import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../lib/session';
import { initials } from '../../lib/format';

const BASE_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/templates', label: 'Templates' },
];

// Only ever shown to visitors who are not signed in (spec §16).
const SIGNED_OUT_EXTRA = [{ to: '/developers', label: 'Developers' }];

const USER_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/downloads', label: 'My Downloads' },
];

const DEVELOPER_LINKS = [
  { to: '/developer', label: 'Developer Dashboard' },
  { to: '/developer/templates', label: 'My Templates' },
  { to: '/developer/upload', label: 'Upload Template' },
];

const PROFILE_LINK = { to: '/profile', label: 'Profile' };

/**
 * Responsive, role-aware navbar (spec §16).
 *
 * The three link sets match the spec exactly, so developer-only links are
 * never rendered for a normal user -- and ProtectedRoute still rejects those
 * URLs if someone types them by hand.
 */
export default function Navbar() {
  const { isAuthenticated, user, logout } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const navRef = useRef(null);

  // Publish the nav's real height as --nav-h. Viewport-fit screens (the auth
  // forms) subtract it from 100dvh, so anything that changes it -- a wider
  // label set, text zoom, the mobile drawer opening -- is picked up instead
  // of leaving the page a few pixels too tall (a scrollbar) or too short
  // (content sliding under the nav).
  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const sync = () => {
      document.documentElement.style.setProperty('--nav-h', `${el.offsetHeight}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const isDeveloper = user?.role === 'developer' || user?.role === 'admin';

  const navLinks = !isAuthenticated
    ? [...BASE_LINKS, ...SIGNED_OUT_EXTRA]
    : isDeveloper
      ? [...BASE_LINKS, ...DEVELOPER_LINKS, PROFILE_LINK]
      : [...BASE_LINKS, ...USER_LINKS, PROFILE_LINK];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const linkCls = (to) => `ui-navlink ${location.pathname === to ? '!text-brand-700 font-semibold' : ''}`;

  const brand = (
    <Link to="/" className="group flex shrink-0 items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm shadow-soft transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110">
        🧩
      </span>
      <span className="text-lg font-extrabold tracking-tight text-ink-900">web craft</span>
    </Link>
  );

  const authButtons = isAuthenticated ? (
    <div className="flex items-center gap-2.5">
      <span className="hidden items-center gap-2 rounded-full border border-ink-200 bg-ink-50 py-1 pl-1 pr-3 text-sm text-ink-700 md:flex">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
          {initials(user?.name)}
        </span>
        <span className="max-w-[9rem] truncate">{user?.name}</span>
      </span>
      <button
        type="button"
        onClick={handleLogout}
        className="ui-btn ui-btn--ghost !px-3 !py-2 text-sm hover:!border-red-200 hover:!bg-red-50 hover:!text-red-600"
      >
        Logout
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Link to="/login" className="ui-btn ui-btn--ghost !px-3.5 !py-2 text-sm">
        Login
      </Link>
      <Link to="/register" className="ui-btn ui-btn--primary !px-3.5 !py-2 text-sm">
        Register
      </Link>
    </div>
  );

  return (
    <nav
      ref={navRef}
      className="sticky top-0 z-40 animate-slide-down border-b border-ink-100 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/70"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
        {brand}

        {/* Desktop */}
        <div className="hidden items-center gap-5 lg:flex">
          {navLinks.map((l) => (
            <Link key={l.to} to={l.to} className={linkCls(l.to)}>
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden lg:block">{authButtons}</div>

        {/* Mobile trigger */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="ui-btn ui-btn--ghost !px-3 !py-2 lg:hidden"
        >
          <span aria-hidden>{open ? '✕' : '☰'}</span>
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="animate-slide-down border-t border-ink-100 bg-white px-5 pb-5 pt-3 lg:hidden">
          <div className="stagger flex flex-col gap-1">
            {[...navLinks].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  location.pathname === l.to
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-700 hover:bg-ink-50 hover:text-brand-700'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div className="mt-4 border-t border-ink-100 pt-4">{authButtons}</div>
        </div>
      )}
    </nav>
  );
}
