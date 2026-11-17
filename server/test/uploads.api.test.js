import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startServer } from '../src/server.js';

function storageDouble() {
  const uploaded = [];
  return {
    uploaded,
    async upload({ file, kind, owner }) {
      const accessGroup = ['manager', 'admin'].includes(owner.role) ? 'management' : 'employee';
      const fileMetadata = { bucket: 'excellium-uploads', path: `${accessGroup}/${kind}/${owner.id}/test-upload.pdf`, originalName: file.originalname, mimeType: 'application/pdf', size: file.size, uploadedAt: new Date().toISOString() };
      uploaded.push(fileMetadata);
      return fileMetadata;
    },
    async createSignedUrl(file) { return { url: `https://storage.example.test/${file.path}`, expiresIn: 300 }; },
    async remove() {}
  };
}

async function createApi(t) {
  const directory = await mkdtemp(join(tmpdir(), 'excellium-uploads-'));
  const storage = storageDouble();
  const { server } = await startServer({ port: 0, host: '127.0.0.1', storePath: join(directory, 'store.json'), storage });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, storage };
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'john@excellium.com', password: 'password123', accessGroup: 'employee' })
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('uploads an invoice PDF through Express and returns an owner-authorized signed URL', async (t) => {
  const { baseUrl, storage } = await createApi(t);
  const cookie = await login(baseUrl);
  const payload = new FormData();
  payload.set('month', 'November 2026');
  payload.set('amount', '4200');
  payload.set('paymentDetails', 'Demo payroll account');
  payload.set('document', new Blob(['%PDF-1.7\nDemo'], { type: 'application/pdf' }), 'invoice.pdf');

  const uploadResponse = await fetch(`${baseUrl}/api/invoices`, { method: 'POST', headers: { cookie }, body: payload });
  assert.equal(uploadResponse.status, 201);
  const invoice = (await uploadResponse.json()).invoice;
  assert.equal(invoice.document.originalName, 'invoice.pdf');
  assert.equal(storage.uploaded.length, 1);
  assert.match(storage.uploaded[0].path, /^employee\/invoice\/usr_john\//);

  const signedResponse = await fetch(`${baseUrl}/api/invoices/${invoice.id}/document`, { headers: { cookie } });
  assert.equal(signedResponse.status, 200);
  assert.match((await signedResponse.json()).url, /storage\.example\.test/);
});
