import { useEffect } from 'react';
import { mediaUrl } from './format';

/**
 * Per-page document metadata (spec §15).
 *
 * This is a single-page app, so <title>, the description and the Open Graph
 * tags cannot be declared per route in markup -- the static index.html can
 * only carry site defaults. `useSeo` writes a page's metadata while it is
 * mounted and puts the defaults back on the way out.
 *
 * The reset lives in the cleanup rather than in a route watcher on purpose:
 * React runs a leaving page's cleanup before an entering page's effect, so
 * the defaults always land in between. That is what stops a page which sets
 * nothing (login, profile, admin) from inheriting the title and canonical of
 * whichever page the visitor came from.
 */

const SITE = 'web craft';
const DEFAULT_TITLE = 'web craft — free website template marketplace';
const DEFAULT_DESCRIPTION =
  'web craft — a free marketplace for ready-made website templates. Browse by category or technology, preview, and download the source.';

/** The branded card in public/og.png -- 1200x630, the size every network wants. */
const DEFAULT_IMAGE = '/og.png';

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

function setMeta(attr, key, value) {
  const selector = `meta[${attr}="${key}"]`;
  const existing = document.head.querySelector(selector);
  if (!value) {
    if (existing) existing.remove();
    return;
  }
  const el = existing || document.createElement('meta');
  if (!existing) {
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setCanonical(href) {
  const existing = document.head.querySelector('link[rel="canonical"]');
  if (!href) {
    // An explicit canonical is a claim -- "/profile is a copy of /" is a
    // false one. A page that never asked for a canonical gets none back.
    if (existing) existing.remove();
    return;
  }
  let el = existing;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Write every tag for one page.
 *
 * `noindex` only ever removes tags: it is set on sign-in, registration and
 * anything behind a login, so a crawler that does execute JavaScript still
 * has no reason to index a page the public cannot reach.
 */
export function applySeo({
  title,
  description,
  image,
  path,
  type = 'website',
  noindex = false,
  canonical,
}) {
  const safeTitle = title || DEFAULT_TITLE;
  const safeDescription = description || DEFAULT_DESCRIPTION;
  const imagePath = image || DEFAULT_IMAGE;
  const isDefaultImage = imagePath === DEFAULT_IMAGE;
  const url = `${ORIGIN}${path || window.location.pathname}`;

  document.title = safeTitle;

  setMeta('name', 'description', safeDescription);
  setMeta('name', 'robots', noindex ? 'noindex, nofollow' : null);
  setMeta('name', 'theme-color', '#4f46e5');

  setMeta('property', 'og:site_name', SITE);
  setMeta('property', 'og:title', safeTitle);
  setMeta('property', 'og:description', safeDescription);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:type', type);
  setMeta('property', 'og:image', imagePath);
  setMeta('property', 'og:image:alt', safeTitle);
  // Only the bundled card has known dimensions; a template thumbnail is whatever
  // the developer uploaded, and claiming a size that is wrong is worse than
  // leaving it out.
  setMeta('property', 'og:image:width', isDefaultImage ? '1200' : null);
  setMeta('property', 'og:image:height', isDefaultImage ? '630' : null);

  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', safeTitle);
  setMeta('name', 'twitter:description', safeDescription);
  setMeta('name', 'twitter:image', imagePath);
  setMeta('name', 'twitter:image:alt', safeTitle);

  setCanonical(canonical === false ? null : url);
}

/**
 * Put the site defaults back.
 *
 * The URL is the path we are heading *to*, not the one we are leaving: React
 * runs this cleanup after the router has already rewritten the address bar.
 * Canonical is dropped rather than pointed at the homepage -- see setCanonical.
 */
export function resetSeo() {
  applySeo({ path: window.location.pathname, canonical: false });
}

/**
 * Absolute, crawler-safe preview image for a piece of media.
 *
 * Social scrapers (Facebook, Twitter, LinkedIn, Slack) do not render SVG, so
 * an SVG thumbnail silently becomes "no preview image at all". Falling back
 * to the branded card is better than publishing an image nothing displays.
 */
export function ogImage(path) {
  if (!path) return undefined;
  const url = mediaUrl(path);
  if (!/\.(png|jpe?g|gif|webp)([?#]|$)/i.test(url)) return undefined;
  return url;
}

/**
 * Collapse whitespace and cut at a word boundary.
 *
 * A description cut mid-word reads as a bug in every preview that shows one,
 * and 155 is where the major cards stop anyway. Left alone if it already fits.
 */
export function metaDescription(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= 155) return s;
  return `${s.slice(0, 155).replace(/\s+\S*$/, '')}…`;
}

/**
 * Set the metadata for the page that is currently mounted.
 *
 * Does nothing until a title arrives, so a page waiting on its first fetch
 * does not publish a half-finished description to every scraper.
 */
export function useSeo({ title, description, image, path, type, noindex } = {}) {
  useEffect(() => {
    if (!title) return undefined;
    applySeo({ title, description, image, path, type, noindex });
    return () => resetSeo();
  }, [title, description, image, path, type, noindex]);
}
