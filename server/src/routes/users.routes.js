import { Router } from 'express';
import { z } from 'zod';
import { requireAdministrator, requireAuthentication } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { hashPassword } from '../services/auth.service.js';
import { addAuditEntry, addNotification, publicUser } from '../services/records.service.js';
import { accessGroupForRole } from '../services/access-group.service.js';
import { createId, currentIso } from '../utils/ids.js';
import { conflict, forbidden, notFound } from '../utils/http-error.js';
import { dateOnlySchema } from '../utils/validation.js';

const profileFields = {
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  title: z.string().trim().min(1).max(100),
  roleId: z.string().trim().min(1).max(100),
  departmentId: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(40).default(''),
  startDate: dateOnlySchema.nullable().default(null)
};
const passwordSchema = z.string().min(10, 'Use at least 10 characters for the initial password').max(200);
const createUserSchema = z.object({ ...profileFields, password: passwordSchema }).strict();
const updateUserSchema = z.object({ ...profileFields, password: passwordSchema.optional(), active: z.boolean() }).strict();
const roleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  baseRole: z.enum(['employee', 'trainer', 'manager', 'admin']),
  description: z.string().trim().max(300).default('')
}).strict();
const departmentSchema = z.object({ name: z.string().trim().min(2).max(100) }).strict();

function assignment(data, input) {
  const role = data.roles.find((item) => item.id === input.roleId);
  if (!role) throw notFound('Select an existing role');
  const department = data.departments.find((item) => item.id === input.departmentId);
  if (!department) throw notFound('Select an existing department');
  return { role: role.baseRole, roleId: role.id, roleName: role.name, accessGroup: accessGroupForRole(role.baseRole), departmentId: department.id, department: department.name };
}

function checkEmail(data, email, exceptId) {
  if (data.users.some((user) => user.id !== exceptId && user.email.toLowerCase() === email)) throw conflict('A user with this email already exists');
}

export function createUsersRouter() {
  const router = Router();
  router.use(requireAuthentication, requireAdministrator);

  router.get('/', (request, response) => {
    const { users, roles, departments } = request.app.locals.store.data;
    response.json({ users: users.map(publicUser), roles, departments });
  });

  router.post('/roles', validate(roleSchema), async (request, response, next) => {
    try {
      let role;
      await request.app.locals.store.mutate((data) => {
        if (data.roles.some((item) => item.name.toLowerCase() === request.validated.name.toLowerCase())) throw conflict('A role with this name already exists');
        role = { id: createId('role'), ...request.validated, system: false, createdAt: currentIso() };
        data.roles.push(role);
        addAuditEntry(data, request.auth.user.id, `Created role ${role.name} with ${role.baseRole} permissions`, { eventType: 'ROLE_CREATED' });
      });
      response.status(201).json({ role });
    } catch (error) { next(error); }
  });

  router.post('/departments', validate(departmentSchema), async (request, response, next) => {
    try {
      let department;
      await request.app.locals.store.mutate((data) => {
        if (data.departments.some((item) => item.name.toLowerCase() === request.validated.name.toLowerCase())) throw conflict('A department with this name already exists');
        department = { id: createId('dept'), name: request.validated.name, createdAt: currentIso() };
        data.departments.push(department);
        addAuditEntry(data, request.auth.user.id, `Created department ${department.name}`, { eventType: 'DEPARTMENT_CREATED' });
      });
      response.status(201).json({ department });
    } catch (error) { next(error); }
  });

  router.post('/', validate(createUserSchema), async (request, response, next) => {
    try {
      const { password, roleId, departmentId, ...profile } = request.validated;
      const credentials = hashPassword(password);
      let user;
      await request.app.locals.store.mutate((data) => {
        checkEmail(data, profile.email);
        user = { id: createId('usr'), ...profile, ...assignment(data, { roleId, departmentId }), ...credentials, active: true, createdAt: currentIso() };
        data.users.push(user);
        addNotification(data, { userId: user.id, message: `Welcome to ${data.organization.name}. Your ${user.roleName} workspace is ready.` });
        addAuditEntry(data, request.auth.user.id, `Created profile for ${user.name} (${user.roleName}, ${user.department})`, { subjectUserId: user.id, eventType: 'USER_CREATED' });
      });
      response.status(201).json({ user: publicUser(user) });
    } catch (error) { next(error); }
  });

  router.patch('/:userId', validate(updateUserSchema), async (request, response, next) => {
    try {
      const { password, roleId, departmentId, ...profile } = request.validated;
      const credentials = password ? hashPassword(password) : {};
      let user;
      await request.app.locals.store.mutate((data) => {
        user = data.users.find((candidate) => candidate.id === request.params.userId);
        if (!user) throw notFound('User not found');
        const selected = assignment(data, { roleId, departmentId });
        checkEmail(data, profile.email, user.id);
        if (user.id === request.auth.user.id && (!profile.active || selected.role !== 'admin')) throw forbidden('You cannot deactivate or remove administrator access from your own account');
        if (user.role === 'admin' && (!profile.active || selected.role !== 'admin') && !data.users.some((other) => other.id !== user.id && other.role === 'admin' && other.active !== false)) {
          throw conflict('At least one active administrator must remain');
        }
        Object.assign(user, profile, selected, credentials, { updatedAt: currentIso() });
        addAuditEntry(data, request.auth.user.id, `Updated profile for ${user.name} (${user.roleName}, ${user.department}; ${user.active ? 'active' : 'inactive'})`, { subjectUserId: user.id, eventType: 'USER_UPDATED' });
      });
      response.json({ user: publicUser(user) });
    } catch (error) { next(error); }
  });

  return router;
}
