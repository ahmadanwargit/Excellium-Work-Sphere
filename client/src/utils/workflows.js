export function formatMoney(value, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 2 }).format(Number(value) || 0);
}

export function formErrorMessage(error) {
  const details = Object.values(error.details?.fieldErrors ?? {}).flat().join(' ');
  return details || error.message || 'Something went wrong. Please try again.';
}

export function calendarDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const days = Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
  return Number.isFinite(days) ? days : 0;
}

export function invoiceTotals(items, taxRate) {
  const subtotalCents = items.reduce((sum, item) => sum + Math.round((Number(item.quantity) * Number(item.unitRate) + Number.EPSILON) * 100), 0);
  const taxCents = Math.round(subtotalCents * Number(taxRate) / 100);
  return { subtotal: subtotalCents / 100, tax: taxCents / 100, total: (subtotalCents + taxCents) / 100 };
}

export function exportInvoices(invoices) {
  const escape = (value) => {
    const text = String(value ?? '');
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = [['ID', 'Employee', 'Period', 'Currency', 'Amount', 'Status'], ...invoices.map((invoice) => [invoice.id, invoice.employee?.name, invoice.month, invoice.currency ?? 'USD', invoice.amount, invoice.status])];
  const url = window.URL.createObjectURL(new window.Blob([rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'excellium-invoices.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.URL.revokeObjectURL(url);
}
