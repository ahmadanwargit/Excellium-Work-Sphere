const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function sortByTimestamp(items, property = 'eventAt') {
  return [...items].sort((left, right) => new Date(left[property]) - new Date(right[property]));
}

function roundedPoint(sample) {
  return `${Math.round(sample.x)}:${Math.round(sample.y)}`;
}

function hasRepeatingLoop(samples) {
  const points = sortByTimestamp(samples).map(roundedPoint);
  if (points.length < 8) return false;

  // Look for a short coordinate sequence repeated at least three times. This
  // intentionally accepts a little noise only after the browser's 3s throttle.
  for (let size = 2; size <= 4; size += 1) {
    if (points.length < size * 3) continue;
    const tail = points.slice(-size * 3);
    const pattern = tail.slice(0, size).join('|');
    if (tail.slice(size, size * 2).join('|') === pattern && tail.slice(size * 2).join('|') === pattern) return true;
  }
  return false;
}

function hasFixedIntervalPixelNudges(samples) {
  const ordered = sortByTimestamp(samples);
  if (ordered.length < 8) return false;
  const tail = ordered.slice(-8);
  const intervals = [];
  let tinyMoves = 0;

  for (let index = 1; index < tail.length; index += 1) {
    const previous = tail[index - 1];
    const current = tail[index];
    const interval = new Date(current.eventAt) - new Date(previous.eventAt);
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
    if (distance > 0 && distance <= 3) tinyMoves += 1;
    intervals.push(interval);
  }

  const average = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  const variance = intervals.reduce((sum, interval) => sum + (interval - average) ** 2, 0) / intervals.length;
  // Repeated sub-pixel/two-pixel movement at a near-perfect cadence is a strong
  // signal; normal hand motion is far less regular after three-second sampling.
  return tinyMoves >= 6 && average >= 2_500 && average <= 12_000 && Math.sqrt(variance) <= 250;
}

function hasThirtyMinutesWithoutInput(samples, heartbeats, now) {
  const cutoff = new Date(now).getTime() - THIRTY_MINUTES_MS;
  const recentSamples = samples.filter((sample) => new Date(sample.eventAt).getTime() >= cutoff);
  const recentHeartbeats = heartbeats.filter((heartbeat) => new Date(heartbeat.recordedAt).getTime() >= cutoff);
  const motionSeconds = recentHeartbeats.reduce((sum, heartbeat) => sum + (heartbeat.durationSeconds || 0), 0);
  const directInput = recentHeartbeats.reduce((sum, heartbeat) => sum + (heartbeat.mouseClicks || 0) + (heartbeat.keypresses || 0), 0);
  const first = recentSamples[0] && new Date(recentSamples[0].eventAt).getTime();
  const last = recentSamples.at(-1) && new Date(recentSamples.at(-1).eventAt).getTime();

  return recentSamples.length >= 10 && motionSeconds >= 30 * 60 && directInput === 0 && last - first >= THIRTY_MINUTES_MS;
}

/**
 * Returns stable, reviewable heuristic labels. These are deliberately signals
 * for an admin review, not automated disciplinary decisions.
 */
export function detectJigglerPatterns({ samples = [], heartbeats = [], now = new Date().toISOString() }) {
  const flags = [];
  if (hasRepeatingLoop(samples)) flags.push('REPETITIVE_COORDINATE_LOOP');
  if (hasFixedIntervalPixelNudges(samples)) flags.push('FIXED_INTERVAL_PIXEL_NUDGE');
  if (hasThirtyMinutesWithoutInput(samples, heartbeats, now)) flags.push('MOTION_WITHOUT_INPUT_30_MIN');
  return flags;
}
