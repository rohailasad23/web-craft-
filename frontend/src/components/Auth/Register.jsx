import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';

const ROLE_OPTIONS = [
  {
    value: 'user',
    icon: '👤',
    title: 'Downloader',
    blurb: 'Browse, preview and download templates.',
  },
  {
    value: 'developer',
    icon: '🛠',
    title: 'Developer',
    blurb: 'Everything above, plus upload and manage your own templates.',
  },
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

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-5 py-14 sm:px-6">
      <div className="animate-fade-up">
        <Link to="/" className="mb-8 flex w-fit items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg shadow-soft">
            🧩
          </span>
          <span className="text-xl font-extrabold tracking-tight text-ink-900">web craft</span>
        </Link>

        <span className="ui-eyebrow">Create account</span>
        <h1 className="ui-title mt-2 text-3xl">Join web craft</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Download templates straight away, or publish your own and let the community use it.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="ui-card mt-8 space-y-5 p-6 animate-fade-up [animation-delay:.08s]"
        noValidate
      >
        {error && (
          <div className="ui-alert ui-alert--error" role="alert">
            {error}
          </div>
        )}

        {/* account type (spec §4 -- never `admin`) */}
        <fieldset>
          <legend className="ui-label">I want to…</legend>
          <div className="stagger grid gap-2.5 sm:grid-cols-2">
            {ROLE_OPTIONS.map((option) => {
              const active = role === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRole(option.value)}
                  aria-pressed={active}
                  className={`rounded-xl border-2 p-3.5 text-left transition-all duration-300 ${
                    active
                      ? 'border-brand-600 bg-brand-50 shadow-soft'
                      : 'border-ink-200 bg-white hover:-translate-y-0.5 hover:border-brand-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="text-base">
                      {option.icon}
                    </span>
                    <span className="text-sm font-bold text-ink-900">{option.title}</span>
                    {active && <span className="ml-auto text-sm font-bold text-brand-600">✓</span>}
                  </span>
                  <span className="mt-1.5 block text-xs leading-relaxed text-ink-500">
                    {option.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="name" className="ui-label">
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
              placeholder="At least 6 characters"
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
          <label htmlFor="confirmPassword" className="ui-label">
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

        <button
          type="submit"
          disabled={loading}
          className={`ui-btn ui-btn--block ui-btn--lg ${
            done ? 'ui-btn--success' : 'ui-btn--primary'
          }`}
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

        <p className="text-center text-xs leading-relaxed text-ink-500">
          {role === 'developer'
            ? 'You can switch back to a normal account any time from Profile settings.'
            : 'You can upgrade to a developer account later from your dashboard.'}
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500 animate-fade-in">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
