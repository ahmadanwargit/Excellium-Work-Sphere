import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, authApi } from '../api/client';

const requestBody = (payload) => payload instanceof FormData ? payload : JSON.stringify(payload);

export function usePortal() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState({ dashboard: null, attendance: null, invoices: [], meetings: [], equipment: { assets: [], requests: [] }, notifications: [], directory: [] });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [dashboard, attendance, invoices, meetings, equipment, notifications, directory] = await Promise.all([
      apiRequest('/api/dashboard'), apiRequest('/api/attendance'), apiRequest('/api/invoices'), apiRequest('/api/meetings'), apiRequest('/api/equipment'), apiRequest('/api/notifications'), apiRequest('/api/directory')
    ]);
    setUser(dashboard.user);
    setData({ dashboard, attendance, invoices: invoices.invoices, meetings: meetings.meetings, equipment, notifications: notifications.notifications, directory: directory.people });
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
      setData({ dashboard: null, attendance: null, invoices: [], meetings: [], equipment: { assets: [], requests: [] }, notifications: [], directory: [] });
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
    updateBreak: (payload) => execute('/api/attendance/break', { method: 'POST', body: JSON.stringify(payload) }),
    createCorrection: (payload) => execute('/api/attendance/corrections', { method: 'POST', body: JSON.stringify(payload) }),
    createInvoice: (payload) => execute('/api/invoices', { method: 'POST', body: requestBody(payload) }),
    decideInvoice: (id, status) => execute(`/api/invoices/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
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
