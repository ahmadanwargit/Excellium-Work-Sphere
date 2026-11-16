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

export const authApi = {
  login: (credentials) => apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST', body: '{}' }),
  me: () => apiRequest('/api/me')
};
