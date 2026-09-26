import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { dropSaved } from '../lib/favorites';
import { formatDate, formatCount, initials, mediaUrl } from '../lib/format';
import { RowSkeleton, StatSkeleton, TemplateGridSkeleton } from '../components/Common/Skeletons';
import TemplateCard from '../components/Templates/TemplateCard';
import Footer from '../components/Common/Footer';

/**
 * /dashboard -- the logged-in user's home (spec §5): profile summary,
 * account settings, download history, and the "become a developer" path.
 */
export default function Dashboard() {
  const { user, refresh } = useSession();
  const [downloads, setDownloads] = useState(null);
  const [favorites, setFavorites] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const isDeveloper = user?.role === 'developer' || user?.role === 'admin';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');

    Promise.all([
      api.get('/api/users/me/downloads?limit=6'),
      api.get('/api/users/me/favorites?limit=4'),
      isDeveloper ? api.get('/api/templates/mine') : Promise.resolve({ data: { templates: [] } }),
    ])
      .then(([dl, fav, mine]) => {
        if (!alive) return;
        setDownloads(dl.data);
        setFavorites(fav.data);
        setTemplates(mine.data.templates);
      })
      .catch((err) => alive && setError(getErrorMessage(err, 'Could not load your dashboard')))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [isDeveloper]);

  const promoteToDeveloper = async () => {
    try {
      await api.put('/api/users/me', { role: 'developer' });
      await refresh?.();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not upgrade your account'));
    }
  };

  const recent = downloads?.downloads?.slice(0, 6) || [];
  // Spec §1: the saved list has to be reachable from the dashboard. Four
  // cards, not a second row component -- the same card, heart and all, that
  // the catalogue uses.
  const recentSaved = (favorites?.templates || []).slice(0, 4);

  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-16 pt-10 sm:px-6">
        <header className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="ui-eyebrow">Welcome back</span>
            <h1 className="ui-title mt-2 text-3xl sm:text-4xl">{user?.name}</h1>
            <p className="mt-2 text-sm text-ink-500">
              {user?.email} · joined {formatDate(user?.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/profile" className="ui-btn ui-btn--soft !px-4 !py-2.5 text-sm">
              Account settings
            </Link>
            <Link to="/templates" className="ui-btn ui-btn--primary !px-4 !py-2.5 text-sm">
              Browse templates
            </Link>
          </div>
        </header>

        {error && (
          <div className="ui-alert ui-alert--error mt-6" role="alert">
            {error}
          </div>
        )}

        {/* ------------------------------------------------------ stats */}
        <section
          className="stagger mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Overview"
        >
          {loading ? (
            Array.from({ length: 4 }, (_, i) => <StatSkeleton key={i} />)
          ) : (
            <>
              <Stat
                label="Downloaded templates"
                value={downloads?.total ?? 0}
                hint="distinct templates"
                icon="⬇️"
              />
              <Stat
                label="Account type"
                value={isDeveloper ? 'Developer' : 'User'}
                hint={isDeveloper ? 'can publish templates' : 'read-only'}
                icon={isDeveloper ? '🛠' : '👤'}
              />
              {isDeveloper && (
                <Stat label="Your templates" value={templates?.length ?? 0} hint="published" icon="🧩" />
              )}
              {isDeveloper && (
                <Stat
                  label="Total downloads"
                  value={formatCount(
                    (templates || []).reduce((sum, t) => sum + (t.downloadCount || 0), 0)
                  )}
                  hint="across your work"
                  icon="📈"
                />
              )}
            </>
          )}
        </section>

        {/* -------------------------------------- become a developer (§22) */}
        {!isDeveloper && (
          <section className="ui-card mt-8 flex flex-col gap-4 border-brand-200 bg-brand-50/60 p-6 sm:flex-row sm:items-center">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-xl shadow-soft">
              🛠
            </span>
            <div className="flex-1">
              <h2 className="text-base font-bold text-ink-900">Ready to share your work?</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">
                Switch your account to a developer to upload templates, manage them, and see how
                often the community downloads them. You can switch back at any time.
              </p>
            </div>
            <button
              type="button"
              onClick={promoteToDeveloper}
              className="ui-btn ui-btn--primary shrink-0 !px-5 !py-2.5"
            >
              Become a developer
            </button>
          </section>
        )}

        {isDeveloper && (
          <section className="mt-4 flex flex-wrap gap-3">
            <Link to="/developer" className="ui-btn ui-btn--soft !px-4 !py-2.5 text-sm">
              Developer dashboard
            </Link>
            <Link to="/developer/templates" className="ui-btn ui-btn--soft !px-4 !py-2.5 text-sm">
              My templates
            </Link>
            <Link to="/developer/upload" className="ui-btn ui-btn--success !px-4 !py-2.5 text-sm">
              <span aria-hidden>＋</span> Upload template
            </Link>
          </section>
        )}

        {/* ----------------------------------------------- recent downloads */}
        <section className="mt-10" aria-labelledby="recent-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="ui-eyebrow">History</span>
              <h2 id="recent-heading" className="ui-title mt-2 text-2xl">
                Recently downloaded
              </h2>
            </div>
            <Link
              to="/downloads"
              className="text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              All downloads →
            </Link>
          </div>

          <div className="mt-5">
            {loading ? (
              <RowSkeleton rows={3} />
            ) : recent.length === 0 ? (
              <div className="ui-card p-8 text-center">
                <span className="text-4xl" aria-hidden>
                  📥
                </span>
                <h3 className="ui-title mt-3 text-lg">No downloads yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
                  Anything you download will show up here so you can find it again later.
                </p>
                <Link to="/templates" className="ui-btn ui-btn--soft mt-5 !px-5 !py-2.5">
                  Browse templates
                </Link>
              </div>
            ) : (
              <ul className="stagger ui-card divide-y divide-ink-100 overflow-hidden !p-0">
                {recent.map(({ template, downloadedAt }) => (
                  <li key={template._id || template.slug}>
                    <Link
                      to={`/templates/${template.slug}`}
                      className="flex items-center gap-4 p-4 transition-colors hover:bg-ink-50"
                    >
                      <img
                        src={mediaUrl(template.thumbnail)}
                        alt=""
                        className="h-14 w-20 shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink-900">
                          {template.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-500">
                          {template.category} · downloaded {formatDate(downloadedAt)}
                        </span>
                      </span>
                      <span className="ui-btn ui-btn--ghost !px-3 !py-1.5 !text-xs">View</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ------------------------------------------------ saved templates */}
        <section className="mt-10" aria-labelledby="saved-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="ui-eyebrow">Shortlist</span>
              <h2 id="saved-heading" className="ui-title mt-2 text-2xl">
                Saved templates
              </h2>
            </div>
            <Link
              to="/saved"
              className="text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              {favorites?.total ? `All ${favorites.total} saved →` : 'All saved →'}
            </Link>
          </div>

          <div className="mt-5">
            {loading ? (
              <TemplateGridSkeleton count={4} />
            ) : recentSaved.length === 0 ? (
              <div className="ui-card p-8 text-center">
                <span className="text-4xl" aria-hidden>
                  ♡
                </span>
                <h3 className="ui-title mt-3 text-lg">Nothing saved yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
                  Tap the heart on any template to build a shortlist you can compare side by side.
                </p>
                <Link to="/templates" className="ui-btn ui-btn--soft mt-5 !px-5 !py-2.5">
                  Browse templates
                </Link>
              </div>
            ) : (
              <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {recentSaved.map((t) => (
                  <TemplateCard
                    key={t._id || t.slug}
                    template={t}
                    onFavoriteChange={(tpl, isSaved) => {
                      if (!isSaved) setFavorites((d) => dropSaved(d, tpl));
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* -------------------------------------------------- profile card */}
        <section className="ui-card mt-10 p-6" aria-labelledby="profile-heading">
          <div className="flex flex-wrap items-center gap-5">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-extrabold text-white shadow-soft">
              {initials(user?.name)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="profile-heading" className="text-lg font-bold text-ink-900">
                {user?.name}
              </h2>
              <p className="mt-0.5 break-all text-sm text-ink-500">{user?.email}</p>
              {user?.bio && <p className="mt-2 text-sm text-ink-700">{user.bio}</p>}
            </div>
            <Link to="/profile" className="ui-btn ui-btn--soft !px-4 !py-2.5 text-sm">
              Edit profile
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function Stat({ label, value, hint, icon }) {
  return (
    <div className="ui-card p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</span>
        <span aria-hidden className="text-lg">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
