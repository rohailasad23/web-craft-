import { API_URL } from './api';

/** 1234 -> "1.2k", 1200000 -> "1.2M". Keeps cards from showing 10 digits. */
export function formatCount(value) {
  const n = Number(value) || 0;
  if (n >= 1e6) return trim(n / 1e6) + 'M';
  if (n >= 1e3) return trim(n / 1e3) + 'k';
  return String(n);
}

function trim(v) {
  const r = Math.round(v * 10) / 10;
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1);
}

/** ISO string -> "12 Sep 2026". Returns '' for anything unusable. */
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * ISO string -> "just now" / "4m ago" / "2d ago" / "12 Sep 2026".
 *
 * Relative for anything recent (a notification feed that says "2 days ago"
 * reads faster than one that says "23 September 2026"), then falls back to an
 * absolute date so a stale item is never vague about how stale it is.
 */
export function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

/** "Ayesha Khan" -> "AK". Used for the avatar when none is uploaded. */
export function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${Math.round(n / 1024 / 1024)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/**
 * Turn the stored path ("/uploads/...") into something the browser can load.
 * Absolute URLs pass through untouched.
 */
export function mediaUrl(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  return API_URL + (path.startsWith('/') ? path : `/${path}`);
}
