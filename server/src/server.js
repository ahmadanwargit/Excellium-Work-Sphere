import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { JsonStore } from './data/json-store.js';
import { SupabaseRelationalStore } from './data/supabase-relational-store.js';
import { SessionService } from './services/session.service.js';
import { StorageService } from './services/storage.service.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const dataFile = join(moduleDirectory, '..', 'data', 'store.json');
const clientDistPath = join(moduleDirectory, '..', '..', 'client', 'dist');

async function createStore({ storePath, store }) {
  if (store) return store.initialise();
  if (env.persistenceProvider === 'supabase') {
    return new SupabaseRelationalStore().initialise();
  }
  if (env.persistenceProvider !== 'json') {
    throw new Error('PERSISTENCE_PROVIDER must be either "supabase" or "json"');
  }
  return new JsonStore(storePath).initialise();
}

export async function startServer({ port = env.port, host = '0.0.0.0', storePath = dataFile, store, storage = StorageService.fromEnvironment() } = {}) {
  const persistentStore = await createStore({ storePath, store });
  const app = createApp({ store: persistentStore, sessions: new SessionService(), storage, clientDistPath });

  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      console.log(`Excellium Express API listening on http://${host}:${port}`);
      resolve({ app, server, store: persistentStore });
    });
  });
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntrypoint) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
