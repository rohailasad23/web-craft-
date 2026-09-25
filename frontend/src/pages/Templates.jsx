import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import SearchFilters from '../components/Templates/SearchFilters';
import TemplateCard from '../components/Templates/TemplateCard';
import { TemplateGridSkeleton } from '../components/Common/Skeletons';
import Breadcrumbs from '../components/Common/Breadcrumbs';
import Footer from '../components/Common/Footer';

const PAGE_SIZE = 12;

/**
 * Browse/search page (spec §7, §8).
 *
 * The whole query lives in the URL (`?q=&filter=&sort=&page=`), so a filtered
 * view can be shared or bookmarked and Back behaves as people expect.
 */
export default function Templates() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const topRef = useRef(null);

  const q = params.get('q') || '';
  const filter = params.get('filter') || 'All';
  const sort = params.get('sort') || 'newest';
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);

  const patch = useCallback(
    (next, replace = false) => {
      const merged = { q, filter, sort, page: String(page), ...next };
      const out = {};
      for (const [k, v] of Object.entries(merged)) {
        const value = String(v ?? '');
        const isDefault =
          (k === 'filter' && value === 'All') ||
          (k === 'sort' && value === 'newest') ||
          (k === 'page' && value === '1') ||
          (k === 'q' && !value);
        if (value && !isDefault) out[k] = value;
      }
      setParams(out, { replace });
    },
    [q, filter, sort, page, setParams]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');

    const query = new URLSearchParams({
      q,
      filter,
      sort,
      page: String(page),
      limit: String(PAGE_SIZE),
    });

    api
      .get(`/api/templates?${query.toString()}`)
      .then((res) => alive && setData(res.data))
      .catch((err) => alive && setError(getErrorMessage(err, 'Could not load templates')))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [q, filter, sort, page]);

  // A stale bookmark (?page=9) or a filter that narrows the result set can
  // land past the last page. Correct the URL instead of claiming there is
  // nothing to show -- the answer is "page 4 of 3", not "no results".
  useEffect(() => {
    const last = data?.totalPages || 1;
    if (data && page > last) patch({ page: String(last) }, true);
  }, [data, page, patch]);

  const changePage = (next) => {
    patch({ page: String(next) });
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const templates = data?.templates || [];
  const totalPages = data?.totalPages || 1;
  // The URL points past the last page; the effect above is already correcting
  // it, so keep the skeleton up rather than inventing an empty result set.
  const outOfRange = Boolean(data) && page > totalPages;

  return (
    <div className="flex min-h-[70vh] flex-col">
      <main
        ref={topRef}
        className="mx-auto w-full max-w-7xl flex-1 scroll-mt-24 px-5 pb-16 pt-10 sm:px-6"
      >
        {/* Spec §29: only when there is a level below Home/Templates -- a
            two-stop breadcrumb on a top-level page is noise, not orientation. */}
        {(q || filter !== 'All') && (
          <Breadcrumbs
            className="mb-4"
            items={[
              { label: 'Templates', to: '/templates' },
              ...(q
                ? [{ label: `Results for “${q}”` }]
                : filter !== 'All'
                  ? [{ label: filter }]
                  : []),
            ]}
          />
        )}

        <header className="animate-fade-up">
          <span className="ui-eyebrow">Library</span>
          <h1 className="ui-title mt-2 text-3xl sm:text-4xl">
            {q ? `Results for “${q}”` : filter !== 'All' ? filter : 'All templates'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
            Filter by category, technology or tag, then download the source archive. Every template
            shows its technologies, tags, developer and download count before you commit.
          </p>
        </header>

        <div className="mt-7">
          <SearchFilters
            q={q}
            filter={filter}
            sort={sort}
            total={data?.totalTemplates}
            onChange={patch}
          />
        </div>

        <section className="mt-8" aria-label="Templates">
          {loading && !data ? (
            <TemplateGridSkeleton count={PAGE_SIZE} />
          ) : error ? (
            <div className="ui-alert ui-alert--error" role="alert">
              {error}
            </div>
          ) : outOfRange ? (
            <TemplateGridSkeleton count={PAGE_SIZE} />
          ) : templates.length === 0 ? (
            <div className="ui-card p-10 text-center">
              <span className="text-4xl" aria-hidden>
                🔎
              </span>
              <h2 className="ui-title mt-4 text-xl">No templates found</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">
                Nothing matches these filters yet. Try a broader search, or clear the filters and
                start again.
              </p>
              <button
                type="button"
                onClick={() => setParams({})}
                className="ui-btn ui-btn--soft mt-5 !px-5 !py-2.5"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div
                aria-busy={loading}
                className={`stagger grid gap-5 transition-opacity duration-300 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
                  loading && data ? 'opacity-60' : 'opacity-100'
                }`}
              >
                {templates.map((t) => (
                  <TemplateCard key={t._id || t.slug} template={t} />
                ))}
              </div>

              {totalPages > 1 && (
                <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Pagination">
                  <button
                    type="button"
                    onClick={() => changePage(page - 1)}
                    disabled={page <= 1 || loading}
                    className="ui-btn ui-btn--soft !px-4 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <span className="text-sm font-semibold text-ink-700" aria-current="page">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => changePage(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="ui-btn ui-btn--soft !px-4 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next →
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
