import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';

export function hasSupabaseConfiguration() {
  return Boolean(env.supabaseUrl && env.supabaseSecretKey);
}

/**
 * Creates a server-only client. The secret key bypasses RLS and must never be
 * exposed to the React application or prefixed with VITE_.
 */
export function createSupabaseServerClient() {
  if (!hasSupabaseConfiguration()) {
    throw new HttpError(503, 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY on the server.');
  }

  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
