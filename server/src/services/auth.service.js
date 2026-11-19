import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const passwordSalt = randomBytes(24).toString('hex');
  return { passwordSalt, passwordHash: scryptSync(password, passwordSalt, 64).toString('hex') };
}

export function verifyPassword(password, user) {
  const supplied = scryptSync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, 'hex');
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}
