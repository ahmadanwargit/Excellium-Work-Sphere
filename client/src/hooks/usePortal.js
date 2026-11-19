import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, authApi, downloadApiFile } from '../api/client';

const requestBody = (payload) => payload instanceof FormData ? payload : JSON.stringify(payload);
const emptyData = () => ({ dashboard: null, attendance: null, teamAttendance: null, invoices: [], leaves: [], meetings: [], equipment: { assets: [], requests: [] }, notifications: [], directory: [], administration: { users: [], roles: [], departments: [] }, organization: null, auditLog: [] });

export function usePortal() {
  const [state, setState] = useState({ user: null, data: emptyData(), loading: true });
  const [refreshing, setRefreshing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const epoch = useRef(0);
  const sequence = useRef(0);
  const inFlight = useRef(null);

  const refresh = useCallback(({ force = false } = {}) => {
    if (inFlight.current && !force) return inFlight.current;
    const sessionEpoch = epoch.current;
    const requestId = ++sequence.current;
    setRefreshing(true);
    const current = () => sessionEpoch === epoch.current && requestId === sequence.current;
    const pending = apiRequest('/api/portal').then((result) => {
      if (current()) {
        const { user, ...data } = result;
        setState({ user, data, loading: false });
        setLastUpdated(new Date());
        setSyncError('');
      }
      return result.user;
    }).catch((error) => {
      if (current()) {
        if (error.status === 401) { setState({ user: null, data: emptyData(), loading: false }); setSyncError(''); }
        else { setState((previous) => ({ ...previous, loading: false })); setSyncError(error.message); }
      }
      throw error;
    }).finally(() => {
      if (inFlight.current === pending) inFlight.current = null;
      if (current()) setRefreshing(false);
    });
    inFlight.current = pending;
    return pending;
  }, []);

  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);

  const userId = state.user?.id;

  // Requests submitted in another employee/trainer session appear without a
  // sign-out: refresh on return, on navigation and every 30s while visible.
  useEffect(() => {
    if (!userId) return undefined;
    const sync = () => { if (document.visibilityState === 'visible') void refresh().catch(() => {}); };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    const timer = window.setInterval(sync, 30_000);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); };
  }, [userId, refresh]);

  const login = useCallback(async (credentials) => {
    await authApi.login(credentials);
    epoch.current += 1;
    inFlight.current = null;
    return refresh({ force: true });
  }, [refresh]);

  const logout = useCallback(async () => {
    epoch.current += 1;
    sequence.current += 1;
    inFlight.current = null;
    try { await authApi.logout(); } finally {
      epoch.current += 1; sequence.current += 1; inFlight.current = null;
      setState({ user: null, data: emptyData(), loading: false }); setRefreshing(false); setSyncError(''); setLastUpdated(null);
    }
  }, []);

  const execute = useCallback(async (path, options) => {
    const result = await apiRequest(path, options);
    // Do not invite a duplicate submission when the write succeeded but a
    // follow-up read failed: the shell shows its persistent refresh warning.
    await refresh({ force: true }).catch((error) => { if (error.status === 401) throw error; });
    return result;
  }, [refresh]);

  return useMemo(() => ({
    ...state, refreshing, syncError, lastUpdated, login, logout, refresh,
    clockIn: () => execute('/api/attendance/clock-in', { method: 'POST', body: '{}' }),
    clockOut: () => execute('/api/attendance/clock-out', { method: 'POST', body: '{}' }),
    startBreak: (minutes) => execute('/api/attendance/break/start', { method: 'POST', body: JSON.stringify({ minutes }) }),
    endBreak: () => execute('/api/attendance/break/end', { method: 'POST', body: '{}' }),
    updateBreak: (payload) => execute('/api/attendance/break', { method: 'POST', body: JSON.stringify(payload) }),
    sendActivityHeartbeat: async (payload) => {
      const result = await apiRequest('/api/activity/heartbeat', { method: 'POST', body: JSON.stringify(payload) });
      if (!result.ignored && result.session) setState((previous) => ({ ...previous, data: { ...previous.data, attendance: previous.data.attendance ? { ...previous.data.attendance, currentSession: result.session } : null } }));
      return result;
    },
    createCorrection: (payload) => execute('/api/attendance/corrections', { method: 'POST', body: JSON.stringify(payload) }),
    createInvoice: (payload) => execute('/api/invoices', { method: 'POST', body: requestBody(payload) }),
    updateInvoiceDraft: (id, payload) => execute(`/api/invoices/${encodeURIComponent(id)}/draft`, { method: 'PUT', body: requestBody(payload) }),
    submitInvoice: (id) => execute(`/api/invoices/${encodeURIComponent(id)}/submit`, { method: 'POST', body: '{}' }),
    downloadInvoice: (id) => downloadApiFile(`/api/invoices/${encodeURIComponent(id)}/pdf`, `${id}.pdf`),
    decideInvoice: (id, status) => execute(`/api/invoices/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    applyLeave: (payload) => execute('/api/leaves', { method: 'POST', body: JSON.stringify(payload) }),
    decideLeave: (id, payload) => execute(`/api/leaves/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    cancelLeave: (id) => execute(`/api/leaves/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }),
    createUser: (payload) => execute('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
    updateUser: (id, payload) => execute(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    createRole: (payload) => execute('/api/admin/users/roles', { method: 'POST', body: JSON.stringify(payload) }),
    createDepartment: (payload) => execute('/api/admin/users/departments', { method: 'POST', body: JSON.stringify(payload) }),
    invoiceDocumentUrl: (id) => apiRequest(`/api/invoices/${encodeURIComponent(id)}/document`),
    createMeeting: (payload) => execute('/api/meetings', { method: 'POST', body: JSON.stringify(payload) }),
    confirmMeeting: (id) => execute(`/api/meetings/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'Confirmed' }) }),
    createEquipmentRequest: (payload) => execute('/api/equipment/requests', { method: 'POST', body: requestBody(payload) }),
    decideEquipmentRequest: (id, status) => execute(`/api/equipment/requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    equipmentAttachmentUrl: (id) => apiRequest(`/api/equipment/requests/${encodeURIComponent(id)}/attachment`),
    markNotificationsRead: () => execute('/api/notifications/read', { method: 'POST', body: '{}' }),
    updateProfile: (payload) => execute('/api/settings/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
    updateOrganization: (payload) => execute('/api/settings/organization', { method: 'PATCH', body: JSON.stringify(payload) })
  }), [state, refreshing, syncError, lastUpdated, execute, login, logout, refresh]);
}
