import React from 'react';
import { Link } from 'react-router-dom';

const FEATURES = [
  {
    icon: '✨',
    title: 'AI writes the copy',
    body: 'Describe your business in one line and get a complete hero, features and CTA — in seconds.',
  },
  {
    icon: '🎨',
    title: 'Edit everything live',
    body: 'Change colours, sections and text in the editor. The preview updates as you type.',
  },
  {
    icon: '📱',
    title: 'Responsive by default',
    body: 'Every generated page is built mobile-first, so it looks right on any screen.',
  },
  {
    icon: '⚡',
    title: 'Publish in one click',
    body: 'Ship it to a shareable URL instantly — no build step, no hosting setup.',
  },
  {
    icon: '💳',
    title: 'Client payments built in',
    body: 'Connect Razorpay and let clients pay for the page directly from the published link.',
  },
  {
    icon: '🔒',
    title: 'Safe to embed',
    body: 'Published pages are sanitised and served with a strict Content-Security-Policy.',
  },
];

const STEPS = [
  { n: '01', title: 'Describe', body: 'Tell the builder what your business does.' },
  { n: '02', title: 'Generate', body: 'AI drafts the sections, copy and images.' },
  { n: '03', title: 'Refine', body: 'Tweak anything in the visual editor.' },
  { n: '04', title: 'Publish', body: 'Share the link or take payment.' },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-ink-50 text-ink-900 overflow-x-hidden">
      {/* ---------- Top bar ---------- */}
      <header className="relative z-20 animate-slide-down">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white text-lg shadow-soft transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110">
              ⚡
            </span>
            <span className="text-lg font-extrabold tracking-tight">LP Builder</span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link to="/login" className="ui-navlink hidden sm:block">
              Login
            </Link>
            <Link to="/register" className="ui-btn ui-btn--primary">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative">
        {/* animated backdrop */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-brand-400/30 blur-3xl animate-float" />
          <div className="absolute top-32 -right-32 h-[24rem] w-[24rem] rounded-full bg-purple-400/30 blur-3xl animate-float-slow" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-300/30 blur-3xl animate-float" />
          {/* subtle grid */}
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(15,23,42,.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,.06) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse 70% 60% at 50% 35%, black, transparent)',
            }}
          />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-24 text-center sm:pt-24">
          <span className="ui-eyebrow animate-fade-up">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500 animate-ping" />
            AI landing page builder
          </span>

          <h1 className="ui-title mt-6 text-5xl sm:text-6xl lg:text-7xl animate-fade-up [animation-delay:.08s]">
            AI generates it.
            <br />
            You customize it.{' '}
            <span className="bg-gradient-to-r from-brand-500 via-brand-600 to-purple-600 bg-[length:200%_auto] bg-clip-text text-transparent animate-gradient-x">
              Clients pay for it.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-500 animate-fade-up [animation-delay:.16s]">
            Describe your business once — get a complete, editable, publishable landing page.
            No design skills, no boilerplate, no waiting on a developer.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4 animate-fade-up [animation-delay:.24s]">
            <Link to="/register" className="ui-btn ui-btn--primary ui-btn--lg group">
              Start building free
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </Link>
            <Link to="/login" className="ui-btn ui-btn--ghost ui-btn--lg">
              I already have an account
            </Link>
          </div>

          <p className="mt-5 text-sm text-ink-500 animate-fade-up [animation-delay:.32s]">
            No credit card required
          </p>

          {/* mock preview window */}
          <div className="relative mx-auto mt-16 max-w-3xl animate-pop-in [animation-delay:.4s]">
            <div className="ui-card overflow-hidden !rounded-2xl">
              <div className="flex items-center gap-1.5 border-b border-ink-100 bg-ink-50 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
                <span className="ml-3 h-5 flex-1 rounded-md bg-white text-[11px] leading-5 text-ink-500">
                  yoursite.com
                </span>
              </div>
              <div className="space-y-3 p-6 text-left">
                <div className="ui-skeleton h-4 w-24" />
                <div className="ui-skeleton h-7 w-3/4" />
                <div className="ui-skeleton h-3 w-full" />
                <div className="ui-skeleton h-3 w-5/6" />
                <div className="flex gap-3 pt-2">
                  <div className="ui-skeleton h-9 w-32 rounded-lg" />
                  <div className="ui-skeleton h-9 w-24 rounded-lg" />
                </div>
                <div className="grid grid-cols-3 gap-3 pt-3">
                  <div className="ui-skeleton h-16 rounded-xl" />
                  <div className="ui-skeleton h-16 rounded-xl" />
                  <div className="ui-skeleton h-16 rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="ui-eyebrow">Features</span>
          <h2 className="ui-title mt-3 text-3xl sm:text-4xl">
            Everything you need, nothing you don&apos;t
          </h2>
        </div>

        <div className="stagger mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="ui-card ui-card--hover group p-6">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-2xl transition-all duration-500 group-hover:scale-110 group-hover:bg-brand-100 group-hover:-rotate-6">
                {f.icon}
              </div>
              <h3 className="mt-4 text-base font-bold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="relative border-y border-ink-100 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="ui-eyebrow">How it works</span>
            <h2 className="ui-title mt-3 text-3xl sm:text-4xl">From idea to live in four steps</h2>
          </div>

          <div className="stagger mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.n} className="group relative">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-extrabold text-white shadow-soft transition-transform duration-500 group-hover:scale-110 group-hover:-translate-y-1">
                    {s.n}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span className="hidden h-px flex-1 bg-gradient-to-r from-brand-200 to-transparent lg:block" />
                  )}
                </div>
                <h3 className="mt-4 text-lg font-bold tracking-tight">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="animate-fade-up relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-purple-800 bg-[length:200%_200%] animate-gradient-x px-8 py-16 text-center text-white shadow-lift">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-2xl animate-float"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-white/10 blur-2xl animate-float-slow"
          />

          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Ready to ship your first page?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/80">
              Create an account and generate a full landing page in under a minute.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/register"
                className="ui-btn ui-btn--lg bg-white text-brand-700 hover:bg-brand-50"
              >
                Create free account
              </Link>
              <Link
                to="/login"
                className="ui-btn ui-btn--lg border border-white/40 text-white hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-ink-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-ink-500">
            © {new Date().getFullYear()} LP Builder. Built with the MERN stack.
          </p>
          <div className="flex items-center gap-6">
            <Link to="/login" className="ui-navlink">
              Login
            </Link>
            <Link to="/register" className="ui-navlink">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
