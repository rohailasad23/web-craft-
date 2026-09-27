import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { RowSkeleton } from '../../components/Common/Skeletons';

/**
 * Where each group's "everything" link goes. These pages read `status` (and
 * `action` on audit) only -- none of them accept `q` -- so the links stay
 * plain paths instead of carrying a parameter nobody would act on.
 */
const GROUP_LINK = {
  templates: { to: '/admin/templates', label: 'Open the moderation queue' },
  developers: { to: '/admin/users', label: 'Open the account list' },
  users: { to: '/admin/users', label: 'Open the account list' },
  reports: { to: '/admin/reports', label: 'Open the report queue' },
  audit: { to: '/admin/audit', label: 'Open the audit log' },
};

/** `template.approved` -> "Template approved". */
function humanise(action) {
  return String(action || '')
    .split('.')
    .map((part) => part.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()))
    .join(' ');
}

/** One result row, shaped by which group it came from. */
function ResultRow({ groupKey, item }) {
  if (groupKey === 'templates') {
    return (
      <>
        <Link
          to={`/templates/${item.slug}`}
          className="block truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
        >
          {item.title}
        </Link>
        <p className="mt-0.5 truncate text-xs text-ink-500">
          {item.status} · {item.authorName || 'Unknown'}
        </p>
      </>
    );
  }

  if (groupKey === 'developers' || groupKey === 'users') {
    const to = groupKey === 'developers' ? `/developers/${item._id}` : '/admin/users';
    return (
      <>
        <Link
          to={to}
          className="block truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
        >
          {item.name}
        </Link>
        <p className="mt-0.5 truncate text-xs text-ink-500">
          {item.email}
          {item.trustLevel ? ` · ${item.trustLevel}` : ''}
          {item.role ? ` · ${item.role}` : ''}
        </p>
      </>
    );
  }

  if (groupKey === 'reports') {
    const template = item.templateId;
    const inner = (
      <>
        <span className="block truncate text-sm font-bold text-ink-900">{item.reason}</span>
        <p className="mt-0.5 truncate text-xs text-ink-500">
          {template ? template.title : 'The reported template has since been deleted'}
        </p>
      </>
    );
    // The report itself has no detail page, so the subject is the useful
    // destination -- but this endpoint populates the subject with its title
    // only, so a slug may not be there. Anything without one falls back to
    // the queue it lives in rather than a dead /templates/undefined link.
    const to = template?.slug ? `/templates/${template.slug}` : '/admin/reports';
    return (
      <Link to={to} className="block transition-colors hover:text-brand-700">
        {inner}
      </Link>
    );
  }

  // audit
  return (
    <>
      <Link
        to="/admin/audit"
        className="block truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
      >
        {humanise(item.action)}
      </Link>
      <p className="mt-0.5 truncate text-xs text-ink-500">
        by {item.adminId?.name || 'a removed account'} · {formatDate(item.createdAt)}
      </p>
    </>
  );
}

const fetchResults = (term) => api.get('/api/admin/search', { params: { q: term } });

/**
 * /admin/search?q= -- §25's one field across templates, users, developers,
 * reports and the audit log.
 *
 * The term lives in the URL, so a search is a link an admin can paste to a
 * colleague and Back works after opening a result. The API rejects anything
 * under two characters, and this page mirrors that rule before spending a
 * request on it.
 */
export default function AdminSearch() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const [term, setTerm] = useState(q);
  const [hint, setHint] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(() => q.length >= 2);

  useEffect(() => {
    if (q.length < 2) return undefined;
    let alive = true;
    // Only the callbacks touch state: the effect itself just kicks off the
    // request, which is the pattern every other fetch in this panel follows.
    fetchResults(q)
      .then((res) => {
        if (alive) {
          setError('');
          setResults(res.data);
        }
      })
      .catch((err) => {
        if (alive) setError(getErrorMessage(err, 'Search failed'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [q]);

  const run = (value) => {
    setLoading(true);
    setError('');
    fetchResults(value)
      .then((res) => {
        setError('');
        setResults(res.data);
      })
      .catch((err) => setError(getErrorMessage(err, 'Search failed')))
      .finally(() => setLoading(false));
  };

  const submit = (event) => {
    event.preventDefault();
    const value = term.trim();
    if (value.length < 2) {
      setHint('Type at least 2 characters.');
      return;
    }
    setHint('');
    if (value === q) {
      // The URL would not change, so the effect above would not re-run and
      // the spinner would hang -- search straight from here instead.
      run(value);
      return;
    }
    setLoading(true);
    setError('');
    const merged = new URLSearchParams(params);
    merged.set('q', value);
    setParams(merged);
  };

  const groups = results?.groups || [];
  const searching = q.length >= 2;
  const totalCount = groups.reduce((n, g) => n + (g.count || 0), 0);

  return (
    <div>
      <form onSubmit={submit} role="search" className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="admin-search-page">
          Search templates, users, developers, reports and the audit log
        </label>
        <input
          id="admin-search-page"
          type="search"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            if (hint) setHint('');
          }}
          placeholder="Search templates, users, developers, reports and the audit log…"
          className="ui-input !w-auto min-w-[16rem] flex-1 !py-2 text-sm"
        />
        <button type="submit" className="ui-btn ui-btn--primary !px-4 !py-2 !text-sm">
          Search
        </button>
      </form>

      {hint && (
        <p className="mt-2 text-xs font-semibold text-amber-700" role="alert">
          {hint}
        </p>
      )}

      {error && (
        <div className="ui-alert ui-alert--error mt-5" role="alert">
          {error}
        </div>
      )}

      <div className="mt-5">
        {error ? null : loading ? (
          <RowSkeleton rows={5} />
        ) : !searching || !results ? (
          <div className="ui-card p-10 text-center">
            <span aria-hidden className="text-3xl">
              🔍
            </span>
            <h2 className="ui-title mt-3 text-lg">Search the panel</h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-500">
              Search across templates, users, developers, reports and the audit log.
            </p>
          </div>
        ) : totalCount === 0 ? (
          <div className="ui-card p-10 text-center">
            <h2 className="ui-title text-lg">
              No matches for “{results.query || q}”.
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
              Check the spelling, or search for part of a name, title, email address or action.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {groups.map((g) => {
              const link = GROUP_LINK[g.key];
              const items = g.items || [];
              return (
                <section key={g.key} aria-label={g.label} className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="ui-title text-lg">{g.label}</h2>
                    <span className="text-xs font-bold text-ink-500">
                      {g.count} {g.count === 1 ? 'match' : 'matches'}
                    </span>
                  </div>

                  <ul className="ui-card mt-3 divide-y divide-ink-100 !p-0">
                    {items.length === 0 ? (
                      <li className="p-4 text-sm text-ink-500">
                        Nothing in this group matches “{results.query || q}”.
                      </li>
                    ) : (
                      items.map((item) => (
                        <li key={item._id} className="min-w-0 p-4">
                          <ResultRow groupKey={g.key} item={item} />
                        </li>
                      ))
                    )}
                  </ul>

                  {link && (g.count || 0) > 0 && (
                    <Link
                      to={link.to}
                      className="mt-2 inline-block text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
                    >
                      {link.label} →
                    </Link>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {!loading && searching && results && (
        <p className="mt-4 text-xs text-ink-500">
          Each group shows its top matches; counts are exact, not estimates.
        </p>
      )}
    </div>
  );
}
