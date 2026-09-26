import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatDate, timeAgo } from '../../lib/format';
import { useToast } from '../../components/Common/Toast';
import { RowSkeleton } from '../../components/Common/Skeletons';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

const STATUS_CLS = {
  pending: '!bg-amber-50 !text-amber-700',
  reviewed: '!bg-sky-50 !text-sky-700',
  resolved: '!bg-emerald-50 !text-emerald-700',
  dismissed: '!bg-ink-100 !text-ink-600',
};

/** What a moderator can do from each state; anything already decided reopens. */
const ACTIONS = {
  pending: [
    { to: 'reviewed', label: 'Mark reviewed' },
    { to: 'resolved', label: 'Resolve', primary: true },
    { to: 'dismissed', label: 'Dismiss' },
  ],
  reviewed: [
    { to: 'resolved', label: 'Resolve', primary: true },
    { to: 'dismissed', label: 'Dismiss' },
  ],
  resolved: [{ to: 'pending', label: 'Reopen' }],
  dismissed: [{ to: 'pending', label: 'Reopen' }],
};

/**
 * /admin/reports -- the report queue (spec §7 + §8).
 *
 * Every report shows the template it is about and the person who raised it,
 * because a report without its subject is just a complaint. Closing one
 * notifies the reporter, so the button that says "Resolve" is also making a
 * promise to a real user -- the confirm text says as much.
 */
export default function AdminReports() {
  const [params, setParams] = useSearchParams();
  const status = FILTERS.some((f) => f.value === params.get('status'))
    ? params.get('status')
    : 'pending';

  const [reports, setReports] = useState(null);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = status === 'all' ? '' : `?status=${status}`;
      const res = await api.get(`/api/admin/reports${qs}`);
      setReports(res.data.reports || []);
      setCounts(res.data.counts || {});
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load reports'));
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatusFilter = (next) => {
    const merged = new URLSearchParams(params);
    // Always written, even for "all" -- this page defaults to "pending" when
    // the parameter is absent, so deleting it would be a no-op and the tab
    // would never move. See Templates.jsx.
    merged.set('status', next);
    setParams(merged, { replace: true });
  };

  const decide = async (report, next) => {
    setBusyId(report._id);
    try {
      const res = await api.patch(`/api/admin/reports/${report._id}`, { status: next });
      toast.success(res.data?.message || `Report marked as ${next}`);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'That action failed'));
    } finally {
      setBusyId(null);
    }
  };

  const list = reports || [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter reports by status"
          className="flex flex-wrap gap-1.5 rounded-xl border border-ink-200 bg-white p-1"
        >
          {FILTERS.map((f) => {
            const active = f.value === status;
            const badge = counts[f.value];
            return (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={
                  typeof badge === 'number' && badge > 0
                    ? `${f.label}, ${badge}`
                    : f.label
                }
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-brand-600 text-white shadow-soft'
                    : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                }`}
              >
                {f.label}
                {typeof badge === 'number' && badge > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      active ? 'bg-white/25 text-white' : 'bg-ink-100 text-ink-600'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-ink-500" aria-live="polite">
          {loading ? 'Loading…' : `${list.length} report${list.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {error && (
        <div className="ui-alert ui-alert--error mt-5" role="alert">
          {error}
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <RowSkeleton rows={4} />
        ) : list.length === 0 ? (
          <div className="ui-card p-10 text-center">
            <span aria-hidden className="text-3xl">
              🕊️
            </span>
            <h2 className="ui-title mt-3 text-lg">Nothing to review</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
              No reports in this state. Anything users flag will show up here.
            </p>
          </div>
        ) : (
          <ul className="ui-card divide-y divide-ink-100 !p-0">
            {list.map((r) => {
              const template = r.templateId;
              const reporter = r.userId;
              const actions = ACTIONS[r.status] || ACTIONS.pending;
              return (
                <li key={r._id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="ui-badge !bg-red-50 !text-red-700">{r.reason}</span>
                        <span className={`ui-badge ${STATUS_CLS[r.status] || ''}`}>
                          {r.status}
                        </span>
                        <span className="text-xs text-ink-400" title={formatDate(r.createdAt)}>
                          {timeAgo(r.createdAt)}
                        </span>
                      </div>

                      {template ? (
                        <Link
                          to={`/templates/${template.slug}`}
                          className="mt-2 block truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
                        >
                          {template.title}
                          <span className="ml-2 text-xs font-normal text-ink-400">
                            {template.status}
                          </span>
                        </Link>
                      ) : (
                        <p className="mt-2 text-sm font-bold text-ink-400">
                          The reported template has since been deleted
                        </p>
                      )}

                      {r.description && (
                        <p className="mt-1.5 max-w-2xl whitespace-pre-line break-words text-sm leading-relaxed text-ink-600">
                          {r.description}
                        </p>
                      )}

                      <p className="mt-1.5 text-xs text-ink-500">
                        Reported by {reporter?.name || 'a deleted account'}
                      </p>
                    </div>

                    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                      {actions.map((a) => (
                        <button
                          key={a.to}
                          type="button"
                          onClick={() => decide(r, a.to)}
                          disabled={busyId === r._id}
                          className={`ui-btn !px-3 !py-1.5 !text-xs ${
                            a.primary ? 'ui-btn--primary' : 'ui-btn--ghost'
                          }`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!loading && (
        <p className="mt-4 text-xs text-ink-400">
          Closing a report notifies the person who raised it. Reopening restores it to the pending
          queue without contacting anyone.
        </p>
      )}
    </div>
  );
}
