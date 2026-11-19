import assert from 'node:assert/strict';
import test from 'node:test';
import { JsonStore } from '../src/data/json-store.js';
import { createApi } from './helpers/api.js';

const fields = {
  month: 'November 2026', currency: 'PKR', taxRate: 10, paymentDetails: 'Bank transfer', notes: 'Monthly work', dueDate: '2026-12-05', status: 'Draft',
  lineItems: [{ description: 'Project work', quantity: 2, unitRate: 125.5 }, { description: 'Training', quantity: 1.5, unitRate: 40 }]
};

test('prepares, edits, downloads and submits a private invoice draft with server-calculated totals', async (t) => {
  const { request, login, storePath } = await createApi(t);
  const cookie = await login();
  const manager = await login('daniel@excellium.com', 'management');
  const colleague = await login('priya@excellium.com');
  const created = await request('/api/invoices', { method: 'POST', cookie, body: { ...fields, amount: 1 } });
  assert.equal(created.status, 201);
  let { invoice } = await created.json();
  assert.equal(invoice.subtotal, 311);
  assert.equal(invoice.taxAmount, 31.1);
  assert.equal(invoice.amount, 342.1, 'a client-supplied total must never override line-item calculations');
  assert.equal(invoice.submittedAt, null);
  assert.equal(invoice.employeeId, 'usr_john');
  const id = invoice.id;
  const managerInvoices = (await (await request('/api/invoices', { cookie: manager })).json()).invoices;
  assert.equal(managerInvoices.some((item) => item.id === id), false);
  assert.equal((await request(`/api/invoices/${id}/pdf`, { cookie: manager })).status, 403);
  assert.equal((await request(`/api/invoices/${id}/pdf`, { cookie: colleague })).status, 403);
  assert.equal((await request(`/api/invoices/${id}/draft`, { method: 'PUT', cookie: colleague, body: fields })).status, 403);

  const edited = await request(`/api/invoices/${id}/draft`, { method: 'PUT', cookie, body: { ...fields, lineItems: [fields.lineItems[1]] } });
  assert.equal(edited.status, 200);
  invoice = (await edited.json()).invoice;
  assert.equal(invoice.amount, 66);
  const restarted = await new JsonStore(storePath).initialise();
  assert.equal(restarted.data.invoices.find((item) => item.id === id).lineItems.length, 1);

  const pdf = await request(`/api/invoices/${id}/pdf`, { cookie });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /application\/pdf/);
  assert.match(pdf.headers.get('content-disposition'), new RegExp(id));
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await request(`/api/invoices/${id}/submit`, { method: 'POST', cookie, body: {} })).status, 200);
  assert.equal((await request(`/api/invoices/${id}/submit`, { method: 'POST', cookie, body: {} })).status, 409);
  assert.equal((await request(`/api/invoices/${id}/draft`, { method: 'PUT', cookie, body: fields })).status, 409);
  assert.equal((await request(`/api/invoices/${id}`, { method: 'PATCH', cookie: manager, body: { status: 'Approved' } })).status, 200);
  const messages = (await (await request('/api/notifications', { cookie })).json()).notifications;
  assert.ok(messages.some((item) => item.message.includes(`${id} was approved`)));
});

test('validates invoice line items, tax, dates, totals and ownership fields', async (t) => {
  const { request, login } = await createApi(t);
  const cookie = await login();
  for (const body of [
    { ...fields, lineItems: 'not-json' }, { ...fields, lineItems: [] }, { ...fields, taxRate: -1 },
    { ...fields, dueDate: '2026-02-30' }, { ...fields, employeeId: 'usr_sara' },
    { ...fields, lineItems: [{ description: 'bad', quantity: -1, unitRate: 1 }] },
    { ...fields, lineItems: [{ description: 'bad', quantity: 1, unitRate: 0 }] },
    { ...fields, lineItems: [{ description: 'too much', quantity: 100_000, unitRate: 1_000_000 }] }
  ]) assert.equal((await request('/api/invoices', { method: 'POST', cookie, body })).status, 400);
  assert.equal((await request('/api/invoices')).status, 401);
  const existingPdf = await request('/api/invoices/INV-1042/pdf', { cookie });
  assert.equal(existingPdf.status, 200, 'existing amount-only invoices remain downloadable');
});
