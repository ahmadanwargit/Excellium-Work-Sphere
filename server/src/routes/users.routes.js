import { Router } from 'express';
import { z } from 'zod';
import { requireAdministrator, requireAuthentication, requirePermission } from '../middleware/auth.middleware.js';
import { assignableRoles } from '../../../shared/access-control.mjs';
import { administrationView } from '../services/workspace-views.service.js';
import { validate } from '../middleware/validate.middleware.js';
import { hashPassword } from '../services/auth.service.js';
import { addAuditEntry, addNotification, publicUser } from '../services/records.service.js';
import { accessGroupForRole } from '../services/access-group.service.js';
import { createId, currentIso } from '../utils/ids.js';
import { conflict, forbidden, notFound } from '../utils/http-error.js';
import { dateOnlySchema } from '../utils/validation.js';
import { assignDepartment, deletionPreview, managedProfile, removeDepartment, removeProfile, removeRoles } from '../services/profile-lifecycle.service.js';

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
const selectedIds = z.array(z.string().trim().min(1).max(100)).min(1).max(100).refine((ids) => new Set(ids).size === ids.length, 'Do not select an item twice');
const deleteProfileSchema = z.object({ confirm: z.literal(true), confirmationEmail: z.string().trim().email().max(254), acknowledgeHistoryRetention: z.literal(true) }).strict();

function assignment(data, input, actor) {
  const role = data.roles.find((item) => item.id === input.roleId && !item.deletedAt);
  if (!role) throw notFound('Select an existing role');
  if (!assignableRoles(actor).includes(role.baseRole)) throw forbidden('Management can assign only employee or trainer roles. Administrator access is required for privileged roles.');
  const department = data.departments.find((item) => item.id === input.departmentId && !item.deletedAt);
  if (!department) throw notFound('Select an existing department');
  return { role: role.baseRole, roleId: role.id, roleName: role.name, accessGroup: accessGroupForRole(role.baseRole), departmentId: department.id, department: department.name };
}

function checkEmail(data, email, exceptId) {
  if (data.users.some((user) => user.id !== exceptId && user.email.toLowerCase() === email)) throw conflict('This email belongs to an existing or removed profile. Historical account emails remain reserved.');
}

export function createUsersRouter() {
  const router = Router();
  router.use(requireAuthentication, requirePermission('manageStaff'));

  router.get('/', (request, response) => {
    response.json(administrationView(request.app.locals.store.data, request.auth.user));
  });

  router.post('/roles', requireAdministrator, validate(roleSchema), async (request, response, next) => {
    try {
      let role;
      await request.app.locals.store.mutate((data) => {
        if (data.roles.some((item) => !item.deletedAt && item.name.toLowerCase() === request.validated.name.toLowerCase())) throw conflict('A role with this name already exists');
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
        if (data.departments.some((item) => !item.deletedAt && item.name.toLowerCase() === request.validated.name.toLowerCase())) throw conflict('A department with this name already exists');
        department = { id: createId('dept'), name: request.validated.name, createdAt: currentIso() };
        data.departments.push(department);
        addAuditEntry(data, request.auth.user.id, `Created department ${department.name}`, { eventType: 'DEPARTMENT_CREATED' });
      });
      response.status(201).json({ department });
    } catch (error) { next(error); }
  });

  router.delete('/roles', requireAdministrator, validate(z.object({ roleIds: selectedIds, confirm: z.literal(true) }).strict()), async (request, response, next) => {
    try {
      let result;
      await request.app.locals.store.mutate((data) => { result = removeRoles(data, request.auth.user, request.validated.roleIds); });
      response.json(result);
    } catch (error) { next(error); }
  });

  router.post('/departments/:departmentId/employees', requirePermission('manageDepartments'), validate(z.object({ userIds: selectedIds }).strict()), async (request, response, next) => {
    try {
      let result;
      await request.app.locals.store.mutate((data) => { result = assignDepartment(data, request.auth.user, request.params.departmentId, request.validated.userIds); });
      response.json(result);
    } catch (error) { next(error); }
  });

  router.delete('/departments/:departmentId', requirePermission('manageDepartments'), validate(z.object({ confirm: z.literal(true), replacementDepartmentId: z.string().trim().min(1).max(100).optional() }).strict()), async (request, response, next) => {
    try {
      let result;
      await request.app.locals.store.mutate((data) => { result = removeDepartment(data, request.auth.user, request.params.departmentId, request.validated.replacementDepartmentId); });
      response.json(result);
    } catch (error) { next(error); }
  });

  router.get('/:userId/deletion', (request, response, next) => {
    try { response.json(deletionPreview(request.app.locals.store.data, request.auth.user, request.params.userId)); }
    catch (error) { next(error); }
  });

  router.delete('/:userId', validate(deleteProfileSchema), async (request, response, next) => {
    try {
      await request.app.locals.store.mutate((data) => { removeProfile(data, request.auth.user, request.params.userId, request.validated); });
      response.status(204).end();
    } catch (error) { next(error); }
  });

  router.post('/', validate(createUserSchema), async (request, response, next) => {
    try {
      const { password, roleId, departmentId, ...profile } = request.validated;
      const credentials = hashPassword(password);
      let user;
      await request.app.locals.store.mutate((data) => {
        checkEmail(data, profile.email);
        user = { id: createId('usr'), ...profile, ...assignment(data, { roleId, departmentId }, request.auth.user), ...credentials, active: true, createdAt: currentIso() };
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
        user = managedProfile(data, request.auth.user, request.params.userId);
        const selected = assignment(data, { roleId, departmentId }, request.auth.user);
        checkEmail(data, profile.email, user.id);
        if (user.id === request.auth.user.id && (!profile.active || selected.role !== 'admin')) throw forbidden('You cannot deactivate or remove administrator access from your own account');
        if (user.role === 'admin' && (!profile.active || selected.role !== 'admin') && !data.users.some((other) => other.id !== user.id && other.role === 'admin' && other.active !== false && !other.deletedAt)) {
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
