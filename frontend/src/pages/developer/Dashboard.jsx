import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatCount } from '../../lib/format';
import { StatSkeleton, RowSkeleton } from '../../components/Common/Skeletons';
import Footer from '../../components/Common/Footer';

/**
 * /developer -- the developer workspace (spec §16): submission totals,
 * aggregate downloads and quick actions.
 */
export default function DeveloperDashboard() {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .get('/api/templates/mine')
      .then((res) => alive && setTemplates(res.data.templates))
      .catch((err) => alive && setError(getErrorMessage(err, 'Could not load your templates')))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, []);

  const list = templates || [];
  const totalDownloads = list.reduce((sum, t) => sum + (t.downloadCount || 0), 0);
  const approved = list.filter((t) => t.status === 'approved').length;
  const totalFiles = list.reduce((sum, t) => sum + (t.screenshots?.length || 0) + 1, 0);

  const recent = [...list]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  const top = [...list]
    .sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0))
    .slice(0, 5);

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

        <section className="stagger mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Totals">
          {loading ? (
            Array.from({ length: 4 }, (_, i) => <StatSkeleton key={i} />)
          ) : (
            <>
              <Stat label="Templates" value={list.length} icon="🧩" hint="in total" />
              <Stat label="Published" value={approved} icon="✅" hint="approved and listed" />
              <Stat label="Downloads" value={formatCount(totalDownloads)} icon="⬇️" hint="across your work" />
              <Stat label="Files" value={totalFiles} icon="🗂" hint="archives and screenshots" />
            </>
          )}
        </section>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {/* ------------------------------------------------ recent */}
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
                    <li key={t._id}>
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

          {/* ---------------------------------------------- top performing */}
          <section aria-labelledby="top-heading">
            <h2 id="top-heading" className="ui-title text-xl">
              Most downloaded
            </h2>
            <div className="mt-4">
              {loading ? (
                <RowSkeleton rows={4} />
              ) : top.length === 0 || totalDownloads === 0 ? (
                <EmptyRow
                  title="No downloads yet"
                  body="Once people start downloading your templates the ranking appears here."
                  to="/templates"
                  cta="Browse the library"
                />
              ) : (
                <ol className="ui-card divide-y divide-ink-100 !p-0">
                  {top.map((t, i) => (
                    <li key={t._id} className="flex items-center gap-4 p-4">
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
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink-900">{value}</p>
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
  return (
    <span className={`ui-badge shrink-0 ${map[status] || map.pending}`}>{status}</span>
  );
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
