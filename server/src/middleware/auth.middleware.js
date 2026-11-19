import { findUser, isAdmin, isManager } from '../services/records.service.js';
import { forbidden, unauthorized } from '../utils/http-error.js';
import { can } from '../../../shared/access-control.mjs';

const SESSION_COOKIE = 'excellium_session';

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
}

export async function requireAuthentication(request, _response, next) {
  try {
    const token = request.cookies[SESSION_COOKIE] || request.get('authorization')?.replace(/^Bearer\s+/i, '');
    const session = await request.app.locals.sessions.get(token);
    if (!session) throw unauthorized('Your session has expired. Please sign in again.');
    const user = findUser(request.app.locals.store.data, session.userId);
    if (!user || user.active === false) throw unauthorized('Your account is no longer available');
    request.auth = { token, user };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireManagement(request, _response, next) {
  if (!isManager(request.auth.user)) return next(forbidden('This action requires management access'));
  return next();
}

export function requireAdministrator(request, _response, next) {
  if (!isAdmin(request.auth.user)) return next(forbidden('This action requires finance or admin access'));
  return next();
}

export function requirePermission(permission) {
  return (request, _response, next) => {
    if (!can(request.auth.user, permission)) return next(forbidden('Your role cannot use this functionality'));
    return next();
  };
}

export { SESSION_COOKIE };
