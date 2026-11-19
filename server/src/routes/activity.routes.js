import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requirePermission } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { ensureWorkSessionCollections, recordActivityHeartbeat } from '../services/activity.service.js';

const coordinateSchema = z.object({
  x: z.number().finite().min(0).max(100_000),
  y: z.number().finite().min(0).max(100_000),
  timestamp: z.string().datetime({ offset: true }),
  eventType: z.enum(['pointer', 'touch']).default('pointer')
});

const heartbeatSchema = z.object({
  state: z.enum(['ACTIVE', 'IDLE']),
  durationSeconds: z.number().finite().min(0).max(180),
  mouseClicks: z.number().int().min(0).max(100).default(0),
  keypresses: z.number().int().min(0).max(300).default(0),
  pageHidden: z.boolean().default(false),
  coordinates: z.array(coordinateSchema).max(12).default([])
});

/** Activity is sampled, not surveilled: no key content, screenshots, or page data. */
export function createActivityRouter() {
  const router = Router();
  router.use(requireAuthentication, requirePermission('selfService'));

  router.post('/heartbeat', validate(heartbeatSchema), async (request, response, next) => {
    try {
      let result;
      const store = request.app.locals.store;
      const mutate = store.mutateActivity ? store.mutateActivity.bind(store) : store.mutate.bind(store);
      await mutate((data) => {
        ensureWorkSessionCollections(data);
        result = recordActivityHeartbeat(data, request.auth.user.id, request.validated);
      });
      response.status(result.ignored ? 202 : 201).json({
        ignored: result.ignored,
        session: result.session,
        heartbeat: result.heartbeat ?? null
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
