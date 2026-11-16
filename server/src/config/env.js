import 'dotenv/config';

function numberFromEnvironment(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: numberFromEnvironment('PORT', 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  sessionTtlMs: numberFromEnvironment('SESSION_TTL_HOURS', 8) * 60 * 60 * 1000,
  supabaseUrl: process.env.SUPABASE_URL?.trim() || null,
  // SUPABASE_SECRET_KEY is the preferred modern name. SERVICE_ROLE_KEY is
  // accepted for projects that still use Supabase's legacy key terminology.
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
  supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'excellium-uploads',
  uploadMaxBytes: numberFromEnvironment('SUPABASE_UPLOAD_MAX_BYTES', 10 * 1024 * 1024),
  signedUrlTtlSeconds: numberFromEnvironment('SUPABASE_SIGNED_URL_TTL_SECONDS', 300),
  isProduction: process.env.NODE_ENV === 'production'
});
