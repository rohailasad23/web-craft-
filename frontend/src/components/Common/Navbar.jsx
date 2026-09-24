import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Auth state lives in App.jsx now; no more navigate() + forced reload().
  const handleLogout = () => {
    onLogout?.();
    navigate('/login', { replace: true });
  };

  const isActive = (path) => location.pathname === path;

  const linkCls = (path) =>
    `ui-navlink ${isActive(path) ? 'text-brand-700 font-semibold' : ''}`;

  return (
    <nav className="sticky top-0 z-40 animate-slide-down border-b border-ink-100 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
        <Link to="/dashboard" className="group flex shrink-0 items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm shadow-soft transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110">
            ⚡
          </span>
          <span className="text-lg font-extrabold tracking-tight text-ink-900">LP Builder</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-4">
          <Link to="/dashboard" className={`${linkCls('/dashboard')} hidden sm:block`}>
            Dashboard
          </Link>
          <Link
            to="/generate"
            className={`ui-btn ui-btn--soft !px-3.5 !py-2 text-sm ${
              isActive('/generate') ? '!bg-brand-600 !text-white' : ''
            }`}
          >
            <span aria-hidden>＋</span>
            New Page
          </Link>

          {user?.name && (
            <span className="hidden items-center gap-2 rounded-full border border-ink-200 bg-ink-50 py-1 pl-1 pr-3 text-sm text-ink-700 md:flex">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
                {user.name.trim().charAt(0).toUpperCase()}
              </span>
              {user.name}
            </span>
          )}

          <button
            onClick={handleLogout}
            className="ui-btn ui-btn--ghost !px-3 !py-2 text-sm hover:!border-red-200 hover:!bg-red-50 hover:!text-red-600"
            type="button"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
