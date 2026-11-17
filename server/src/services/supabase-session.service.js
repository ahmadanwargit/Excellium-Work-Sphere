import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { createSupabaseServerClient } from './supabase-client.service.js';

const TABLE = 'excellium_auth_sessions';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const isSessionToken = (token) => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

/**
 * Shared, revocable sessions for Vercel's independent function instances.
 * Only a hash is persisted; the bearer token stays in the HttpOnly cookie.
 */
export class SupabaseSessionService {
  constructor({ client = createSupabaseServerClient(), now = Date.now } = {}) {
    this.client = client;
    this.now = now;
  }

  async create(userId) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + env.sessionTtlMs;
    const { error } = await this.client.from(TABLE).insert({
      token_hash: tokenHash(token),
      user_id: userId,
      expires_at: new Date(expiresAt).toISOString()
    });
    if (error) throw new Error('Unable to create the shared sign-in session');
    return { token, expiresAt };
  }

  async get(token) {
    if (!isSessionToken(token)) return null;
    const { data, error } = await this.client.from(TABLE)
      .select('user_id, expires_at')
      .eq('token_hash', tokenHash(token))
      .gt('expires_at', new Date(this.now()).toISOString())
      .maybeSingle();
    if (error) throw new Error('Unable to load the shared sign-in session');
    return data ? { userId: data.user_id, expiresAt: Date.parse(data.expires_at) } : null;
  }

  async destroy(token) {
    if (!isSessionToken(token)) return;
    const { error } = await this.client.from(TABLE).delete().eq('token_hash', tokenHash(token));
    if (error) throw new Error('Unable to revoke the shared sign-in session');
  }
}
