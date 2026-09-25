import { Link } from 'react-router-dom';

/**
 * Breadcrumbs (spec §29).
 *
 *   Home → Templates → React → Modern Dashboard
 *
 * A plain `<ol>` rather than a `<div>`: the list semantics are what screen
 * readers turn into "list, 4 items" navigation, and the separator is
 * `aria-hidden` so it is never read out as punctuation between every stop.
 *
 * The last crumb is plain text with `aria-current="page"` -- it is where you
 * already are, so it must not be a link to yourself.
 *
 *   <Breadcrumbs items={[{ label: 'Templates', to: '/templates' }, { label: t.title }]} />
 *
 * `Home` is always prepended unless `home={false}`.
 */
export default function Breadcrumbs({ items = [], home = true, className = '' }) {
  const crumbs = [...(home ? [{ label: 'Home', to: '/' }] : []), ...items];
  if (crumbs.length < 2) return null;

  return (
    <nav aria-label="Breadcrumb" className={`min-w-0 ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-500">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden className="shrink-0 text-ink-300">
                  /
                </span>
              )}
              {last || !crumb.to ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={
                    last
                      ? 'max-w-[16ch] truncate font-semibold text-ink-700 sm:max-w-[28ch]'
                      : 'max-w-[16ch] truncate sm:max-w-[24ch]'
                  }
                  title={crumb.label}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.to}
                  className="max-w-[16ch] truncate rounded transition-colors hover:text-brand-600 sm:max-w-[24ch]"
                  title={crumb.label}
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
