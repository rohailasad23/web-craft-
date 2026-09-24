import React from 'react';
import { Link } from 'react-router-dom';

const GROUPS = [
  {
    title: 'Explore',
    links: [
      { to: '/', label: 'Home' },
      { to: '/templates', label: 'Templates' },
      { to: '/developers', label: 'Developers' },
    ],
  },
  {
    title: 'Contribute',
    links: [
      { to: '/register', label: 'Become a developer' },
      { to: '/developer/upload', label: 'Upload a template' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/login', label: 'Login' },
      { to: '/register', label: 'Register' },
      { to: '/dashboard', label: 'Dashboard' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-100 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-base shadow-soft">
              🧩
            </span>
            <span className="text-lg font-extrabold tracking-tight text-ink-900">web craft</span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-500">
            Ready-made website templates for developers and creators. Discover, preview, download
            — and share your own.
          </p>
        </div>

        {GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h3 className="text-sm font-bold text-ink-900">{group.title}</h3>
            <ul className="stagger mt-4 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-ink-500 transition-colors hover:text-brand-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-ink-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} web craft. All templates shared by their authors.</span>
          <span>Built with React &amp; MongoDB</span>
        </div>
      </div>
    </footer>
  );
}
