import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useSeo } from '../../lib/seo';

const ROLE_OPTIONS = [
  { value: 'user', icon: '👤', title: 'Downloader' },
  { value: 'developer', icon: '🛠', title: 'Developer' },
];

/**
 * Register (spec §3, §22 "How to become a developer").
 *
 * The account type the visitor picks here is sent as `role`, and the server
 * only ever accepts `user` or `developer` -- `admin` is coerced back to `user`
 * there, so no crafted request can create an administrator.
 */
export default function Register({ onAuth }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Spec §15 -- same reasoning as the sign-in form.
  useSeo({
    title: 'Create an account — web craft',
    description: 'Join web craft to save templates, download the source, and publish your own.',
    path: '/register',
    noindex: true,
  });
  const mounted = useRef(true);

  // StrictMode mounts, unmounts and mounts again in dev, so the flag has
  // to be claimed on mount -- not only released on cleanup -- otherwise
  // the success redirect below would never fire.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || done) return;

    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Please fill in name, email and password');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/api/auth/register', { ...form, role });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      onAuth?.(res.data.user, res.data.token);

      // Normal -> Loading -> Success (anim guide §17): show the green
      // "Account created" confirmation before we move to the dashboard.
      setLoading(false);
      setDone(true);
      window.setTimeout(() => {
        if (mounted.current) navigate('/dashboard', { replace: true });
      }, 480);
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed'));
      setLoading(false);
    }
  };

  /* Same viewport-fit shell as Login: the column is exactly 100dvh minus the
     sticky navbar, so this page -- the taller of the two -- still never grows
     a scrollbar. Both account fields sit side by side at every width, which
     keeps the composition identical on desktop and mobile instead of stacking
     into a long, scrolling form on phones. */
  return (
    <div className="h-[calc(100dvh_-_var(--nav-h))] overflow-y-auto overscroll-contain px-5 py-3 sm:px-6">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center">
        <div className="animate-fade-up">
          <h1 className="ui-title text-2xl sm:text-3xl">Join web craft</h1>
          {/* The error takes the subtitle's place so validation never pushes
              the card past the bottom of the screen. */}
          {error ? (
            <div className="ui-alert ui-alert--error mt-2 !px-3.5 !py-2 text-xs" role="alert">
              {error}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              Download free templates, or publish your own.
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="ui-card mt-4 space-y-3 p-5 animate-fade-up [animation-delay:.08s]"
          noValidate
        >
          {/* account type (spec §4 -- never `admin`) */}
          <fieldset>
            <legend className="ui-label !mb-1">I want to join as…</legend>
            <div className="stagger grid grid-cols-2 gap-2.5">
              {ROLE_OPTIONS.map((option) => {
                const active = role === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRole(option.value)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left transition-all duration-300 ${
                      active
                        ? 'border-brand-600 bg-brand-50 shadow-soft'
                        : 'border-ink-200 bg-white hover:-translate-y-0.5 hover:border-brand-300'
                    }`}
                  >
                    <span aria-hidden className="text-base leading-none">
                      {option.icon}
                    </span>
                    <span className="text-sm font-bold text-ink-900">{option.title}</span>
                    {active && <span className="ml-auto text-sm font-bold text-brand-600">✓</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Two columns at every breakpoint: same layout on a phone and on a
              desktop, and the whole form stays inside one screen. */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="name" className="ui-label !mb-1">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={update('name')}
                placeholder="Your name"
                maxLength={80}
                className="ui-input"
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="ui-label !mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={update('email')}
                placeholder="you@example.com"
                className="ui-input"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="ui-label !mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={update('password')}
                  placeholder="••••••"
                  minLength={6}
                  className="ui-input !pr-16"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="ui-label !mb-1">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
                placeholder="Repeat it"
                minLength={6}
                className="ui-input"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`ui-btn ui-btn--block ${done ? 'ui-btn--success' : 'ui-btn--primary'}`}
          >
            {/* Label crossfades between states rather than snapping (§17). */}
            <span key={done ? 'done' : loading ? 'loading' : 'idle'} className="inline-flex animate-fade-quick items-center gap-2">
              {loading ? (
                <>
                  <span className="ui-spinner" aria-hidden /> Creating account…
                </>
              ) : done ? (
                <>
                  <span aria-hidden>✓</span> Account created
                </>
              ) : (
                'Create account'
              )}
            </span>
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-500 animate-fade-in">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
