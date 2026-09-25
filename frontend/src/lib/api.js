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

/**
 * Mirrors what the stored session claims about account status, so the client
 * can spot a stale one without re-reading localStorage on every response.
 * App.jsx keeps this in sync.
 */
let suspendedSession = false;
export function setSuspendedSession(value) {
  suspendedSession = Boolean(value);
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => {
    // A write that requireActive() allowed is proof the stored status is out
    // of date: while suspended, every write comes back 403 ACCOUNT_SUSPENDED.
    // Re-reading /me clears the banner as soon as an admin lifts the
    // suspension -- without any polling, which §36 rules out. Reads are
    // deliberately skipped because they keep working while suspended, so they
    // would re-check on every page view of an open tab.
    const method = (response.config?.method || 'get').toLowerCase();
    if (suspendedSession && method !== 'get' && method !== 'head') {
      window.dispatchEvent(new Event('account:recheck'));
    }
    return response;
  },
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

    // Spec §9: a suspension can happen mid-session (an admin clicks while the
    // user is reading a page), so the client hears about it the moment the
    // server refuses an action rather than waiting for a page reload to
    // discover a status field nobody fetched.
    if (status === 403 && error.response?.data?.code === 'ACCOUNT_SUSPENDED') {
      window.dispatchEvent(new Event('account:suspended'));
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
