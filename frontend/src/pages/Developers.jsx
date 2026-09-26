import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import { formatCount, initials } from '../lib/format';
import { useSeo } from '../lib/seo';
import Footer from '../components/Common/Footer';

const PAGE_SIZE = 12;

/**
 * The directory search box, debounced into the URL from inside.
 *
 * It owns the keystroke state so that typing re-renders this one input instead
 * of the whole page: held in Developers, every character re-ran the directory
 * render above -- header, grid, pagination -- for an input that only commits
 * 350ms after the last keystroke.
 */
function DeveloperSearch({ initial, onCommit }) {
  const [term, setTerm] = useState(initial);
  const [committed, setCommitted] = useState(initial);

  // Browser back/forward, or a link into the page with ?q= already on it.
  useEffect(() => {
    setTerm(initial);
    setCommitted(initial);
  }, [initial]);

  // Debounce the box into the URL, same as the template search.
  useEffect(() => {
    const id = setTimeout(() => {
      if (term !== committed) {
        setCommitted(term);
        onCommit(term.trim());
      }
    }, 350);
    return () => clearTimeout(id);
  }, [term, committed, onCommit]);

  return (
    <div className="mt-7 max-w-md">
      <input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search developers…"
        aria-label="Search developers"
        className="ui-input"
      />
    </div>
  );
}

/** Directory of contributors (spec §10) -- makes the site feel like a community. */
export default function Developers() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);

  // Spec §15. A search over the directory is a destination of its own.
  useSeo({
    title: q ? `Developers matching “${q}” — web craft` : 'Developers — web craft',
    description:
      'The developers publishing free website templates on web craft. See what each one has released and how often it has been downloaded.',
    path: `/developers${params.toString() ? `?${params.toString()}` : ''}`,
  });

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');

    api
      .get(`/api/developers?q=${encodeURIComponent(q)}&page=${page}&limit=${PAGE_SIZE}`)
      .then((res) => alive && setData(res.data))
      .catch((err) => alive && setError(getErrorMessage(err, 'Could not load developers')))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [q, page]);

  // Called by the search box once it settles (its own debounce, so typing does
  // not re-render this component). A new query always restarts at page 1.
  const commit = useCallback(
    (value) => {
      const next = { page: '1' };
      if (value) next.q = value;
      setParams(next);
    },
    [setParams]
  );

  const developers = data?.developers || [];
  const totalPages = data?.pages || 1;

  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-16 pt-10 sm:px-6">
        <header className="animate-fade-up">
          <span className="ui-eyebrow">Community</span>
          <h1 className="ui-title mt-2 text-3xl sm:text-4xl">Developers</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
            The people behind the templates. Every profile shows how much they have shared and how
            often the community has downloaded it.
          </p>
        </header>

        <DeveloperSearch initial={q} onCommit={commit} />

        <section className="mt-8" aria-label="Developers">
          {loading && !data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="ui-card p-5">
                  <div className="flex items-center gap-4">
                    <div className="ui-skeleton h-12 w-12 !rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="ui-skeleton h-4 w-1/2" />
                      <div className="ui-skeleton h-3 w-3/4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="ui-alert ui-alert--error" role="alert">
              {error}
            </div>
          ) : developers.length === 0 ? (
            <div className="ui-card p-10 text-center">
              <span className="text-4xl" aria-hidden>
                👥
              </span>
              <h2 className="ui-title mt-4 text-xl">No developers found</h2>
              <p className="mt-2 text-sm text-ink-500">
                {q ? `Nothing matches “${q}”.` : 'Be the first to publish a template.'}
              </p>
              <Link to="/register" className="ui-btn ui-btn--soft mt-5 !px-5 !py-2.5">
                Become a developer
              </Link>
            </div>
          ) : (
            <>
              <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {developers.map((d) => (
                  <Link
                    key={d.id}
                    to={`/developers/${d.id}`}
                    className="ui-card ui-card--hover group flex items-center gap-4 p-5"
                  >
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white shadow-soft transition-transform duration-300 group-hover:scale-105">
                      {initials(d.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink-900 group-hover:text-brand-700">
                        {d.name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-ink-500">
                        {d.bio || 'No bio yet.'}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-ink-700">
                        <span>
                          {d.templateCount} template{d.templateCount === 1 ? '' : 's'}
                        </span>
                        <span className="text-brand-700">
                          ↓ {formatCount(d.totalDownloads)} downloads
                        </span>
                      </span>
                    </span>
                  </Link>
                ))}
              </div>

              {totalPages > 1 && (
                <nav
                  className="mt-10 flex items-center justify-center gap-3"
                  aria-label="Pagination"
                >
                  <button
                    type="button"
                    onClick={() => setParams({ ...(q ? { q } : {}), page: String(page - 1) })}
                    disabled={page <= 1}
                    className="ui-btn ui-btn--soft !px-4 !py-2 text-sm disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <span className="text-sm font-semibold text-ink-700">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setParams({ ...(q ? { q } : {}), page: String(page + 1) })}
                    disabled={page >= totalPages}
                    className="ui-btn ui-btn--soft !px-4 !py-2 text-sm disabled:opacity-40"
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
