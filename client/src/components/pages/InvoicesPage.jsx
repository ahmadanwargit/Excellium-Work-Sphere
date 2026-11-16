import { useState } from 'react';
import { Button, DataTable, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { isManager } from '../../utils/portal';

function PaymentChart() {
  const months = [['Jun', 4200], ['Jul', 4200], ['Aug', 4000], ['Sep', 4200], ['Oct', 4200]];
  return <div className="flex h-[150px] items-end gap-2.5 pt-2.5">{months.map(([month, value]) => <div className="chart-column" key={month}><i className="chart-column-bar" style={{ height: `${value / 4200 * 100}%` }} />{month}</div>)}</div>;
}

export function InvoicesPage({ user, invoices, actions, onError }) {
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState({ month: 'November 2026', amount: 4200, paymentDetails: '', document: null });
  const manager = isManager(user.role);
  const submit = async () => {
    const payload = new FormData();
    payload.append('month', invoice.month);
    payload.append('amount', invoice.amount);
    payload.append('paymentDetails', invoice.paymentDetails);
    if (invoice.document) payload.append('document', invoice.document);
    try { setBusy(true); await actions.createInvoice(payload); setShowModal(false); } catch (error) { onError(error.message); } finally { setBusy(false); }
  };
  const decide = async (id, status) => { try { await actions.decideInvoice(id, status); } catch (error) { onError(error.message); } };
  const viewDocument = async (id) => { try { const { url } = await actions.invoiceDocumentUrl(id); window.open(url, '_blank', 'noopener,noreferrer'); } catch (error) { onError(error.message); } };
  const headings = ['ID', ...(manager ? ['Employee'] : []), 'Month', 'Amount', 'Status', ''];
  return <>
    <PageHeading title="Salary invoices" description={manager ? 'Review and decide on submitted invoices.' : 'Submit and track your monthly invoices.'} action={<div className="flex gap-2">{user.role === 'employee' && <Button variant="primary" onClick={() => setShowModal(true)}>Submit invoice</Button>}<Button onClick={() => onError('Invoice records exported')}>Export records</Button></div>} />
    <Panel title="Invoices"><DataTable headings={headings} rows={invoices.map((item) => ({ id: item.id, cells: [item.id, ...(manager ? [item.employee?.name ?? '—'] : []), item.month, `$${item.amount.toLocaleString()}`, <StatusBadge key={`${item.id}-status`} status={item.status}>{item.status}</StatusBadge>, <span key={`${item.id}-actions`} className="flex gap-1.5">{item.document && <Button small onClick={() => viewDocument(item.id)}>Document</Button>}{manager && item.status === 'Pending' && <><Button small variant="primary" onClick={() => decide(item.id, 'Approved')}>Approve</Button><Button small variant="danger" onClick={() => decide(item.id, 'Rejected')}>Reject</Button></>}</span>] }))} /></Panel>
    <div className="mt-4"><Panel title="Payment history"><PaymentChart /></Panel></div>
    {showModal && <Modal title="Submit invoice" confirmLabel="Submit invoice" onClose={() => setShowModal(false)} onConfirm={submit} busy={busy}><label className="field-label">Month</label><select className="field-control" value={invoice.month} onChange={(event) => setInvoice({ ...invoice, month: event.target.value })}><option>November 2026</option><option>October 2026</option></select><label className="field-label">Amount (USD)</label><input className="field-control" type="number" value={invoice.amount} onChange={(event) => setInvoice({ ...invoice, amount: event.target.value })} /><label className="field-label">Payment details</label><input className="field-control" value={invoice.paymentDetails} placeholder="Bank account or reference" onChange={(event) => setInvoice({ ...invoice, paymentDetails: event.target.value })} /><label className="field-label">PDF document</label><input className="field-control" type="file" accept=".pdf" onChange={(event) => setInvoice({ ...invoice, document: event.target.files?.[0] ?? null })} /></Modal>}
  </>;
}
