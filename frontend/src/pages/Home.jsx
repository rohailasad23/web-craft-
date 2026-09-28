import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useCatalog } from '../lib/catalog';
import { useSession } from '../lib/session';
import { usePlatform } from '../lib/platform';
import { formatCount, initials, mediaUrl } from '../lib/format';
import { useSeo } from '../lib/seo';
import { pointerEffectsAllowed, reducedMotion } from '../lib/motion';
import TemplateCard from '../components/Templates/TemplateCard';
import {
  TemplateGridSkeleton,
  TemplateCardSkeleton,
  StatSkeleton,
} from '../components/Common/Skeletons';
import Footer from '../components/Common/Footer';
import CinematicIntro from '../components/Common/CinematicIntro';

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

/* ------------------------------------------------ the opening (§1-§9)
   The homepage introduces itself instead of simply appearing. WEB CRAFT
   arrives as a wall of type, the camera pulls back to a medium wordmark,
   the word then resolves letter by letter out of its own centre, the credit
   draws in beneath it, and finally the word travels to the navbar brand --
   handing over to the hero's own beats at 1.6s: eyebrow 1.6s, headline
   1.8/2.0/2.2s, description 2.4s, search 2.6s, buttons 2.8s, and a fully
   interactive page by ~2.9s (§30).

   That is 1.8s of stage plus the hero clock, once per session. No spinner,
   no progress bar, no "loading" -- the real page renders underneath the whole
   time and simply becomes visible as the veil lifts (§29).

   THREE TEMPOS, ONE CLOCK. Every beat below is written on the canonical
   first-visit timeline and each visitor gets that same shape compressed:
     cine   first page of the session -- the full opening
     short  everyone after it -- same sequence at ~40% of the tempo, so a
            returning visitor is never made to watch an introduction twice
     calm   prefers-reduced-motion -- no opening stage at all, just the
            existing short fade

   The mode is read once at module load on purpose: React's StrictMode
   double-render must not be able to flip the answer between two renders
   (§41). The stamp is written back in an effect below. */
const INTRO_KEY = 'wc:intro';
let returningThisSession = false;
try {
  returningThisSession =
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem(INTRO_KEY) !== null;
} catch {
  returningThisSession = false; // storage unavailable: show the full entrance
}

const INTRO_MODE = reducedMotion()
  ? 'calm'
  : returningThisSession
    ? 'short'
    : 'cine';

const INTRO_TEMPO = { cine: 1, short: 0.42, calm: 0.1 };

/**
 * Discovery homepage (spec §7): hero + search, category entry points, featured,
 * latest and popular templates, and a contributor section.
 */
/**
 * The hero search box, on its own so that typing re-renders this component and
 * nothing else. Held as state inside Home, every keystroke re-ran Home's whole
 * render -- four template grids, the category rail, contributors, FAQ -- purely
 * to keep one controlled input honest, and then did nothing until submit.
 */
function HeroSearch({ delay }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');

  const submit = (event) => {
    event.preventDefault();
    navigate(term.trim() ? `/templates?q=${encodeURIComponent(term.trim())}` : '/templates');
  };

  return (
    <form
      onSubmit={submit}
      // §4/§13: a step of the entrance sequence (`delay` comes from the
      // hero's own clock), and §28: the whole search row lifts a hair on
      // focus, so the field announces itself without the layout moving.
      className="mx-auto mt-8 flex max-w-xl line-rise gap-2 transition-all duration-300 focus-within:-translate-y-0.5"
      style={delay}
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
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useSession();
  const { categories, ready } = useCatalog();
  const platform = usePlatform();

  // Spec §3: the homepage's seven content sections are the admin's to order,
  // rename and switch off. Before config answers (or if it never does) this
  // is EXACTLY the layout that shipped before the switchboard existed --
  // "unknown" behaves like "as built", never like "empty page".
  const sections = platform.sections?.length ? platform.sections : FALLBACK_SECTIONS;

  // Spec §15. Home is the one page whose metadata is static -- it is also the
  // page the branded og.png was designed for.
  useSeo({
    title: 'web craft — free website template marketplace',
    description:
      'A free marketplace for ready-made website templates. Browse by category or technology, preview live demos, and download the source.',
    path: '/',
  });

  const [featured, setFeatured] = useState(null);
  const [trending, setTrending] = useState(null);
  const [latest, setLatest] = useState(null);
  const [popular, setPopular] = useState(null);
  const [developers, setDevelopers] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const get = (url) => api.get(url).then((r) => r.data);

    Promise.all([
      get('/api/templates?featured=true&limit=4'),
      // §2: the trending row is behaviour, not a sort the catalogue page has
      // -- downloads and saves from the last 14 days, with any admin
      // override applied. It is fetched with the rest so one loading state
      // covers the whole page.
      get('/api/templates?trending=true&limit=4'),
      get('/api/templates?sort=newest&limit=4'),
      get('/api/templates?sort=downloads&limit=4'),
      get('/api/developers?limit=6'),
    ])
      .then(([f, tr, l, p, d]) => {
        if (!alive) return;
        setFeatured(f.templates);
        setTrending(tr.templates);
        setLatest(l.templates);
        setPopular(p.templates);
        setDevelopers(d.developers);
      })
      .catch(() => alive && setFailed(true));

    return () => {
      alive = false;
    };
  }, []);

  const goCategory = useCallback(
    (c) => navigate(`/templates?filter=${encodeURIComponent(c)}`),
    [navigate]
  );

  const loading = !failed && latest === null;

  // §41: stamp the session the moment the homepage mounts, so the NEXT page
  // load already knows this visitor has seen the full entrance.
  useEffect(() => {
    try {
      sessionStorage.setItem(INTRO_KEY, '1');
    } catch {
      // Storage unavailable (private mode): nothing to persist, nothing to
      // break -- the entrance simply plays at full tempo every time.
    }
  }, []);

  /* The opening stage itself. `playing` only decides whether the fixed layer
     is mounted; `skipped` is what a visitor who did not want to watch it
     sets, and it pulls the hero forward to the short tempo so the page
     finishes arriving immediately instead of waiting out the rest of a
     timeline nobody is reading any more (§16). */
  const [introPlaying, setIntroPlaying] = useState(INTRO_MODE === 'cine');
  const [introSkipped, setIntroSkipped] = useState(false);
  const endIntro = useCallback(() => setIntroPlaying(false), []);

  const introTempo = INTRO_TEMPO[introSkipped && INTRO_MODE === 'cine' ? 'short' : INTRO_MODE];
  /** ms into the canonical timeline -> an animation delay for one element. */
  const at = (ms) => ({ animationDelay: `${Math.round(ms * introTempo)}ms` });
  /** The same clock for a `.stagger` row (its children add their own 50ms). */
  const stag = (ms) => ({ '--stag-start': `${Math.round(ms * introTempo)}ms` });

  // §16: nobody is ever held inside the opening. A wheel, a swipe or any key
  // press ends the stage on the spot and moves the hero to the short tempo.
  // (The stage itself is `pointer-events: none` in CSS, so clicks pass
  // through to the page and never even reach this.)
  useEffect(() => {
    if (!introPlaying) return undefined;
    const skip = () => {
      setIntroPlaying(false);
      setIntroSkipped(true);
    };
    const opts = { passive: true };
    window.addEventListener('wheel', skip, opts);
    window.addEventListener('touchmove', skip, opts);
    window.addEventListener('keydown', skip);
    return () => {
      window.removeEventListener('wheel', skip, opts);
      window.removeEventListener('touchmove', skip, opts);
      window.removeEventListener('keydown', skip);
    };
  }, [introPlaying]);

  /* §6/§18/§22: one pointer handler drives both the parallax and the cursor
     light. It writes custom properties on the hero root, and every layer
     reads them by inheritance -- so the whole cluster moves from at most ONE
     style write per animation frame. No per-layer listeners, no loop, no
     work at all once the pointer leaves, and nothing at all without a fine
     pointer or when the OS asks for reduced motion (§35, §36).

     §15: the hero only answers the cursor once the opening is over. Until
     then the cluster sits still on its own drift, which is what makes the
     first cursor movement afterwards feel like the page waking up. */
  const heroRef = useRef(null);
  const heroFrame = useRef(0);
  const heroPoint = useRef({ x: 0, y: 0 });

  useEffect(() => () => window.cancelAnimationFrame(heroFrame.current), []);

  const paintHero = () => {
    heroFrame.current = 0;
    const hero = heroRef.current;
    if (!hero) return;
    const box = hero.getBoundingClientRect();
    const { x, y } = heroPoint.current;
    // -0.5 .. 0.5, so each layer can scale it to its own few pixels.
    hero.style.setProperty('--px', ((x - box.left) / box.width - 0.5).toFixed(3));
    hero.style.setProperty('--py', ((y - box.top) / box.height - 0.5).toFixed(3));
    hero.style.setProperty('--cx', `${Math.round(x - box.left)}px`);
    hero.style.setProperty('--cy', `${Math.round(y - box.top)}px`);
  };

  const onHeroPointer = (event) => {
    if (introPlaying) return;
    if (!pointerEffectsAllowed() || event.pointerType === 'touch') return;
    heroPoint.current = { x: event.clientX, y: event.clientY };
    if (heroFrame.current) return;
    heroFrame.current = window.requestAnimationFrame(paintHero);
  };

  const onHeroLeave = () => {
    const hero = heroRef.current;
    if (!hero) return;
    window.cancelAnimationFrame(heroFrame.current);
    heroFrame.current = 0;
    // Ease the layers back to centre instead of freezing them where they were.
    hero.style.setProperty('--px', '0');
    hero.style.setProperty('--py', '0');
  };

  /* §18: the opening is not the end of the motion, it is the start. As the
     page travels through the hero, one number -- 0 to 1 -- goes on the hero
     root, and the cluster drifts up and away while the backdrop thins. Same
     rAF-throttled, one-write-per-frame discipline as the pointer: the
     listener only schedules a frame, and it stops entirely once the hero has
     been scrolled past. */
  useEffect(() => {
    if (reducedMotion()) return undefined;
    const hero = heroRef.current;
    if (!hero) return undefined;
    let frame = 0;
    let last = -1;

    const paint = () => {
      frame = 0;
      const travelled = Math.min(Math.max(window.scrollY / Math.max(hero.offsetHeight, 1), 0), 1);
      const next = Math.round(travelled * 100) / 100;
      if (next === last) return; // nothing moved: no style write
      last = next;
      hero.style.setProperty('--sy', String(next));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // §5/§45: the preview cluster is built from rows this page already fetches
  // -- newest first, curated picks as the fallback. No extra request, and
  // never an invented template: while the fetch is in flight the frame shows
  // a real skeleton, and a failed fetch falls back to decoration that claims
  // nothing.
  const heroItems = latest?.length ? latest : featured || [];

  return (
    <div>
      {/* §1-§9: the opening. Mounted only for a first visit, on top of a
          page that is already rendered and already clickable, and taken
          away the moment its 1.45s are up. */}
      {introPlaying && <CinematicIntro onDone={endIntro} />}

      {/* ---------------------------------------------------------- hero */}
      <section
        ref={heroRef}
        onPointerMove={onHeroPointer}
        onPointerLeave={onHeroLeave}
        className="relative overflow-hidden border-b border-ink-100 bg-white"
      >
        {/* §1/§40: the stage sets itself first -- glow, grid, then the soft
            light that tracks the pointer (§22). Decorative only: it is
            aria-hidden, pointer-events-none, and gone on touch or reduced
            motion, so it can never stand between a visitor and the page. */}
        <div
          aria-hidden
          className="hero-backdrop pointer-events-none absolute inset-0 animate-fade-in"
          style={at(1000)}
        >
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
          <div className="hero-light" />
        </div>

        {/* §8-§14: one connected reveal. Every element below is a beat of
            the same clock, in the order the story is told -- label, the
            three words one at a time, the sentence, the field, the
            buttons -- and nothing waits longer than 1.4s (§11, §32). */}
        <div className="relative mx-auto max-w-4xl px-5 pb-4 pt-14 text-center sm:px-6 sm:pt-20">
          <span
            className="ui-eyebrow line-rise"
            style={{ ...at(1600), '--rise-y': '15px', '--rise-blur': '6px' }}
          >
            Free template marketplace
          </span>

          {/* §9: three moments, not one block. The mask on `.hero-line`
              is what makes each word rise out of nothing; "Build." keeps
              the brand gradient and lands last, so the sentence finishes
              on the word it is about. */}
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.04] tracking-tight text-ink-900 sm:text-6xl">
            <span className="hero-line">
              <span className="line-rise" style={at(1800)}>
                Discover.
              </span>
            </span>
            <span className="hero-line">
              <span className="line-rise" style={{ ...at(2000), '--rise-blur': '7px' }}>
                Download.
              </span>
            </span>
            <span className="hero-line">
              <span
                className="line-rise bg-gradient-to-r from-brand-600 via-brand-500 to-purple-500 bg-clip-text text-transparent"
                style={{ ...at(2200), '--rise-blur': '5px' }}
              >
                Build.
              </span>
            </span>
          </h1>

          <p
            className="mx-auto mt-5 max-w-2xl line-rise text-base leading-relaxed text-ink-500 sm:text-lg"
            style={{ ...at(2400), '--rise-blur': '6px' }}
          >
            <strong className="font-semibold text-ink-700">web craft is a free marketplace for
            ready-made website templates.</strong> Browse by category or technology, open the live
            demo before you commit, and download the full source in one click — no paywall, no
            premium tier, no subscription.
          </p>

          {/* §13: the field arrives slightly smaller and settles -- the
              width itself never animates, which is the point. */}
          <HeroSearch
            delay={{ ...at(2600), '--rise-y': '18px', '--rise-scale': '0.94', '--rise-blur': '6px' }}
          />

          <div
            className="mt-8 line-rise flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ ...at(2800), '--rise-blur': '4px' }}
          >
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
            <div
              className="stagger mt-9 flex flex-wrap justify-center gap-2"
              style={stag(3000)}
            >
              {categories.slice(0, 5).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => goCategory(c)}
                  className="ui-press rounded-full border border-ink-200 bg-white/80 px-4 py-1.5 text-sm font-semibold text-ink-700 backdrop-blur hover:-translate-y-0.5 hover:border-brand-400 hover:text-brand-700 hover:shadow-soft"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* §5/§21: the preview cluster. It is already in place when the
            word leaves -- the world is here before the sentence starts. */}
        <HeroVisual items={heroItems} loading={loading} style={at(1250)} />
      </section>

      <main className="mx-auto max-w-7xl px-5 sm:px-6">
        {failed && (
          <div className="ui-alert ui-alert--error mt-8">
            Could not reach the API. Is the backend running on port 8080?
          </div>
        )}

        {/* ----------------------------------------- what is web craft */}
        <section className="mt-14" aria-labelledby="what-heading">
          <div className="ui-card reveal overflow-hidden">
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
          {/* §17: one connector, drawn once, as the section arrives -- and
              only where four steps actually sit side by side. On a single
              column the stack is its own explanation; a line would just be
              decoration. The wrapper carries `.reveal` so the line waits with
              everything else instead of drawing itself off screen. */}
          <div className="reveal relative mt-6">
            <span
              aria-hidden="true"
              className="draw-line absolute left-[12.5%] right-[12.5%] top-[-14px] hidden h-px rounded-full bg-gradient-to-r from-brand-200 via-brand-400 to-brand-200 lg:block"
            />
            <ol className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="ui-card ui-card--hover p-5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-sm font-extrabold text-brand-700 tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3.5 text-sm font-bold text-ink-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
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
          <div className="reveal mt-6 grid gap-4 lg:grid-cols-2">
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

        {/* ------------------------------- admin-ordered sections (§3)
            These seven rows are the ones the Content screen reorders, renames
            and switches off, so they render from the CONFIG's order rather
            than the page's. Everything around them -- hero, explainer, FAQ,
            call to action -- is fixed product copy and stays put. */}
        {sections
          .filter((s) => s.enabled !== false)
          .map((s) => {
            switch (s.key) {
              case 'categories':
                return ready && categories?.length > 0 ? (
                  <CategoriesSection
                    key="categories"
                    section={s}
                    categories={categories}
                    goCategory={goCategory}
                  />
                ) : null;

              case 'featured':
                return (
                  <FeaturedSection
                    key="featured"
                    id="featured-heading"
                    eyebrow="Hand-picked"
                    title={s.title || SECTION_TITLES.featured}
                    blurb={s.blurb || DEFAULT_BLURBS.featured}
                    items={featured}
                    loading={loading}
                  />
                );

              case 'trending':
                return (
                  <TemplateSection
                    key="trending"
                    id="trending-heading"
                    eyebrow="Right now"
                    title={s.title || SECTION_TITLES.trending}
                    blurb={s.blurb || DEFAULT_BLURBS.trending}
                    items={trending}
                    loading={loading}
                    // §15: the badge names the list these rows came from -- the
                    // server's real 14-day activity ranking -- not a score
                    // anybody invented (§45).
                    badge="Trending"
                  />
                );

              case 'latest':
                return (
                  <RailSection
                    key="latest"
                    id="latest-heading"
                    eyebrow="Fresh"
                    title={s.title || SECTION_TITLES.latest}
                    blurb={s.blurb || DEFAULT_BLURBS.latest}
                    items={latest}
                    loading={loading}
                    action={{ to: '/templates?sort=newest', label: 'All latest' }}
                  />
                );

              case 'popular':
                return (
                  <TemplateSection
                    key="popular"
                    id="popular-heading"
                    eyebrow="Community favourites"
                    title={s.title || SECTION_TITLES.popular}
                    blurb={s.blurb || DEFAULT_BLURBS.popular}
                    items={popular}
                    loading={loading}
                    action={{ to: '/templates?sort=downloads', label: 'All popular' }}
                  />
                );

              case 'spotlight':
                // §4: an admin's picks, shipped inside the platform payload --
                // no extra request, and empty until someone is actually chosen.
                return <SpotlightSection key="spotlight" section={s} devs={platform.spotlight || []} />;

              case 'contributors':
                return (
                  <ContributorsSection key="contributors" section={s} developers={developers} loading={loading} />
                );

              default:
                return null;
            }
          })}

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
        <section className="reveal relative mt-16 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-purple-800 px-6 py-12 text-center shadow-lift sm:px-12">
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

/* ------------------------------------------------- §3 config fallbacks */

/**
 * The shipped layout, used until GET /api/platform answers (and for the whole
 * visit if it never does). Titles below mirror PlatformConfig's defaults on
 * the server; blurbs live here because they are pure presentation copy the
 * API has no reason to know about. Either way: no config renders exactly the
 * homepage that existed before the switchboard, not an empty page.
 */
const FALLBACK_SECTIONS = ['categories', 'featured', 'trending', 'latest', 'popular', 'spotlight', 'contributors'].map(
  (key, i) => ({ key, enabled: true, order: (i + 1) * 10, title: '', blurb: '' })
);

const SECTION_TITLES = {
  categories: 'Popular categories',
  featured: 'Featured templates',
  trending: 'Trending now',
  latest: 'Latest templates',
  popular: 'Most downloaded',
  spotlight: 'Developer spotlight',
  contributors: 'Meet the contributors',
};

const DEFAULT_BLURBS = {
  categories:
    'Start from the kind of site you are building. Categories and technologies share one filter bar, so “React” and “Portfolio” are a single click apart — pick either and the catalogue narrows itself.',
  featured:
    'A short shortlist shown first on purpose: templates marked as featured, each with a live demo, a screenshot gallery and the full source archive attached.',
  trending:
    'Downloads and saves from the last two weeks, counted on this site — what people are reaching for right now, not what they always have.',
  latest:
    'Newest uploads first. Useful if you have been here before and want to see what landed since your last visit — every card opens the full template page with the demo and the download.',
  popular:
    'Sorted by real download counts recorded on this site, so this is the closest thing we have to a list of what developers actually reach for.',
  spotlight:
    'Developers the team has put forward by hand — one profile, their best work and nothing they did not choose to show.',
  contributors:
    'Every template has an author. These are the people with published work here — open a profile to see everything they have uploaded and how often it has been downloaded.',
};

function CategoriesSection({ section, categories, goCategory }) {
  return (
    <section className="mt-16" aria-labelledby="categories-heading">
      <SectionHeading
        id="categories-heading"
        eyebrow="Browse"
        title={section.title || SECTION_TITLES.categories}
        blurb={section.blurb || DEFAULT_BLURBS.categories}
        action={{ to: '/templates', label: 'View all' }}
      />
      <div className="stagger mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {categories.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => goCategory(c)}
            className="ui-card ui-card--hover ui-press group p-5 text-left"
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
            {/* §13: the affordance itself moves, so the card reads as a
                destination rather than a label. */}
            <span className="mt-0.5 block text-xs text-ink-500 transition-all duration-300 group-hover:translate-x-1 group-hover:text-brand-700">
              Explore →
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ContributorsSection({ section, developers, loading }) {
  return (
    <section className="mt-16" aria-labelledby="developers-heading">
      <SectionHeading
        id="developers-heading"
        eyebrow="Community"
        title={section.title || SECTION_TITLES.contributors}
        blurb={section.blurb || DEFAULT_BLURBS.contributors}
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
              {/* §16: the avatar answers the pointer too -- one small motion
                  on the identity itself, so the card feels handled rather
                  than merely tinted. */}
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-soft transition-transform duration-300 ease-out group-hover:scale-105">
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
  );
}

/**
 * §4's spotlight: the developers an admin actually picked, delivered inside
 * the platform payload. Renders nothing until someone has been chosen (spec
 * §1/§22: never fabricate a spotlight), and the badge it shows -- if any --
 * is the admin's own trust judgement, never an auto-award.
 */
function SpotlightSection({ section, devs }) {
  if (!devs.length) return null;

  return (
    <section className="mt-16" aria-labelledby="spotlight-heading">
      <SectionHeading
        id="spotlight-heading"
        eyebrow="Highlighted"
        title={section.title || SECTION_TITLES.spotlight}
        blurb={section.blurb || DEFAULT_BLURBS.spotlight}
        action={{ to: '/developers', label: 'All developers' }}
      />
      <div className="stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {devs.map((d) => (
          <Link key={d.id} to={`/developers/${d.id}`} className="ui-card ui-card--hover group p-5">
            <span className="flex items-center gap-4">
              {/* Initials underneath, photo on top: a pasted avatar URL that
                  has since rotted hides itself instead of showing a broken
                  image box. */}
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-soft">
                {initials(d.name)}
                {d.image && (
                  <img
                    src={d.image}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full rounded-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-ink-900 group-hover:text-brand-700">
                    {d.name}
                  </span>
                  {d.trustBadge && (
                    <span
                      className={`ui-badge shrink-0 ${
                        d.trustBadge === 'verified' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {d.trustBadge === 'verified' ? 'Verified' : 'Trusted'}
                    </span>
                  )}
                </span>
                {d.skills?.length > 0 && (
                  <span className="mt-1 block truncate text-xs text-ink-500">{d.skills.join(' · ')}</span>
                )}
              </span>
            </span>
            {d.blurb && (
              <p className="mt-3.5 line-clamp-3 text-sm leading-relaxed text-ink-500">{d.blurb}</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, action, id, blurb, extra }) {
  return (
    // `.reveal`: every section announces itself as it arrives (§10, §11) --
    // one block, one curve, held only for as long as it is still below the
    // fold, then released by the same observer that drives the grids.
    <div className="reveal flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <span className="ui-eyebrow">{eyebrow}</span>
        <h2 id={id} className="ui-title mt-2 text-2xl sm:text-3xl">
          {title}
        </h2>
        {blurb && (
          <p className="mt-2.5 text-sm leading-relaxed text-ink-500 sm:text-base">{blurb}</p>
        )}
      </div>
      {(action || extra) && (
        <div className="flex flex-wrap items-center gap-2.5">
          {extra}
          {action && (
            <Link
              to={action.to}
              className="text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
            >
              {action.label} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateSection({ id, eyebrow, title, blurb, items, loading, action, badge }) {
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
              <TemplateCard key={t._id || t.slug} template={t} badge={badge} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** A catalogue row as a floating card beside the hero preview (§5). */
function MiniPreview({ template }) {
  return (
    <div className="ui-card animate-fade-in overflow-hidden !p-0">
      <div className="aspect-[16/10] overflow-hidden bg-ink-100">
        {template.thumbnail ? (
          <img
            src={mediaUrl(template.thumbnail)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xl" aria-hidden>
            🧩
          </div>
        )}
      </div>
      <div className="p-3 text-left">
        <p className="truncate text-xs font-bold text-ink-900">{template.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-500">{template.category}</p>
      </div>
    </div>
  );
}

/** The same shape while the homepage fetch is still in flight (§30). */
function MiniPreviewSkeleton() {
  return (
    <div className="ui-card overflow-hidden !p-0">
      <div className="ui-skeleton aspect-[16/10] !rounded-none" />
      <div className="space-y-2 p-3">
        <div className="ui-skeleton h-3 w-3/4" />
        <div className="ui-skeleton h-2.5 w-1/2" />
      </div>
    </div>
  );
}

/**
 * The hero's layered preview cluster (§5, §40): a browser window flanked by
 * two smaller catalogue cards, each on its own depth layer so the pointer
 * parallax separates them (§6).
 *
 * Honest states only (§45): while the homepage fetch is in flight the frame
 * shimmers like every other loading surface on the site, and if it fails the
 * panel falls back to decoration that promises nothing -- no fabricated
 * template, no invented number.
 */
function HeroVisual({ items, loading, style }) {
  const [primary, second, third] = items || [];
  const sides = [second, third];

  return (
    <div
      className="line-rise hero-drift relative mx-auto mt-10 flex w-full max-w-4xl items-center justify-center gap-4 px-5 pb-14 sm:px-6"
      style={{ ...style, '--rise-y': '40px', '--rise-scale': '0.98', '--rise-blur': '8px' }}
    >
      {/* Depth layers 2 and 3 (behind, and off to the right). Desktop only:
          below lg there is no room beside the window without crowding the
          edge of the screen (§42). */}
      {(sides[0] || loading) && (
        <div
          className="hero-depth hidden w-44 shrink-0 self-start lg:block"
          style={{ '--depth': '10px' }}
        >
          <div className="hero-float hero-float--b">
            {sides[0] ? <MiniPreview template={sides[0]} /> : <MiniPreviewSkeleton />}
          </div>
        </div>
      )}

      <div className="hero-depth w-full max-w-xl" style={{ '--depth': '5px' }}>
        <div className="hero-float hero-float--a">
          <div className="ui-card overflow-hidden !p-0 shadow-lift">
            {/* browser chrome -- decorative, so aria-hidden */}
            <div aria-hidden className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/80 px-4 py-2.5">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              </span>
              <span className="mx-auto max-w-[62%] truncate rounded-md bg-white px-3 py-0.5 text-[11px] font-semibold text-ink-500 shadow-soft">
                web craft
                {primary ? ` / ${String(primary.category || 'templates').toLowerCase()}` : ''}
              </span>
            </div>

            {/* the viewport */}
            <div className="relative aspect-[16/9] overflow-hidden bg-ink-100">
              {primary ? (
                <img
                  src={mediaUrl(primary.thumbnail)}
                  alt=""
                  loading="lazy"
                  className="animate-fade-in h-full w-full object-cover"
                />
              ) : loading ? (
                <div className="ui-skeleton h-full w-full !rounded-none" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-50 via-white to-purple-50">
                  <span
                    className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-2xl shadow-soft"
                    aria-hidden
                  >
                    🧩
                  </span>
                </div>
              )}
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-700 shadow-soft backdrop-blur">
                {primary ? primary.category : 'Templates'}
              </span>
            </div>

            {/* footer: real rows or an honest skeleton, never a mock metric */}
            <div className="flex items-center gap-3 p-4 text-left">
              {primary ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900">{primary.title}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    ↓ {formatCount(primary.downloadCount)} downloads · ♥{' '}
                    {formatCount(primary.favoriteCount || 0)} saves
                  </p>
                </div>
              ) : loading ? (
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="ui-skeleton h-3.5 w-2/5" />
                  <div className="ui-skeleton h-3 w-3/5" />
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900">Browse the catalogue</p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    Every template is free to download.
                  </p>
                </div>
              )}
              <Link
                to={primary ? `/templates/${primary.slug}` : '/templates'}
                className="ui-btn ui-btn--primary !px-3.5 !py-2 !text-xs shrink-0"
              >
                {primary ? 'View details' : 'Browse'}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {(sides[1] || loading) && (
        <div
          className="hero-depth hidden w-44 shrink-0 self-end lg:block"
          style={{ '--depth': '14px' }}
        >
          <div className="hero-float hero-float--c">
            {sides[1] ? <MiniPreview template={sides[1]} /> : <MiniPreviewSkeleton />}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * §14: the one row on the homepage with a deliberate hierarchy. A primary
 * card spans two columns (taller preview, larger title, tilt, its own badge)
 * while the remaining picks support it, and a real "browse everything" tile
 * closes the grid so the layout never leaves a hole. Four identical cards
 * would say that none of them matters.
 *
 * The closing tile is dropped only when there is exactly one supporting card:
 * that is the single combination that would leave an empty cell.
 */
function FeaturedSection({ id, eyebrow, title, blurb, items, loading }) {
  if (!loading && (!items || items.length === 0)) return null;

  const [primary, ...rest] = items || [];
  const showTile = rest.length !== 1;

  return (
    <section className="mt-16" aria-labelledby={id}>
      <SectionHeading eyebrow={eyebrow} title={title} blurb={blurb} id={id} />
      <div className="mt-6">
        {loading ? (
          <TemplateGridSkeleton count={4} />
        ) : (
          <div className="stagger grid items-start gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TemplateCard template={primary} featured tilt badge="Featured" />
            </div>
            {rest.map((t) => (
              <div key={t._id || t.slug}>
                <TemplateCard template={t} />
              </div>
            ))}
            {showTile && (
              <Link
                to="/templates"
                className="ui-card ui-card--hover group flex min-h-[10rem] flex-col justify-center p-6 text-left"
              >
                <span className="ui-eyebrow">Everything else</span>
                <span className="ui-title mt-1.5 text-lg group-hover:text-brand-700">
                  Browse the catalogue
                </span>
                <span className="mt-1.5 text-sm leading-relaxed text-ink-500">
                  Live demos, technology lists and free source downloads for every template.
                </span>
                <span
                  aria-hidden
                  className="mt-3 text-sm font-semibold text-brand-700 transition-transform duration-300 group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * §18: the ONE horizontal showcase on the site. It never hijacks the page --
 * the vertical wheel keeps scrolling the document, a touch swipe or the
 * heading's arrows move the rail, and focusing a card scrolls it into view --
 * so mouse, touch and keyboard all reach the same place (§18, §43).
 */
function RailSection({ id, eyebrow, title, blurb, items, loading, action }) {
  const railRef = useRef(null);

  if (!loading && (!items || items.length === 0)) return null;

  const nudge = (dir) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: dir * Math.round(rail.clientWidth * 0.85),
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
  };

  const controls = (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => nudge(-1)}
        aria-label="Scroll showcase left"
        className="ui-press grid h-9 w-9 place-items-center rounded-full border border-ink-200 bg-white text-ink-700 hover:border-brand-400 hover:text-brand-700 hover:shadow-soft"
      >
        <span aria-hidden>‹</span>
      </button>
      <button
        type="button"
        onClick={() => nudge(1)}
        aria-label="Scroll showcase right"
        className="ui-press grid h-9 w-9 place-items-center rounded-full border border-ink-200 bg-white text-ink-700 hover:border-brand-400 hover:text-brand-700 hover:shadow-soft"
      >
        <span aria-hidden>›</span>
      </button>
    </div>
  );

  const CARD = 'w-[76vw] max-w-[320px] shrink-0 sm:w-[320px]';

  return (
    <section className="mt-16" aria-labelledby={id}>
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        blurb={blurb}
        id={id}
        action={action}
        extra={controls}
      />
      <div className="mt-6">
        {loading ? (
          <div className="ui-rail [scroll-padding-left:1.25rem] flex gap-5 overflow-x-auto pb-2 sm:[scroll-padding-left:1.5rem]">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className={CARD}>
                <TemplateCardSkeleton />
              </div>
            ))}
          </div>
        ) : (
          <div
            ref={railRef}
            className="ui-rail -mx-5 flex gap-5 overflow-x-auto px-5 pb-2 sm:-mx-6 sm:px-6 [scroll-padding-left:1.25rem] sm:[scroll-padding-left:1.5rem]"
          >
            {items.map((t) => (
              <div key={t._id || t.slug} className={CARD}>
                <TemplateCard template={t} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
