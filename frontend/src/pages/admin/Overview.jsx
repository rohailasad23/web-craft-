import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatCount, formatDate } from '../../lib/format';
import { StatSkeleton, RowSkeleton } from '../../components/Common/Skeletons';

/**
 * /admin -- platform statistics (spec §14).
 *
 * Every number here is a real count straight from MongoDB. The spec is
 * explicit that charts, if used, stay "simple and useful" and that no fake
 * statistics are added -- so there is a number grid and a ranked list, both of
 * which are just the data, and no sparklines with invented history behind them.
 */
export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  const s = data?.stats;
  const top = data?.topTemplates || [];

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
            Awaiting review
          </h2>
          <div className="mt-4">
            {loading ? (
              <RowSkeleton rows={3} />
            ) : (
              <ul className="ui-card divide-y divide-ink-100 !p-0">
                <li className="flex items-center justify-between gap-4 p-4">
                  <span className="text-sm text-ink-700">Templates in the moderation queue</span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-extrabold text-amber-600">
                      {s?.pending || 0}
                    </span>
                    <Link to="/admin/templates?status=pending" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
                      Open →
                    </Link>
                  </span>
                </li>
                <li className="flex items-center justify-between gap-4 p-4">
                  <span className="text-sm text-ink-700">Reports with no decision yet</span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-extrabold text-red-600">{s?.reports || 0}</span>
                    <Link to="/admin/reports?status=pending" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
                      Open →
                    </Link>
                  </span>
                </li>
                <li className="flex items-center justify-between gap-4 p-4">
                  <span className="text-sm text-ink-700">Suspended accounts</span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-extrabold text-ink-700">{s?.suspended || 0}</span>
                    <Link to="/admin/users?status=suspended" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
                      Open →
                    </Link>
                  </span>
                </li>
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

      {!loading && data && (
        <p className="mt-8 text-xs text-ink-500">
          Figures are counted live. Generated {formatDate(new Date().toISOString())}.
        </p>
      )}
    </div>
  );
}
