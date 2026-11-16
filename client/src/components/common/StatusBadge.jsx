const toneByStatus = {
  Approved: 'status-ok', Present: 'status-ok', Confirmed: 'status-ok', 'On time': 'status-ok', Available: 'status-ok', Active: 'status-ok',
  Pending: 'status-warn', Late: 'status-warn', 'In repair': 'status-warn', 'Early departure': 'status-warn', Idle: 'status-warn',
  Rejected: 'status-error', Absent: 'status-error', Missed: 'status-error', Locked: 'status-error',
  'On leave': 'status-info', 'In use': 'status-info', 'On break': 'status-info', Offline: 'status-info'
};

export function StatusBadge({ children, status = children }) {
  return <span className={`status-badge ${toneByStatus[status] ?? 'status-info'}`}>{children}</span>;
}
