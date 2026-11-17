import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { createActivityRouter } from './routes/activity.routes.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createAttendanceRouter } from './routes/attendance.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createEquipmentRouter } from './routes/equipment.routes.js';
import { createInvoicesRouter } from './routes/invoices.routes.js';
import { createMeetingsRouter } from './routes/meetings.routes.js';
import { createWorkspaceRouter } from './routes/workspace.routes.js';

// Reuse the limiter across serverless invocations on the same warm instance.
// A distributed rate-limit store can replace this for larger deployments.
const authenticationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-7', legacyHeaders: false });

export function createApp({ store, sessions, storage, clientDistPath, trustProxy = false }) {
  const app = express();
  app.locals.store = store;
  app.locals.sessions = sessions;
  app.locals.storage = storage;

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!env.isProduction) app.use(morgan('dev'));

  app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'excellium-express-api', schemaVersion: store.data.schemaVersion, persistence: env.persistenceProvider, storageConfigured: storage.enabled }));
  app.use('/api/auth', authenticationLimiter, createAuthRouter());
  app.use('/api/attendance', createAttendanceRouter());
  app.use('/api/activity', createActivityRouter());
  app.use('/api/admin', createAdminRouter());
  app.use('/api/invoices', createInvoicesRouter());
  app.use('/api/meetings', createMeetingsRouter());
  app.use('/api/equipment', createEquipmentRouter());
  app.use('/api', createWorkspaceRouter());
  app.use('/api', notFoundHandler);

  if (env.isProduction && clientDistPath) {
    app.use(express.static(clientDistPath));
    app.get('*', (_request, response) => response.sendFile('index.html', { root: clientDistPath }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
