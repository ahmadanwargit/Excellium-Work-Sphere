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
  isProduction: process.env.NODE_ENV === 'production'
});
