import React, { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { timeAgo, formatDate } from '../../lib/format';
import { RowSkeleton } from '../../components/Common/Skeletons';

/** Machine action -> how it reads to a human. */
const LABEL = {
  'template.approved': { text: 'Template approved', cls: 'bg-emerald-50 text-emerald-700' },
  'template.rejected': { text: 'Template rejected', cls: 'bg-amber-50 text-amber-700' },
  'template.restored': { text: 'Template returned to review', cls: 'bg-sky-50 text-sky-700' },
  'template.deleted': { text: 'Template deleted', cls: 'bg-red-50 text-red-700' },
  'user.suspended': { text: 'User suspended', cls: 'bg-red-50 text-red-700' },
  'user.unsuspended': { text: 'User reinstated', cls: 'bg-emerald-50 text-emerald-700' },
  'user.role_changed': { text: 'Role changed', cls: 'bg-violet-50 text-violet-700' },
  'report.resolved': { text: 'Report closed', cls: 'bg-ink-100 text-ink-700' },
  'report.dismissed': { text: 'Report dismissed', cls: 'bg-ink-100 text-ink-700' },
};

const FILTERS = [
  { value: 'all', label: 'Everything' },
  { value: 'template.approved', label: 'Approvals' },
  { value: 'template.rejected', label: 'Rejections' },
  { value: 'template.deleted', label: 'Deletions' },
  { value: 'user.suspended', label: 'Suspensions' },
  { value: 'report.resolved', label: 'Reports' },
];

/**
 * /admin/audit -- the read side of spec §35.
 *
 * Write-only logs nobody can read are worse than useless during an incident,
 * so this is deliberately a flat, scannable list: who did what, to what, and
 * when. `metadata` is rendered as key/value pairs straight from the server --
 * the backend only ever puts ids, names and statuses in it, never secrets,
 * which is why it is safe to show as-is.
 */
export default function AdminAudit() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('all');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const qs = action === 'all' ? '' : `?action=${encodeURIComponent(action)}`;
    api
      .get(`/api/admin/audit${qs}`)
      .then((res) => alive && setEntries(res.data.entries || []))
      .catch((err) => alive && setError(getErrorMessage(err, 'Could not load the audit log')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [action]);

  const list = entries || [];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Filter the audit log"
        className="flex flex-wrap gap-1.5 rounded-xl border border-ink-200 bg-white p-1"
      >
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={action === f.value}
            onClick={() => setAction(f.value)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              action === f.value
                ? 'bg-brand-600 text-white shadow-soft'
                : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="ui-alert ui-alert--error mt-5" role="alert">
          {error}
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <RowSkeleton rows={6} />
        ) : list.length === 0 ? (
          <div className="ui-card p-10 text-center">
            <span aria-hidden className="text-3xl">
              📋
            </span>
            <h2 className="ui-title mt-3 text-lg">No entries yet</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
              Approvals, rejections, deletions, suspensions and report decisions are recorded here.
            </p>
          </div>
        ) : (
          <ol className="ui-card divide-y divide-ink-100 !p-0">
            {list.map((e) => {
              const label = LABEL[e.action] || { text: e.action, cls: 'bg-ink-100 text-ink-700' };
              return (
                <li key={e._id} className="flex flex-wrap items-start gap-3 p-4">
                  <span
                    aria-hidden
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs ${label.cls}`}
                  >
                    •
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink-900">{label.text}</span>
                      <span className="text-xs text-ink-500" title={formatDate(e.createdAt)}>
                        {timeAgo(e.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">
                      by {e.adminId?.name || 'a removed account'}
                      {e.targetId ? ` · target ${String(e.targetId).slice(-8)}` : ''}
                    </p>
                    {e.metadata && Object.keys(e.metadata).length > 0 && (
                      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                        {Object.entries(e.metadata).map(([k, v]) => (
                          <div key={k} className="flex gap-1.5">
                            <dt className="text-ink-500">{k}</dt>
                            <dd className="font-semibold text-ink-700">{String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {!loading && (
        <p className="mt-4 text-xs text-ink-500">
          Showing the latest {list.length} entr{list.length === 1 ? 'y' : 'ies'}. Passwords and
          other secrets are never written to this log.
        </p>
      )}
    </div>
  );
}
