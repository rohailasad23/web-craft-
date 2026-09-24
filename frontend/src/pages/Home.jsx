import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useCatalog } from '../lib/catalog';
import { useSession } from '../lib/session';
import { formatCount, initials } from '../lib/format';
import TemplateCard from '../components/Templates/TemplateCard';
import { TemplateGridSkeleton, StatSkeleton } from '../components/Common/Skeletons';
import Footer from '../components/Common/Footer';

/**
 * Discovery homepage (spec §7): hero + search, category entry points, featured,
 * latest and popular templates, and a contributor section.
 */
export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useSession();
  const { categories, ready } = useCatalog();

  const [term, setTerm] = useState('');
  const [featured, setFeatured] = useState(null);
  const [latest, setLatest] = useState(null);
  const [popular, setPopular] = useState(null);
  const [developers, setDevelopers] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const get = (url) => api.get(url).then((r) => r.data);

    Promise.all([
      get('/api/templates?featured=true&limit=4'),
      get('/api/templates?sort=newest&limit=4'),
      get('/api/templates?sort=downloads&limit=4'),
      get('/api/developers?limit=6'),
    ])
      .then(([f, l, p, d]) => {
        if (!alive) return;
        setFeatured(f.templates);
        setLatest(l.templates);
        setPopular(p.templates);
        setDevelopers(d.developers);
      })
      .catch(() => alive && setFailed(true));

    return () => {
      alive = false;
    };
  }, []);

  const submit = (event) => {
    event.preventDefault();
    navigate(term.trim() ? `/templates?q=${encodeURIComponent(term.trim())}` : '/templates');
  };

  const goCategory = useCallback(
    (c) => navigate(`/templates?filter=${encodeURIComponent(c)}`),
    [navigate]
  );

  const loading = !failed && latest === null;

  return (
    <div>
      {/* ---------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-ink-100 bg-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-brand-200/45 blur-3xl animate-float" />
          <div className="absolute -right-32 top-24 h-96 w-96 rounded-full bg-purple-200/40 blur-3xl animate-float [animation-delay:-3s]" />
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(99,102,241,.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,102,241,.12) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
              maskImage: 'radial-gradient(ellipse at 50% 0%, black, transparent 72%)',
            }}
          />
        </div>

        <div className="relative mx-auto max-w-4xl px-5 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="ui-eyebrow animate-fade-up">Template marketplace</span>
          <h1 className="mt-5 animate-fade-up text-4xl font-extrabold leading-[1.06] tracking-tight text-ink-900 [animation-delay:.08s] sm:text-6xl">
            Discover, download &amp;
            <span className="block bg-gradient-to-r from-brand-600 via-brand-500 to-purple-500 bg-clip-text text-transparent">
              ship websites faster
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl animate-fade-up text-base leading-relaxed text-ink-500 [animation-delay:.16s] sm:text-lg">
            A community library of ready-made templates for developers and creators. Browse by
            category or technology, preview before you commit, and download the source in one
            click.
          </p>

          <form
            onSubmit={submit}
            className="mx-auto mt-8 flex max-w-xl animate-fade-up gap-2 [animation-delay:.24s]"
          >
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search “portfolio”, “React”, “dashboard”…"
              aria-label="Search templates"
              className="ui-input !py-3.5"
            />
            <button type="submit" className="ui-btn ui-btn--primary !px-6 !py-3.5 shrink-0">
              Search
            </button>
          </form>

          <div className="mt-8 flex animate-fade-up flex-col items-center justify-center gap-3 [animation-delay:.32s] sm:flex-row">
            <Link to="/templates" className="ui-btn ui-btn--lg">
              Browse all templates
            </Link>
            {!isAuthenticated ? (
              <Link to="/register" className="ui-btn ui-btn--soft !px-6 !py-3.5">
                Become a developer
              </Link>
            ) : user?.role === 'user' ? (
              <Link to="/dashboard" className="ui-btn ui-btn--soft !px-6 !py-3.5">
                Go to dashboard
              </Link>
            ) : (
              <Link to="/developer/upload" className="ui-btn ui-btn--success !px-6 !py-3.5">
                <span aria-hidden>＋</span> Upload a template
              </Link>
            )}
          </div>

          {ready && categories?.length > 0 && (
            <div className="stagger mt-9 flex flex-wrap justify-center gap-2">
              {categories.slice(0, 5).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => goCategory(c)}
                  className="rounded-full border border-ink-200 bg-white/80 px-4 py-1.5 text-sm font-semibold text-ink-700 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-400 hover:text-brand-700 hover:shadow-soft"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-5 sm:px-6">
        {failed && (
          <div className="ui-alert ui-alert--error mt-8">
            Could not reach the API. Is the backend running on port 8080?
          </div>
        )}

        {/* ------------------------------------------------ categories */}
        {ready && categories?.length > 0 && (
          <section className="mt-14" aria-labelledby="categories-heading">
            <SectionHeading
              id="categories-heading"
              eyebrow="Browse"
              title="Popular categories"
              action={{ to: '/templates', label: 'View all' }}
            />
            <div className="stagger mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {categories.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => goCategory(c)}
                  className="ui-card ui-card--hover group p-5 text-left"
                >
                  <span
                    className="grid h-11 w-11 place-items-center rounded-xl text-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
                    style={{ background: CATEGORY_TINTS[i % CATEGORY_TINTS.length] }}
                    aria-hidden
                  >
                    {CATEGORY_ICONS[i % CATEGORY_ICONS.length]}
                  </span>
                  <span className="mt-3.5 block text-sm font-bold text-ink-900 group-hover:text-brand-700">
                    {c}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">Explore →</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* -------------------------------------------------- featured */}
        <TemplateSection
          id="featured-heading"
          eyebrow="Hand-picked"
          title="Featured templates"
          items={featured}
          loading={loading}
        />

        {/* ---------------------------------------------------- latest */}
        <TemplateSection
          id="latest-heading"
          eyebrow="Fresh"
          title="Latest templates"
          items={latest}
          loading={loading}
          action={{ to: '/templates?sort=newest', label: 'All latest' }}
        />

        {/* -------------------------------------------------- popular */}
        <TemplateSection
          id="popular-heading"
          eyebrow="Community favourites"
          title="Most downloaded"
          items={popular}
          loading={loading}
          action={{ to: '/templates?sort=downloads', label: 'All popular' }}
        />

        {/* ----------------------------------------------- developers */}
        <section className="mt-16" aria-labelledby="developers-heading">
          <SectionHeading
            id="developers-heading"
            eyebrow="Community"
            title="Meet the contributors"
            action={{ to: '/developers', label: 'All developers' }}
          />

          {loading ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <StatSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(developers || []).map((d) => (
                <Link
                  key={d.id}
                  to={`/developers/${d.id}`}
                  className="ui-card ui-card--hover group flex items-center gap-4 p-5"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-soft">
                    {initials(d.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink-900 group-hover:text-brand-700">
                      {d.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-500">
                      {d.templateCount} template{d.templateCount === 1 ? '' : 's'} ·{' '}
                      {formatCount(d.totalDownloads)} downloads
                    </span>
                  </span>
                  <span aria-hidden className="text-ink-500 transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </Link>
              ))}
            </div>
          )}

          {!loading && (developers || []).length === 0 && (
            <p className="ui-alert ui-alert--info mt-6">No developers have joined yet.</p>
          )}
        </section>

        {/* -------------------------------------------------- CTA band */}
        <section className="relative mt-16 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-purple-800 px-6 py-12 text-center shadow-lift sm:px-12">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-20">
            <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white blur-3xl" />
            <div className="absolute -bottom-20 -right-10 h-72 w-72 rounded-full bg-purple-300 blur-3xl" />
          </div>
          <div className="relative">
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Have a template to share?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
              Register as a developer, upload your archive and screenshots, and let the community
              download your work.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to={isAuthenticated ? '/developer/upload' : '/register'}
                className="ui-btn !bg-white !px-6 !py-3 !text-brand-700 hover:!bg-brand-50"
              >
                <span aria-hidden>＋</span>{' '}
                {isAuthenticated ? 'Upload a template' : 'Start contributing'}
              </Link>
              <Link
                to="/templates"
                className="ui-btn !border !border-white/40 !bg-transparent !px-6 !py-3 !text-white hover:!bg-white/10"
              >
                Explore first
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

const CATEGORY_ICONS = ['🎨', '🛍', '🚀', '📊', '✍️'];
const CATEGORY_TINTS = [
  'rgba(99,102,241,.14)',
  'rgba(244,63,94,.14)',
  'rgba(14,165,233,.14)',
  'rgba(16,185,129,.14)',
  'rgba(139,92,246,.14)',
];

function SectionHeading({ eyebrow, title, action, id }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="ui-eyebrow">{eyebrow}</span>
        <h2 id={id} className="ui-title mt-2 text-2xl sm:text-3xl">
          {title}
        </h2>
      </div>
      {action && (
        <Link
          to={action.to}
          className="text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}

function TemplateSection({ id, eyebrow, title, items, loading, action }) {
  if (!loading && (!items || items.length === 0)) return null;

  return (
    <section className="mt-16" aria-labelledby={id}>
      <SectionHeading eyebrow={eyebrow} title={title} action={action} id={id} />
      <div className="mt-6">
        {loading ? (
          <TemplateGridSkeleton count={4} />
        ) : (
          <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((t) => (
              <TemplateCard key={t._id || t.slug} template={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
