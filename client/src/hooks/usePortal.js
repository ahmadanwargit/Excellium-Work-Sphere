import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, authApi, downloadApiFile } from '../api/client';

const requestBody = (payload) => payload instanceof FormData ? payload : JSON.stringify(payload);
const emptyData = () => ({ dashboard: null, attendance: null, invoices: [], leaves: [], meetings: [], equipment: { assets: [], requests: [] }, notifications: [], directory: [], administration: { users: [], roles: [], departments: [] } });

export function usePortal() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [dashboard, attendance, invoices, meetings, equipment, notifications, directory, leaves] = await Promise.all([
      apiRequest('/api/dashboard'), apiRequest('/api/attendance'), apiRequest('/api/invoices'), apiRequest('/api/meetings'), apiRequest('/api/equipment'), apiRequest('/api/notifications'), apiRequest('/api/directory'), apiRequest('/api/leaves')
    ]);
    const administration = dashboard.user.role === 'admin' ? await apiRequest('/api/admin/users') : { users: [], roles: [], departments: [] };
    setUser(dashboard.user);
    setData({ dashboard, attendance, invoices: invoices.invoices, meetings: meetings.meetings, equipment, notifications: notifications.notifications, directory: directory.people, leaves: leaves.leaves, administration });
    return dashboard.user;
  }, []);

  useEffect(() => {
    authApi.me()
      .then(() => refresh())
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (credentials) => {
    const result = await authApi.login(credentials);
    await refresh();
    return result.user;
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } finally {
      setUser(null);
      setData(emptyData());
    }
  }, []);

  const execute = useCallback(async (path, options) => {
    const result = await apiRequest(path, options);
    await refresh();
    return result;
  }, [refresh]);

  return useMemo(() => ({
    user, data, loading, login, logout, refresh,
    clockIn: () => execute('/api/attendance/clock-in', { method: 'POST', body: '{}' }),
    clockOut: () => execute('/api/attendance/clock-out', { method: 'POST', body: '{}' }),
    // Explicit break controls keep the client state machine aligned with the
    // dedicated start/end server transitions.
    startBreak: (durationMinutes) => execute('/api/attendance/break/start', { method: 'POST', body: JSON.stringify({ minutes: durationMinutes }) }),
    endBreak: () => execute('/api/attendance/break/end', { method: 'POST', body: '{}' }),
    updateBreak: (payload) => execute('/api/attendance/break', { method: 'POST', body: JSON.stringify(payload) }),
    sendActivityHeartbeat: async (payload) => {
      const result = await apiRequest('/api/activity/heartbeat', { method: 'POST', body: JSON.stringify(payload) });
      if (!result.ignored && result.session) {
        setData((previous) => ({
          ...previous,
          attendance: previous.attendance ? {
            ...previous.attendance,
            currentSession: result.session,
            current: previous.attendance.current ? {
              ...previous.attendance.current,
              activeSeconds: result.session.activeSeconds,
              idleSeconds: result.session.idleSeconds
            } : previous.attendance.current
          } : previous.attendance
        }));
      }
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
    createEquipmentRequest: (payload) => execute('/api/equipment/requests', { method: 'POST', body: requestBody(payload) }),
    decideEquipmentRequest: (id, status) => execute(`/api/equipment/requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    equipmentAttachmentUrl: (id) => apiRequest(`/api/equipment/requests/${encodeURIComponent(id)}/attachment`),
    markNotificationsRead: () => execute('/api/notifications/read', { method: 'POST', body: '{}' }),
    updateProfile: (payload) => execute('/api/settings/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
    updateOrganization: (payload) => execute('/api/settings/organization', { method: 'PATCH', body: JSON.stringify(payload) })
  }), [data, execute, loading, login, logout, refresh, user]);
}
