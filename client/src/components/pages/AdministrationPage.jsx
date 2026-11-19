import { useState } from 'react';
import { Button, DataTable, EmptyState, PageHeading, Panel } from '../common/UI';
import { formErrorMessage } from '../../utils/workflows';

export function AdministrationPage({ section, data, actions, onError }) {
  const [organization, setOrganization] = useState(data.organization);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (section === 'audit') return <>
    <PageHeading title="Audit trail" description="Actual profile changes, access assignments and operational decisions recorded by the portal." />
    <Panel title="Latest 100 events">{data.auditLog.length ? <DataTable headings={['Time', 'Actor', 'Event', 'Action']} rows={data.auditLog.map((item) => ({ id: item.id, cells: [new Date(item.timestamp).toLocaleString(), item.actor?.name ?? 'System', (item.eventType ?? 'GENERAL').replaceAll('_', ' '), <span key="action" className="inline-block max-w-[600px] whitespace-normal">{item.action}</span>] }))} /> : <EmptyState>No audit events yet.</EmptyState>}</Panel>
  </>;

  const save = async (event) => {
    event.preventDefault();
    try { setBusy(true); setError(''); await actions.updateOrganization({ name: organization.name, workWeek: organization.workWeek, standardStartTime: organization.standardStartTime, inactivityLockMinutes: Number(organization.inactivityLockMinutes) }); onError('Organization settings saved'); }
    catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  return <>
    <PageHeading title="Organization settings" description="Administrator-only company settings. These do not grant access or change employee roles." />
    <Panel title="Workspace configuration" className="max-w-[760px]">
      <form onSubmit={save}><fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
        <label className="field-label" htmlFor="org-name">Company name</label><input id="org-name" className="field-control" required maxLength={120} value={organization?.name ?? ''} onChange={(event) => setOrganization({ ...organization, name: event.target.value })} />
        <label className="field-label" htmlFor="org-week">Work week</label><input id="org-week" className="field-control" required maxLength={50} value={organization?.workWeek ?? ''} onChange={(event) => setOrganization({ ...organization, workWeek: event.target.value })} />
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2"><div><label className="field-label" htmlFor="org-start">Standard start time (UTC)</label><input id="org-start" className="field-control" type="time" required value={organization?.standardStartTime ?? ''} onChange={(event) => setOrganization({ ...organization, standardStartTime: event.target.value })} /></div><div><label className="field-label" htmlFor="org-lock">Inactivity setting (minutes)</label><input id="org-lock" className="field-control" type="number" required min="1" max="60" value={organization?.inactivityLockMinutes ?? ''} onChange={(event) => setOrganization({ ...organization, inactivityLockMinutes: event.target.value })} /></div></div>
        {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}
        <div className="mt-5 flex justify-end"><Button variant="primary" type="submit">{busy ? 'Saving…' : 'Save organization settings'}</Button></div>
      </fieldset></form>
    </Panel>
  </>;
}
