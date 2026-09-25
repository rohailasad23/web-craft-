import React, { useEffect, useRef, useState } from 'react';
import { useCatalog } from '../../lib/catalog';

const SORT_LABELS = {
  newest: 'Latest',
  popular: 'Most popular',
  downloads: 'Most downloaded',
  updated: 'Recently updated',
  az: 'A–Z',
};

/**
 * Search box + the flat chip list from GET /api/meta + sort (spec §8).
 *
 * Every value comes from the server, so a new category appears here without a
 * frontend change. Chips are URLs, so a filtered view is shareable.
 *
 * Tags get a dropdown rather than a third row of chips: spec §2 wants them
 * database-driven, and §28 warns against piling on more small buttons once the
 * chip list is already this long.
 */
export default function SearchFilters({
  q = '',
  filter = 'All',
  sort = 'newest',
  total,
  onChange,
  inputRef,
}) {
  const { filters, sorts, tags } = useCatalog();
  const [term, setTerm] = useState(q);
  const first = useRef(true);

  // Keep the box in step when the URL changes (back button, chip click).
  useEffect(() => {
    setTerm(q);
  }, [q]);

  // Debounce typing into the parent's URL update; skip the very first render
  // so a deep link does not immediately overwrite itself.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const id = setTimeout(() => {
      if (term !== q) onChange({ q: term, page: 1 });
    }, 350);
    return () => clearTimeout(id);
  }, [term, q, onChange]);

  const patch = (next) => onChange({ ...next, page: 1 });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-500"
          >
            🔍
          </span>
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search templates, technologies or developers…"
            aria-label="Search templates"
            className="ui-input !pl-11"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="whitespace-nowrap font-semibold text-ink-500">Sort</span>
          <select
            value={sort}
            onChange={(e) => patch({ sort: e.target.value })}
            className="ui-select !w-auto"
            aria-label="Sort templates"
          >
            {(sorts?.length ? sorts : ['newest']).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s] || s}
              </option>
            ))}
          </select>
        </label>

        {tags?.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="whitespace-nowrap font-semibold text-ink-500">Tag</span>
            <select
              value={tags.includes(filter) ? filter : ''}
              onChange={(e) => patch({ filter: e.target.value || 'All' })}
              className="ui-select !w-auto"
              aria-label="Filter by tag"
            >
              <option value="">Any tag</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="stagger -mx-1 flex flex-wrap gap-2 px-1">
        {(filters?.length ? filters : ['All']).map((entry) => {
          const active = entry === filter;
          return (
            <button
              key={entry}
              type="button"
              onClick={() => patch({ filter: entry })}
              aria-pressed={active}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all duration-300 ${
                active
                  ? 'border-brand-600 bg-brand-600 text-white shadow-soft'
                  : 'border-ink-200 bg-white text-ink-700 hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700'
              }`}
            >
              {entry}
            </button>
          );
        })}
      </div>

      {typeof total === 'number' && (
        <p className="text-sm text-ink-500" role="status">
          {total === 0
            ? 'No templates match these filters.'
            : `${total} template${total === 1 ? '' : 's'} found`}
        </p>
      )}
    </div>
  );
}
