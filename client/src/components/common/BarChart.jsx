import { EmptyState } from './UI';

// A true zero-baseline, shared scale per chart. Exact values and full labels
// remain visible without hover, color perception or a wide desktop viewport.
export function BarChart({ label, points, max, unit = '', emptyMessage = 'No recorded data for this period.' }) {
  if (!points.length) return <EmptyState>{emptyMessage}</EmptyState>;
  const scale = max ?? Math.max(1, ...points.map((point) => Number(point.value) || 0));
  const tick = (value) => `${Number(value.toFixed(1)).toLocaleString()}${unit}`;
  return <figure className="m-0 min-w-0" aria-label={label}>
    <figcaption className="mb-4 text-xs text-muted">{label}</figcaption>
    <div className="space-y-4">{points.map((point, index) => {
      const valid = typeof point.value === 'number' && Number.isFinite(point.value);
      return <div key={point.id ?? point.label ?? index} className="min-w-0">
        <div className="mb-1 flex items-start justify-between gap-3 text-xs"><span className="min-w-0 break-words font-medium">{point.label}</span><b className="shrink-0 tabular-nums">{point.formatted ?? (valid ? tick(point.value) : 'No eligible days')}</b></div>
        <div className="h-2.5 overflow-hidden rounded bg-line" aria-hidden="true"><span className="block h-full rounded bg-accent" style={{ width: `${valid ? Math.min(100, Math.max(0, point.value / scale * 100)) : 0}%` }} /></div>
        {point.detail && <small className="mt-1 block text-xs text-muted">{point.detail}</small>}
      </div>;
    })}</div>
    <div className="mt-3 flex justify-between border-t border-line pt-2 text-[11px] tabular-nums text-muted" aria-hidden="true"><span>{tick(0)}</span><span>{tick(scale / 2)}</span><span>{tick(scale)}</span></div>
  </figure>;
}
