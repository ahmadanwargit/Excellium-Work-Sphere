import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

export class SessionService {
  constructor() {
    this.sessions = new Map();
  }

  create(userId) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + env.sessionTtlMs;
    this.sessions.set(token, { userId, expiresAt });
    return { token, expiresAt };
  }

  get(token) {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      if (token) this.sessions.delete(token);
      return null;
    }
    return session;
  }

  destroy(token) {
    if (token) this.sessions.delete(token);
  }
}
