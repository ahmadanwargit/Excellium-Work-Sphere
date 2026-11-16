import { randomBytes } from 'node:crypto';

export function createId(prefix) {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

export function nextSequenceId(items, prefix, property = 'id') {
  const highest = Math.max(
    0,
    ...items
      .map((item) => Number(String(item[property]).replace(/^\D+/, '')))
      .filter(Number.isFinite)
  );

  return `${prefix}-${highest + 1}`;
}

export const currentIso = () => new Date().toISOString();
export const currentDateKey = () => currentIso().slice(0, 10);
