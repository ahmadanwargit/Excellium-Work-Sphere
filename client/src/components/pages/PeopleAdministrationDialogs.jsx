import { useEffect, useState } from 'react';
import { Button, EmptyState, Modal } from '../common/UI';
import { formErrorMessage } from '../../utils/workflows';

export function ProfileDeleteDialog({ person, actions, onClose, onDone }) {
  const { previewUserDeletion } = actions;
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState(null);
  const [email, setEmail] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setPreview(null); setError('');
    previewUserDeletion(person.id).then((value) => { if (current) setPreview(value); }).catch((failure) => { if (current) setError(formErrorMessage(failure)); });
    return () => { current = false; };
  }, [previewUserDeletion, person.id, retry]);
  const submit = async () => {
    if (step === 1) { setStep(2); setError(''); return; }
    if (email.toLowerCase().trim() !== preview.user.email.toLowerCase() || !acknowledged) { setError('Type the exact work email and acknowledge history retention.'); return; }
    try {
      setBusy(true); setError('');
      await actions.deleteUser(person.id, { confirm: true, confirmationEmail: email.trim(), acknowledgeHistoryRetention: true });
      onDone('Profile deleted. Sign-in and existing sessions are blocked; historical records and assigned equipment remain available to management.');
    } catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  return <Modal title={step === 1 ? 'Delete profile · confirmation 1 of 2' : 'Delete profile · final confirmation'} confirmLabel={step === 1 ? 'Continue to final confirmation' : 'Delete profile permanently'} confirmVariant={step === 2 ? 'danger' : 'primary'} busy={busy} onClose={onClose} onConfirm={preview ? submit : undefined}>
    <p className="break-words">Remove <b>{preview?.user.name ?? person.name}</b> ({preview?.user.email ?? person.email}) from the employee portal?</p>
    <p className="text-xs leading-relaxed text-muted">The account will disappear from active profiles, directory, rankings and new assignment lists. Sign-in and existing sessions will stop working. This cannot be undone from the portal. The work email stays reserved.</p>
    {preview ? <div className="rounded-lg border border-line bg-canvas p-3 text-xs leading-relaxed"><b>History is retained, not erased:</b><p className="mb-0">{preview.impact.invoices} invoices · {preview.impact.attendance} attendance records · {preview.impact.leave} leave requests · {preview.impact.equipment} equipment assignments.</p><p className="mb-0">Equipment stays assigned until management records its return or reassignment. Review and audit records remain intact.</p></div> : !error && <p role="status">Checking profile and linked records…</p>}
    {step === 2 && <><label className="field-label" htmlFor="delete-profile-email">Type the profile’s work email to confirm</label><input id="delete-profile-email" type="email" autoComplete="off" className="field-control" required value={email} onChange={(event) => setEmail(event.target.value)} /><label className="mt-4 flex items-start gap-2 text-xs"><input className="mt-0.5" type="checkbox" required checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I understand that access is removed and historical work and equipment records are retained.</span></label></>}
    {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}{!preview && error && <Button type="button" small onClick={() => setRetry((value) => value + 1)}>Retry check</Button>}
  </Modal>;
}

export function RoleDeleteDialog({ roles, actions, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    try { setBusy(true); setError(''); const result = await actions.deleteRoles(roles.map((role) => role.id)); onDone(`${result.removed} role preset(s) deleted. ${result.reassigned} profile(s) reassigned with unchanged permissions.`); }
    catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  return <Modal title="Delete selected roles" confirmLabel="Delete roles" confirmVariant="danger" onClose={onClose} onConfirm={submit} busy={busy}><p>Delete {roles.length} custom role preset(s)?</p><ul className="pl-5">{roles.map((role) => <li key={role.id}>{role.name}</li>)}</ul><p className="text-xs leading-relaxed text-muted">All assigned profiles, including historical ones, move to the corresponding built-in permission level. Their access level does not change. Built-in roles cannot be deleted.</p>{error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}</Modal>;
}

export function DepartmentMembersDialog({ initialId, users, departments, actions, onClose, onDone }) {
  const [departmentId, setDepartmentId] = useState(initialId ?? departments[0]?.id ?? '');
  const [selection, setSelection] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const candidates = users.filter((person) => person.active !== false && person.departmentId !== departmentId && `${person.name} ${person.email} ${person.department}`.toLowerCase().includes(query.toLowerCase()));
  const submit = async () => {
    if (!selection.length) { setError('Select at least one profile to add or move.'); return; }
    try { setBusy(true); setError(''); const result = await actions.assignDepartment(departmentId, selection); onDone(`${result.assigned} employee / trainer profile(s) added to the selected department.`); }
    catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  return <Modal title="Add employees to department" confirmLabel={`Add ${selection.length || ''} selected profiles`.replace('  ', ' ')} onClose={onClose} onConfirm={submit} busy={busy}>
    <label className="field-label" htmlFor="member-department">Select department</label><select id="member-department" className="field-control" required value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setSelection([]); setError(''); }}>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
    <p className="text-xs text-muted">Choose existing active profiles. Their current department will be replaced, and the change appears in their own profile. Create new employees from Employee profiles.</p>
    <label className="field-label" htmlFor="member-search">Find employees / trainers</label><input id="member-search" className="field-control" placeholder="Search name, email or current department" value={query} onChange={(event) => setQuery(event.target.value)} />
    <fieldset className="mt-4 min-w-0 rounded-lg border border-line p-3"><legend className="px-1 text-xs">Select profiles · {selection.length} selected</legend><div className="max-h-64 space-y-3 overflow-auto">{candidates.length ? candidates.map((person) => <label className="flex items-start gap-2 text-xs" key={person.id}><input type="checkbox" className="mt-0.5" checked={selection.includes(person.id)} onChange={(event) => setSelection(event.target.checked ? [...selection, person.id] : selection.filter((id) => id !== person.id))} /><span className="min-w-0 break-words"><b>{person.name}</b><small className="block text-muted">{person.email} · currently {person.department}</small></span></label>) : <EmptyState>No matching active profiles outside this department.</EmptyState>}</div></fieldset>
    {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}
  </Modal>;
}

export function DepartmentDeleteDialog({ department, departments, actions, onClose, onDone }) {
  const [replacementId, setReplacementId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    try { setBusy(true); setError(''); const result = await actions.deleteDepartment(department.id, replacementId || undefined); onDone(`Department deleted. ${result.reassigned} profile assignment(s) moved safely.`); }
    catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  return <Modal title="Delete department" confirmLabel="Delete department" confirmVariant="danger" onClose={onClose} onConfirm={submit} busy={busy}><p>Delete <b>{department.name}</b>?</p><p className="text-xs leading-relaxed text-muted">{department.assignmentCount ?? department.memberCount} current / historical profile assignments are linked. All assignments must be moved before this department is removed. Work records are preserved. At least one department must remain.</p><label className="field-label" htmlFor="replacement-department">Move existing profiles to{!department.assignmentCount ? ' (optional)' : ''}</label><select id="replacement-department" className="field-control" required={Boolean(department.assignmentCount)} value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">Select replacement department</option>{departments.filter((item) => item.id !== department.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}</Modal>;
}
