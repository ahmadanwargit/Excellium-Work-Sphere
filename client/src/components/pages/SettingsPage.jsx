import { useState } from 'react';
import { Button, PageHeading, Panel } from '../common/UI';
import { permissionsFor, PERMISSION_LABELS, roleMeta } from '../../utils/portal';
import { formErrorMessage } from '../../utils/workflows';

export function SettingsPage({ user, actions, onError }) {
  const [form, setForm] = useState({ name: user.name, title: user.title });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (event) => {
    event.preventDefault();
    try { setBusy(true); setError(''); await actions.updateProfile(form); onError('Profile saved'); }
    catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  return <>
    <PageHeading title="My profile" description="Your account details and assigned workspace access. Only authorized management can change roles or departments." />
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Personal details"><form onSubmit={save}><fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
        <label className="field-label" htmlFor="profile-name">Full name</label><input id="profile-name" className="field-control" required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <label className="field-label" htmlFor="profile-email">Work email</label><input id="profile-email" className="field-control" value={user.email} readOnly />
        <label className="field-label" htmlFor="profile-title">Job title</label><input id="profile-title" className="field-control" required maxLength={100} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}<div className="mt-5 flex justify-end"><Button variant="primary" type="submit">{busy ? 'Saving…' : 'Save profile'}</Button></div>
      </fieldset></form></Panel>
      <Panel title="Role-based access"><dl className="m-0 space-y-3"><div><dt className="text-xs text-muted">Assigned role</dt><dd className="m-0 font-semibold">{user.roleName ?? roleMeta[user.role].label}</dd></div><div><dt className="text-xs text-muted">Permission level</dt><dd className="m-0">{roleMeta[user.role].label}</dd></div><div><dt className="text-xs text-muted">Department</dt><dd className="m-0">{user.department}</dd></div><div><dt className="text-xs text-muted">Sign-in category</dt><dd className="m-0">{user.accessGroup === 'management' ? 'Admin / Management' : 'Employee / Trainer'}</dd></div></dl><ul className="mb-0 mt-4 space-y-1 border-t border-line pl-4 pt-4 text-xs text-muted">{permissionsFor(user).map((permission) => <li key={permission}>{PERMISSION_LABELS[permission]}</li>)}</ul><p className="mt-4 text-xs text-muted">Need a password reset or access change? Contact your workspace administrator. Choosing another sign-in category does not change your assigned permissions.</p></Panel>
    </div>
  </>;
}
