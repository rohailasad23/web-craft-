import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatCount, timeAgo, formatDate } from '../../lib/format';
import { StatSkeleton, RowSkeleton } from '../../components/Common/Skeletons';
import Footer from '../../components/Common/Footer';

/**
 * /developer -- the developer workspace (spec §16 + §13).
 *
 * One request to /api/templates/mine/stats serves every section below, so the
 * totals, the chart and the two lists can never disagree with each other the
 * way they would if each fetched separately (§36).
 *
 * The chart is deliberately bars over a library: §13 asks for useful basic
 * statistics and says in as many words not to build complicated analytics.
 */
export default function DeveloperDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .get('/api/templates/mine/stats')
      .then((res) => alive && setStats(res.data))
      .catch((err) => alive && setError(getErrorMessage(err, 'Could not load your statistics')))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, []);

  const totals = stats?.totals;
  const perTemplate = stats?.perTemplate || [];
  const maxDownloads = perTemplate.reduce((m, t) => Math.max(m, t.downloadCount || 0), 0);

  const recent = [...perTemplate]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  const top = [...perTemplate].sort((a, b) => b.downloadCount - a.downloadCount).slice(0, 5);
  const recentDownloads = stats?.recentDownloads || [];

  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-16 pt-10 sm:px-6">
        <header className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="ui-eyebrow">Developer workspace</span>
            <h1 className="ui-title mt-2 text-3xl sm:text-4xl">Developer Dashboard</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-500">
              Everything you have published, how often it is downloaded, and the fastest way to add
              something new.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/developer/templates" className="ui-btn ui-btn--soft !px-4 !py-2.5 text-sm">
              My templates
            </Link>
            <Link to="/developer/upload" className="ui-btn ui-btn--success !px-4 !py-2.5 text-sm">
              <span aria-hidden>＋</span> Upload template
            </Link>
          </div>
        </header>

        {error && (
          <div className="ui-alert ui-alert--error mt-6" role="alert">
            {error}
          </div>
        )}

        {/* Spec §13: total templates, downloads and favourites. */}
        <section className="stagger mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Totals">
          {loading ? (
            Array.from({ length: 4 }, (_, i) => <StatSkeleton key={i} />)
          ) : (
            <>
              <Stat label="Templates" value={totals?.templates} icon="🧩" hint="in total" />
              <Stat label="Published" value={totals?.approved} icon="✅" hint="approved and listed" />
              <Stat label="Downloads" value={formatCount(totals?.downloads)} icon="⬇️" hint="across your work" />
              <Stat label="Favorites" value={formatCount(totals?.favorites)} icon="♥" hint="people who saved you" />
            </>
          )}
        </section>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {/* ------------------------------------------ downloads per template */}
          <section aria-labelledby="per-heading">
            <h2 id="per-heading" className="ui-title text-xl">
              Downloads per template
            </h2>
            <div className="mt-4">
              {loading ? (
                <RowSkeleton rows={4} />
              ) : perTemplate.length === 0 ? (
                <EmptyRow
                  title="No templates yet"
                  body="Upload your first archive and it will show up here."
                  to="/developer/upload"
                  cta="Upload a template"
                />
              ) : (
                <ul className="ui-card space-y-4 !p-5">
                  {perTemplate.slice(0, 8).map((t) => {
                    // A zero-download template still gets a visible track, so
                    // the list reads as a chart rather than a set of blanks.
                    const pct = maxDownloads ? Math.round((t.downloadCount / maxDownloads) * 100) : 0;
                    return (
                      <li key={t.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <Link
                            to={`/templates/${t.slug}`}
                            className="min-w-0 truncate text-sm font-semibold text-ink-800 transition-colors hover:text-brand-700"
                          >
                            {t.title}
                          </Link>
                          <span className="shrink-0 text-xs font-bold text-ink-600">
                            {formatCount(t.downloadCount)}
                          </span>
                        </div>
                        <div
                          className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100"
                          role="img"
                          aria-label={`${t.title}: ${t.downloadCount} downloads`}
                        >
                          <div
                            className="h-full origin-left rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-transform duration-700"
                            style={{
                              // scaleX rather than width: the track already
                              // clips (overflow-hidden + rounded-full), so the
                              // bar looks the same either way -- but transform
                              // is composited, while animating width re-ran
                              // layout for every bar on every frame.
                              transform: `scaleX(${
                                Math.max(pct, t.downloadCount > 0 ? 4 : 0) / 100
                              })`,
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* ------------------------------------------------ most downloaded */}
          <section aria-labelledby="top-heading">
            <h2 id="top-heading" className="ui-title text-xl">
              Most downloaded
            </h2>
            <div className="mt-4">
              {loading ? (
                <RowSkeleton rows={4} />
              ) : !stats?.mostDownloaded ? (
                <EmptyRow
                  title="No downloads yet"
                  body="Once people start downloading your templates the ranking appears here."
                  to="/templates"
                  cta="Browse the library"
                />
              ) : (
                <ol className="ui-card divide-y divide-ink-100 !p-0">
                  {top.map((t, i) => (
                    <li key={t.id} className="flex items-center gap-4 p-4">
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-extrabold ${
                          i === 0
                            ? 'bg-amber-100 text-amber-700'
                            : i === 1
                              ? 'bg-ink-100 text-ink-700'
                              : 'bg-ink-50 text-ink-500'
                        }`}
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                      <Link
                        to={`/templates/${t.slug}`}
                        className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900 transition-colors hover:text-brand-700"
                      >
                        {t.title}
                      </Link>
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

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {/* --------------------------------------------- recent downloads */}
          <section aria-labelledby="recent-dl-heading">
            <h2 id="recent-dl-heading" className="ui-title text-xl">
              Recent downloads
            </h2>
            <div className="mt-4">
              {loading ? (
                <RowSkeleton rows={4} />
              ) : recentDownloads.length === 0 ? (
                <div className="ui-card p-8 text-center">
                  <p className="text-sm text-ink-500">
                    No downloads recorded yet. They will appear here as they happen.
                  </p>
                </div>
              ) : (
                <ul className="ui-card divide-y divide-ink-100 !p-0">
                  {recentDownloads.map((r, i) => (
                    <li key={`${r.template.slug}-${r.downloadedAt}-${i}`} className="p-4">
                      <Link
                        to={`/templates/${r.template.slug}`}
                        className="block truncate text-sm font-semibold text-ink-900 transition-colors hover:text-brand-700"
                      >
                        {r.template.title}
                      </Link>
                      <span className="mt-0.5 block text-xs text-ink-500" title={formatDate(r.downloadedAt)}>
                        {timeAgo(r.downloadedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* -------------------------------------------------- recently added */}
          <section aria-labelledby="recent-heading">
            <div className="flex items-end justify-between gap-3">
              <h2 id="recent-heading" className="ui-title text-xl">
                Recently added
              </h2>
              <Link
                to="/developer/templates"
                className="text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                Manage →
              </Link>
            </div>
            <div className="mt-4">
              {loading ? (
                <RowSkeleton rows={4} />
              ) : recent.length === 0 ? (
                <EmptyRow
                  title="No templates yet"
                  body="Upload your first archive and it will show up here."
                  to="/developer/upload"
                  cta="Upload a template"
                />
              ) : (
                <ul className="ui-card divide-y divide-ink-100 !p-0">
                  {recent.map((t) => (
                    <li key={t.id}>
                      <Link
                        to={`/templates/${t.slug}`}
                        className="flex items-center gap-3.5 p-4 transition-colors hover:bg-ink-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-ink-900">
                            {t.title}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-500">
                            {t.category} · ↓ {formatCount(t.downloadCount)}
                          </span>
                        </span>
                        <StatusBadge status={t.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Stat({ label, value, hint, icon }) {
  return (
    <div className="ui-card p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</span>
        <span aria-hidden className="text-lg">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink-900">
        {value === undefined || value === null ? '0' : value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    approved: '!bg-emerald-50 !text-emerald-700',
    pending: '!bg-amber-50 !text-amber-700',
    rejected: '!bg-red-50 !text-red-700',
  };
  return <span className={`ui-badge shrink-0 ${map[status] || map.pending}`}>{status}</span>;
}

function EmptyRow({ title, body, to, cta }) {
  return (
    <div className="ui-card p-8 text-center">
      <h3 className="ui-title text-base">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-500">{body}</p>
      <Link to={to} className="ui-btn ui-btn--soft mt-4 !px-4 !py-2 !text-sm">
        {cta}
      </Link>
    </div>
  );
}
