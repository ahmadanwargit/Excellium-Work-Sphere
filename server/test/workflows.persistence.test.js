import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { SupabaseRelationalStore } from '../src/data/supabase-relational-store.js';
import { prepareInvoice, invoiceSchema } from '../src/services/invoice.service.js';
import { postgresClient } from './helpers/pglite-client.js';

const migrations = new URL('../../supabase/migrations/', import.meta.url);
const latest = '202611170002_add_portal_workflows.sql';

async function createDatabase(t, { legacy = false } = {}) {
  // PostgREST returns dates as strings; use the same wire representation.
  const db = new PGlite({ parsers: { 1082: (value) => value, 1184: (value) => new Date(value).toISOString() } });
  t.after(() => db.close());
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);");
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql') && name !== latest).sort()) await db.exec(await readFile(new URL(name, migrations), 'utf8'));
  if (legacy) {
    await db.exec("insert into excellium_users (id, email, name, role, title, department, password_salt, password_hash, created_at) values ('legacy', 'legacy@example.test', 'Legacy Person', 'employee', 'Engineer', 'Engineering', 'old-salt', 'old-hash', '2026-01-01'); insert into excellium_invoices (id, employee_id, invoice_month, amount, status, submitted_at) values ('LEGACY-1', 'legacy', 'October 2026', 4200, 'Pending', '2026-11-01');");
  }
  const sql = await readFile(new URL(latest, migrations), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // The migration is safe to re-run during manual setup.
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
