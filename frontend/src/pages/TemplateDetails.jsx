import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { useFavorite } from '../lib/favorites';
import { downloadTemplate } from '../lib/download';
import { useToast } from '../components/Common/Toast';
import ShareButton from '../components/Common/ShareButton';
import Breadcrumbs from '../components/Common/Breadcrumbs';
import ReportDialog from '../components/Common/ReportDialog';
import { formatBytes, formatDate, formatCount, initials, mediaUrl } from '../lib/format';
import Footer from '../components/Common/Footer';

/**
 * /templates/:slug -- the full detail page (spec §9): gallery, description,
 * technologies, category, developer, download count, preview, GitHub and the
 * download button that records the download on the server.
 */
export default function TemplateDetails() {
  const { slug } = useParams();
  const { isAuthenticated, user } = useSession();
  const toast = useToast();

  const [template, setTemplate] = useState(null);
  // Spec §1: save control + spec §16/§30 share sit on this page too.
  const { saved: favorited, toggle: toggleFavorite } = useFavorite(template);
  const [author, setAuthor] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [activeShot, setActiveShot] = useState(0);
  // Download follows Download -> Downloading... -> Downloaded (§16).
  const [phase, setPhase] = useState('idle');
  // Index of the screenshot shown in the lightbox, or null when closed (§23).
  const [lightbox, setLightbox] = useState(null);
  // Spec §7: reporting is a dialog, not a `mailto:` buried in the footer.
  const [reporting, setReporting] = useState(false);
  const resetTimer = useRef(null);
  const closeRef = useRef(null);

  // Gallery list. Screenshots are optional, so fall back to the thumbnail.
  const shots = template
    ? template.screenshots?.length
      ? template.screenshots
      : template.thumbnail
        ? [template.thumbnail]
        : []
    : [];

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setError('');
    setActiveShot(0);

    api
      .get(`/api/templates/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!alive) return;
        setTemplate(res.data.template);
        setAuthor(res.data.template.author || null);
        setCanEdit(Boolean(res.data.canEdit));
        setStatus('ready');
      })
      .catch((err) => {
        if (!alive) return;
        setError(getErrorMessage(err, 'This template could not be loaded'));
        setStatus('error');
      });

    return () => {
      alive = false;
    };
  }, [slug]);

  // Cancel a pending "Downloaded -> Download" reset on unmount.
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  // Lightbox keyboard support (anim guide §23/§25): Escape closes, the
  // arrow keys step through the gallery, and the page behind is locked so
  // it cannot scroll away under the overlay.
  useEffect(() => {
    if (lightbox === null || shots.length === 0) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowRight') setLightbox((i) => (i + 1) % shots.length);
      else if (e.key === 'ArrowLeft') setLightbox((i) => (i - 1 + shots.length) % shots.length);
    };

    window.addEventListener('keydown', onKey);
    // Keyboard-first: focus lands on Close so Tab/Escape work immediately.
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightbox, shots.length]);

  const handleDownload = async () => {
    if (phase === 'busy') return;
    if (!isAuthenticated) {
      toast.info('Please log in to download this template.');
      return;
    }

    setPhase('busy');
    try {
      await downloadTemplate(template);
      toast.success(`Downloading “${template.title}”`);
      // Reflect the increment without refetching the whole page.
      setTemplate((t) => ({ ...t, downloadCount: (t.downloadCount || 0) + 1 }));
      setPhase('done');
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setPhase('idle'), 2400);
    } catch (err) {
      toast.error(err.message);
      setPhase('idle');
    }
  };

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <div className="ui-skeleton aspect-[16/10] !rounded-2xl" />
            <div className="ui-skeleton h-4 w-2/3" />
            <div className="ui-skeleton h-3 w-full" />
            <div className="ui-skeleton h-3 w-4/5" />
          </div>
          <div className="ui-skeleton h-72 !rounded-2xl" />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center sm:px-6">
        <span className="text-5xl" aria-hidden>
          🧩
        </span>
        <h1 className="ui-title mt-4 text-2xl">Template not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">{error}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/templates" className="ui-btn ui-btn--primary">
            Browse templates
          </Link>
          <Link to="/" className="ui-btn ui-btn--soft">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  const activeImage = shots[activeShot] || template.thumbnail;
  const authorId = author?._id ?? author;

  // Spec §31: file type and size, derived from what the developer actually
  // uploaded -- nothing here is guessed, so a template with no recorded file
  // simply shows a dash.
  const fileExt = (template.file?.filename || '').includes('.')
    ? template.file.filename.split('.').pop().toUpperCase()
    : /zip/i.test(template.file?.contentType || '')
      ? 'ZIP'
      : '';

  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-16 pt-8 sm:px-6">
        <Breadcrumbs
          className="mb-6 text-sm"
          items={[
            { label: 'Templates', to: '/templates' },
            {
              label: template.category,
              to: `/templates?filter=${encodeURIComponent(template.category)}`,
            },
            { label: template.title },
          ]}
        />

        <div className="grid gap-8 lg:grid-cols-[1.65fr_1fr]">
          {/* ------------------------------------------------ media */}
          <section aria-label="Screenshots">
            <div className="ui-card overflow-hidden !p-0">
              <div className="relative aspect-[16/10] bg-ink-100">
                {/* The screenshot itself opens the lightbox (anim guide §23). */}
                {activeImage ? (
                  <button
                    type="button"
                    onClick={() => setLightbox(activeShot)}
                    aria-label={`View ${template.title} screenshot ${activeShot + 1} fullscreen`}
                    className="absolute inset-0 block h-full w-full cursor-zoom-in overflow-hidden"
                  >
                    <img
                      key={activeImage}
                      src={mediaUrl(activeImage)}
                      alt={`${template.title} screenshot ${activeShot + 1}`}
                      className="h-full w-full object-cover animate-fade-in"
                    />
                  </button>
                ) : (
                  <div className="grid h-full w-full place-items-center text-5xl" aria-hidden>
                    🧩
                  </div>
                )}
                <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-700 shadow-soft backdrop-blur">
                  {template.category}
                </span>
                {/* Hover-only hint: decorative, never the only way in. */}
                <span className="reveal-hover pointer-events-none absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-soft backdrop-blur">
                  <span aria-hidden>⤢</span> Fullscreen
                </span>
              </div>
            </div>

            {shots.length > 1 && (
              <div className="stagger mt-3 flex flex-wrap gap-3">
                {shots.map((src, i) => (
                  <button
                    key={src + i}
                    type="button"
                    onClick={() => setActiveShot(i)}
                    aria-label={`Show screenshot ${i + 1}`}
                    aria-current={i === activeShot}
                    className={`h-16 w-24 overflow-hidden rounded-lg border-2 transition-all ${
                      i === activeShot
                        ? 'border-brand-600 shadow-soft'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={mediaUrl(src)} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <section className="mt-8" aria-labelledby="about-heading">
              <h2 id="about-heading" className="ui-title text-xl">
                About this template
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                {template.description}
              </p>
            </section>

            {template.technologies?.length > 0 && (
              <section className="mt-7" aria-labelledby="tech-heading">
                <h2 id="tech-heading" className="ui-title text-xl">
                  Built with
                </h2>
                <ul className="stagger mt-3 flex flex-wrap gap-2">
                  {template.technologies.map((tech) => (
                    <li key={tech}>
                      <Link
                        to={`/templates?filter=${encodeURIComponent(tech)}`}
                        className="inline-block rounded-lg border border-ink-200 bg-ink-50 px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                      >
                        {tech}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {template.tags?.length > 0 && (
              <section className="mt-7" aria-labelledby="tags-heading">
                <h2 id="tags-heading" className="ui-title text-xl">
                  Tags
                </h2>
                <ul className="stagger mt-3 flex flex-wrap gap-2">
                  {template.tags.map((tag) => (
                    <li key={tag}>
                      {/* Tags are a filter value, not a search term: they link
                          straight to ?filter=<tag>, which the catalogue
                          matches against the tags field (spec §2). */}
                      <Link
                        to={`/templates?filter=${encodeURIComponent(tag)}`}
                        className="inline-block rounded-lg border border-dashed border-ink-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink-500 transition-colors hover:border-brand-300 hover:text-brand-700"
                      >
                        #{tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Spec §6: only when the developer actually wrote one. An empty
                or absent changelog renders nothing -- a section heading over
                a blank list tells the visitor less than no section at all. */}
            {template.changelog?.length > 0 && (
              <section className="mt-7" aria-labelledby="changelog-heading">
                <h2 id="changelog-heading" className="ui-title text-xl">
                  Changelog
                </h2>
                <ol className="stagger mt-4 space-y-3">
                  {template.changelog.map((entry, index) => {
                    const notes = Array.isArray(entry.notes) ? entry.notes : [];
                    return (
                      <li
                        key={`${entry.version}-${entry.createdAt || index}`}
                        className="ui-card p-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-extrabold tracking-tight text-ink-900">
                            {entry.version ? `v${entry.version}` : 'Update'}
                          </span>
                          <span className="text-xs text-ink-400">
                            {formatDate(entry.createdAt)}
                          </span>
                        </div>
                        {notes.length > 0 && (
                          <ul className="mt-2.5 space-y-1.5">
                            {notes.map((note, i) => (
                              <li
                                key={`${note}-${i}`}
                                className="flex gap-2 text-sm leading-relaxed text-ink-600"
                              >
                                <span aria-hidden className="shrink-0 text-brand-400">
                                  •
                                </span>
                                <span className="min-w-0 break-words">{note}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
          </section>

          {/* ------------------------------------------------- sidebar */}
          {/* `min-w-0` matters: the sidebar holds single-line `truncate` text,
              so its min-content width is ~800px. As a grid item with the
              default `min-width:auto` it would drag the whole track with it --
              widening the page below `lg` and starving the article column to
              ~200px at desktop. Letting it shrink is what makes the ellipsis
              inside actually do its job. */}
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="ui-card p-6 animate-fade-up">
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink-900">
                {template.title}
              </h1>

              {/* Spec §31: the facts a visitor needs before committing to a
                  download. Every value is whatever the developer supplied --
                  nothing here is derived or assumed, and a missing licence
                  reads as missing (§32) rather than defaulting to "MIT". */}
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-ink-100 py-5 text-sm">
                <Meta label="Category">
                  <Link
                    to={`/templates?filter=${encodeURIComponent(template.category)}`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {template.category}
                  </Link>
                </Meta>
                <Meta label="Version">{template.version || '—'}</Meta>
                <Meta label="Downloads">{formatCount(template.downloadCount)}</Meta>
                <Meta label="Saves">{formatCount(template.favoriteCount || 0)}</Meta>
                <Meta label="Added">{formatDate(template.createdAt)}</Meta>
                <Meta label="Updated">{formatDate(template.updatedAt)}</Meta>
                <Meta label="Size">
                  {template.file?.size ? formatBytes(template.file.size) : '—'}
                </Meta>
                <Meta label="File type">{fileExt || '—'}</Meta>
                <Meta label="License" className="col-span-2">
                  {template.license ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-ink-100 px-2 py-1 text-xs font-bold tracking-wide text-ink-700">
                      <span aria-hidden>⚖</span>
                      {template.license}
                    </span>
                  ) : (
                    <span className="text-sm font-normal italic text-ink-400">
                      License not specified.
                    </span>
                  )}
                </Meta>
              </dl>

              {/* developer */}
              <div className="mt-5">
                <span className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Developer
                </span>
                <div className="mt-2 flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
                    {initials(author?.name)}
                  </span>
                  <div className="min-w-0">
                    {authorId ? (
                      <Link
                        to={`/developers/${authorId}`}
                        className="block truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
                      >
                        {author?.name || template.authorName}
                      </Link>
                    ) : (
                      <span className="block truncate text-sm font-bold text-ink-900">
                        {template.authorName}
                      </span>
                    )}
                    {author?.bio && (
                      <span className="mt-0.5 block truncate text-xs text-ink-500">
                        {author.bio}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* actions */}
              <div className="mt-6 space-y-2.5">
                {/* Download -> Downloading... -> Downloaded (anim guide §16).
                    Full-width, so the longer labels never shift the card. */}
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={phase === 'busy'}
                  aria-live="polite"
                  className={`ui-btn ui-btn--lg ui-btn--block !text-base ${
                    phase === 'done' ? 'ui-btn--success' : 'ui-btn--primary'
                  }`}
                >
                  <span
                    key={phase}
                    className="inline-flex animate-fade-quick items-center gap-2"
                  >
                    {phase === 'busy' ? (
                      <span className="ui-spinner" aria-hidden />
                    ) : (
                      <span aria-hidden>{phase === 'done' ? '✓' : '↓'}</span>
                    )}
                    {phase === 'busy'
                      ? 'Downloading…'
                      : phase === 'done'
                        ? 'Downloaded'
                        : 'Download template'}
                  </span>
                </button>

                {!isAuthenticated && (
                  <p className="text-center text-xs text-ink-500">
                    You need to be signed in to download.{' '}
                    <Link to="/login" className="font-semibold text-brand-700 hover:underline">
                      Log in
                    </Link>
                  </p>
                )}

                {/* Spec §1 and §30: saving and sharing are peers, so they share
                    one row instead of stretching the button stack further. */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={toggleFavorite}
                    aria-pressed={favorited}
                    className={`ui-btn !px-2 ${favorited ? 'ui-btn--saved' : 'ui-btn--soft'}`}
                  >
                    <span
                      key={String(favorited)}
                      className="inline-flex animate-fade-quick items-center gap-2"
                    >
                      <span aria-hidden>{favorited ? '♥' : '♡'}</span>
                      {favorited ? 'Saved' : 'Save'}
                    </span>
                  </button>

                  <ShareButton title={template.title} className="ui-btn ui-btn--soft !px-2" />
                </div>

                {template.previewUrl && (
                  <a
                    href={template.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="ui-btn ui-btn--soft ui-btn--block"
                  >
                    <span aria-hidden>↗</span> Live preview
                  </a>
                )}

                {template.githubUrl && (
                  <a
                    href={template.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="ui-btn ui-btn--ghost ui-btn--block"
                  >
                    <span aria-hidden>⌥</span> View on GitHub
                  </a>
                )}

                {canEdit && (
                  <Link
                    to={`/developer/upload/${template._id}`}
                    className="ui-btn ui-btn--success ui-btn--block"
                  >
                    <span aria-hidden>✎</span> Edit template
                  </Link>
                )}
              </div>

              <p className="mt-5 border-t border-ink-100 pt-4 text-xs leading-relaxed text-ink-500">
                Downloading records your name against this template so the developer can see how
                often it is used. Re-downloading is not counted twice.
              </p>

              {/* Spec §7: reachable, but deliberately quieter than Download and
                  Save -- reporting is the exception, not the next step in the
                  happy path. Hidden from the owner, who can simply edit it. */}
              {!canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    if (!isAuthenticated) {
                      toast.info('Please log in to report this template.');
                      return;
                    }
                    setReporting(true);
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <span aria-hidden>⚑</span> Report this template
                </button>
              )}
            </div>

            {canEdit && user?.role === 'admin' && (
              <div className="ui-alert ui-alert--info mt-4 text-xs">
                You are viewing this as an administrator.
              </div>
            )}
          </aside>
        </div>
      </main>

      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        template={template}
      />

      {/* ------------------------------------------------ lightbox (§23) */}
      {lightbox !== null && shots[lightbox] && (
        <div
          className="ui-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${template.title} screenshots`}
          onClick={() => setLightbox(null)}
        >
          <div className="ui-lightbox__scrim" />

          <img
            src={mediaUrl(shots[lightbox])}
            alt={`${template.title} screenshot ${lightbox + 1}`}
            className="ui-lightbox__img"
          />

          {shots.length > 1 && (
            <>
              <button
                type="button"
                className="ui-lightbox__nav ui-lightbox__nav--prev"
                aria-label="Previous screenshot"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((i) => (i - 1 + shots.length) % shots.length);
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="ui-lightbox__nav ui-lightbox__nav--next"
                aria-label="Next screenshot"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((i) => (i + 1) % shots.length);
                }}
              >
                ›
              </button>
              <span className="ui-lightbox__count">
                {lightbox + 1} / {shots.length}
              </span>
            </>
          )}

          <button
            ref={closeRef}
            type="button"
            className="ui-lightbox__close"
            aria-label="Close fullscreen preview"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(null);
            }}
          >
            ×
          </button>
        </div>
      )}

      <Footer />
    </div>
  );
}

function Meta({ label, children, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 font-semibold text-ink-900">{children}</dd>
    </div>
  );
}
