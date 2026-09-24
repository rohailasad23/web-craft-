import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../components/Common/Toast';
import { downloadTemplate } from '../lib/download';
import { formatDate, formatCount, mediaUrl } from '../lib/format';
import { RowSkeleton } from '../components/Common/Skeletons';
import Footer from '../components/Common/Footer';

/**
 * /downloads -- "My Downloads" (spec §5, §9): every template the signed-in
 * user has downloaded, newest first, each re-downloadable in one click.
 */
export default function MyDownloads() {
  const { isAuthenticated } = useSession();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busySlug, setBusySlug] = useState('');
  // Which row is showing its "Downloaded" confirmation (anim guide §16).
  const [doneSlug, setDoneSlug] = useState('');
  const doneTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let alive = true;

    api
      .get('/api/users/me/downloads')
      .then((res) => alive && setData(res.data))
      .catch((err) => alive && setError(getErrorMessage(err, 'Could not load your downloads')))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  const handleDownload = async (template) => {
    if (busySlug || doneSlug === template.slug) return;
    setBusySlug(template.slug);
    try {
      await downloadTemplate(template);
      toast.success(`Downloading “${template.title}”`);
      setDoneSlug(template.slug);
      window.clearTimeout(doneTimer.current);
      doneTimer.current = window.setTimeout(() => setDoneSlug(''), 2000);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusySlug('');
    }
  };

  const rows = data?.downloads || [];

  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16 pt-10 sm:px-6">
        <header className="animate-fade-up">
          <span className="ui-eyebrow">Library</span>
          <h1 className="ui-title mt-2 text-3xl sm:text-4xl">My Downloads</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Templates you have downloaded appear here. Each one is only counted once, no matter how
            often you download it.
          </p>
        </header>

        <section className="mt-8" aria-label="Downloaded templates">
          {loading ? (
            <RowSkeleton rows={5} />
          ) : error ? (
            <div className="ui-alert ui-alert--error" role="alert">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="ui-card p-12 text-center">
              <span className="text-5xl" aria-hidden>
                📥
              </span>
              <h2 className="ui-title mt-4 text-xl">Nothing downloaded yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">
                Browse the library, download a template, and it will be waiting for you here the
                next time you sign in.
              </p>
              <Link to="/templates" className="ui-btn ui-btn--primary mt-6 !px-5 !py-2.5">
                Browse templates
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm font-semibold text-ink-700" role="status">
                {data.total} template{data.total === 1 ? '' : 's'} downloaded
              </p>

              <ul className="stagger ui-card divide-y divide-ink-100 overflow-hidden !p-0">
                {rows.map(({ template, downloadedAt }) => {
                  const busy = busySlug === template.slug;
                  return (
                    <li key={template._id || template.slug} className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-4">
                        <Link to={`/templates/${template.slug}`} className="shrink-0">
                          <img
                            src={mediaUrl(template.thumbnail)}
                            alt=""
                            loading="lazy"
                            className="h-16 w-24 rounded-lg object-cover ring-1 ring-ink-100 transition-transform hover:scale-105"
                          />
                        </Link>

                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/templates/${template.slug}`}
                            className="block truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
                          >
                            {template.title}
                          </Link>
                          <p className="mt-1 truncate text-xs text-ink-500">
                            {template.category} · by {template.authorName} · downloaded{' '}
                            {formatDate(downloadedAt)}
                          </p>
                          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-ink-700">
                            <span>↓ {formatCount(template.downloadCount)} downloads</span>
                            {template.technologies?.slice(0, 3).map((tech) => (
                              <span
                                key={tech}
                                className="rounded-md border border-ink-100 bg-ink-50 px-1.5 py-0.5"
                              >
                                {tech}
                              </span>
                            ))}
                          </p>
                        </div>

                        <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                          <Link
                            to={`/templates/${template.slug}`}
                            className="ui-btn ui-btn--ghost flex-1 !px-3 !py-2 !text-xs sm:flex-none"
                          >
                            Details
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDownload(template)}
                            disabled={busy}
                            className={`ui-btn flex-1 whitespace-nowrap !px-3 !py-2 !text-xs sm:flex-none ${
                              doneSlug === template.slug ? 'ui-btn--success' : 'ui-btn--primary'
                            }`}
                          >
                            {busy ? (
                              <span className="ui-spinner" aria-hidden />
                            ) : (
                              <span aria-hidden>{doneSlug === template.slug ? '✓' : '↓'}</span>
                            )}
                            <span
                              key={
                                busy ? 'busy' : doneSlug === template.slug ? 'done' : 'idle'
                              }
                              className="animate-fade-quick"
                            >
                              {busy
                                ? 'Downloading…'
                                : doneSlug === template.slug
                                  ? 'Downloaded'
                                  : 'Download again'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
