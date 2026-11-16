import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { JsonStore } from './data/json-store.js';
import { SessionService } from './services/session.service.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const dataFile = join(moduleDirectory, '..', 'data', 'store.json');
const clientDistPath = join(moduleDirectory, '..', '..', 'client', 'dist');

export async function startServer({ port = env.port, host = '0.0.0.0', storePath = dataFile } = {}) {
  const store = await new JsonStore(storePath).initialise();
  const app = createApp({ store, sessions: new SessionService(), clientDistPath });

  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      console.log(`Excellium Express API listening on http://${host}:${port}`);
      resolve({ app, server, store });
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
