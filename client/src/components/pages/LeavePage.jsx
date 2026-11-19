import { useMemo, useState } from 'react';
import { Button, DataTable, EmptyState, MetricCard, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { calendarDays, formErrorMessage } from '../../utils/workflows';

const emptyRequest = () => ({ type: 'Annual', startDate: '', endDate: '', reason: '' });

export function LeavePage({ user, leaves, actions, onError }) {
  const administrator = user.role === 'admin';
  const [scope, setScope] = useState(administrator ? 'all' : 'mine');
  const [status, setStatus] = useState('All');
  const [form, setForm] = useState(null);
  const [review, setReview] = useState(null);
  const [withdraw, setWithdraw] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = leaves.filter((leave) => leave.employeeId === user.id);
  const scoped = scope === 'mine' ? mine : leaves;
  const results = useMemo(() => scoped.filter((leave) => status === 'All' || leave.status === status), [scoped, status]);
  const days = form ? calendarDays(form.startDate, form.endDate) : 0;
  const openRequest = () => { setError(''); setForm(emptyRequest()); };
  const submit = async () => {
    try {
      setBusy(true); setError('');
      await actions.applyLeave(form);
      setForm(null);
      onError('Leave application sent to your administrator');
    } catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const decide = async () => {
    try {
      setBusy(true); setError('');
      await actions.decideLeave(review.leave.id, { status: review.status, reviewNote: review.note });
      setReview(null);
      onError(`Leave ${review.status.toLowerCase()}`);
    } catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const cancel = async () => {
    try { setBusy(true); await actions.cancelLeave(withdraw.id); setWithdraw(null); onError('Leave request withdrawn'); }
    catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };

  return <>
    <PageHeading title="Leave applications" description={administrator ? 'Review employee leave requests and keep decisions in one place.' : 'Apply for time off and track your administrator’s decision.'} action={<Button variant="primary" onClick={openRequest}>Apply for leave</Button>} />
    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricCard label={administrator && scope === 'all' ? 'Pending review' : 'My pending requests'} value={scoped.filter((leave) => leave.status === 'Pending').length} detail="Awaiting administrator decision" />
      <MetricCard label="Approved requests" value={scoped.filter((leave) => leave.status === 'Approved').length} detail="Accepted leave applications" />
      <MetricCard label="Approved days" value={scoped.filter((leave) => leave.status === 'Approved').reduce((sum, leave) => sum + leave.days, 0)} detail="Calendar days across approved requests" />
    </div>
    <Panel title="Leave requests" action={<div className="flex flex-wrap items-center gap-2">
      {administrator && <select aria-label="Leave request scope" className="field-control !w-auto !py-1.5" value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">All employees</option><option value="mine">My requests</option></select>}
      <select aria-label="Filter leave status" className="field-control !w-auto !py-1.5" value={status} onChange={(event) => setStatus(event.target.value)}>{['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'].map((value) => <option key={value}>{value}</option>)}</select>
    </div>}>
      {results.length ? <DataTable headings={[...(administrator && scope === 'all' ? ['Employee'] : []), 'Type', 'Dates', 'Days', 'Status', 'Decision / actions']} rows={results.map((leave) => ({ id: leave.id, cells: [
        ...(administrator && scope === 'all' ? [<span key="employee">{leave.employee?.name}<small className="block text-muted">{leave.employee?.department}</small></span>] : []),
        leave.type, <span key="dates">{leave.startDate}<small className="block text-muted">to {leave.endDate}</small></span>, leave.days,
        <StatusBadge key="status" status={leave.status}>{leave.status}</StatusBadge>,
        <div key="actions" className="max-w-[300px] whitespace-normal">
          {leave.status === 'Pending' && <div className="flex flex-wrap gap-1.5">{administrator && leave.employeeId !== user.id && <>
            <Button small variant="primary" onClick={() => { setError(''); setReview({ leave, status: 'Approved', note: '' }); }}>Approve</Button>
            <Button small variant="danger" onClick={() => { setError(''); setReview({ leave, status: 'Rejected', note: '' }); }}>Reject</Button>
          </>}{leave.employeeId === user.id && <Button small onClick={() => { setError(''); setWithdraw(leave); }}>Withdraw</Button>}</div>}
          {leave.decidedByUser && <small className="block text-muted">By {leave.decidedByUser.name}</small>}
          {leave.reviewNote && <p className="m-0 mt-1 text-xs">{leave.reviewNote}</p>}
          {leave.status === 'Cancelled' && <small className="text-muted">Withdrawn by employee</small>}
        </div>
      ] }))} /> : <EmptyState>No leave requests match this view.</EmptyState>}
    </Panel>
    <p className="text-xs text-muted">Dates are inclusive and counted as calendar days. Leave balances and paid-leave eligibility follow your organization’s policy.</p>

    {form && <Modal title="Apply for leave" confirmLabel="Send application" onClose={() => setForm(null)} onConfirm={submit} busy={busy}>
      <p className="text-muted">Your administrator will review this request. You’ll receive a portal notification when it is decided.</p>
      <label className="field-label" htmlFor="leave-type">Leave type</label><select id="leave-type" className="field-control" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{['Annual', 'Sick', 'Casual', 'Unpaid'].map((type) => <option key={type}>{type}</option>)}</select>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="field-label" htmlFor="leave-start">Start date</label><input id="leave-start" className="field-control" type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></div>
        <div><label className="field-label" htmlFor="leave-end">End date</label><input id="leave-end" className="field-control" type="date" required min={form.startDate || undefined} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></div>
      </div>
      {days > 0 && <p className="rounded-lg bg-accent-soft px-3 py-2 text-accent">{days} calendar day{days === 1 ? '' : 's'} requested</p>}
      <label className="field-label" htmlFor="leave-reason">Reason</label><textarea id="leave-reason" className="field-control" rows="4" required minLength={5} maxLength={2000} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
      {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}
    </Modal>}
    {review && <Modal title={`${review.status === 'Approved' ? 'Approve' : 'Reject'} leave request`} confirmLabel={review.status === 'Approved' ? 'Approve leave' : 'Reject leave'} onClose={() => setReview(null)} onConfirm={decide} busy={busy}>
      <p><b>{review.leave.employee?.name}</b> · {review.leave.type}</p><p className="text-muted">{review.leave.startDate} to {review.leave.endDate} · {review.leave.days} day(s)</p>
      <p className="whitespace-pre-wrap rounded-lg bg-canvas p-3">{review.leave.reason}</p>
      <label className="field-label" htmlFor="leave-review-note">{review.status === 'Rejected' ? 'Reason for rejection (required)' : 'Note to employee (optional)'}</label>
      <textarea id="leave-review-note" className="field-control" rows="3" maxLength={1000} required={review.status === 'Rejected'} minLength={review.status === 'Rejected' ? 3 : undefined} value={review.note} onChange={(event) => setReview({ ...review, note: event.target.value })} />
      {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}
    </Modal>}
    {withdraw && <Modal title="Withdraw leave request" confirmLabel="Withdraw request" onClose={() => setWithdraw(null)} onConfirm={cancel} busy={busy}><p>Withdraw your {withdraw.type.toLowerCase()} leave for {withdraw.startDate} to {withdraw.endDate}? You can apply again if your plans change.</p>{error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}</Modal>}
  </>;
}
