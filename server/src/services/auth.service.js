import { scryptSync, timingSafeEqual } from 'node:crypto';

export function verifyPassword(password, user) {
  const supplied = scryptSync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, 'hex');
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}
