import { useMemo, useState } from 'react';
import { Button, DataTable, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { isManager } from '../../utils/portal';

export function EquipmentPage({ user, equipment, actions, onError }) {
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('All');
  const [form, setForm] = useState({ item: 'MacBook Pro 14"', type: 'Replacement', reason: '' });
  const manager = isManager(user.role);
  const inventory = useMemo(() => equipment.assets.filter((asset) => filter === 'All' || asset.type === filter), [equipment.assets, filter]);
  const submit = async () => { try { setBusy(true); await actions.createEquipmentRequest(form); setShowModal(false); setForm({ item: 'MacBook Pro 14"', type: 'Replacement', reason: '' }); } catch (error) { onError(error.message); } finally { setBusy(false); } };
  const decide = async (id, status) => { try { await actions.decideEquipmentRequest(id, status); } catch (error) { onError(error.message); } };
  return <>
    <PageHeading title="Equipment and assets" description="Your devices, requests and company inventory." action={<Button variant="primary" onClick={() => setShowModal(true)}>Request change</Button>} />
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Panel title="My equipment">{equipment.assets.filter((asset) => !manager || asset.assignedTo === user.id).slice(0, manager ? 2 : undefined).map((asset) => <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0" key={asset.id}><div>{asset.name}<small className="block text-muted">{asset.type} · SN {asset.serialNumber} · {asset.issuedOn ? `Issued ${asset.issuedOn}` : 'Not assigned'}</small></div><Button small onClick={() => setShowModal(true)}>Request</Button></div>)}</Panel><Panel title="Requests"><DataTable headings={['ID', 'Item', 'Type', 'Status', '']} rows={equipment.requests.map((item) => ({ cells: [item.id, item.item, item.type, <StatusBadge key={`${item.id}-status`} status={item.status}>{item.status}</StatusBadge>, manager && item.status === 'Pending' ? <span key={`${item.id}-actions`} className="flex gap-1.5"><Button small variant="primary" onClick={() => decide(item.id, 'Approved')}>Approve</Button><Button small variant="danger" onClick={() => decide(item.id, 'Rejected')}>Reject</Button></span> : ''] }))} /></Panel></div>
    {manager && <div className="mt-4"><Panel title="Company inventory"><select className="field-control mb-2.5 w-auto" value={filter} onChange={(event) => setFilter(event.target.value)}>{['All', 'Laptop', 'Monitor', 'Phone', 'Keyboard'].map((type) => <option key={type}>{type}</option>)}</select><DataTable headings={['Asset', 'Type', 'Tag', 'Assigned to', 'Status']} rows={inventory.map((asset) => ({ cells: [asset.name, asset.type, asset.id, asset.assignee?.name ?? 'Unassigned', <StatusBadge key={`${asset.id}-status`} status={asset.status}>{asset.status}</StatusBadge>] }))} /></Panel></div>}
    {showModal && <Modal title="Request equipment change" confirmLabel="Submit request" onClose={() => setShowModal(false)} onConfirm={submit} busy={busy}><label className="field-label">Item</label><input className="field-control" value={form.item} onChange={(event) => setForm({ ...form, item: event.target.value })} /><label className="field-label">Request type</label><select className="field-control" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{['Replacement', 'Upgrade', 'Repair', 'Return'].map((type) => <option key={type}>{type}</option>)}</select><label className="field-label">Reason</label><textarea className="field-control" rows="3" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /><label className="field-label">Supporting image</label><input className="field-control" type="file" accept="image/*" /></Modal>}
  </>;
}
