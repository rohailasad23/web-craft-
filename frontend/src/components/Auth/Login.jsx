import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';

/** Sign in (spec §5). Preserves the URL the visitor was heading for. */
export default function Login({ onAuth }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

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

      // Go wherever the link intended; fall back to the dashboard.
      const next = location.state?.from?.pathname || '/dashboard';
      navigate(next, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-5 py-14 sm:px-6">
      <div className="animate-fade-up">
        <Link to="/" className="mb-8 flex w-fit items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg shadow-soft">
            🧩
          </span>
          <span className="text-xl font-extrabold tracking-tight text-ink-900">web craft</span>
        </Link>

        <span className="ui-eyebrow">Welcome back</span>
        <h1 className="ui-title mt-2 text-3xl">Sign in to your account</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Download templates you have saved, manage your submissions, and pick up where you left off.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="ui-card mt-8 space-y-5 p-6 animate-fade-up [animation-delay:.08s]" noValidate>
        {error && (
          <div className="ui-alert ui-alert--error" role="alert">
            {error}
          </div>
        )}

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

        <button type="submit" disabled={loading} className="ui-btn ui-btn--primary ui-btn--block ui-btn--lg">
          {loading ? (
            <>
              <span className="ui-spinner" aria-hidden /> Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500 animate-fade-in">
        New here?{' '}
        <Link to="/register" className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
