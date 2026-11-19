export function weeklyWorkSeries(records, now = new Date()) {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end.getTime() - (6 - index) * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    const minutes = records.filter((record) => record.date === key && !record.incomplete).reduce((sum, record) => sum + Math.max(0, Number(record.workedMinutes) || 0), 0);
    return { id: key, label: date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }), value: minutes / 60, formatted: `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`, detail: key };
  });
}

export function approvedInvoiceSeries(invoices) {
  const currencies = new Map();
  invoices.filter((invoice) => invoice.status === 'Approved').forEach((invoice) => {
    const currency = invoice.currency ?? 'USD';
    const periods = currencies.get(currency) ?? new Map();
    const existing = periods.get(invoice.month);
    const calendarMonth = Date.parse(/^\d{4}-\d{2}$/.test(invoice.month) ? `${invoice.month}-01T00:00:00Z` : `1 ${invoice.month}`);
    const order = Number.isFinite(calendarMonth) ? calendarMonth : Date.parse(invoice.submittedAt ?? invoice.createdAt ?? '') || 0;
    periods.set(invoice.month, { label: invoice.month, total: Math.round(((existing?.total ?? 0) + invoice.amount) * 100) / 100, count: (existing?.count ?? 0) + 1, order: Math.max(existing?.order ?? order, order) });
    currencies.set(currency, periods);
  });
  return [...currencies].sort(([a], [b]) => a.localeCompare(b)).map(([currency, periods]) => ({ currency, totalPeriods: periods.size, points: [...periods.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)).slice(-6) }));
}
