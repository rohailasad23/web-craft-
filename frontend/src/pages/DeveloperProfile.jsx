import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import { formatDate, formatCount, initials } from '../lib/format';
import TemplateCard from '../components/Templates/TemplateCard';
import { TemplateGridSkeleton } from '../components/Common/Skeletons';
import Footer from '../components/Common/Footer';

/** /developers/:id -- name, avatar, bio, counts and published templates (§10). */
export default function DeveloperProfile() {
  const { id } = useParams();
  const [developer, setDeveloper] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setDeveloper(null);
    setTemplates(null);

    Promise.all([
      api.get(`/api/developers/${encodeURIComponent(id)}`),
      api.get(`/api/developers/${encodeURIComponent(id)}/templates`),
    ])
      .then(([profile, list]) => {
        if (!alive) return;
        setDeveloper(profile.data.developer);
        setTemplates(list.data.templates);
      })
      .catch((err) => alive && setError(getErrorMessage(err, 'Developer not found')))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6">
        <div className="ui-card mb-8 flex items-center gap-5 p-6">
          <div className="ui-skeleton h-16 w-16 !rounded-full" />
          <div className="flex-1 space-y-3">
            <div className="ui-skeleton h-5 w-48" />
            <div className="ui-skeleton h-3 w-72" />
          </div>
        </div>
        <TemplateGridSkeleton count={6} />
      </div>
    );
  }

  if (error || !developer) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center sm:px-6">
        <span className="text-5xl" aria-hidden>
          👤
        </span>
        <h1 className="ui-title mt-4 text-2xl">Developer not found</h1>
        <p className="mt-3 text-sm text-ink-500">{error}</p>
        <Link to="/developers" className="ui-btn ui-btn--soft mt-6">
          Back to all developers
        </Link>
      </div>
    );
  }

  const list = templates || [];

  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-16 pt-8 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-500"
        >
          <Link to="/" className="transition-colors hover:text-brand-700">
            Home
          </Link>
          <span aria-hidden>›</span>
          <Link to="/developers" className="transition-colors hover:text-brand-700">
            Developers
          </Link>
          <span aria-hidden>›</span>
          <span className="font-semibold text-ink-900">{developer.name}</span>
        </nav>

        <header className="ui-card animate-fade-up p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-extrabold text-white shadow-lift">
              {initials(developer.name)}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
                  {developer.name}
                </h1>
                <span className="ui-badge !bg-brand-50 !text-brand-700">
                  {developer.role === 'admin' ? 'Admin' : 'Developer'}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">
                {developer.bio || 'This developer has not written a bio yet.'}
              </p>
              <p className="mt-2 text-xs text-ink-500">Joined {formatDate(developer.joinedAt)}</p>
            </div>

            <dl className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-1 lg:grid-cols-2">
              <Stat label="Templates" value={developer.templateCount} />
              <Stat label="Downloads" value={formatCount(developer.totalDownloads)} />
            </dl>
          </div>
        </header>

        <section className="mt-10" aria-labelledby="their-templates">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="ui-eyebrow">Portfolio</span>
              <h2 id="their-templates" className="ui-title mt-2 text-2xl">
                Templates by {developer.name.split(' ')[0]}
              </h2>
            </div>
            <Link
              to={`/templates?q=${encodeURIComponent(developer.name)}`}
              className="text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              Search their work →
            </Link>
          </div>

          <div className="mt-6">
            {list.length === 0 ? (
              <div className="ui-card p-10 text-center">
                <span className="text-4xl" aria-hidden>
                  🗂
                </span>
                <h3 className="ui-title mt-4 text-lg">Nothing published yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
                  {developer.name} has not published a template. Check back later, or browse the
                  rest of the library.
                </p>
                <Link to="/templates" className="ui-btn ui-btn--soft mt-5 !px-5 !py-2.5">
                  Browse templates
                </Link>
              </div>
            ) : (
              <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t) => (
                  <TemplateCard key={t._id || t.slug} template={t} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-center sm:min-w-[7rem]">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-extrabold text-ink-900">{value}</dd>
    </div>
  );
}
