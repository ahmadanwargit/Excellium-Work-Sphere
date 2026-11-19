import { useState } from 'react';
import { Button, DataTable, EmptyState, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { can, formatDateTime } from '../../utils/portal';
import { formErrorMessage } from '../../utils/workflows';

export function MeetingsPage({ user, meetings, actions, onError }) {
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [meeting, setMeeting] = useState({ title: '', startsAt: '', participants: '' });
  const canSchedule = can(user, 'scheduleMeetings');
  const management = can(user, 'teamAttendance');
  const trainer = user.role === 'trainer';
  const submit = async () => {
    try {
      setBusy(true); setError('');
      await actions.createMeeting({ ...meeting, startsAt: new Date(meeting.startsAt).toISOString() });
      setShowModal(false); setMeeting({ title: '', startsAt: '', participants: '' });
      onError(management ? 'Meeting scheduled' : 'Training session requested. Management will confirm it.');
    } catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const confirm = async (id) => {
    try { setBusy(true); await actions.confirmMeeting(id); onError('Meeting confirmed; participants have been notified'); }
    catch (failure) { onError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const upcoming = meetings.filter((item) => new Date(item.startsAt) >= new Date());
  const past = meetings.filter((item) => new Date(item.startsAt) < new Date()).reverse();
  const pending = management ? meetings.filter((item) => item.status === 'Pending') : [];
  return <>
    <PageHeading title={management ? 'Meeting management' : trainer ? 'Training sessions & meetings' : 'My invited meetings'} description={management ? 'Schedule organization meetings and confirm training-session requests.' : trainer ? 'Request training sessions and view meetings you created or were invited to.' : 'Your meeting invitations and their confirmation status. Scheduling is handled by trainers and management.'} action={canSchedule && <Button variant="primary" onClick={() => { setError(''); setShowModal(true); }}>{trainer ? 'Request training session' : 'Schedule meeting'}</Button>} />
    {management && <div className="mb-4"><Panel title="Awaiting confirmation">{pending.length ? <DataTable headings={['Session', 'Requested by', 'Scheduled time', 'Action']} rows={pending.map((item) => ({ id: item.id, cells: [item.title, item.creator?.name ?? 'Former user', formatDateTime(item.startsAt), <Button small variant="primary" key="confirm" disabled={busy} onClick={() => confirm(item.id)}>Confirm session</Button>] }))} /> : <EmptyState>No pending meeting requests.</EmptyState>}</Panel></div>}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><Panel title="Upcoming">{upcoming.length ? upcoming.map((item) => <div className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-0" key={item.id}><div className="min-w-0"><b>{item.title}</b><small className="block text-muted">{formatDateTime(item.startsAt)}</small><small className="mt-1 block text-muted">{item.participantDetails.map((participant) => participant.name).join(', ')}</small></div><StatusBadge status={item.status}>{item.status}</StatusBadge></div>) : <EmptyState>No upcoming meetings.</EmptyState>}</Panel><Panel title="Meeting history">{past.length ? <DataTable headings={['Meeting', 'Date', 'Status']} rows={past.map((item) => ({ id: item.id, cells: [item.title, formatDateTime(item.startsAt), <StatusBadge key="status" status={item.status}>{item.status}</StatusBadge>] }))} /> : <EmptyState>No past meetings in your workspace.</EmptyState>}</Panel></div>
    {canSchedule && showModal && <Modal title={trainer ? 'Request training session' : 'Schedule meeting'} confirmLabel={trainer ? 'Send session request' : 'Schedule meeting'} onClose={() => setShowModal(false)} onConfirm={submit} busy={busy}>
      {trainer && <p className="text-xs text-muted">Training requests remain pending until management confirms them.</p>}
      <label className="field-label" htmlFor="meeting-title">Title</label><input id="meeting-title" className="field-control" required maxLength={140} value={meeting.title} onChange={(event) => setMeeting({ ...meeting, title: event.target.value })} />
      <label className="field-label" htmlFor="meeting-date">Date and time (your local time)</label><input id="meeting-date" className="field-control" type="datetime-local" required value={meeting.startsAt} onChange={(event) => setMeeting({ ...meeting, startsAt: event.target.value })} />
      <label className="field-label" htmlFor="meeting-participants">Participants (optional)</label><input id="meeting-participants" className="field-control" maxLength={1000} placeholder="Comma-separated work emails or names" value={meeting.participants} onChange={(event) => setMeeting({ ...meeting, participants: event.target.value })} /><p className="text-xs text-muted">Participants must be active directory members. You are automatically included.</p>
      {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}
    </Modal>}
  </>;
}
