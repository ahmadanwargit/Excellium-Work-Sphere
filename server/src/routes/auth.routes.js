import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { sessionCookieOptions, SESSION_COOKIE } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { verifyPassword } from '../services/auth.service.js';
import { ACCESS_GROUPS, hasAccessGroup } from '../services/access-group.service.js';
import { publicUser } from '../services/records.service.js';
import { HttpError } from '../utils/http-error.js';

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(500),
  // The sign-in surface intentionally exposes only these two groups. The
  // persisted role remains server-side for finer route authorization.
  accessGroup: z.enum([ACCESS_GROUPS.EMPLOYEE, ACCESS_GROUPS.MANAGEMENT])
}).strict();

export function createAuthRouter() {
  const router = Router();

  router.post('/login', validate(loginSchema), async (request, response, next) => {
    try {
      const { email, password, accessGroup } = request.validated;
      const user = request.app.locals.store.data.users.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());
      if (!user || user.active === false || user.deletedAt || !verifyPassword(password, user)) throw new HttpError(401, 'Incorrect email or password');
      if (!hasAccessGroup(user, accessGroup)) throw new HttpError(403, 'This email does not belong to the selected sign-in group');

      const { token, expiresAt } = await request.app.locals.sessions.create(user.id);
      response
        .cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge: env.sessionTtlMs })
        .status(200)
        .json({ user: publicUser(user), expiresAt: new Date(expiresAt).toISOString() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', async (request, response, next) => {
    try {
      await request.app.locals.sessions.destroy(request.cookies[SESSION_COOKIE]);
      response.clearCookie(SESSION_COOKIE, sessionCookieOptions()).status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
