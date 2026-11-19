import { useMemo, useState } from 'react';
import { Button, DataTable, EmptyState, MetricCard, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { can } from '../../utils/portal';
import { formErrorMessage } from '../../utils/workflows';

const blankRequest = () => ({ item: '', type: 'Replacement', reason: '', attachment: null });

export function EquipmentPage({ user, equipment, actions, onError, inventoryOnly = false }) {
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [error, setError] = useState('');
  const [form, setForm] = useState(blankRequest);
  const reviewer = can(user, 'reviewEquipment');
  const selfService = can(user, 'selfService');
  const inventory = useMemo(() => equipment.assets.filter((asset) => (filter === 'All' || asset.type === filter) && `${asset.name} ${asset.serialNumber} ${asset.assignee?.name ?? ''}`.toLowerCase().includes(query.toLowerCase())), [equipment.assets, filter, query]);
  const submit = async () => {
    const payload = new FormData();
    payload.append('item', form.item); payload.append('type', form.type); payload.append('reason', form.reason);
    if (form.attachment) payload.append('attachment', form.attachment);
    try { setBusy(true); setError(''); await actions.createEquipmentRequest(payload); setShowModal(false); setForm(blankRequest()); onError('Equipment request sent to management'); }
    catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const decide = async (id, decision) => {
    try { setBusy(true); await actions.decideEquipmentRequest(id, decision); onError(`Equipment request ${decision.toLowerCase()}`); }
    catch (failure) { onError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const viewAttachment = async (id) => {
    try { const { url } = await actions.equipmentAttachmentUrl(id); window.open(url, '_blank', 'noopener,noreferrer'); }
    catch (failure) { onError(failure.message); }
  };

  if (inventoryOnly) return <>
    <PageHeading title="Company asset inventory" description="Management-only inventory and assignment overview. Employee and trainer portals see only their own assigned equipment." />
    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><MetricCard label="Total assets" value={equipment.assets.length} detail="Company inventory" /><MetricCard label="Assigned" value={equipment.assets.filter((asset) => asset.assignedTo).length} detail="Assigned to a staff member" /><MetricCard label="Unassigned" value={equipment.assets.filter((asset) => !asset.assignedTo).length} detail="Available or under service" /></div>
    <Panel title="Asset inventory"><div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]"><input aria-label="Search assets" className="field-control" placeholder="Search asset, serial number or assignee" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter asset type" className="field-control !w-auto" value={filter} onChange={(event) => setFilter(event.target.value)}>{['All', ...new Set(equipment.assets.map((asset) => asset.type))].map((type) => <option key={type}>{type}</option>)}</select></div>{inventory.length ? <DataTable headings={['Asset', 'Type', 'Serial number', 'Assigned to', 'Status']} rows={inventory.map((asset) => ({ id: asset.id, cells: [asset.name, asset.type, asset.serialNumber, asset.assignee?.name ?? 'Unassigned', <StatusBadge key="status" status={asset.status}>{asset.status}</StatusBadge>] }))} /> : <EmptyState>No assets match this view.</EmptyState>}</Panel>
  </>;

  const requests = equipment.requests.filter((item) => status === 'All' || item.status === status);
  return <>
    <PageHeading title={reviewer ? 'Equipment request approvals' : 'My equipment'} description={reviewer ? 'Review staff replacement, repair, upgrade and return requests. Company assets have their own inventory page.' : 'View your assigned devices and submit equipment requests to management.'} action={selfService && <Button variant="primary" onClick={() => { setError(''); setShowModal(true); }}>Request change</Button>} />
    {selfService && <div className="mb-4"><Panel title="My assigned equipment">{equipment.assets.length ? equipment.assets.map((asset) => <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0" key={asset.id}><div><b>{asset.name}</b><small className="block text-muted">{asset.type} · SN {asset.serialNumber}{asset.issuedOn && ` · Issued ${asset.issuedOn}`}</small></div><Button small onClick={() => { setForm({ ...blankRequest(), item: asset.name }); setError(''); setShowModal(true); }}>Request</Button></div>) : <EmptyState>No equipment is assigned to you yet.</EmptyState>}</Panel></div>}
    <Panel title={reviewer ? 'Staff equipment requests' : 'My requests'} action={<select aria-label="Filter equipment request status" className="field-control !w-auto !py-1.5" value={status} onChange={(event) => setStatus(event.target.value)}>{['All', 'Pending', 'Approved', 'Rejected'].map((value) => <option key={value}>{value}</option>)}</select>}>
      {requests.length ? <DataTable headings={['Request', ...(reviewer ? ['Employee / trainer'] : []), 'Item / reason', 'Type', 'Status', 'Decision / actions']} rows={requests.map((item) => ({ id: item.id, cells: [item.id, ...(reviewer ? [<span key="person"><b>{item.employee?.name}</b><small className="block text-muted">{item.employee?.department}</small></span>] : []), <span key="item" className="inline-block max-w-[300px] whitespace-normal"><b>{item.item}</b><small className="mt-1 block whitespace-pre-wrap text-muted">{item.reason}</small></span>, item.type, <StatusBadge key="status" status={item.status}>{item.status}</StatusBadge>, <div key="actions" className="space-y-1"><span className="flex flex-wrap gap-1.5">{item.attachment && <Button small onClick={() => viewAttachment(item.id)}>View attachment</Button>}{reviewer && item.canReview && item.status === 'Pending' && <><Button small variant="primary" disabled={busy} onClick={() => decide(item.id, 'Approved')}>Approve</Button><Button small variant="danger" disabled={busy} onClick={() => decide(item.id, 'Rejected')}>Reject</Button></>}</span>{item.decidedByUser && <small className="block text-muted">By {item.decidedByUser.name}</small>}</div>] }))} /> : <EmptyState>No equipment requests match this view.</EmptyState>}
    </Panel>
    {selfService && showModal && <Modal title="Request equipment change" confirmLabel="Submit request" onClose={() => setShowModal(false)} onConfirm={submit} busy={busy}><label className="field-label" htmlFor="equipment-item">Item</label><input id="equipment-item" className="field-control" required maxLength={150} value={form.item} onChange={(event) => setForm({ ...form, item: event.target.value })} /><label className="field-label" htmlFor="equipment-type">Request type</label><select id="equipment-type" className="field-control" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{['Replacement', 'Upgrade', 'Repair', 'Return'].map((type) => <option key={type}>{type}</option>)}</select><label className="field-label" htmlFor="equipment-reason">Reason</label><textarea id="equipment-reason" className="field-control" rows="3" required maxLength={1000} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /><label className="field-label" htmlFor="equipment-attachment">Supporting image (optional)</label><input id="equipment-attachment" className="field-control" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setForm({ ...form, attachment: event.target.files?.[0] ?? null })} />{error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}</Modal>}
  </>;
}
