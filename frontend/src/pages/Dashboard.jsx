import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';

const STATUS_STYLES = {
  published: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  draft: 'bg-amber-100 text-amber-700 ring-amber-200',
  ready: 'bg-brand-100 text-brand-700 ring-brand-200',
  archived: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const formatDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function Dashboard() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const fetchPages = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true);
    try {
      // 401s are handled globally by the shared client.
      const res = await api.get('/api/pages');
      setPages(res.data.pages || []);
      setError('');
      setLoading(false);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load your landing pages'));
      setLoading(false);
    }
  }, []);

  // Initial load only.
  useEffect(() => {
    // Data fetch on mount: every setState runs after `await`, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    fetchPages();
  }, [fetchPages]);

  const handleDelete = async (page) => {
    const confirmed = window.confirm(`Delete "${page.businessName}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(page._id);
    try {
      await api.delete(`/api/pages/${page._id}`);
      setPages((prev) => prev.filter((p) => p._id !== page._id));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete page'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
      {/* ---------- Header ---------- */}
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="ui-eyebrow">Workspace</span>
          <h1 className="ui-title mt-2 text-3xl sm:text-4xl">Your landing pages</h1>
          {!loading && !error && (
            <p className="mt-2 text-sm text-ink-500">
              {pages.length === 0
                ? 'Nothing here yet — create your first page below.'
                : `${pages.length} page${pages.length === 1 ? '' : 's'} in your workspace.`}
            </p>
          )}
        </div>

        <Link to="/generate" className="ui-btn ui-btn--primary group">
          <span aria-hidden className="transition-transform duration-300 group-hover:rotate-90">
            ＋
          </span>
          New Page
        </Link>
      </div>

      {/* ---------- Loading skeleton ---------- */}
      {loading && (
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="ui-card animate-fade-in p-5" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="ui-skeleton h-5 w-2/3" />
              <div className="ui-skeleton mt-3 h-3 w-1/3" />
              <div className="mt-5 flex gap-2">
                <div className="ui-skeleton h-6 w-20 rounded-full" />
                <div className="ui-skeleton h-6 w-16 rounded-full" />
              </div>
              <div className="ui-skeleton mt-5 h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* ---------- Error ---------- */}
      {!loading && error && (
        <div role="alert" className="ui-alert ui-alert--error mt-8 justify-between">
          <span className="flex items-start gap-2">
            <span aria-hidden>⚠️</span>
            <span>{error}</span>
          </span>
          <button
            onClick={() => fetchPages({ showLoading: true })}
            className="ui-btn ui-btn--ghost shrink-0 !border-red-200 !bg-white !text-red-600 !py-1.5 !px-3 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {/* ---------- Empty state ---------- */}
      {!loading && !error && pages.length === 0 && (
        <div className="animate-pop-in mt-10 overflow-hidden rounded-3xl border border-dashed border-brand-200 bg-white px-6 py-16 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-brand-50 to-purple-100 text-4xl shadow-soft animate-float">
            🚀
          </div>
          <h2 className="ui-title mt-6 text-2xl">No landing pages yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
            Describe your business and AI will draft a complete page you can edit and publish in
            under a minute.
          </p>
          <Link to="/generate" className="ui-btn ui-btn--primary ui-btn--lg mt-7 group">
            Generate your first page
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>
        </div>
      )}

      {/* ---------- Cards ---------- */}
      {!loading && !error && pages.length > 0 && (
        <div className="stagger mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => {
            const created = formatDate(page.createdAt);
            return (
              <article key={page._id} className="ui-card ui-card--hover group flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-base font-extrabold text-white shadow-soft transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
                      {(page.businessName || '?').trim().charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <span
                    className={`ui-badge ring-1 capitalize ${
                      STATUS_STYLES[page.status] || STATUS_STYLES.draft
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {page.status}
                  </span>
                </div>

                <h3 className="mt-4 truncate text-lg font-bold tracking-tight" title={page.businessName}>
                  {page.businessName}
                </h3>
                <p className="mt-0.5 truncate text-sm capitalize text-ink-500" title={page.businessType}>
                  {page.businessType}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`ui-badge ring-1 capitalize ${
                      page.paymentStatus === 'paid'
                        ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                        : 'bg-slate-100 text-slate-600 ring-slate-200'
                    }`}
                  >
                    💳 {page.paymentStatus}
                  </span>
                  {created && <span className="text-ink-500">· {created}</span>}
                </div>

                {page.publicUrl && (
                  <a
                    href={page.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 transition-colors hover:text-emerald-700"
                  >
                    View live page
                    <span className="transition-transform duration-300 group-hover:translate-x-1">↗</span>
                  </a>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-ink-100 pt-4">
                  <Link
                    to={`/editor/${page._id}`}
                    className="ui-btn ui-btn--soft !px-3 !py-1.5 text-sm"
                  >
                    Open Editor →
                  </Link>
                  <button
                    onClick={() => handleDelete(page)}
                    disabled={deletingId === page._id}
                    className="ui-btn !px-3 !py-1.5 text-sm !text-slate-400 transition-all hover:!bg-red-50 hover:!text-red-600 disabled:opacity-50"
                    type="button"
                  >
                    {deletingId === page._id ? (
                      <span className="ui-spinner" aria-hidden />
                    ) : (
                      <span aria-hidden>🗑</span>
                    )}
                    {deletingId === page._id ? 'Deleting…' : ''}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
