import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

/**
 * Single axios instance used by the whole app.
 *
 * - Attaches the bearer token automatically, so no caller has to remember it.
 * - On 401 it clears the session and emits `auth:expired`, which App.jsx uses
 *   to bounce the user to /login. Previously an expired token just made every
 *   request fail silently while the UI still claimed to be logged in.
 */
const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    // Don't log the user out because their *login attempt* was rejected.
    const isCredentialAttempt = url.includes('/api/auth/login') || url.includes('/api/auth/register');

    if (status === 401 && !isCredentialAttempt) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
  }
);

/** Prefer the server's message; fall back sensibly. */
export function getErrorMessage(error, fallback = 'Something went wrong') {
  return (
    error?.response?.data?.error ||
    (error?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Is the backend running?' : null) ||
    error?.message ||
    fallback
  );
}

export default api;
