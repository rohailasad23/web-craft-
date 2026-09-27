import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatCount, formatDate } from '../../lib/format';
import { StatSkeleton, RowSkeleton } from '../../components/Common/Skeletons';

/**
 * /admin -- platform statistics (spec §14) with the §21 Action Required
 * block, §24's health checks and a command centre for the screens an admin
 * reaches for constantly.
 *
 * Every number here is a real count straight from MongoDB. The spec is
 * explicit that charts, if used, stay "simple and useful" and that no fake
 * statistics are added -- so there is a number grid and a ranked list, both of
 * which are just the data, and no sparklines with invented history behind them.
 * Health is fetched separately so a failing health probe cannot blank the
 * statistics (and vice versa).
 */
export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get('/api/admin/stats')
      .then((res) => alive && setData(res.data))
      .catch((err) => alive && setError(getErrorMessage(err, 'Could not load statistics')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // §24: live checks, one extra round-trip. A failure here is reported as a
  // line in its own panel rather than turning the whole overview red.
  useEffect(() => {
    let alive = true;
    api
      .get('/api/admin/health')
      .then((res) => alive && setHealth(res.data))
      .catch((err) => alive && setHealthError(getErrorMessage(err, 'Health checks unavailable')));
    return () => {
      alive = false;
    };
  }, []);

  const s = data?.stats;
  const top = data?.topTemplates || [];
  const ar = data?.actionRequired || null;

  // §21: only rows with actual work are rendered -- an all-zero block shows
  // one "nothing waiting" line instead of five zeros to squint at. Each count
  // links to the screen where that work is DONE, not to a detail page that
  // would only restate the same number.
  const actionRows = ar
    ? [
        { label: 'Templates waiting to be reviewed', value: ar.templates, to: '/admin/queue', tone: 'text-amber-600' },
        { label: 'Reports waiting for a decision', value: ar.reports, to: '/admin/queue', tone: 'text-red-600' },
        { label: 'Flagged content to restore or hide', value: ar.content, to: '/admin/queue', tone: 'text-amber-600' },
        { label: 'Duplicate warnings awaiting review', value: ar.duplicates, to: '/admin/queue', tone: 'text-amber-600' },
        { label: 'Critical security events (last 24h)', value: ar.security, to: '/admin/security', tone: 'text-red-600' },
      ].filter((row) => row.value > 0)
    : [];

  const checks = health?.checks;
  const healthDot = {
    healthy: 'bg-emerald-500',
    configured: 'bg-emerald-500',
    attention: 'bg-amber-500',
    unknown: 'bg-ink-300',
    not_configured: 'bg-ink-300',
    unhealthy: 'bg-red-500',
  };

  const COMMANDS = [
    { to: '/admin/queue', icon: '🧰', label: 'Work queue', hint: 'reports, duplicates, flagged content' },
    { to: '/admin/content', icon: '🎛', label: 'Content control', hint: 'sections, featured, spotlight, announcements' },
    { to: '/admin/security', icon: '🛡', label: 'Security log', hint: 'logins, failures, permission changes' },
    { to: '/admin/settings', icon: '⚙️', label: 'Flags & maintenance', hint: 'switch features off, wall the site' },
    { to: '/admin/search', icon: '🔍', label: 'Search the panel', hint: 'templates, users, reports, audit rows' },
  ];

  return (
    <div>
      {error && (
        <div className="ui-alert ui-alert--error mb-6" role="alert">
          {error}
        </div>
      )}

      <section aria-label="Platform totals" className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }, (_, i) => <StatSkeleton key={i} />)
          : [
              { label: 'Users', value: s?.users, icon: '👥', hint: 'every registered account' },
              {
                label: 'Developers',
                value: s?.developers,
                icon: '🧑‍💻',
                hint: 'developers and admins',
              },
              { label: 'Templates', value: s?.templates, icon: '🧩', hint: `${s?.approved ?? 0} approved` },
              { label: 'Downloads', value: s?.downloads, icon: '⬇️', hint: 'distinct user + template pairs' },
              {
                label: 'Open reports',
                value: s?.reports,
                icon: '⚑',
                hint: 'waiting on a decision',
                to: '/admin/reports',
                alert: (s?.reports || 0) > 0,
              },
              {
                label: 'Suspended',
                value: s?.suspended,
                icon: '⛔',
                hint: 'accounts unable to sign in',
                to: '/admin/users?status=suspended',
              },
            ].map((card) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-wide text-ink-500">
                      {card.label}
                    </span>
                    <span aria-hidden className="text-lg">
                      {card.icon}
                    </span>
                  </div>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink-900">
                    {formatCount(card.value || 0)}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">{card.hint}</p>
                </>
              );
              return card.to ? (
                <Link
                  key={card.label}
                  to={card.to}
                  className={`ui-card block p-5 transition-transform hover:-translate-y-0.5 ${
                    card.alert ? 'ring-2 ring-red-200' : ''
                  }`}
                >
                  {body}
                </Link>
              ) : (
                <div key={card.label} className="ui-card p-5">
                  {body}
                </div>
              );
            })}
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="queue-heading">
          <h2 id="queue-heading" className="ui-title text-xl">
            Action required
          </h2>
          <div className="mt-4">
            {loading ? (
              <RowSkeleton rows={3} />
            ) : actionRows.length === 0 ? (
              <div className="ui-card p-6">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                  <span aria-hidden>✓</span>
                  Nothing is waiting on you.
                </p>
              </div>
            ) : (
              <ul className="ui-card divide-y divide-ink-100 !p-0">
                {actionRows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-4 p-4">
                    <span className="text-sm text-ink-700">{row.label}</span>
                    <span className="flex items-center gap-3">
                      <span className={`text-sm font-extrabold ${row.tone}`}>{row.value}</span>
                      <Link
                        to={row.to}
                        className="text-sm font-semibold text-brand-700 hover:text-brand-800"
                      >
                        Open →
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="top-heading">
          <h2 id="top-heading" className="ui-title text-xl">
            Most downloaded
          </h2>
          <div className="mt-4">
            {loading ? (
              <RowSkeleton rows={3} />
            ) : top.length === 0 ? (
              <div className="ui-card p-8 text-center">
                <p className="text-sm text-ink-500">Nothing has been downloaded yet.</p>
              </div>
            ) : (
              <ol className="ui-card divide-y divide-ink-100 !p-0">
                {top.map((t, i) => (
                  <li key={t._id} className="flex items-center gap-4 p-4">
                    <span
                      aria-hidden
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-extrabold ${
                        i === 0
                          ? 'bg-amber-100 text-amber-700'
                          : i === 1
                            ? 'bg-ink-100 text-ink-700'
                            : 'bg-ink-50 text-ink-500'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link
                        to={`/templates/${t.slug}`}
                        className="block truncate text-sm font-semibold text-ink-900 transition-colors hover:text-brand-700"
                      >
                        {t.title}
                      </Link>
                      <span className="block truncate text-xs text-ink-500">{t.category}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-brand-700">
                      ↓ {formatCount(t.downloadCount)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      {/* §24: real probes. The backup row prints the API's own words -- when
          no backup service is configured it says exactly that, because a
          guessed "last backup" time would be the one lie on this page. */}
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="health-heading">
          <h2 id="health-heading" className="ui-title text-xl">
            Platform health
          </h2>
          <div className="mt-4">
            {healthError ? (
              <div className="ui-alert ui-alert--warning" role="alert">
                {healthError}
              </div>
            ) : !health ? (
              <RowSkeleton rows={6} />
            ) : (
              <ul className="ui-card divide-y divide-ink-100 !p-0">
                {[
                  ['API', checks.api, checks.api?.uptimeSeconds != null ? `up ${Math.floor(checks.api.uptimeSeconds / 3600)}h ${Math.floor((checks.api.uptimeSeconds % 3600) / 60)}m` : ''],
                  ['Database', checks.database, ''],
                  ['Storage', checks.storage, ''],
                  ['Moderation', checks.moderation, ''],
                  ['Security', checks.security, ''],
                  ['Backups', checks.backup, checks.backup?.state === 'not_configured' ? checks.backup.message : ''],
                ].map(([label, check, hint]) => (
                  <li key={label} className="flex items-center justify-between gap-4 p-4">
                    <span className="flex items-center gap-2.5 text-sm text-ink-700">
                      <span
                        aria-hidden
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${healthDot[check?.state] || 'bg-ink-300'}`}
                      />
                      {label}
                    </span>
                    <span className="flex min-w-0 items-center gap-3 text-right">
                      {hint && <span className="truncate text-xs text-ink-500">{hint}</span>}
                      <span className="text-sm font-semibold text-ink-900">
                        {check?.label || '—'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="command-heading">
          <h2 id="command-heading" className="ui-title text-xl">
            Command centre
          </h2>
          <div className="mt-4">
            <ul className="ui-card divide-y divide-ink-100 !p-0">
              {COMMANDS.map((cmd) => (
                <li key={cmd.to}>
                  <Link
                    to={cmd.to}
                    className="flex items-center gap-4 p-4 transition-colors hover:bg-ink-50"
                  >
                    <span aria-hidden className="text-lg">
                      {cmd.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-900">{cmd.label}</span>
                      <span className="block truncate text-xs text-ink-500">{cmd.hint}</span>
                    </span>
                    <span aria-hidden className="text-sm font-bold text-brand-700">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {!loading && data && (
        <p className="mt-8 text-xs text-ink-500">
          Figures are counted live. Generated {formatDate(new Date().toISOString())}.
        </p>
      )}
    </div>
  );
}
