import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useSession } from '../../lib/session';
import { timeAgo } from '../../lib/format';

/** One tint per kind of note, so the feed can be scanned without reading it. */
const TONE = {
  approved: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  rejected: 'bg-amber-50 text-amber-600 border-amber-100',
  removed: 'bg-red-50 text-red-600 border-red-100',
  account: 'bg-sky-50 text-sky-600 border-sky-100',
  report: 'bg-violet-50 text-violet-600 border-violet-100',
};

const ICON = { approved: '✓', rejected: '!', removed: '✕', account: '●', report: '⚑' };

/**
 * Navbar notification bell (spec §12).
 *
 * Fetch policy: once when the session appears, and again each time the panel
 * is opened. Deliberately no polling -- §36 asks for exactly that -- because
 * a feed a user has to actively open does not need to stay hot while they are
 * reading a template.
 *
 * Accessibility: a disclosure (button + `aria-expanded` + a labelled panel),
 * not `role="menu"`. A menu promises arrow-key navigation and roving focus
 * that this list does not implement, whereas a plain list of buttons works
 * with Tab exactly as it looks like it should.
 */
export default function NotificationBell() {
  const { isAuthenticated } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const loadedFor = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/api/notifications');
      setItems(data.notifications || []);
      setUnread(data.unread || 0);
    } catch (err) {
      // A failed feed must not take the navbar down with it.
      setError(getErrorMessage(err, 'Could not load notifications'));
    } finally {
      setLoading(false);
    }
  }, []);

  // One fetch per session, not one per route change: opening the panel is
  // what refreshes it, so navigating around the site does not add a request
  // to every page view (§36).
  useEffect(() => {
    if (!isAuthenticated) {
      loadedFor.current = false;
      setItems([]);
      setUnread(0);
      setOpen(false);
      return undefined;
    }
    if (loadedFor.current) return undefined;
    loadedFor.current = true;
    load();
    return undefined;
  }, [isAuthenticated, load]);

  // Closing on route change keeps a stale panel from floating over a page the
  // user has just navigated to.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Outside click / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isAuthenticated) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Refresh on the way in: the badge should never be confidently wrong.
    if (next) load();
  };

  const markAll = async () => {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await api.patch('/api/notifications/read-all');
    } catch {
      // Optimistic update already landed; the next fetch corrects it if the
      // server disagreed, which is better than throwing a toast at a bell.
      load();
    }
  };

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      api.patch(`/api/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.href) navigate(n.href);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="ui-btn ui-btn--ghost relative !px-2 !py-1.5 sm:!px-2.5"
      >
        <span aria-hidden className="text-base leading-none">
          🔔
        </span>
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          className="ui-card absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(21rem,calc(100vw-2rem))] border border-white/60 p-0 shadow-lift animate-fade-up"
        >
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
            <h2 className="text-sm font-bold text-ink-900">Notifications</h2>
            <button
              type="button"
              onClick={markAll}
              disabled={!unread}
              className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700 disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
            {loading && !items.length && (
              <p className="px-4 py-6 text-center text-sm text-ink-500">Loading…</p>
            )}
            {error && <p className="px-4 py-4 text-sm text-red-600">{error}</p>}
            {!loading && !error && !items.length && (
              <p className="px-4 py-6 text-center text-sm text-ink-500">
                Nothing yet. Approvals, rejections and reports show up here.
              </p>
            )}
            {!!items.length && (
              <ul className="divide-y divide-ink-100">
                {items.map((n) => {
                  const tone = TONE[n.type] || TONE.account;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50 ${
                          n.read ? 'opacity-70' : ''
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${tone}`}
                        >
                          {ICON[n.type] || '●'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold leading-snug text-ink-800">
                            {n.title}
                            {!n.read && (
                              <span className="ml-1.5 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full bg-brand-500 align-middle" />
                            )}
                          </span>
                          {n.message ? (
                            <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                              {n.message}
                            </span>
                          ) : null}
                          <span className="mt-1 block text-[11px] text-ink-500">
                            {timeAgo(n.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
