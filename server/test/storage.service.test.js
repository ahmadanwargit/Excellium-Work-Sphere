import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageService, detectFileMimeType } from '../src/services/storage.service.js';

test('detects accepted binary formats instead of trusting client MIME types', () => {
  assert.equal(detectFileMimeType(Buffer.from('%PDF-1.7\n')), 'application/pdf');
  assert.equal(detectFileMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectFileMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(detectFileMimeType(Buffer.from('not-a-file')), null);
});

test('stores validated files in private access-group and owner-scoped paths and signs access', async () => {
  const calls = [];
  const client = {
    storage: {
      from: (bucket) => ({
        upload: async (path, body, options) => { calls.push({ type: 'upload', bucket, path, body, options }); return { error: null }; },
        createSignedUrl: async (path, seconds) => { calls.push({ type: 'signed-url', bucket, path, seconds }); return { data: { signedUrl: 'https://storage.example.test/signed-url' }, error: null }; },
        remove: async () => ({ error: null })
      })
    }
  };
  const storage = new StorageService({ client, bucket: 'excellium-uploads', maxBytes: 1024, signedUrlTtlSeconds: 300, enabled: true });
  const metadata = await storage.upload({
    kind: 'invoice',
    owner: { id: 'usr_john', role: 'employee', accessGroup: 'management' },
    file: { originalname: 'october.pdf', mimetype: 'application/pdf', size: 9, buffer: Buffer.from('%PDF-1.7') }
  });

  assert.match(metadata.path, /^employee\/invoice\/usr_john\/file_/);
  assert.equal(metadata.mimeType, 'application/pdf');
  assert.equal(calls[0].bucket, 'excellium-uploads');
  assert.equal(calls[0].options.contentType, 'application/pdf');

  const signed = await storage.createSignedUrl(metadata);
  assert.equal(signed.url, 'https://storage.example.test/signed-url');
  assert.equal(calls[1].seconds, 300);

  const managementMetadata = await storage.upload({
    kind: 'invoice',
    owner: { id: 'usr_sara', role: 'admin' },
    file: { originalname: 'management.pdf', mimetype: 'application/pdf', size: 9, buffer: Buffer.from('%PDF-1.7') }
  });
  assert.match(managementMetadata.path, /^management\/invoice\/usr_sara\/file_/);
});
