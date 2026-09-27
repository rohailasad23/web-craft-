import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatDate, timeAgo, formatCount } from '../../lib/format';
import { useToast } from '../../components/Common/Toast';
import { useConfirm } from '../../components/Common/ConfirmDialog';
import { StatSkeleton, RowSkeleton } from '../../components/Common/Skeletons';

/** §20's queue priority, in the colours Reports.jsx uses for its own badges. */
const PRIORITY_CLS = {
  critical: '!bg-red-100 !text-red-700',
  high: '!bg-amber-100 !text-amber-700',
  normal: '!bg-ink-100 !text-ink-700',
  low: '!bg-ink-100 !text-ink-600',
};

/** Flagged rows arrive as 'template' or 'user'; each restores via its own router. */
const CONTENT_PATH = { template: 'templates', user: 'users' };

/**
 * One eye button for the whole page. The server owns the answer (POST /watch
 * toggles and returns the resulting state), so the row only mirrors what the
 * last response said instead of guessing whether a click added or removed.
 */
function WatchButton({ watching, busy, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={watching}
      title={watching ? 'Stop watching this item' : 'Track this item in your watchlist'}
      className={`ui-btn !px-3 !py-1.5 !text-xs ${watching ? 'ui-btn--soft' : 'ui-btn--ghost'}`}
    >
      {watching ? '👁 Watching' : '👁 Watch'}
    </button>
  );
}

/**
 * /admin/queue -- §19's one work queue, plus §18's watchlist behind a second
 * pill so "what needs me?" and "what am I keeping an eye on?" share a screen.
 *
 * The backend already sorts reports by §20 priority (critical first, oldest
 * first inside a priority), so this page renders the arrays as they arrive:
 * re-sorting here would only risk disagreeing with the counts above them.
 * Every decision refetches, and an action taken on an empty queue simply
 * leaves the section out of the next render.
 */
export default function AdminQueue() {
  const [tab, setTab] = useState('queue');
  const [queue, setQueue] = useState(null);
  const [items, setItems] = useState(null);
  const [watching, setWatching] = useState(() => new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const watchKey = (targetType, targetId) => `${targetType}:${targetId}`;

  const applyWatchlist = (list) => {
    setItems(list);
    setWatching(new Set(list.map((i) => watchKey(i.targetType, i.targetId))));
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [q, w] = await Promise.all([
        api.get('/api/admin/queue'),
        api.get('/api/admin/watchlist'),
      ]);
      setQueue(q.data);
      applyWatchlist(w.data.items || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load the queue'));
      setQueue(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Only on mount: each action below refetches instead, because the whole
    // point of the queue is that it is accurate the moment you look at it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (key, action, fallback) => {
    setBusy(key);
    try {
      const res = await action();
      toast.success(res?.data?.message || fallback);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  const toggleWatch = async (row) => {
    const key = watchKey(row.targetType, row.targetId);
    setBusy(`watch:${key}`);
    try {
      const res = await api.post('/api/admin/watch', {
        targetType: row.targetType,
        targetId: row.targetId,
        label: row.label,
        href: row.href,
      });
      // The response says which way the toggle went, so the eye flips from
      // that rather than from a guess; the list refetch below then brings the
      // Watchlist tab in line with the same server state.
      const next = new Set(watching);
      if (res.data?.watching) next.add(key);
      else next.delete(key);
      setWatching(next);
      toast.success(res.data?.message || 'Watchlist updated');
      try {
        const w = await api.get('/api/admin/watchlist');
        applyWatchlist(w.data.items || []);
      } catch {
        // The toggle already succeeded -- a failed refetch must not undo it.
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update your watchlist'));
    } finally {
      setBusy(null);
    }
  };

  const approve = (t) =>
    act(`tpl:${t._id}`, () => api.patch(`/api/admin/templates/${t._id}/status`, { status: 'approved' }), 'Template approved');

  const reject = async (t) => {
    const ok = await confirm({
      title: `Reject “${t.title}”?`,
      body: 'The developer is told it was not approved, and can edit and resubmit it. You can approve it later from the templates screen.',
      confirmLabel: 'Reject',
      tone: 'danger',
    });
    if (!ok) return;
    await act(`tpl:${t._id}`, () => api.patch(`/api/admin/templates/${t._id}/status`, { status: 'rejected' }), 'Template rejected');
  };

  const decideReport = (r, status) =>
    act(`rpt:${r._id}`, () => api.patch(`/api/admin/reports/${r._id}`, { status }), `Report marked as ${status}`);

  const setContentState = (row, state) => {
    const path = CONTENT_PATH[row.targetType];
    if (!path) return Promise.resolve();
    return act(
      `state:${row.targetId}`,
      () => api.patch(`/api/admin/${path}/${row.targetId}/content`, { state }),
      state === 'visible' ? 'Content restored' : 'Content hidden'
    );
  };

  const hideContent = async (row) => {
    const ok = await confirm({
      title: `Hide “${row.label}”?`,
      body: 'It disappears from the public site until someone restores it. Nothing is deleted.',
      confirmLabel: 'Hide',
      tone: 'danger',
    });
    if (!ok) return;
    await setContentState(row, 'hidden');
  };

  const clearDuplicate = (d) =>
    act(`dup:${d.id}`, () => api.patch(`/api/admin/templates/${d.id}/duplicates`, { reviewed: true }), 'Duplicate warning cleared');

  const counts = queue?.counts || {};
  const templates = queue?.templates || [];
  const reports = queue?.reports || [];
  const content = queue?.content || [];
  const duplicates = queue?.duplicates || [];
  const nothingWaiting =
    !loading &&
    Boolean(queue) &&
    templates.length + reports.length + content.length + duplicates.length === 0;

  const totals = [
    { label: 'Pending templates', value: counts.templates, tone: 'text-amber-600' },
    { label: 'Pending reports', value: counts.reports, tone: 'text-red-600' },
    { label: 'Flagged content', value: counts.content, tone: 'text-amber-600' },
    { label: 'Duplicate warnings', value: counts.duplicates, tone: 'text-amber-600' },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Queue or watchlist"
          className="flex flex-wrap gap-1.5 rounded-xl border border-ink-200 bg-white p-1"
        >
          {[
            { value: 'queue', label: 'Queue' },
            { value: 'watchlist', label: 'Watchlist' },
          ].map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.value
                  ? 'bg-brand-600 text-white shadow-soft'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
              }`}
            >
              {t.label}
              {t.value === 'watchlist' && Array.isArray(items) && items.length > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    tab === t.value ? 'bg-white/25 text-white' : 'bg-ink-100 text-ink-600'
                  }`}
                >
                  {items.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-500" aria-live="polite">
          {loading ? 'Loading…' : tab === 'queue' ? `${counts.total ?? 0} waiting` : `${(items || []).length} watched`}
        </p>
      </div>

      {error && (
        <div className="ui-alert ui-alert--error mt-5" role="alert">
          {error}
        </div>
      )}

      {tab === 'queue' ? (
        <div className="mt-5">
          <section aria-label="Queue totals" className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 4 }, (_, i) => <StatSkeleton key={i} />)
              : queue
                ? totals.map((card) => (
                    <div key={card.label} className="ui-card p-5">
                      <span className="text-xs font-bold uppercase tracking-wide text-ink-500">
                        {card.label}
                      </span>
                      <p className={`mt-2 text-3xl font-extrabold tracking-tight ${card.tone}`}>
                        {formatCount(card.value || 0)}
                      </p>
                    </div>
                  ))
                : null}
          </section>

          {loading ? (
            <div className="mt-8">
              <RowSkeleton rows={5} />
            </div>
          ) : !queue ? null : nothingWaiting ? (
            <div className="ui-card mt-8 p-10 text-center">
              <span aria-hidden className="text-3xl">
                ✅
              </span>
              <h2 className="ui-title mt-3 text-lg">Nothing waiting here.</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
                New submissions, reports, flagged content and duplicate warnings show up the moment
                they exist.
              </p>
            </div>
          ) : (
            <div className="mt-8 space-y-8">
              {/* ------------------------------------------ pending templates */}
              {templates.length > 0 && (
                <section aria-labelledby="pending-templates-heading">
                  <h2 id="pending-templates-heading" className="ui-title text-xl">
                    Pending templates{' '}
                    <span className="text-base font-semibold text-ink-500">
                      ({templates.length})
                    </span>
                  </h2>
                  <ul className="ui-card mt-4 divide-y divide-ink-100 !p-0">
                    {templates.map((t) => (
                      <li key={t._id} className="flex flex-wrap items-center gap-4 p-4">
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/templates/${t.slug}`}
                            className="block truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
                          >
                            {t.title}
                          </Link>
                          <p className="mt-0.5 truncate text-xs text-ink-500">
                            {t.authorName || 'Unknown'} · submitted {formatDate(t.createdAt)}
                          </p>
                        </div>
                        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                          <WatchButton
                            watching={watching.has(watchKey('template', t._id))}
                            busy={busy === `watch:template:${t._id}`}
                            onClick={() =>
                              toggleWatch({
                                targetType: 'template',
                                targetId: t._id,
                                label: t.title,
                                href: `/templates/${t.slug}`,
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() => approve(t)}
                            disabled={busy === `tpl:${t._id}`}
                            className="ui-btn ui-btn--success !px-3 !py-1.5 !text-xs"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => reject(t)}
                            disabled={busy === `tpl:${t._id}`}
                            className="ui-btn ui-btn--ghost !px-3 !py-1.5 !text-xs hover:!border-red-200 hover:!bg-red-50 hover:!text-red-600"
                          >
                            Reject
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* ------------------------------------------- pending reports */}
              {reports.length > 0 && (
                <section aria-labelledby="pending-reports-heading">
                  <h2 id="pending-reports-heading" className="ui-title text-xl">
                    Pending reports{' '}
                    <span className="text-base font-semibold text-ink-500">({reports.length})</span>
                  </h2>
                  <p className="mt-1 text-xs text-ink-500">
                    Ordered by priority, oldest first inside a priority.
                  </p>
                  <ul className="ui-card mt-4 divide-y divide-ink-100 !p-0">
                    {reports.map((r) => (
                      <li key={r._id} className="flex flex-wrap items-start gap-4 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="ui-badge !bg-red-50 !text-red-700">{r.reason}</span>
                            <span className={`ui-badge ${PRIORITY_CLS[r.priority] || ''}`}>
                              {r.priority}
                            </span>
                            <span className="text-xs text-ink-500" title={formatDate(r.createdAt)}>
                              {timeAgo(r.createdAt)}
                            </span>
                          </div>

                          {r.templateId ? (
                            <Link
                              to={`/templates/${r.templateId.slug}`}
                              className="mt-2 block truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
                            >
                              {r.templateId.title}
                            </Link>
                          ) : (
                            <p className="mt-2 text-sm font-bold text-ink-500">
                              The reported template has since been deleted
                            </p>
                          )}

                          <p className="mt-1.5 text-xs text-ink-500">
                            Reported by {r.userId?.name || 'a deleted account'}
                          </p>
                        </div>

                        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                          <WatchButton
                            watching={watching.has(watchKey('report', r._id))}
                            busy={busy === `watch:report:${r._id}`}
                            onClick={() =>
                              toggleWatch({
                                targetType: 'report',
                                targetId: r._id,
                                label: `${r.reason}${r.templateId ? ` — ${r.templateId.title}` : ''}`,
                                href: '/admin/reports',
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() => decideReport(r, 'resolved')}
                            disabled={busy === `rpt:${r._id}`}
                            className="ui-btn ui-btn--primary !px-3 !py-1.5 !text-xs"
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            onClick={() => decideReport(r, 'dismissed')}
                            disabled={busy === `rpt:${r._id}`}
                            className="ui-btn ui-btn--ghost !px-3 !py-1.5 !text-xs"
                          >
                            Dismiss
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* ------------------------------------------ flagged content */}
              {content.length > 0 && (
                <section aria-labelledby="flagged-content-heading">
                  <h2 id="flagged-content-heading" className="ui-title text-xl">
                    Flagged content{' '}
                    <span className="text-base font-semibold text-ink-500">({content.length})</span>
                  </h2>
                  <ul className="ui-card mt-4 divide-y divide-ink-100 !p-0">
                    {content.map((row) => {
                      const key = watchKey(row.targetType, row.targetId);
                      return (
                        <li key={key} className="flex flex-wrap items-center gap-4 p-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="ui-badge !bg-amber-50 !text-amber-700">
                                {row.targetType}
                              </span>
                              <span className="truncate text-sm font-bold text-ink-900">
                                {row.label}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-ink-500">
                              {row.detail} · flagged {timeAgo(row.at)}
                            </p>
                          </div>
                          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                            <WatchButton
                              watching={watching.has(key)}
                              busy={busy === `watch:${key}`}
                              onClick={() =>
                                toggleWatch({
                                  targetType: row.targetType,
                                  targetId: row.targetId,
                                  label: row.label,
                                  href:
                                    row.targetType === 'user' ? '/admin/users' : '/admin/templates',
                                })
                              }
                            />
                            <button
                              type="button"
                              onClick={() => setContentState(row, 'visible')}
                              disabled={busy === `state:${row.targetId}`}
                              className="ui-btn ui-btn--success !px-3 !py-1.5 !text-xs"
                            >
                              Restore
                            </button>
                            <button
                              type="button"
                              onClick={() => hideContent(row)}
                              disabled={busy === `state:${row.targetId}`}
                              className="ui-btn ui-btn--ghost !px-3 !py-1.5 !text-xs hover:!border-red-200 hover:!bg-red-50 hover:!text-red-600"
                            >
                              Hide
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* -------------------------------------- unreviewed duplicates */}
              {duplicates.length > 0 && (
                <section aria-labelledby="duplicates-heading">
                  <h2 id="duplicates-heading" className="ui-title text-xl">
                    Unreviewed duplicates{' '}
                    <span className="text-base font-semibold text-ink-500">
                      ({duplicates.length})
                    </span>
                  </h2>
                  <ul className="ui-card mt-4 divide-y divide-ink-100 !p-0">
                    {duplicates.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-start gap-4 p-4">
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/templates/${d.slug}`}
                            className="block truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
                          >
                            {d.title}
                          </Link>
                          <p className="mt-0.5 truncate text-xs text-ink-500">
                            {d.authorName || 'Unknown'} · checked {formatDate(d.checkedAt)}
                          </p>
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {(d.matches || []).map((m, i) => (
                              <li
                                key={`${m.type || 'match'}-${i}`}
                                className="ui-badge !bg-amber-50 !text-amber-700"
                              >
                                {m.reason || `${m.type} match${m.title ? `: ${m.title}` : ''}`}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-1.5 text-xs text-ink-500">
                            Advisory only — clearing the warning deletes nothing and changes no
                            template.
                          </p>
                        </div>
                        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                          <WatchButton
                            watching={watching.has(watchKey('template', d.id))}
                            busy={busy === `watch:template:${d.id}`}
                            onClick={() =>
                              toggleWatch({
                                targetType: 'template',
                                targetId: d.id,
                                label: d.title,
                                href: `/templates/${d.slug}`,
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() => clearDuplicate(d)}
                            disabled={busy === `dup:${d.id}`}
                            className="ui-btn ui-btn--soft !px-3 !py-1.5 !text-xs"
                          >
                            Clear warning
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5">
          {items === null ? (
            <RowSkeleton rows={3} />
          ) : items.length === 0 ? (
            <div className="ui-card p-10 text-center">
              <span aria-hidden className="text-3xl">
                👁
              </span>
              <h2 className="ui-title mt-3 text-lg">Your watchlist is empty</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
                Use the eye button anywhere in the admin to track an item.
              </p>
            </div>
          ) : (
            <ul className="ui-card divide-y divide-ink-100 !p-0">
              {items.map((item) => {
                const key = watchKey(item.targetType, item.targetId);
                return (
                  <li key={key} className="flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="ui-badge !bg-ink-100 !text-ink-700">
                          {item.targetType}
                        </span>
                        {item.href ? (
                          <Link
                            to={item.href}
                            className="truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
                          >
                            {item.label || 'Untitled item'}
                          </Link>
                        ) : (
                          <span className="truncate text-sm font-bold text-ink-900">
                            {item.label || 'Untitled item'}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">Watching since {formatDate(item.createdAt)}</p>
                    </div>
                    <WatchButton
                      watching
                      busy={busy === `watch:${key}`}
                      onClick={() =>
                        toggleWatch({
                          targetType: item.targetType,
                          targetId: item.targetId,
                          label: item.label,
                          href: item.href,
                        })
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
