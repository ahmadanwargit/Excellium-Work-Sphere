import { useState } from 'react';
import { Button, DataTable, EmptyState, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { can, formatDateTime } from '../../utils/portal';
import { formErrorMessage } from '../../utils/workflows';

const emptyMeeting = () => ({ title: '', startsAt: '', participants: [], durationMinutes: 30, notes: '' });

export function MeetingsPage({ user, meetings, data, actions, onError }) {
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [meeting, setMeeting] = useState(emptyMeeting);
  const canSchedule = can(user, 'scheduleMeetings');
  const management = can(user, 'teamAttendance');
  const trainer = user.role === 'trainer';
  const contacts = data.directory.filter((person) => person.id !== user.id && (!trainer || ['admin', 'manager'].includes(person.role)));
  const submit = async () => {
    if (trainer && !meeting.participants.length) { setError('Select at least one management contact.'); return; }
    try {
      setBusy(true); setError('');
      await actions.createMeeting({ ...meeting, meetingType: trainer ? 'Management' : 'General', startsAt: new Date(meeting.startsAt).toISOString() });
      setShowModal(false); setMeeting(emptyMeeting());
      onError(management ? 'Meeting scheduled' : 'Meeting requested. Your selected management contacts will confirm it.');
    } catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const confirm = async (id) => {
    try { setBusy(true); await actions.confirmMeeting(id); onError('Meeting confirmed; participants have been notified'); }
    catch (failure) { onError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const upcoming = meetings.filter((item) => new Date(item.startsAt) >= new Date());
  const past = meetings.filter((item) => new Date(item.startsAt) < new Date()).reverse();
  const pending = management ? meetings.filter((item) => item.status === 'Pending' && item.canConfirm) : [];
  return <>
    <PageHeading title={management ? 'Meeting management' : trainer ? 'Schedule a meeting with management' : 'My invited meetings'} description={management ? 'Schedule organization meetings and confirm requests from trainers. Private management meetings are visible to invitees and administrators.' : trainer ? 'Choose management contacts, propose a time and send an agenda. Your request stays pending until it is confirmed.' : 'Your meeting invitations and their confirmation status. Management handles scheduling.'} action={canSchedule && <Button variant="primary" disabled={trainer && !contacts.length} onClick={() => { setError(''); setShowModal(true); }}>{trainer ? 'Schedule a meeting with management' : 'Schedule meeting'}</Button>} />
    {trainer && !contacts.length && <Panel><EmptyState>No active management contacts are available. Contact your administrator.</EmptyState></Panel>}
    {management && <div className="mb-4"><Panel title="Awaiting confirmation">{pending.length ? <DataTable headings={['Meeting / agenda', 'Requested by', 'Proposed time', 'Action']} rows={pending.map((item) => ({ id: item.id, cells: [<span key="meeting" className="inline-block max-w-[320px] whitespace-normal"><b>{item.title}</b>{item.notes && <small className="block whitespace-pre-wrap text-muted">{item.notes}</small>}</span>, item.creator?.name ?? 'Former user', `${formatDateTime(item.startsAt)} · ${item.durationMinutes} min`, <Button small variant="primary" key="confirm" disabled={busy} onClick={() => confirm(item.id)}>Confirm meeting</Button>] }))} /> : <EmptyState>No pending meeting requests.</EmptyState>}</Panel></div>}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><Panel title="Upcoming">{upcoming.length ? upcoming.map((item) => <div className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-0" key={item.id}><div className="min-w-0"><b className="break-words">{item.title}</b><small className="block text-muted">{formatDateTime(item.startsAt)} · {item.durationMinutes ?? 30} min</small><small className="mt-1 block break-words text-muted">{item.participantDetails.map((participant) => participant.name).join(', ')}</small>{item.notes && <p className="mb-0 mt-2 whitespace-pre-wrap break-words text-xs text-muted">{item.notes}</p>}</div><StatusBadge status={item.status}>{item.status}</StatusBadge></div>) : <EmptyState>No upcoming meetings.</EmptyState>}</Panel><Panel title="Meeting history">{past.length ? <DataTable headings={['Meeting', 'Date', 'Status']} rows={past.map((item) => ({ id: item.id, cells: [item.title, formatDateTime(item.startsAt), <StatusBadge key="status" status={item.status}>{item.status}</StatusBadge>] }))} /> : <EmptyState>No past meetings in your workspace.</EmptyState>}</Panel></div>
    {canSchedule && showModal && <Modal title={trainer ? 'Schedule a meeting with management' : 'Schedule meeting'} confirmLabel={trainer ? 'Send meeting request' : 'Schedule meeting'} onClose={() => setShowModal(false)} onConfirm={submit} busy={busy}>
      {trainer && <p className="text-xs text-muted">Choose at least one active management contact. You are included automatically. This is a meeting request, not a training session.</p>}
      <label className="field-label" htmlFor="meeting-title">Title</label><input id="meeting-title" className="field-control" required maxLength={140} value={meeting.title} onChange={(event) => setMeeting({ ...meeting, title: event.target.value })} />
      <label className="field-label" htmlFor="meeting-date">Date and time (your local time)</label><input id="meeting-date" className="field-control" type="datetime-local" required value={meeting.startsAt} onChange={(event) => setMeeting({ ...meeting, startsAt: event.target.value })} />
      <label className="field-label" htmlFor="meeting-duration">Duration</label><select id="meeting-duration" className="field-control" value={meeting.durationMinutes} onChange={(event) => setMeeting({ ...meeting, durationMinutes: Number(event.target.value) })}>{[15, 30, 45, 60, 90, 120, 180, 240].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select>
      <fieldset className="mt-4 min-w-0 rounded-lg border border-line p-3"><legend className="px-1 text-xs font-semibold">{trainer ? 'Management contacts (select at least one)' : 'Participants (optional)'}</legend><div className="max-h-40 space-y-3 overflow-auto">{contacts.map((person) => <label key={person.id} className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={meeting.participants.includes(person.id)} onChange={(event) => setMeeting({ ...meeting, participants: event.target.checked ? [...meeting.participants, person.id] : meeting.participants.filter((id) => id !== person.id) })} /><span className="min-w-0 break-words"><b>{person.name}</b><small className="block text-muted">{person.title} · {person.department}</small></span></label>)}</div></fieldset>
      <label className="field-label" htmlFor="meeting-notes">Agenda / notes (optional)</label><textarea id="meeting-notes" className="field-control" rows="3" maxLength={2000} value={meeting.notes} onChange={(event) => setMeeting({ ...meeting, notes: event.target.value })} />
      {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}
    </Modal>}
  </>;
}
