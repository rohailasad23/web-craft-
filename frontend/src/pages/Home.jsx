import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useCatalog } from '../lib/catalog';
import { useSession } from '../lib/session';
import { formatCount, initials } from '../lib/format';
import { useSeo } from '../lib/seo';
import TemplateCard from '../components/Templates/TemplateCard';
import { TemplateGridSkeleton, StatSkeleton } from '../components/Common/Skeletons';
import Footer from '../components/Common/Footer';

/* Anim guide §8 -- one magnetic CTA, and only one.
   Feature-detected at load: nothing runs for touch users (§25) or when the
   OS asks for reduced motion (§26). The handler only writes a transform, so
   there is no JavaScript animation loop and the browser stays on the GPU (§27). */
const CAN_MAGNET =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MAGNET_MAX = 5; // spec: 2-5px, never more

function magnetMove(event) {
  if (!CAN_MAGNET) return;
  const box = event.currentTarget.getBoundingClientRect();
  const dx = ((event.clientX - box.left) / box.width - 0.5) * 2;
  const dy = ((event.clientY - box.top) / box.height - 0.5) * 2;
  event.currentTarget.style.transform =
    `translate3d(${(dx * MAGNET_MAX).toFixed(1)}px, ${(dy * MAGNET_MAX).toFixed(1)}px, 0)`;
}

function magnetLeave(event) {
  event.currentTarget.style.transform = '';
}

/**
 * Discovery homepage (spec §7): hero + search, category entry points, featured,
 * latest and popular templates, and a contributor section.
 */
export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useSession();
  const { categories, ready } = useCatalog();

  // Spec §15. Home is the one page whose metadata is static -- it is also the
  // page the branded og.png was designed for.
  useSeo({
    title: 'web craft — free website template marketplace',
    description:
      'A free marketplace for ready-made website templates. Browse by category or technology, preview live demos, and download the source.',
    path: '/',
  });

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
          <span className="ui-eyebrow animate-fade-up">Free template marketplace</span>
          <h1 className="mt-5 animate-fade-up text-4xl font-extrabold leading-[1.04] tracking-tight text-ink-900 [animation-delay:.08s] sm:text-6xl">
            <span className="block">Discover.</span>
            <span className="block">Download.</span>
            <span className="block bg-gradient-to-r from-brand-600 via-brand-500 to-purple-500 bg-clip-text text-transparent">
              Build.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl animate-fade-up text-base leading-relaxed text-ink-500 [animation-delay:.16s] sm:text-lg">
            <strong className="font-semibold text-ink-700">web craft is a free marketplace for
            ready-made website templates.</strong> Browse by category or technology, open the live
            demo before you commit, and download the full source in one click — no paywall, no
            premium tier, no subscription.
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
            <span
              className="ui-magnetic"
              onPointerMove={magnetMove}
              onPointerLeave={magnetLeave}
            >
              <Link to="/templates" className="ui-btn ui-btn--primary ui-btn--lg">
                Browse all templates
              </Link>
            </span>
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

        {/* ----------------------------------------- what is web craft */}
        <section className="mt-14" aria-labelledby="what-heading">
          <div className="ui-card overflow-hidden">
            <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.12fr_1fr] lg:gap-12 lg:p-11">
              <div>
                <span className="ui-eyebrow">The short version</span>
                <h2 id="what-heading" className="ui-title mt-2 text-2xl sm:text-3xl">
                  What is web craft?
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink-500 sm:text-base">
                  web craft is a free catalogue of ready-made website templates. Every listing is a
                  complete project you can actually take away — HTML/CSS, JavaScript, React, Next.js,
                  Vue, Tailwind CSS or Bootstrap — with a live demo, screenshots, the technologies it
                  uses and the developer who built it, all on one page.
                </p>
                <p className="mt-3.5 text-sm leading-relaxed text-ink-500 sm:text-base">
                  Nothing here is held back for money. There is no premium tier, no credits, no
                  subscription and no blurred preview: you find a template, you look at it properly,
                  and you download the source. That is the whole product.
                </p>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  <Link to="/templates" className="ui-btn ui-btn--primary !px-5 !py-2.5 text-sm">
                    Browse the catalogue
                  </Link>
                  <Link to="/register" className="ui-btn ui-btn--soft !px-5 !py-2.5 text-sm">
                    Create a free account
                  </Link>
                </div>
              </div>

              <ul className="stagger space-y-3.5">
                {WHAT_POINTS.map((p) => (
                  <li key={p.title} className="flex gap-3.5 rounded-2xl border border-ink-100 bg-ink-50/70 p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-base shadow-soft" aria-hidden>
                      {p.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-ink-900">{p.title}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-ink-500">{p.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ how it works */}
        <section className="mt-16" aria-labelledby="how-heading">
          <SectionHeading
            id="how-heading"
            eyebrow="The journey"
            title="How web craft works"
            blurb="Four steps from an idea to a running project — and the exact same path runs in reverse when you are here to share your own work."
          />
          <ol className="stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="ui-card ui-card--hover p-5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-sm font-extrabold text-brand-700">
                  {i + 1}
                </span>
                <h3 className="mt-3.5 text-sm font-bold text-ink-900">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="ui-alert ui-alert--info mt-5">
            <span aria-hidden>🛠️</span>
            <span>
              <strong className="font-semibold">Built something worth sharing?</strong> Register,
              open the Developer Dashboard, upload your archive and screenshots, and your template
              joins the same catalogue — published straight away and free to everyone.
            </span>
          </p>
        </section>

        {/* ------------------------------------------- why it exists */}
        <section className="mt-16" aria-labelledby="why-heading">
          <SectionHeading
            id="why-heading"
            eyebrow="Why we built it"
            title="Why this website exists"
            blurb="Most template marketplaces make you pay before you can even see what you are buying. web craft was built to be the opposite of that."
          />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="ui-card border-ink-200 p-6">
              <span className="ui-badge bg-red-50 text-red-600">The problem</span>
              <p className="mt-3.5 text-sm leading-relaxed text-ink-500 sm:text-base">
                Good templates sit behind paywalls and subscriptions, previews are blurred until you
                hand over a card, and finding something that matches your stack means scrolling past
                listing after listing that does not. On the other side, the free files are usually a
                single abandoned page with no screenshots and nobody to ask.
              </p>
            </div>
            <div className="ui-card border-brand-200 p-6">
              <span className="ui-badge bg-brand-50 text-brand-700">Our answer</span>
              <p className="mt-3.5 text-sm leading-relaxed text-ink-500 sm:text-base">
                One place where quality templates are free to browse, free to preview and free to
                download — and where the developers who build them get a real audience instead of a
                checkout page. No payment provider is wired into this project at all, so there is
                nothing to upgrade to and nothing to unlock later.
              </p>
            </div>
          </div>

          <div className="stagger mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROMISES.map((p) => (
              <div key={p.title} className="ui-card p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-50 text-lg" aria-hidden>
                  {p.icon}
                </span>
                <h3 className="mt-3 text-sm font-bold text-ink-900">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ categories */}
        {ready && categories?.length > 0 && (
          <section className="mt-16" aria-labelledby="categories-heading">
            <SectionHeading
              id="categories-heading"
              eyebrow="Browse"
              title="Popular categories"
              blurb="Start from the kind of site you are building. Categories and technologies share one filter bar, so “React” and “Portfolio” are a single click apart — pick either and the catalogue narrows itself."
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
          blurb="A short shortlist shown first on purpose: templates marked as featured, each with a live demo, a screenshot gallery and the full source archive attached."
          items={featured}
          loading={loading}
        />

        {/* ---------------------------------------------------- latest */}
        <TemplateSection
          id="latest-heading"
          eyebrow="Fresh"
          title="Latest templates"
          blurb="Newest uploads first. Useful if you have been here before and want to see what landed since your last visit — every card opens the full template page with the demo and the download."
          items={latest}
          loading={loading}
          action={{ to: '/templates?sort=newest', label: 'All latest' }}
        />

        {/* -------------------------------------------------- popular */}
        <TemplateSection
          id="popular-heading"
          eyebrow="Community favourites"
          title="Most downloaded"
          blurb="Sorted by real download counts recorded on this site, so this is the closest thing we have to a list of what developers actually reach for."
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
            blurb="Every template has an author. These are the people with published work here — open a profile to see everything they have uploaded and how often it has been downloaded."
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

        {/* ------------------------------------------------------- FAQ */}
        <section className="mt-16" aria-labelledby="faq-heading">
          <SectionHeading
            id="faq-heading"
            eyebrow="Questions"
            title="Why this site exists, answered"
            blurb="The short version of what web craft is, what it costs and how it stays free."
          />
          <div className="stagger mt-6 grid gap-4 lg:grid-cols-2">
            {FAQS.map((f) => (
              <div key={f.q} className="ui-card p-5 sm:p-6">
                <h3 className="text-sm font-bold text-ink-900 sm:text-base">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.a}</p>
              </div>
            ))}
          </div>
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

/* Homepage explainer copy. Kept as data so the sections read as one
   consistent voice and the JSX stays about layout, not sentences. */
const WHAT_POINTS = [
  {
    icon: '👀',
    title: 'Preview it before you download it',
    body: 'Every template page carries a live demo link and a screenshot gallery, so you can judge the layout and the details before you spend a byte.',
  },
  {
    icon: '📦',
    title: 'Real source, not a sample',
    body: 'One click hands you the whole project archive — markup, styles, scripts and assets — ready to open in your editor.',
  },
  {
    icon: '🤝',
    title: 'Made by developers, listed by name',
    body: 'Each upload comes from a contributor with a public profile, so you always know who built it and what else they have published.',
  },
];

const STEPS = [
  {
    title: 'Discover',
    body: 'Start on this page or open the full catalogue. Search by name, pick a category, or filter by the technology you actually build in.',
  },
  {
    title: 'Preview',
    body: 'Open a template to read what it is, flip through the screenshots and jump to the live demo in a new tab.',
  },
  {
    title: 'Download',
    body: 'Sign in — creating an account is free — and take the archive. It is recorded in My Downloads so you can come back to it.',
  },
  {
    title: 'Build',
    body: 'Open it in your editor, swap in your own content and ship it. The code is yours to learn from and adapt.',
  },
];

const PROMISES = [
  {
    icon: '💸',
    title: '100% free, always',
    body: 'No premium tier, no subscriptions, no paywalls. Every template costs the same: nothing.',
  },
  {
    icon: '🔍',
    title: 'Public browsing',
    body: 'Search, category pages, template details and live demos are open to everyone — no account needed to look.',
  },
  {
    icon: '🧾',
    title: 'Tracked downloads',
    body: 'Sign in and every download lands in My Downloads, so nothing you take has to be hunted down again.',
  },
  {
    icon: '🏆',
    title: 'Credit stays with the author',
    body: 'Every listing points back to the developer who uploaded it, with their profile and the rest of their work.',
  },
];

const FAQS = [
  {
    q: 'What is web craft?',
    a: 'A free marketplace for ready-made website templates. You search it by category or technology, preview any template live, and download its full source archive.',
  },
  {
    q: 'Is it really free?',
    a: 'Yes. There is no premium tier, no subscription and no paid download anywhere on this site. The project deliberately has no payment provider wired into it.',
  },
  {
    q: 'Do I need an account?',
    a: 'Not to browse. Search, category pages, template details and demos are public. You only sign in when you want to download, and registering costs nothing.',
  },
  {
    q: 'What exactly do I get?',
    a: 'The complete archive the developer uploaded — markup, styles, scripts and assets — plus the screenshots and details they shared on the template page.',
  },
  {
    q: 'Can I use a template commercially?',
    a: 'Check the template page and the licence files inside the archive. Nothing here claims a licence on the author’s behalf, so confirm the terms with them before shipping commercially.',
  },
  {
    q: 'How do I publish my own work?',
    a: 'Register, open your Developer Dashboard and choose Upload Template. Your listing is published straight away and appears in the catalogue and in search.',
  },
];

const CATEGORY_TINTS = [
  'rgba(99,102,241,.14)',
  'rgba(244,63,94,.14)',
  'rgba(14,165,233,.14)',
  'rgba(16,185,129,.14)',
  'rgba(139,92,246,.14)',
];

function SectionHeading({ eyebrow, title, action, id, blurb }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <span className="ui-eyebrow">{eyebrow}</span>
        <h2 id={id} className="ui-title mt-2 text-2xl sm:text-3xl">
          {title}
        </h2>
        {blurb && (
          <p className="mt-2.5 text-sm leading-relaxed text-ink-500 sm:text-base">{blurb}</p>
        )}
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

function TemplateSection({ id, eyebrow, title, blurb, items, loading, action }) {
  if (!loading && (!items || items.length === 0)) return null;

  return (
    <section className="mt-16" aria-labelledby={id}>
      <SectionHeading eyebrow={eyebrow} title={title} blurb={blurb} action={action} id={id} />
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
