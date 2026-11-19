import { canManagePerson } from '../../../shared/access-control.mjs';
import { addAuditEntry, addNotification, publicUser } from './records.service.js';
import { SYSTEM_ROLES } from './workspace-catalog.service.js';
import { currentIso } from '../utils/ids.js';
import { conflict, forbidden, notFound } from '../utils/http-error.js';

export function managedProfile(data, actor, id) {
  const person = data.users.find((item) => item.id === id && !item.deletedAt);
  if (!person) throw notFound('Profile not found');
  if (!canManagePerson(actor, person)) throw forbidden('You cannot manage a profile outside your staff scope');
  return person;
}

function assertRemovable(data, actor, person) {
  if (person.id === actor.id) throw forbidden('You cannot delete your own profile');
  if (person.role === 'admin' && !data.users.some((item) => item.id !== person.id && item.role === 'admin' && item.active !== false && !item.deletedAt)) throw conflict('At least one active administrator must remain');
}

export function deletionPreview(data, actor, id) {
  const person = managedProfile(data, actor, id);
  assertRemovable(data, actor, person);
  return { user: publicUser(person), impact: {
    invoices: data.invoices.filter((item) => item.employeeId === id).length,
    attendance: data.attendance.filter((item) => item.userId === id).length,
    leave: data.leaveRequests.filter((item) => item.employeeId === id).length,
    equipment: data.assets.filter((item) => item.assignedTo === id).length
  } };
}

export function removeProfile(data, actor, id, input) {
  const person = managedProfile(data, actor, id);
  assertRemovable(data, actor, person);
  if (input.confirmationEmail.toLowerCase() !== person.email.toLowerCase()) throw conflict('Confirmation email does not match this profile. Refresh if the email has changed.');
  const at = currentIso();
  Object.assign(person, { active: false, deletedAt: at, deletedBy: actor.id, updatedAt: at });
  addAuditEntry(data, actor.id, `Deleted portal profile for ${person.name} (${person.email}); historical work records retained`, { subjectUserId: person.id, eventType: 'USER_DELETED' });
}

export function removeRoles(data, actor, ids) {
  const roles = ids.map((id) => data.roles.find((role) => role.id === id && !role.deletedAt));
  if (roles.some((role) => !role)) throw notFound('One or more selected roles no longer exist');
  if (roles.some((role) => role.system || SYSTEM_ROLES.some((system) => system.id === role.id))) throw forbidden('Built-in permission levels cannot be deleted. Select custom role presets only.');
  const replacements = new Map(roles.map((role) => {
    const replacement = data.roles.find((item) => item.id === role.baseRole && item.system && !item.deletedAt);
    if (!replacement) throw conflict('The built-in replacement role is unavailable');
    return [role.id, replacement];
  }));
  const affected = data.users.filter((person) => replacements.has(person.roleId));
  const at = currentIso();
  affected.forEach((person) => {
    const replacement = replacements.get(person.roleId);
    Object.assign(person, { roleId: replacement.id, roleName: replacement.name, updatedAt: at });
  });
  roles.forEach((role) => Object.assign(role, { deletedAt: at, deletedBy: actor.id }));
  addAuditEntry(data, actor.id, `Deleted role preset(s): ${roles.map((role) => role.name).join(', ')}; ${affected.length} profile(s) moved to their built-in role with unchanged permissions`, { eventType: 'ROLES_DELETED' });
  return { removed: roles.length, reassigned: affected.length };
}

export function assignDepartment(data, actor, departmentId, userIds) {
  const department = data.departments.find((item) => item.id === departmentId && !item.deletedAt);
  if (!department) throw notFound('Department not found');
  // Validate the complete batch before touching any profile.
  const people = userIds.map((id) => managedProfile(data, actor, id));
  const at = currentIso();
  people.forEach((person) => {
    Object.assign(person, { departmentId: department.id, department: department.name, updatedAt: at });
    if (person.active !== false) addNotification(data, { userId: person.id, message: `Your department is now ${department.name}.` });
    addAuditEntry(data, actor.id, `Assigned ${person.name} to ${department.name}`, { subjectUserId: person.id, eventType: 'DEPARTMENT_ASSIGNMENT' });
  });
  return { assigned: people.length };
}

export function removeDepartment(data, actor, departmentId, replacementId) {
  const department = data.departments.find((item) => item.id === departmentId && !item.deletedAt);
  if (!department) throw notFound('Department not found');
  if (data.departments.filter((item) => !item.deletedAt).length <= 1) throw conflict('At least one department must remain');
  const people = data.users.filter((person) => person.departmentId === departmentId);
  if (people.some((person) => !canManagePerson(actor, person))) throw forbidden('An administrator must remove a department containing management or administrator profiles');
  const replacement = data.departments.find((item) => item.id === replacementId && item.id !== departmentId && !item.deletedAt);
  if (people.length && !replacement) throw conflict('Choose a different department for all existing and historical profile assignments');
  const at = currentIso();
  people.forEach((person) => Object.assign(person, { departmentId: replacement.id, department: replacement.name, updatedAt: at }));
  Object.assign(department, { deletedAt: at, deletedBy: actor.id });
  addAuditEntry(data, actor.id, `Deleted department ${department.name}; ${people.length} profile(s) moved to ${replacement?.name ?? 'no replacement needed'}`, { eventType: 'DEPARTMENT_DELETED' });
  return { removed: department.id, reassigned: people.length };
}
