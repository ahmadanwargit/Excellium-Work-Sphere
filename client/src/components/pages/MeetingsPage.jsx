import { useState } from 'react';
import { Button, DataTable, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { formatDateTime } from '../../utils/portal';

export function MeetingsPage({ meetings, actions, onError }) {
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meeting, setMeeting] = useState({ title: '', startsAt: '', participants: '' });
  const submit = async () => {
    try { setBusy(true); await actions.createMeeting(meeting); setShowModal(false); setMeeting({ title: '', startsAt: '', participants: '' }); } catch (error) { onError(error.message); } finally { setBusy(false); }
  };
  return <>
    <PageHeading title="Meetings" description="Upcoming sessions and history." action={<Button variant="primary" onClick={() => setShowModal(true)}>Schedule meeting</Button>} />
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Panel title="Upcoming">{meetings.length ? meetings.map((item) => <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0" key={item.id}><div>{item.title}<small className="block text-muted">{formatDateTime(item.startsAt)} · {item.participantDetails.map((participant) => participant.name).join(', ')}</small></div><StatusBadge status={item.status}>{item.status}</StatusBadge></div>) : <p className="m-0 text-muted">No upcoming meetings.</p>}</Panel><Panel title="History"><DataTable headings={['Meeting', 'Date', 'Status', '']} rows={[['Weekly sync', '6 Nov', 'Confirmed'], ['Design review', '4 Nov', 'Missed'], ['Budget check-in', '30 Oct', 'Confirmed']].map(([title, date, status]) => ({ cells: [title, date, <StatusBadge key={`${title}-status`} status={status}>{status}</StatusBadge>, status === 'Confirmed' ? <Button key={`${title}-notes`} small onClick={() => onError('Notes opened')}>Notes</Button> : ''] }))} /></Panel></div>
    {showModal && <Modal title="Schedule meeting" confirmLabel="Send request" onClose={() => setShowModal(false)} onConfirm={submit} busy={busy}><label className="field-label">Title</label><input className="field-control" value={meeting.title} onChange={(event) => setMeeting({ ...meeting, title: event.target.value })} /><label className="field-label">Date and time</label><input className="field-control" type="datetime-local" value={meeting.startsAt} onChange={(event) => setMeeting({ ...meeting, startsAt: event.target.value })} /><label className="field-label">Participants</label><input className="field-control" placeholder="Comma-separated names or emails" value={meeting.participants} onChange={(event) => setMeeting({ ...meeting, participants: event.target.value })} /></Modal>}
  </>;
}
