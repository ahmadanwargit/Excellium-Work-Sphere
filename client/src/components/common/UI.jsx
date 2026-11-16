import { useEffect } from 'react';

export function Button({ children, variant = 'default', small = false, className = '', ...props }) {
  const tone = variant === 'primary' ? 'app-button-primary' : variant === 'danger' ? 'app-button-danger' : '';
  return <button className={`app-button ${tone} ${small ? 'app-button-small' : ''} ${className}`} {...props}>{children}</button>;
}

export function Panel({ title, action, children, className = '' }) {
  return <section className={`panel ${className}`}>
    {title && <div className="mb-3 flex items-center justify-between gap-3"><h4 className="m-0 text-sm font-semibold">{title}</h4>{action}</div>}
    {children}
  </section>;
}

export function MetricCard({ label, value, detail }) {
  return <article className="panel metric-card"><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>;
}

export function PageHeading({ title, description, action, hero = false }) {
  return <header className={`page-heading ${hero ? 'dashboard-hero rounded-2xl px-[30px] py-[26px] text-white shadow-card' : ''}`}>
    <div><h3>{title}</h3><p className={hero ? '!text-[#dcd2f5]' : ''}>{description}</p></div>{action && <div>{action}</div>}
  </header>;
}

export function DataTable({ headings, rows }) {
  return <div className="overflow-x-auto"><table className="data-table"><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index}>{row.cells.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function Modal({ title, children, confirmLabel = 'Save', onClose, onConfirm, busy = false }) {
  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <div className="fixed inset-0 z-20 grid place-items-center bg-black/50 p-4" role="presentation">
    <div className="max-h-[90vh] w-full max-w-[460px] overflow-auto rounded-2xl bg-surface p-[22px] shadow-[0_24px_60px_-12px_rgba(0,0,0,.5)]" role="dialog" aria-modal="true" aria-label={title}>
      <h4 className="m-0 mb-1 text-[17px]">{title}</h4>{children}
      <div className="mt-5 flex justify-end gap-2"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={onConfirm} disabled={busy}>{busy ? 'Saving…' : confirmLabel}</Button></div>
    </div>
  </div>;
}

export function Toast({ message }) {
  if (!message) return null;
  return <div className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-md bg-ink px-[18px] py-2.5 text-canvas shadow-lg">{message}</div>;
}

export function EmptyState({ children }) {
  return <p className="m-0 py-3 text-muted">{children}</p>;
}
