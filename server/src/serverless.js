import { createApp } from './app.js';
import { env } from './config/env.js';
import { SupabaseRelationalStore } from './data/supabase-relational-store.js';
import { StorageService } from './services/storage.service.js';
import { SupabaseSessionService } from './services/supabase-session.service.js';

async function createPersistentStore() {
  // Vercel's filesystem is read-only and /tmp is ephemeral. Never fall back to
  // the local JSON demo adapter for a deployed workspace.
  if (env.persistenceProvider !== 'supabase') {
    throw new Error('Vercel requires PERSISTENCE_PROVIDER=supabase and server-only Supabase credentials');
  }
  return new SupabaseRelationalStore().initialise();
}

export function createServerlessHandler({ createStore = createPersistentStore, sessions, storage, logger = console } = {}) {
  let sharedSessions = sessions;
  let sharedStorage = storage;

  return async function handleRequest(request, response) {
    try {
      // Each invocation gets its own current snapshot and Express app. Sharing
      // app.locals.store would race between concurrent requests and leave warm
      // instances reading a stale workspace after another instance writes.
      const store = await createStore();
      sharedSessions ??= new SupabaseSessionService();
      sharedStorage ??= StorageService.fromEnvironment();
      const app = createApp({ store, sessions: sharedSessions, storage: sharedStorage, trustProxy: 1 });
      response.setHeader('Cache-Control', 'private, no-store');
      return app(request, response);
    } catch (error) {
      logger.error('Unable to initialize the Excellium API:', error.message);
      response.statusCode = 503;
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ message: 'The workspace service is temporarily unavailable. Please try again shortly.' }));
    }
  };
}
