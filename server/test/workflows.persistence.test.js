import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { SupabaseRelationalStore } from '../src/data/supabase-relational-store.js';
import { prepareInvoice, invoiceSchema } from '../src/services/invoice.service.js';
import { postgresClient } from './helpers/pglite-client.js';
import { assignDepartment, removeDepartment, removeProfile, removeRoles } from '../src/services/profile-lifecycle.service.js';
import { administrationView, portalView } from '../src/services/workspace-views.service.js';
import { openWorkSession, recordActivityHeartbeat } from '../src/services/activity.service.js';

const migrations = new URL('../../supabase/migrations/', import.meta.url);
const latest = '202611170002_add_portal_workflows.sql';

async function createDatabase(t, { legacy = false } = {}) {
  // PostgREST returns dates as strings; use the same wire representation.
  const db = new PGlite({ parsers: { 1082: (value) => value, 1184: (value) => new Date(value).toISOString() } });
  t.after(() => db.close());
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);");
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql') && name < latest).sort()) await db.exec(await readFile(new URL(name, migrations), 'utf8'));
  if (legacy) {
    await db.exec("insert into excellium_users (id, email, name, role, title, department, password_salt, password_hash, created_at) values ('legacy', 'legacy@example.test', 'Legacy Person', 'employee', 'Engineer', 'Engineering', 'old-salt', 'old-hash', '2026-01-01'); insert into excellium_invoices (id, employee_id, invoice_month, amount, status, submitted_at) values ('LEGACY-1', 'legacy', 'October 2026', 4200, 'Pending', '2026-11-01');");
  }
  const sql = await readFile(new URL(latest, migrations), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // The migration is safe to re-run during manual setup.
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql') && name > latest).sort()) {
    const additive = await readFile(new URL(name, migrations), 'utf8');
    await db.exec(additive); await db.exec(additive);
  }
  return db;
}

test('workflow migration preserves existing users, credentials, categories and amount-only invoices', async (t) => {
  const db = await createDatabase(t, { legacy: true });
  const user = (await db.query("select * from excellium_users where id = 'legacy'")).rows[0];
  assert.equal(user.email, 'legacy@example.test');
  assert.equal(user.password_hash, 'old-hash');
  assert.equal(user.role, 'employee');
  assert.equal(user.access_group, 'employee');
  assert.equal(user.role_id, 'employee');
  assert.ok(user.department_id.startsWith('dept_'));
  assert.equal(user.is_active, true);
  const invoice = (await db.query("select * from excellium_invoices where id = 'LEGACY-1'")).rows[0];
  assert.equal(Number(invoice.amount), 4200);
  assert.equal(Number(invoice.subtotal), 4200);
  assert.equal(invoice.currency, 'USD');
  assert.equal(invoice.status, 'Pending');
  const tables = (await db.query("select relname, relrowsecurity from pg_class where relname in ('excellium_roles', 'excellium_departments', 'excellium_leave_requests', 'excellium_invoice_items')")).rows;
  assert.equal(tables.length, 4);
  assert.ok(tables.every((table) => table.relrowsecurity));
  const permission = (await db.query("select has_table_privilege('anon', 'excellium_leave_requests', 'select') as anon_read, has_table_privilege('authenticated', 'excellium_invoice_items', 'insert') as browser_write")).rows[0];
  assert.equal(permission.anon_read, false);
  assert.equal(permission.browser_write, false);
});

test('normalized store durably saves and reloads profiles, role presets, departments, leave and edited invoice items', async (t) => {
  const db = await createDatabase(t);
  const client = postgresClient(db);
  const store = await new SupabaseRelationalStore({ client }).initialise();
  const now = new Date().toISOString();
  await store.mutate((data) => {
    data.roles.push({ id: 'role_support', name: 'Support Lead', baseRole: 'trainer', system: false, description: 'Employee and training tools', createdAt: now });
    data.departments.push({ id: 'dept_support', name: 'Customer Success', createdAt: now });
    Object.assign(data.users[0], { role: 'trainer', roleId: 'role_support', roleName: 'Support Lead', departmentId: 'dept_support', department: 'Customer Success', phone: '123456789', startDate: '2026-12-01' });
    data.leaveRequests.push({ id: 'leave_test', employeeId: 'usr_john', type: 'Annual', startDate: '2026-12-01', endDate: '2026-12-02', days: 2, reason: 'Family commitments', status: 'Pending', reviewNote: '', createdAt: now, decidedAt: null, decidedBy: null });
    data.invoices.push({ id: 'INV-1052', employeeId: 'usr_john', ...prepareInvoice(invoiceSchema.parse({ month: 'November 2026', status: 'Draft', taxRate: 5, lineItems: [{ description: 'Services', quantity: 2, unitRate: 100 }, { description: 'Training', quantity: 1, unitRate: 50 }] })), createdAt: now, updatedAt: now, submittedAt: null, decidedAt: null, decidedBy: null });
  });
  const restarted = await new SupabaseRelationalStore({ client }).initialise();
  const user = restarted.data.users.find((item) => item.id === 'usr_john');
  assert.equal(user.roleName, 'Support Lead');
  assert.equal(user.role, 'trainer');
  assert.equal(user.department, 'Customer Success');
  assert.equal(user.phone, '123456789');
  assert.equal(user.startDate, '2026-12-01');
  assert.equal(restarted.data.leaveRequests[0].days, 2);
  assert.equal(restarted.data.invoices.find((item) => item.id === 'INV-1052').lineItems.length, 2);
  await restarted.mutate((data) => {
    const invoice = data.invoices.find((item) => item.id === 'INV-1052');
    Object.assign(invoice, prepareInvoice(invoiceSchema.parse({ month: invoice.month, status: 'Draft', lineItems: [{ description: 'Revised services', quantity: 3, unitRate: 80 }] })));
    Object.assign(data.leaveRequests[0], { status: 'Approved', decidedAt: now, decidedBy: 'usr_sara' });
  });
  const final = await new SupabaseRelationalStore({ client }).initialise();
  const invoice = final.data.invoices.find((item) => item.id === 'INV-1052');
  assert.equal(invoice.amount, 240);
  assert.equal(invoice.lineItems.length, 1, 'removed lines must not reappear on the next function instance');
  assert.equal(invoice.lineItems[0].description, 'Revised services');
  assert.equal(final.data.leaveRequests[0].status, 'Approved');
  assert.equal(final.data.leaveRequests[0].decidedBy, 'usr_sara');
  await assert.rejects(db.exec("update excellium_users set role = 'admin' where id = 'usr_john'"), /foreign key/);
});

test('lifecycle removals, catalog reassignment, management meetings and equipment survive cold starts without losing history', async (t) => {
  const db = await createDatabase(t);
  const client = postgresClient(db);
  const store = await new SupabaseRelationalStore({ client }).initialise();
  const at = new Date().toISOString();
  await store.mutate((data) => {
    data.roles.unshift({ id: 'role_lifecycle', name: 'Lifecycle Trainer', baseRole: 'trainer', system: false, description: 'Named trainer preset', createdAt: at });
    data.departments.unshift({ id: 'dept_lifecycle', name: 'Lifecycle Team', createdAt: at });
    const john = data.users.find((person) => person.id === 'usr_john');
    Object.assign(john, { role: 'trainer', roleId: 'role_lifecycle', roleName: 'Lifecycle Trainer' });
    assignDepartment(data, data.users.find((person) => person.id === 'usr_sara'), 'dept_lifecycle', ['usr_john']);
    data.assets.push({ id: 'AST-LIFECYCLE', name: 'Shared saved device', type: 'Laptop', serialNumber: 'PERSIST-001', assignedTo: 'usr_priya', status: 'In use', issuedOn: '2026-11-01' });
    data.meetings.push({ id: 'mtg_lifecycle', title: 'Management planning', startsAt: '2026-12-22T10:00:00.000Z', participants: ['usr_priya', 'usr_daniel'], createdBy: 'usr_priya', status: 'Pending', meetingType: 'Management', durationMinutes: 45, notes: 'Persistent private agenda' });
    data.leaveRequests.push({ id: 'leave_lifecycle', employeeId: 'usr_john', type: 'Annual', startDate: '2026-12-01', endDate: '2026-12-01', days: 1, reason: 'Retained history', status: 'Pending', reviewNote: '', createdAt: at, decidedAt: null, decidedBy: null });
  });
  const next = await new SupabaseRelationalStore({ client }).initialise();
  const johnBefore = next.data.users.find((person) => person.id === 'usr_john');
  assert.equal(johnBefore.departmentId, 'dept_lifecycle');
  await next.mutate((data) => {
    const admin = data.users.find((person) => person.id === 'usr_sara');
    removeRoles(data, admin, ['role_lifecycle']);
    removeDepartment(data, admin, 'dept_lifecycle', data.departments.find((item) => item.name === 'Engineering').id);
    removeProfile(data, admin, 'usr_john', { confirmationEmail: 'john@excellium.com' });
  });
  const restarted = await new SupabaseRelationalStore({ client }).initialise();
  const admin = restarted.data.users.find((person) => person.id === 'usr_sara');
  const catalog = administrationView(restarted.data, admin);
  assert.ok(!catalog.users.some((person) => person.id === 'usr_john'));
  assert.ok(!catalog.roles.some((role) => role.id === 'role_lifecycle'));
  assert.ok(!catalog.departments.some((item) => item.id === 'dept_lifecycle'));
  const removed = restarted.data.users.find((person) => person.id === 'usr_john');
  assert.equal(removed.active, false); assert.ok(removed.deletedAt); assert.equal(removed.deletedBy, 'usr_sara');
  assert.equal(removed.roleId, 'trainer'); assert.equal(removed.department, 'Engineering');
  assert.equal(restarted.data.invoices.filter((item) => item.employeeId === removed.id).length, 2);
  assert.equal(restarted.data.attendance.filter((item) => item.userId === removed.id).length, 4);
  assert.equal(restarted.data.leaveRequests.find((item) => item.id === 'leave_lifecycle').employeeId, removed.id);
  assert.ok(restarted.data.assets.some((item) => item.assignedTo === removed.id));
  const personal = portalView(restarted.data, restarted.data.users.find((person) => person.id === 'usr_priya'));
  assert.equal(personal.equipment.assets.find((item) => item.id === 'AST-LIFECYCLE').serialNumber, 'PERSIST-001');
  const meeting = personal.meetings.find((item) => item.id === 'mtg_lifecycle');
  assert.equal(meeting.durationMinutes, 45); assert.equal(meeting.meetingType, 'Management'); assert.equal(meeting.notes, 'Persistent private agenda');
  // Reuse removed names with new IDs. Tombstones must persist before live
  // records, even when the new rows are first in the payload.
  await restarted.mutate((data) => {
    data.roles.unshift({ id: 'role_reused', name: 'Lifecycle Trainer', baseRole: 'trainer', system: false, createdAt: at });
    data.departments.unshift({ id: 'dept_reused', name: 'Lifecycle Team', createdAt: at });
  });
  const final = await new SupabaseRelationalStore({ client }).initialise();
  assert.equal(final.data.roles.filter((role) => role.name === 'Lifecycle Trainer' && !role.deletedAt).length, 1);
  assert.equal(final.data.departments.filter((item) => item.name === 'Lifecycle Team' && !item.deletedAt).length, 1);
  await assert.rejects(db.exec("update excellium_users set is_active = true where id = 'usr_john'"), /check constraint/);
  await assert.rejects(db.exec("update excellium_roles set deleted_at = now() where id = 'admin'"), /check constraint/);
  const security = (await db.query("select has_table_privilege('anon', 'excellium_users', 'select') as anon_read, has_table_privilege('authenticated', 'excellium_assets', 'update') as browser_write")).rows[0];
  assert.equal(security.anon_read, false); assert.equal(security.browser_write, false);
});

test('atomic typed writes roll back all rows on error, reject stale instances and preserve activity-only writes', async (t) => {
  const db = await createDatabase(t);
  const client = postgresClient(db);
  const first = await new SupabaseRelationalStore({ client }).initialise();
  const stale = await new SupabaseRelationalStore({ client }).initialise();
  await first.mutate((data) => { data.users.find((person) => person.id === 'usr_john').title = 'Committed title'; });
  await assert.rejects(stale.mutate((data) => { data.users.find((person) => person.id === 'usr_john').title = 'Stale overwrite'; }), (error) => error.status === 409);
  const next = await new SupabaseRelationalStore({ client }).initialise();
  const version = next.version;
  await assert.rejects(next.mutate((data) => {
    data.users.find((person) => person.id === 'usr_john').title = 'Must roll back';
    data.invoices[0].employeeId = 'nonexistent-owner';
  }), /foreign key/);
  const verified = await new SupabaseRelationalStore({ client }).initialise();
  assert.equal(verified.version, version);
  assert.equal(verified.data.users.find((person) => person.id === 'usr_john').title, 'Committed title');
  assert.equal(next.data.users.find((person) => person.id === 'usr_john').title, 'Committed title', 'failed callback also restores the local snapshot');
  await next.mutateActivity((data) => { openWorkSession(data, 'usr_john', { at: '2026-11-17T09:00:00Z' }); });
  await next.mutateActivity((data) => { recordActivityHeartbeat(data, 'usr_john', { state: 'ACTIVE', durationSeconds: 30, mouseClicks: 1, keypresses: 1, samples: [] }, { at: '2026-11-17T09:00:30Z' }); });
  const activity = await new SupabaseRelationalStore({ client }).initialise();
  assert.equal(activity.data.workSessions.find((session) => session.userId === 'usr_john').activeSeconds, 30);
  assert.equal(activity.data.activityHeartbeats.length, 1);
  assert.equal(activity.data.invoices.find((item) => item.id === 'INV-1042').employeeId, 'usr_john');
  const permissions = (await db.query("select has_function_privilege('anon', 'public.excellium_persist_workspace(bigint,bigint,jsonb,jsonb)', 'execute') as anon_write, has_function_privilege('authenticated', 'public.excellium_persist_workspace(bigint,bigint,jsonb,jsonb)', 'execute') as browser_write, has_function_privilege('service_role', 'public.excellium_persist_workspace(bigint,bigint,jsonb,jsonb)', 'execute') as server_write")).rows[0];
  assert.equal(permissions.anon_write, false); assert.equal(permissions.browser_write, false); assert.equal(permissions.server_write, true);
});
