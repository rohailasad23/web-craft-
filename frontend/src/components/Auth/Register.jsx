import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';

export default function Register({ onAuth }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

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
      const res = await api.post('/api/auth/register', form);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      onAuth?.(res.data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-4 py-12 sm:px-6">
      {/* backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 bottom-10 h-96 w-96 rounded-full bg-purple-300/40 blur-3xl animate-float" />
        <div className="absolute -right-24 top-0 h-80 w-80 rounded-full bg-brand-300/40 blur-3xl animate-float-slow" />
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
            Build your first
            <br />
            <span className="bg-gradient-to-r from-brand-500 to-purple-600 bg-clip-text text-transparent">
              page in 60 seconds.
            </span>
          </h1>
          <p className="mt-4 max-w-md text-ink-500">
            One description in, a complete editable landing page out. No design tools, no
            developer, no waiting.
          </p>

          <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
            {[
              ['⚡', 'Instant draft'],
              ['🎨', 'Fully editable'],
              ['🚀', 'One-click publish'],
            ].map(([icon, label]) => (
              <div
                key={label}
                className="ui-card ui-card--hover !rounded-xl p-3.5 text-center transition-all duration-300 hover:!-translate-y-1"
              >
                <div className="text-xl">{icon}</div>
                <div className="mt-1.5 text-xs font-semibold text-ink-700">{label}</div>
              </div>
            ))}
          </div>
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

          <span className="ui-eyebrow">Get started</span>
          <h2 className="ui-title mt-2 text-2xl">Create your account</h2>
          <p className="mt-1.5 text-sm text-ink-500">Free forever — no credit card needed.</p>

          {error && (
            <div role="alert" className="ui-alert ui-alert--error mt-5">
              <span aria-hidden>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="stagger mt-6 space-y-4">
            <div>
              <label htmlFor="reg-name" className="ui-label">
                Name
              </label>
              <input
                id="reg-name"
                type="text"
                placeholder="Your name"
                required
                autoComplete="name"
                className="ui-input"
                value={form.name}
                onChange={update('name')}
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="ui-label">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                placeholder="you@company.com"
                required
                autoComplete="email"
                className="ui-input"
                value={form.email}
                onChange={update('email')}
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="ui-label">
                Password
              </label>
              <input
                id="reg-password"
                type="password"
                placeholder="At least 6 characters"
                required
                autoComplete="new-password"
                minLength={6}
                className="ui-input"
                value={form.password}
                onChange={update('password')}
              />
            </div>

            <div>
              <label htmlFor="reg-confirm" className="ui-label">
                Confirm password
              </label>
              <input
                id="reg-confirm"
                type="password"
                placeholder="Repeat your password"
                required
                autoComplete="new-password"
                className="ui-input"
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="ui-btn ui-btn--primary ui-btn--block ui-btn--lg mt-6"
          >
            {loading && <span className="ui-spinner" aria-hidden />}
            {loading ? 'Creating account…' : 'Register'}
          </button>

          <p className="mt-6 text-center text-sm text-ink-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700 transition-colors">
              Login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
