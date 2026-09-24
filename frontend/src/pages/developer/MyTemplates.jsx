import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../components/Common/Toast';
import { formatCount, mediaUrl } from '../../lib/format';
import { RowSkeleton } from '../../components/Common/Skeletons';
import { StatusBadge } from './Dashboard';
import Footer from '../../components/Common/Footer';

/**
 * /developer/templates -- the developer's submissions with edit / delete
 * (spec §6 "Edit button", §17).
 */
export default function MyTemplates() {
  const navigate = useNavigate();
  const toast = useToast();

  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState('');
  const [deleting, setDeleting] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get('/api/templates/mine')
      .then((res) => alive && setTemplates(res.data.templates))
      .catch((err) => alive && setError(getErrorMessage(err, 'Could not load your templates')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const handleDelete = async (template) => {
    setDeleting(template._id);
    try {
      await api.delete(`/api/templates/${template._id}`);
      setTemplates((list) => (list || []).filter((t) => t._id !== template._id));
      toast.success(`“${template.title}” deleted`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete this template'));
    } finally {
      setDeleting('');
      setConfirming('');
    }
  };

  const list = templates || [];

  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-16 pt-10 sm:px-6">
        <header className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="ui-eyebrow">Developer workspace</span>
            <h1 className="ui-title mt-2 text-3xl sm:text-4xl">My Templates</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              Edit metadata, replace the archive or remove a submission.
            </p>
          </div>
          <Link to="/developer/upload" className="ui-btn ui-btn--success !px-4 !py-2.5 text-sm">
            <span aria-hidden>＋</span> Upload template
          </Link>
        </header>

        {error && (
          <div className="ui-alert ui-alert--error mt-6" role="alert">
            {error}
          </div>
        )}

        <section className="mt-8" aria-label="Your templates">
          {loading ? (
            <RowSkeleton rows={4} />
          ) : list.length === 0 ? (
            <div className="ui-card p-12 text-center">
              <span className="text-5xl" aria-hidden>
                📦
              </span>
              <h2 className="ui-title mt-4 text-xl">You have not published anything yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">
                Package your project as a .zip, add a thumbnail and a short description, and the
                whole community can download it.
              </p>
              <Link to="/developer/upload" className="ui-btn ui-btn--primary mt-6 !px-5 !py-2.5">
                Upload your first template
              </Link>
            </div>
          ) : (
            <ul className="stagger ui-card divide-y divide-ink-100 overflow-hidden !p-0">
              {list.map((t) => {
                const isConfirming = confirming === t._id;
                const isDeleting = deleting === t._id;
                return (
                  <li key={t._id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-4">
                      <Link to={`/templates/${t.slug}`} className="shrink-0">
                        <img
                          src={mediaUrl(t.thumbnail)}
                          alt=""
                          loading="lazy"
                          className="h-16 w-24 rounded-lg object-cover ring-1 ring-ink-100 transition-transform hover:scale-105"
                        />
                      </Link>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/templates/${t.slug}`}
                            className="truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
                          >
                            {t.title}
                          </Link>
                          <StatusBadge status={t.status} />
                        </div>
                        <p className="mt-1 truncate text-xs text-ink-500">
                          {t.category} · {(t.technologies || []).join(', ')}
                        </p>
                        <p className="mt-1.5 text-[11px] font-semibold text-ink-700">
                          ↓ {formatCount(t.downloadCount)} downloads ·{' '}
                          {(t.screenshots || []).length} screenshot
                          {(t.screenshots || []).length === 1 ? '' : 's'}
                        </p>
                      </div>

                      <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
                        <Link
                          to={`/developer/upload/${t._id}`}
                          className="ui-btn ui-btn--soft flex-1 !px-3 !py-2 !text-xs sm:flex-none"
                        >
                          ✎ Edit
                        </Link>

                        {isConfirming ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDelete(t)}
                              disabled={isDeleting}
                              className="ui-btn !border-red-200 !bg-red-50 !px-3 !py-2 !text-xs !text-red-600 hover:!bg-red-100"
                            >
                              {isDeleting ? 'Deleting…' : 'Yes, delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirming('')}
                              disabled={isDeleting}
                              className="ui-btn ui-btn--ghost !px-3 !py-2 !text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirming(t._id)}
                            className="ui-btn ui-btn--ghost !px-3 !py-2 !text-xs hover:!border-red-200 hover:!text-red-600"
                          >
                            🗑 Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {list.length > 0 && !loading && (
          <p className="mt-6 text-center text-xs text-ink-500">
            Deleting a template also removes its archive, screenshots and every download record.
          </p>
        )}

        <div className="mt-8 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/developer')}
            className="ui-btn ui-btn--ghost !px-4 !py-2.5 text-sm"
          >
            ← Developer dashboard
          </button>
        </div>
      </main>

      <Footer />
    </div>
  );
}
