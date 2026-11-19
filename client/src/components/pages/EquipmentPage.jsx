import { useMemo, useState } from 'react';
import { Button, DataTable, EmptyState, MetricCard, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { can } from '../../utils/portal';
import { formErrorMessage } from '../../utils/workflows';

const today = () => new Date().toISOString().slice(0, 10);
const blankRequest = () => ({ item: '', type: 'Replacement', reason: '', attachment: null });
const blankAsset = (person = '', name = '') => ({ id: '', name, type: '', serialNumber: '', assignedTo: person, status: person ? 'In use' : 'Available', issuedOn: person ? today() : '' });

function AssetEditor({ initial, equipment, actions, onClose, onDone, onNavigate }) {
  const [asset, setAsset] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assignees = equipment.assignees ?? [];
  const chooseAsset = (id) => {
    const selected = equipment.assets.find((item) => item.id === id);
    setAsset(selected ? { id, name: selected.name, type: selected.type, serialNumber: selected.serialNumber, assignedTo: initial.assignedTo || selected.assignedTo || '', status: initial.assignedTo ? 'In use' : selected.status, issuedOn: initial.assignedTo ? today() : selected.issuedOn || '' } : blankAsset(initial.assignedTo, initial.name));
    setError('');
  };
  const submit = async () => {
    try {
      setBusy(true); setError('');
      const { id, ...fields } = asset;
      const payload = { ...fields, assignedTo: fields.assignedTo || null, issuedOn: fields.issuedOn || null };
      if (id) await actions.updateAsset(id, payload); else await actions.createAsset(payload);
      onDone(asset.assignedTo ? 'Equipment assignment saved. The same details now appear in the assignee’s My equipment section.' : 'Equipment saved as unassigned. Any previous owner will no longer see it.');
    } catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  return <Modal title={initial.id ? 'Edit equipment assignment' : 'Add / assign equipment'} wide confirmLabel="Save equipment assignment" onClose={onClose} onConfirm={submit} busy={busy}>
    <p className="text-xs leading-relaxed text-muted">Use an existing inventory device or add a new one. Assignment is recorded separately from request approval so the actual serial number, issue date and condition stay accurate.</p>
    {!initial.id && <><label className="field-label" htmlFor="equipment-record">Equipment record</label><select id="equipment-record" className="field-control" value={asset.id} onChange={(event) => chooseAsset(event.target.value)}><option value="">Add new equipment</option>{equipment.assets.filter((item) => item.canEdit).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.serialNumber} · {item.assignee?.name ?? 'Unassigned'}</option>)}</select></>}
    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
      <div><label className="field-label" htmlFor="asset-name">Equipment name</label><input id="asset-name" className="field-control" required maxLength={150} value={asset.name} onChange={(event) => setAsset({ ...asset, name: event.target.value })} /></div>
      <div><label className="field-label" htmlFor="asset-type">Equipment type</label><input id="asset-type" className="field-control" required maxLength={80} placeholder="Laptop, monitor, phone…" value={asset.type} onChange={(event) => setAsset({ ...asset, type: event.target.value })} /></div>
      <div><label className="field-label" htmlFor="asset-serial">Serial number</label><input id="asset-serial" className="field-control" required maxLength={100} value={asset.serialNumber} onChange={(event) => setAsset({ ...asset, serialNumber: event.target.value })} /></div>
      <div><label className="field-label" htmlFor="asset-employee">Select employee / trainer</label><select id="asset-employee" className="field-control" value={asset.assignedTo} onChange={(event) => { const id = event.target.value; setAsset({ ...asset, assignedTo: id, issuedOn: id ? today() : '', status: id ? 'In use' : 'Available' }); }}><option value="">Unassigned / returned</option>{asset.assignedTo && !assignees.some((person) => person.id === asset.assignedTo) && <option disabled value={asset.assignedTo}>Former or inactive assignee — select a new owner or return</option>}{assignees.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.department}</option>)}</select></div>
      <div><label className="field-label" htmlFor="asset-issued">Issue date (UTC)</label><input id="asset-issued" className="field-control" type="date" required={Boolean(asset.assignedTo)} disabled={!asset.assignedTo} max={today()} value={asset.issuedOn} onChange={(event) => setAsset({ ...asset, issuedOn: event.target.value })} /></div>
      <div><label className="field-label" htmlFor="asset-status">Equipment status</label><select id="asset-status" className="field-control" value={asset.status} onChange={(event) => setAsset({ ...asset, status: event.target.value })}>{[...(asset.assignedTo ? ['In use'] : ['Available']), 'In repair'].map((status) => <option key={status}>{status}</option>)}</select></div>
    </div>
    <p className="text-xs text-muted">One current owner per device. Reassigning removes the device from its previous owner’s portal. Existing equipment and profile history remain in the audit trail.</p>
    <Button small type="button" onClick={() => { onClose(); onNavigate('users'); }}>Need a new employee? Open employee profiles</Button>
    {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}
  </Modal>;
}

export function EquipmentPage({ user, equipment, actions, onError, onNavigate, inventoryOnly = false }) {
  const [showModal, setShowModal] = useState(false);
  const [assetEditor, setAssetEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [error, setError] = useState('');
  const [form, setForm] = useState(blankRequest);
  const reviewer = can(user, 'reviewEquipment');
  const assigner = can(user, 'assignEquipment');
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
    try { setBusy(true); await actions.decideEquipmentRequest(id, decision); onError(`Equipment request ${decision.toLowerCase()}. Record any device assignment below.`); }
    catch (failure) { onError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const viewAttachment = async (id) => {
    try { const { url } = await actions.equipmentAttachmentUrl(id); window.open(url, '_blank', 'noopener,noreferrer'); }
    catch (failure) { onError(failure.message); }
  };
  const requests = equipment.requests.filter((item) => status === 'All' || item.status === status);
  return <>
    <PageHeading title={inventoryOnly ? 'Company asset inventory' : reviewer ? 'Equipment request approvals' : 'My equipment'} description={assigner ? 'Review requests, add devices and select employees or trainers to record their actual equipment assignments. Saved details are shared with each assignee’s portal.' : 'Your assigned devices, serial numbers, issue dates and equipment status — the same records maintained by management.'} action={<div className="flex flex-wrap gap-2">{assigner && <Button variant="primary" onClick={() => setAssetEditor(blankAsset())}>Add / assign equipment</Button>}{selfService && <Button variant="primary" onClick={() => { setError(''); setShowModal(true); }}>Request change</Button>}</div>} />
    {assigner && <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><MetricCard label="Total assets" value={equipment.assets.length} detail="Saved company inventory" /><MetricCard label="Assigned" value={equipment.assets.filter((asset) => asset.assignedTo).length} detail="Including returns still to be recorded" /><MetricCard label="Unassigned" value={equipment.assets.filter((asset) => !asset.assignedTo).length} detail="Available or under service" /></div>}
    {!inventoryOnly && <Panel title={reviewer ? 'Staff equipment requests' : 'My requests'} action={<select aria-label="Filter equipment request status" className="field-control !w-auto !py-1.5" value={status} onChange={(event) => setStatus(event.target.value)}>{['All', 'Pending', 'Approved', 'Rejected'].map((value) => <option key={value}>{value}</option>)}</select>}>
      {requests.length ? <DataTable headings={['Request', ...(reviewer ? ['Employee / trainer'] : []), 'Item / reason', 'Type', 'Status', 'Decision / actions']} rows={requests.map((item) => ({ id: item.id, cells: [item.id, ...(reviewer ? [<span key="person"><b>{item.employee?.name}</b><small className="block text-muted">{item.employee?.department}</small></span>] : []), <span key="item" className="inline-block max-w-[300px] whitespace-normal"><b>{item.item}</b><small className="mt-1 block whitespace-pre-wrap text-muted">{item.reason}</small></span>, item.type, <StatusBadge key="status" status={item.status}>{item.status}</StatusBadge>, <div key="actions" className="space-y-1"><span className="flex flex-wrap gap-1.5">{item.attachment && <Button small onClick={() => viewAttachment(item.id)}>View attachment</Button>}{reviewer && item.canReview && item.status === 'Pending' && <><Button small variant="primary" disabled={busy} onClick={() => decide(item.id, 'Approved')}>Approve</Button><Button small variant="danger" disabled={busy} onClick={() => decide(item.id, 'Rejected')}>Reject</Button></>}{assigner && item.canReview && item.status === 'Approved' && <Button small onClick={() => setAssetEditor(blankAsset(item.employeeId, item.item))}>Record assignment</Button>}</span>{item.decidedByUser && <small className="block text-muted">By {item.decidedByUser.name}</small>}</div>] }))} /> : <EmptyState>No equipment requests match this view.</EmptyState>}
    </Panel>}
    <div className={inventoryOnly ? '' : 'mt-4'}><Panel title={assigner ? 'Equipment assignments / inventory' : 'My assigned equipment'}>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]"><input aria-label="Search assets" className="field-control" placeholder="Search device, serial number or assignee" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter asset type" className="field-control !w-auto" value={filter} onChange={(event) => setFilter(event.target.value)}>{['All', ...new Set(equipment.assets.map((asset) => asset.type))].map((type) => <option key={type}>{type}</option>)}</select></div>
      {inventory.length ? <DataTable headings={['Asset', 'Type', 'Serial number', ...(assigner ? ['Assigned to'] : []), 'Issue date (UTC)', 'Status', 'Actions']} rows={inventory.map((asset) => ({ id: asset.id, cells: [<span key="asset"><b>{asset.name}</b><small className="block text-muted">{asset.id}</small></span>, asset.type, asset.serialNumber, ...(assigner ? [asset.assignee?.name ?? 'Unassigned'] : []), asset.issuedOn ?? '—', <StatusBadge key="status" status={asset.status}>{asset.status}</StatusBadge>, assigner ? <Button key="edit" small disabled={!asset.canEdit} onClick={() => setAssetEditor({ id: asset.id, name: asset.name, type: asset.type, serialNumber: asset.serialNumber, assignedTo: asset.assignedTo || '', status: asset.status, issuedOn: asset.issuedOn || '' })}>Edit assignment</Button> : <Button key="request" small onClick={() => { setForm({ ...blankRequest(), item: asset.name }); setError(''); setShowModal(true); }}>Request change for device</Button>] }))} /> : <EmptyState>{assigner ? 'No equipment matches this view. Add a device to begin.' : 'No assigned equipment matches this view. Management can add or update your assignments.'}</EmptyState>}
    </Panel></div>
    {assigner && assetEditor && <AssetEditor initial={assetEditor} equipment={equipment} actions={actions} onNavigate={onNavigate} onClose={() => setAssetEditor(null)} onDone={(message) => { setAssetEditor(null); onError(message); }} />}
    {selfService && showModal && <Modal title="Request equipment change" confirmLabel="Submit request" onClose={() => setShowModal(false)} onConfirm={submit} busy={busy}><label className="field-label" htmlFor="equipment-item">Item</label><input id="equipment-item" className="field-control" required maxLength={150} value={form.item} onChange={(event) => setForm({ ...form, item: event.target.value })} /><label className="field-label" htmlFor="equipment-type">Request type</label><select id="equipment-type" className="field-control" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{['Replacement', 'Upgrade', 'Repair', 'Return'].map((type) => <option key={type}>{type}</option>)}</select><label className="field-label" htmlFor="equipment-reason">Reason</label><textarea id="equipment-reason" className="field-control" rows="3" required maxLength={1000} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /><label className="field-label" htmlFor="equipment-attachment">Supporting image (optional)</label><input id="equipment-attachment" className="field-control" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setForm({ ...form, attachment: event.target.files?.[0] ?? null })} />{error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}</Modal>}
  </>;
}
