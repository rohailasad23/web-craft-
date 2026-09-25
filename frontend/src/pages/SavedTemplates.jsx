import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import { dropSaved } from '../lib/favorites';
import TemplateCard from '../components/Templates/TemplateCard';
import { TemplateGridSkeleton } from '../components/Common/Skeletons';
import Footer from '../components/Common/Footer';

/**
 * /saved -- every template the signed-in user has saved (spec §1).
 *
 * Deliberately the same TemplateCard grid as the catalogue rather than a
 * bespoke "saved list" row component: the heart is already there, in its
 * already-familiar place, and unsaving works exactly as it does everywhere
 * else. Un-saving takes the card out of the list straight away, so the page
 * never keeps showing something the person just removed.
 */
export default function SavedTemplates() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    api
      .get('/api/users/me/favorites')
      .then((res) => alive && setData(res.data))
      .catch((err) => alive && setError(getErrorMessage(err, 'Could not load your saved templates')))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, []);

  const handleFavoriteChange = (template, isSaved) => {
    if (isSaved) return;
    setData((d) => dropSaved(d, template));
  };

  const templates = data?.templates || [];
  const total = data?.total ?? 0;

  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-16 pt-10 sm:px-6">
        <header className="animate-fade-up">
          <span className="ui-eyebrow">Library</span>
          <h1 className="ui-title mt-2 text-3xl sm:text-4xl">Saved templates</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
            Everything you tapped the heart on, newest first. Saving is private to your account and
            a template can only be saved once.
          </p>
        </header>

        <section className="mt-8" aria-label="Saved templates">
          {loading ? (
            <TemplateGridSkeleton count={8} />
          ) : error ? (
            <div className="ui-alert ui-alert--error" role="alert">
              {error}
            </div>
          ) : templates.length === 0 ? (
            <div className="ui-card p-12 text-center">
              <span className="text-5xl" aria-hidden>
                ♡
              </span>
              <h2 className="ui-title mt-4 text-xl">Nothing saved yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">
                Tap the heart on any template to keep it here. It is the quickest way to line up
                candidates before you decide.
              </p>
              <Link to="/templates" className="ui-btn ui-btn--primary mt-6 !px-5 !py-2.5">
                Browse templates
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-5 text-sm font-semibold text-ink-700" role="status">
                {total} template{total === 1 ? '' : 's'} saved
              </p>

              <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {templates.map((t) => (
                  <TemplateCard
                    key={t._id || t.slug}
                    template={t}
                    onFavoriteChange={handleFavoriteChange}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
