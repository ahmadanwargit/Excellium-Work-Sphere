import { useState } from 'react';
import { Button, DataTable, EmptyState, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { BarChart } from '../common/BarChart';
import { approvedInvoiceSeries } from '../../utils/charts';
import { can } from '../../utils/portal';
import { exportInvoices, formatMoney, formErrorMessage, invoiceTotals } from '../../utils/workflows';

const newLine = () => ({ key: window.crypto.randomUUID(), description: '', quantity: 1, unitRate: '' });
const freshInvoice = () => ({ id: null, month: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), currency: 'USD', taxRate: 0, paymentDetails: '', notes: '', dueDate: '', lineItems: [newLine()], document: null });

function PaymentChart({ invoices }) {
  const series = approvedInvoiceSeries(invoices);
  return series.length ? <div className="space-y-6">{series.map(({ currency, points, totalPeriods }) => <div key={currency}><BarChart label={`Approved invoice totals · ${currency} · latest ${points.length} of ${totalPeriods} recorded periods · chronological order`} unit={` ${currency}`} points={points.map((point) => ({ label: point.label, value: point.total, formatted: formatMoney(point.total, currency), detail: `${point.count} approved invoice${point.count === 1 ? '' : 's'}` }))} /></div>)}<p className="mb-0 text-xs text-muted">Each currency has its own zero-based scale. No currency conversion is applied. Approval does not confirm payment; missing months are not invented.</p></div> : <EmptyState>No approved invoice history yet. Approval is not a confirmation of payment.</EmptyState>;
}

export function InvoicesPage({ user, invoices, actions, onError }) {
  const [editor, setEditor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('All');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const manager = can(user, 'reviewInvoices');
  const selfService = can(user, 'selfService');
  const totals = editor ? invoiceTotals(editor.lineItems, editor.taxRate) : null;
  const results = invoices.filter((invoice) => status === 'All' || invoice.status === status);
  const edit = (invoice) => {
    setError('');
    setEditor({ id: invoice.id, month: invoice.month, currency: invoice.currency ?? 'USD', taxRate: invoice.taxRate ?? 0, paymentDetails: invoice.paymentDetails ?? '', notes: invoice.notes ?? '', dueDate: invoice.dueDate ?? '', document: null, existingDocument: invoice.document?.originalName,
      lineItems: (invoice.lineItems?.length ? invoice.lineItems : [{ description: `Monthly services — ${invoice.month}`, quantity: 1, unitRate: invoice.amount }]).map((item) => ({ ...item, key: window.crypto.randomUUID() })) });
  };
  const changeLine = (key, field, value) => setEditor((previous) => ({ ...previous, lineItems: previous.lineItems.map((item) => item.key === key ? { ...item, [field]: value } : item) }));
  const save = async (event) => {
    event.preventDefault();
    const intent = event.nativeEvent.submitter?.value === 'Pending' ? 'Pending' : 'Draft';
    if (!Number.isFinite(totals.total) || totals.total <= 0 || totals.total > 1_000_000) { setError('Invoice total must be greater than zero and no more than 1,000,000.'); return; }
    const payload = new FormData();
    payload.set('month', editor.month);
    payload.set('currency', editor.currency);
    payload.set('taxRate', String(editor.taxRate));
    payload.set('paymentDetails', editor.paymentDetails);
    payload.set('notes', editor.notes);
    payload.set('dueDate', editor.dueDate);
    payload.set('status', editor.id ? 'Draft' : intent);
    payload.set('lineItems', JSON.stringify(editor.lineItems.map(({ description, quantity, unitRate }) => ({ description, quantity: Number(quantity), unitRate: Number(unitRate) }))));
    if (editor.document) payload.set('document', editor.document);
    try {
      setBusy(true); setError('');
      if (editor.id) {
        await actions.updateInvoiceDraft(editor.id, payload);
        if (intent === 'Pending') await actions.submitInvoice(editor.id);
      } else await actions.createInvoice(payload);
      setEditor(null);
      setStatus('All');
      onError(intent === 'Draft' ? 'Invoice draft saved' : 'Invoice sent for approval');
    } catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const run = async (operation, message) => {
    try { setBusy(true); await operation(); if (message) onError(message); }
    catch (failure) { onError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const viewDocument = (id) => run(async () => { const { url } = await actions.invoiceDocumentUrl(id); window.open(url, '_blank', 'noopener,noreferrer'); });
  const headings = ['ID', ...(manager ? ['Employee'] : []), 'Month', 'Amount', 'Status', 'Actions'];

  return <>
    <PageHeading title={manager ? 'Invoice approvals' : 'My salary invoices'} description={manager ? 'Review employee and trainer submissions. Drafts stay private to their owners; management cannot prepare personal invoices.' : 'Prepare invoices on the portal, save drafts and submit them for approval.'} action={<div className="flex gap-2">{selfService && <Button variant="primary" disabled={busy} onClick={() => { setError(''); setEditor(freshInvoice()); }}>Prepare invoice</Button>}<Button onClick={() => exportInvoices(invoices)}>Export records</Button></div>} />
    {selfService && editor && <div className="mb-4"><Panel title={editor.id ? `Edit draft ${editor.id}` : 'Prepare invoice'} action={<Button small type="button" disabled={busy} onClick={() => setEditor(null)}>Close editor</Button>}>
      <form onSubmit={save}>
        <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
            <div><label className="field-label" htmlFor="invoice-month">Invoice month / period</label><input id="invoice-month" className="field-control" required maxLength={50} value={editor.month} onChange={(event) => setEditor({ ...editor, month: event.target.value })} /></div>
            <div><label className="field-label" htmlFor="invoice-currency">Currency</label><select id="invoice-currency" className="field-control" value={editor.currency} onChange={(event) => setEditor({ ...editor, currency: event.target.value })}>{['USD', 'PKR', 'GBP', 'EUR', 'AED'].map((currency) => <option key={currency}>{currency}</option>)}</select></div>
            <div><label className="field-label" htmlFor="invoice-due">Due date (optional)</label><input id="invoice-due" className="field-control" type="date" value={editor.dueDate} onChange={(event) => setEditor({ ...editor, dueDate: event.target.value })} /></div>
          </div>
          <p className="mb-1 mt-5 text-sm font-semibold">Line items</p>
          <div className="space-y-3">{editor.lineItems.map((item, index) => <div className="grid grid-cols-2 items-end gap-3 rounded-xl border border-line p-3 lg:grid-cols-[minmax(180px,1fr)_90px_120px_120px_auto]" key={item.key}>
            <div className="col-span-2 lg:col-span-1"><label className="field-label !mt-0" htmlFor={`description-${item.key}`}>Description {index + 1}</label><input id={`description-${item.key}`} className="field-control" required maxLength={250} value={item.description} placeholder="Monthly services, project work…" onChange={(event) => changeLine(item.key, 'description', event.target.value)} /></div>
            <div><label className="field-label !mt-0" htmlFor={`quantity-${item.key}`}>Quantity {index + 1}</label><input id={`quantity-${item.key}`} className="field-control" required type="number" min="0.01" max="100000" step="0.01" value={item.quantity} onChange={(event) => changeLine(item.key, 'quantity', event.target.value)} /></div>
            <div><label className="field-label !mt-0" htmlFor={`rate-${item.key}`}>Unit rate {index + 1}</label><input id={`rate-${item.key}`} className="field-control" required type="number" min="0" max="1000000" step="0.01" value={item.unitRate} onChange={(event) => changeLine(item.key, 'unitRate', event.target.value)} /></div>
            <div className="pb-2"><small className="block text-muted">Line total</small><b>{formatMoney(Math.round((Number(item.quantity) * Number(item.unitRate) + Number.EPSILON) * 100) / 100, editor.currency)}</b></div>
            <Button type="button" small disabled={editor.lineItems.length === 1} aria-label={`Remove line item ${index + 1}`} onClick={() => setEditor({ ...editor, lineItems: editor.lineItems.filter((line) => line.key !== item.key) })}>Remove</Button>
          </div>)}</div>
          <Button className="mt-3" type="button" small disabled={editor.lineItems.length >= 50} onClick={() => setEditor({ ...editor, lineItems: [...editor.lineItems, newLine()] })}>Add line item</Button>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div><label className="field-label" htmlFor="invoice-payment">Payment details (optional)</label><input id="invoice-payment" className="field-control" maxLength={250} value={editor.paymentDetails} placeholder="Bank account or payment reference" onChange={(event) => setEditor({ ...editor, paymentDetails: event.target.value })} /><label className="field-label" htmlFor="invoice-notes">Notes (optional)</label><textarea id="invoice-notes" className="field-control" rows="3" maxLength={2000} value={editor.notes} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} /><label className="field-label" htmlFor="invoice-document">Supporting PDF (optional)</label><input id="invoice-document" className="field-control" type="file" accept="application/pdf,.pdf" onChange={(event) => setEditor({ ...editor, document: event.target.files?.[0] ?? null })} />{editor.existingDocument && <small className="text-muted">Current attachment: {editor.existingDocument}. Select a file only to replace it.</small>}</div>
            <div className="self-start rounded-xl bg-canvas p-4"><label className="field-label !mt-0" htmlFor="invoice-tax">Tax rate (%)</label><input id="invoice-tax" className="field-control" required type="number" min="0" max="100" step="0.01" value={editor.taxRate} onChange={(event) => setEditor({ ...editor, taxRate: event.target.value })} /><dl className="mb-0 space-y-3"><div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="m-0">{formatMoney(totals.subtotal, editor.currency)}</dd></div><div className="flex justify-between"><dt className="text-muted">Tax</dt><dd className="m-0">{formatMoney(totals.tax, editor.currency)}</dd></div><div className="flex justify-between border-t border-line pt-3 text-lg font-semibold"><dt>Total</dt><dd className="m-0 text-accent">{formatMoney(totals.total, editor.currency)}</dd></div></dl><p className="mb-0 text-xs text-muted">Totals are recalculated and validated by the server. A PDF is generated from the saved invoice; no document upload is required.</p></div>
          </div>
          {error && <p role="alert" className="mt-4 text-[var(--color-error)]">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2"><Button type="button" onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" value="Draft">{busy ? 'Saving…' : 'Save draft'}</Button><Button variant="primary" type="submit" value="Pending" disabled={busy}>Submit for approval</Button></div>
        </fieldset>
      </form>
    </Panel></div>}
    <Panel title="Invoices" action={<select aria-label="Filter invoice status" className="field-control !w-auto !py-1.5" value={status} onChange={(event) => setStatus(event.target.value)}>{['All', ...(selfService ? ['Draft'] : []), 'Pending', 'Approved', 'Rejected'].map((value) => <option key={value}>{value}</option>)}</select>}>
      {results.length ? <DataTable headings={headings} rows={results.map((item) => ({ id: item.id, cells: [item.id, ...(manager ? [item.employee?.name ?? '—'] : []), item.month, formatMoney(item.amount, item.currency), <StatusBadge key="status" status={item.status}>{item.status}</StatusBadge>, <span key="actions" className="flex flex-wrap gap-1.5">
        <Button small onClick={() => setPreview(item)}>View</Button><Button small disabled={busy} onClick={() => run(() => actions.downloadInvoice(item.id))}>PDF</Button>
        {item.document && <Button small disabled={busy} onClick={() => viewDocument(item.id)}>Attachment</Button>}
        {selfService && item.status === 'Draft' && item.employeeId === user.id && <><Button small disabled={busy} onClick={() => edit(item)}>Edit</Button><Button small variant="primary" disabled={busy} onClick={() => run(() => actions.submitInvoice(item.id), 'Invoice sent for approval')}>Submit</Button></>}
        {manager && item.canReview && item.status === 'Pending' && <><Button small variant="primary" disabled={busy} onClick={() => run(() => actions.decideInvoice(item.id, 'Approved'))}>Approve</Button><Button small variant="danger" disabled={busy} onClick={() => run(() => actions.decideInvoice(item.id, 'Rejected'))}>Reject</Button></>}
      </span>] }))} /> : <EmptyState>{manager ? 'No submitted staff invoices match this view.' : 'No invoices match this view. Prepare a new invoice to get started.'}</EmptyState>}
    </Panel>
    <div className="mt-4"><Panel title="Approved invoice history"><PaymentChart invoices={invoices} /></Panel></div>
    {preview && <Modal title={`Invoice ${preview.id}`} wide closeLabel="Close" onClose={() => setPreview(null)}>
      <div className="my-4 flex flex-wrap items-center justify-between gap-3"><div><b>{preview.employee?.name}</b><small className="block text-muted">{preview.employee?.email} · {preview.employee?.department}</small></div><StatusBadge status={preview.status}>{preview.status}</StatusBadge></div>
      <p>Period: <b>{preview.month}</b>{preview.dueDate && <> · Due: {preview.dueDate}</>}</p>
      <DataTable headings={['Description', 'Quantity', 'Unit rate', 'Amount']} rows={(preview.lineItems?.length ? preview.lineItems : [{ description: 'Monthly services', quantity: 1, unitRate: preview.amount, amount: preview.amount }]).map((item, index) => ({ id: index, cells: [<span key="description" className="inline-block max-w-[280px] whitespace-normal">{item.description}</span>, item.quantity, formatMoney(item.unitRate, preview.currency), formatMoney(item.amount, preview.currency)] }))} />
      <div className="my-4 space-y-1 text-right"><p className="m-0 text-muted">Subtotal: {formatMoney(preview.subtotal ?? preview.amount, preview.currency)}</p><p className="m-0 text-muted">Tax ({preview.taxRate ?? 0}%): {formatMoney(preview.taxAmount ?? 0, preview.currency)}</p><b className="block text-lg text-accent">Total: {formatMoney(preview.amount, preview.currency)}</b></div>
      {preview.paymentDetails && <p className="whitespace-pre-wrap"><b>Payment details:</b> {preview.paymentDetails}</p>}{preview.notes && <p className="whitespace-pre-wrap"><b>Notes:</b> {preview.notes}</p>}
      <Button type="button" disabled={busy} onClick={() => run(() => actions.downloadInvoice(preview.id))}>Download invoice PDF</Button>
    </Modal>}
  </>;
}
