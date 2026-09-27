import React, { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { RowSkeleton } from '../../components/Common/Skeletons';

const SEVERITIES = [
  { value: 'all', label: 'Any severity' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
];

const SEVERITY_CLS = {
  critical: '!bg-red-100 !text-red-700',
  warning: '!bg-amber-100 !text-amber-700',
  info: '!bg-ink-100 !text-ink-600',
};

/** `login.failed` -> "Login failed". Local on purpose: these are server keys. */
function humanise(type) {
  return String(type || '')
    .split('.')
    .map((part) => part.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()))
    .join(' ');
}

/**
 * /admin/security -- §9's security activity log.
 *
 * The API only accepts `severity` and `scope=logins` (plus a type), so those
 * are the only controls here; the counts row mirrors the three numbers the
 * endpoint itself returns. No filter can ask for something the backend does
 * not have, and there is no pagination because the response carries none --
 * it returns the newest events up to its own limit.
 *
 * Passwords and tokens never reach this collection (the model forbids them),
 * so nothing has to be scrubbed on the way out: the columns below are all
 * there is to show.
 */
export default function AdminSecurity() {
  const [severity, setSeverity] = useState('all');
  const [scope, setScope] = useState('all');
  const [events, setEvents] = useState(null);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const params = {};
    if (severity !== 'all') params.severity = severity;
    if (scope !== 'all') params.scope = scope;

    // Loading and the error line are cleared by the CLICK that changed the
    // filter, not here: setting state synchronously inside an effect is the
    // pattern the repo's lint flags everywhere else it appears.
    api
      .get('/api/admin/security', { params })
      .then((res) => {
        if (!alive) return;
        setError('');
        setEvents(res.data.events || []);
        setCounts(res.data.counts || {});
      })
      .catch((err) => {
        if (!alive) return;
        setError(getErrorMessage(err, 'Could not load security events'));
        setEvents([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [severity, scope]);

  const applyFilter = (patch) => {
    setSeverity(patch.severity ?? severity);
    setScope(patch.scope ?? scope);
    setLoading(true);
    setError('');
  };

  const reset = () => applyFilter({ severity: 'all', scope: 'all' });

  const list = events || [];
  const filtered = severity !== 'all' || scope !== 'all';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter security events"
          className="flex flex-wrap gap-1.5 rounded-xl border border-ink-200 bg-white p-1"
        >
          {[
            { value: 'all', label: 'Events', count: counts.all },
            { value: 'logins', label: 'Admin logins', count: counts.logins },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={scope === tab.value}
              onClick={() => applyFilter({ scope: tab.value })}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                scope === tab.value
                  ? 'bg-brand-600 text-white shadow-soft'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
              }`}
            >
              {tab.label}
              {typeof tab.count === 'number' && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    scope === tab.value ? 'bg-white/25 text-white' : 'bg-ink-100 text-ink-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
          {/* Counts on record, not a tab: the API has no "failures only"
              query, so this chip reports the total rather than pretending to
              filter by it. */}
          <span
            title="Failed logins, rate limits and rejected uploads, all time"
            className="rounded-lg bg-ink-100 px-3.5 py-1.5 text-sm font-semibold text-ink-600"
          >
            Failures
            {typeof counts.failures === 'number' && (
              <span className="ml-1.5 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-ink-600">
                {counts.failures}
              </span>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="security-severity">
            Filter by severity
          </label>
          <select
            id="security-severity"
            value={severity}
            onChange={(e) => applyFilter({ severity: e.target.value })}
            className="ui-input !w-auto !py-2 text-sm"
          >
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={reset} className="ui-btn ui-btn--ghost !px-3 !py-2 !text-xs">
            Reset
          </button>
        </div>
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
              🛡
            </span>
            <h2 className="ui-title mt-3 text-lg">Nothing recorded here</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
              {filtered
                ? 'No security events match this filter. Try resetting it.'
                : 'Failed logins, permission changes and rejected uploads appear here as they happen.'}
            </p>
          </div>
        ) : (
          <ul className="ui-card divide-y divide-ink-100 !p-0">
            {list.map((e) => {
              const actor = e.email || (e.actorId ? `account …${String(e.actorId).slice(-6)}` : '—');
              const meta = Object.entries(e.meta || {}).filter(
                ([, v]) => v !== null && v !== undefined && v !== ''
              );
              return (
                <li key={e._id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`ui-badge ${SEVERITY_CLS[e.severity] || ''}`}>
                      {e.severity}
                    </span>
                    <span className="text-sm font-bold text-ink-900">{humanise(e.type)}</span>
                    <span
                      className="text-xs text-ink-500"
                      title={new Date(e.createdAt).toLocaleString()}
                    >
                      {formatDate(e.createdAt)}
                    </span>
                    {e.roleAtEvent && (
                      <span className="ui-badge !bg-brand-50 !text-brand-700">{e.roleAtEvent}</span>
                    )}
                  </div>

                  <p className="mt-1 truncate text-xs text-ink-500">
                    {actor}
                    {e.ip ? ` · ${e.ip}` : ''}
                  </p>

                  <p className="mt-0.5 truncate text-xs text-ink-500" title={e.userAgent || undefined}>
                    {e.userAgent || 'No user agent recorded'}
                  </p>

                  {meta.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {meta.slice(0, 8).map(([k, v]) => (
                        <li
                          key={k}
                          className="ui-badge !bg-ink-50 !text-ink-600"
                          title={`${k}=${String(v)}`}
                        >
                          {k}={String(v)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!loading && (
        <p className="mt-4 text-xs text-ink-500">
          {list.length > 0
            ? `Newest first · showing ${list.length} event${
                list.length === 1 ? '' : 's'
              }. Nothing is ever pruned automatically — 365 days is the documented retention ceiling.`
            : 'Nothing is ever pruned automatically — 365 days is the documented retention ceiling.'}
        </p>
      )}
    </div>
  );
}
