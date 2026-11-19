import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Browser tests always use disposable local data, never a configured database.
process.env.NODE_ENV = 'production';
process.env.PERSISTENCE_PROVIDER = 'json';
const { startServer } = await import('../../src/server.js');
const { StorageService } = await import('../../src/services/storage.service.js');
const directory = await mkdtemp(join(tmpdir(), 'excellium-browser-'));
const { server } = await startServer({ port: 4173, host: '0.0.0.0', storePath: join(directory, 'store.json'), storage: new StorageService({ enabled: false }) });
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
