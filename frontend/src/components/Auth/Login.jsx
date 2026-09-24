import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';

export default function Login({ onAuth }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/api/auth/login', { email, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      onAuth?.(res.data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-4 py-12 sm:px-6">
      {/* backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-brand-300/40 blur-3xl animate-float" />
        <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-purple-300/40 blur-3xl animate-float-slow" />
      </div>

      <div className="relative grid w-full gap-8 lg:grid-cols-2 lg:items-center">
        {/* Brand panel */}
        <div className="hidden lg:block animate-slide-right">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg shadow-soft">
              ⚡
            </span>
            <span className="text-lg font-extrabold tracking-tight">LP Builder</span>
          </Link>

          <h1 className="ui-title mt-8 text-4xl xl:text-5xl">
            Welcome back.
            <br />
            <span className="bg-gradient-to-r from-brand-500 to-purple-600 bg-clip-text text-transparent">
              Let&apos;s keep building.
            </span>
          </h1>
          <p className="mt-4 max-w-md text-ink-500">
            Sign in to pick up where you left off — your pages, drafts and published sites are
            waiting.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-ink-700">
            {['AI-generated landing pages', 'Visual live editor', 'One-click publishing'].map(
              (item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs text-brand-700">
                    ✓
                  </span>
                  {item}
                </li>
              )
            )}
          </ul>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="ui-card animate-pop-in w-full max-w-md p-7 sm:p-9 lg:justify-self-end">
          <div className="lg:hidden mb-5">
            <Link to="/" className="inline-flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft">
                ⚡
              </span>
              <span className="text-base font-extrabold tracking-tight">LP Builder</span>
            </Link>
          </div>

          <span className="ui-eyebrow">Sign in</span>
          <h2 className="ui-title mt-2 text-2xl">Login to your account</h2>
          <p className="mt-1.5 text-sm text-ink-500">Enter your credentials below.</p>

          {error && (
            <div role="alert" className="ui-alert ui-alert--error mt-5">
              <span aria-hidden>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="stagger mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="ui-label">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                placeholder="you@company.com"
                required
                autoComplete="email"
                className="ui-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="login-password" className="ui-label">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="ui-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="ui-btn ui-btn--primary ui-btn--block ui-btn--lg mt-6"
          >
            {loading && <span className="ui-spinner" aria-hidden />}
            {loading ? 'Signing in…' : 'Login'}
          </button>

          <p className="mt-6 text-center text-sm text-ink-500">
            No account?{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700 transition-colors">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
