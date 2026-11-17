const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error ?? 'The server could not complete that request', response.status, payload.details);
  return payload;
}

export async function downloadApiFile(path, fallbackFilename) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error ?? 'The server could not export that report', response.status, payload.details);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallbackFilename;
  const href = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(href);
}

export const authApi = {
  login: (credentials) => apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST', body: '{}' }),
  me: () => apiRequest('/api/me')
};
