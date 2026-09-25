import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';

/** Sign in (spec §5). Preserves the URL the visitor was heading for. */
export default function Login({ onAuth }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

    if (!form.email.trim() || !form.password) {
      setError('Please fill in both fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/api/auth/login', form);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      onAuth?.(res.data.user, res.data.token);

      // Normal -> Loading -> Success (anim guide §17): let the green
      // confirmation land for a beat before we navigate away.
      setLoading(false);
      setDone(true);

      // Go wherever the link intended; fall back to the dashboard.
      const next = location.state?.from?.pathname || '/dashboard';
      window.setTimeout(() => {
        if (mounted.current) navigate(next, { replace: true });
      }, 420);
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed'));
      setLoading(false);
    }
  };

  /* Viewport-fit shell: the sticky navbar owns --nav-h, so this column is
     exactly the window that is left and the document never exceeds 100dvh --
     no scrollbar, no overlap, identical composition on every screen size.
     `min-h-full` (rather than justify-center on the scroller itself) keeps a
     taller-than-expected card fully reachable if a very short window ever has
     to fall back to this container's own scrollbar. */
  return (
    <div className="h-[calc(100dvh_-_var(--nav-h))] overflow-y-auto overscroll-contain px-5 py-3 sm:px-6">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center">
        <div className="animate-fade-up">
          <h1 className="ui-title text-2xl sm:text-3xl">Sign in to your account</h1>
          {/* The error takes the subtitle's place, so an invalid submit never
              grows the page past the viewport. */}
          {error ? (
            <div className="ui-alert ui-alert--error mt-2 !px-3.5 !py-2 text-xs" role="alert">
              {error}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              Welcome back — pick up where you left off.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="ui-card mt-4 space-y-3 p-5 animate-fade-up [animation-delay:.08s]" noValidate>
          <div>
            <label htmlFor="email" className="ui-label">
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
              autoFocus
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="ui-label">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={update('password')}
                placeholder="••••••••"
                className="ui-input !pr-16"
                autoComplete="current-password"
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

          {/* The label crossfades instead of snapping (anim guide §17). */}
          <button
            type="submit"
            disabled={loading}
            className={`ui-btn ui-btn--block ${
              done ? 'ui-btn--success' : 'ui-btn--primary'
            }`}
          >
            <span
              key={done ? 'done' : loading ? 'loading' : 'idle'}
              className="inline-flex animate-fade-quick items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="ui-spinner" aria-hidden /> Signing in…
                </>
              ) : done ? (
                <>
                  <span aria-hidden>✓</span> Signed in
                </>
              ) : (
                'Sign in'
              )}
            </span>
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-500 animate-fade-in">
          New here?{' '}
          <Link to="/register" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
