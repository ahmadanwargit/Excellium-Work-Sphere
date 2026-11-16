import { useMemo, useState } from 'react';
import { Button, DataTable, PageHeading, Panel } from '../common/UI';

export function SettingsPage({ user, actions, onError }) {
  const tabs = useMemo(() => ['Profile', 'Security', 'Notifications', ...(user.role === 'admin' ? ['Organization', 'Roles', 'Audit logs'] : [])], [user.role]);
  const [tab, setTab] = useState('Profile');
  const [form, setForm] = useState({ name: user.name, title: user.title });
  const [organization, setOrganization] = useState({ name: 'Excellium Global Services', workWeek: 'Mon to Fri', standardStartTime: '09:00', inactivityLockMinutes: 3 });
  const saveProfile = async () => { try { await actions.updateProfile(form); onError('Changes saved'); } catch (error) { onError(error.message); } };
  const saveOrganization = async () => { try { await actions.updateOrganization({ ...organization, inactivityLockMinutes: Number(organization.inactivityLockMinutes) }); onError('Changes saved'); } catch (error) { onError(error.message); } };
  const content = {
    Profile: <><label className="field-label">Full name</label><input className="field-control" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><label className="field-label">Email</label><input className="field-control" value={user.email} readOnly /><label className="field-label">Job title</label><input className="field-control" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /><div className="mt-5 flex justify-end"><Button variant="primary" onClick={saveProfile}>Save changes</Button></div></>,
    Security: <><label className="field-label">Current password</label><input className="field-control" type="password" /><label className="field-label">New password</label><input className="field-control" type="password" /><Toggle label="Two-factor authentication" /><div className="mt-5 flex justify-end"><Button variant="primary" onClick={() => onError('Changes saved')}>Save changes</Button></div></>,
    Notifications: <><Toggle label="Email alerts" /><Toggle label="Invoice updates" /><Toggle label="Meeting reminders" /><Toggle label="Equipment request updates" /><div className="mt-5 flex justify-end"><Button variant="primary" onClick={() => onError('Changes saved')}>Save changes</Button></div></>,
    Organization: <><label className="field-label">Company name</label><input className="field-control" value={organization.name} onChange={(event) => setOrganization({ ...organization, name: event.target.value })} /><label className="field-label">Work week</label><select className="field-control" value={organization.workWeek} onChange={(event) => setOrganization({ ...organization, workWeek: event.target.value })}><option>Mon to Fri</option></select><label className="field-label">Standard start time</label><input className="field-control" value={organization.standardStartTime} onChange={(event) => setOrganization({ ...organization, standardStartTime: event.target.value })} /><label className="field-label">Lock portal after inactivity (minutes)</label><input className="field-control" type="number" min="1" max="60" value={organization.inactivityLockMinutes} onChange={(event) => setOrganization({ ...organization, inactivityLockMinutes: event.target.value })} /><div className="mt-5 flex justify-end"><Button variant="primary" onClick={saveOrganization}>Save changes</Button></div></>,
    Roles: <DataTable headings={['Role', 'Users', 'Can approve']} rows={[['Employee', 30, 'No'], ['Trainer', 6, 'No'], ['Management', 8, 'Invoices, assets'], ['Finance / Admin', 4, 'Everything']].map((cells) => ({ cells }))} />,
    'Audit logs': <DataTable headings={['Time', 'Actor', 'Action']} rows={[['10:42', 'Sara Malik', 'Approved INV-1042'], ['09:15', 'Daniel Okafor', 'Changed role'], ['Yesterday', 'System', 'Backup completed']].map((cells) => ({ cells }))} />
  };
  return <>
    <PageHeading title="Settings" description="Account and workspace preferences." />
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">{tabs.map((item) => <button className={`tab-button ${tab === item ? 'tab-button-active' : ''}`} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>
    <Panel title={tab}>{content[tab]}</Panel>
  </>;
}

function Toggle({ label }) {
  return <label className="flex items-center justify-between border-b border-line py-2.5 last:border-0">{label}<input type="checkbox" defaultChecked /></label>;
}
