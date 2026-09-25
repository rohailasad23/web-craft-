import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../components/Common/Toast';
import { initials } from '../lib/format';
import Footer from '../components/Common/Footer';

/**
 * /profile -- account settings (spec §5).
 *
 * The form only ever sends `name`, `bio` and `avatar`. `role` is included only
 * to switch between user and developer; the server ignores anything else, so a
 * crafted body cannot make anyone an admin.
 */
export default function Profile() {
  const { user, refresh } = useSession();
  const toast = useToast();

  const [form, setForm] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
    avatar: user?.avatar || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Spec §11 lives in its own <form>: nesting it inside the profile form
  // would be invalid HTML and would submit both at once.
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  const isDeveloper = user?.role === 'developer' || user?.role === 'admin';

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const updatePw = (field) => (e) => setPw({ ...pw, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    if (!form.name.trim()) {
      setError('Name cannot be empty');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.put('/api/users/me', {
        name: form.name.trim(),
        bio: form.bio.trim(),
        avatar: form.avatar.trim(),
      });
      await refresh?.();
      toast.success('Profile updated');
    } catch (err) {
      const msg = getErrorMessage(err, 'Could not save your profile');
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const switchRole = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await api.put('/api/users/me', { role: isDeveloper ? 'user' : 'developer' });
      await refresh?.();
      toast.success(
        isDeveloper ? 'Switched to a normal account' : 'You are now a developer — happy uploading!'
      );
    } catch (err) {
      const msg = getErrorMessage(err, 'Could not change your account type');
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (pwSaving) return;

    if (!pw.current || !pw.next) {
      setPwError('Enter your current password and the new one.');
      return;
    }
    if (pw.next.length < 6) {
      setPwError('The new password must be at least 6 characters.');
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwError('The two new passwords do not match.');
      return;
    }

    setPwSaving(true);
    setPwError('');
    try {
      await api.post('/api/auth/change-password', {
        currentPassword: pw.current,
        newPassword: pw.next,
      });
      // Clearing the fields is the confirmation: nothing is left pre-filled.
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password updated');
    } catch (err) {
      const msg = getErrorMessage(err, 'Could not change your password');
      setPwError(msg);
      toast.error(msg);
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-10 sm:px-6">
        <header className="animate-fade-up">
          <span className="ui-eyebrow">Account</span>
          <h1 className="ui-title mt-2 text-3xl sm:text-4xl">Profile &amp; settings</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Your name and bio appear on your developer profile and next to every template you
            publish.
          </p>
        </header>

        {error && (
          <div className="ui-alert ui-alert--error mt-6" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {/* --------------------------------------------------- avatar */}
          <section className="ui-card p-6">
            <div className="flex flex-wrap items-center gap-5">
              <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-extrabold text-white shadow-soft">
                {initials(form.name || user?.name)}
              </span>
              <div className="min-w-0 flex-1">
                <label htmlFor="avatar" className="ui-label">
                  Avatar URL <span className="font-normal text-ink-500">(optional)</span>
                </label>
                <input
                  id="avatar"
                  type="url"
                  value={form.avatar}
                  onChange={update('avatar')}
                  placeholder="https://…"
                  className="ui-input"
                />
                <p className="mt-2 text-xs text-ink-500">
                  Leave it empty and we show your initials instead.
                </p>
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------- fields */}
          <section className="ui-card space-y-5 p-6">
            <div>
              <label htmlFor="name" className="ui-label">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={update('name')}
                maxLength={80}
                required
                className="ui-input"
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="email" className="ui-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={user?.email || ''}
                disabled
                className="ui-input cursor-not-allowed opacity-60"
                aria-describedby="email-help"
              />
              <p id="email-help" className="mt-2 text-xs text-ink-500">
                Email changes are not supported yet — the address identifies your account.
              </p>
            </div>

            <div>
              <label htmlFor="bio" className="ui-label">
                Bio <span className="font-normal text-ink-500">(optional, max 500 characters)</span>
              </label>
              <textarea
                id="bio"
                value={form.bio}
                onChange={update('bio')}
                rows={4}
                maxLength={500}
                placeholder="A sentence or two about what you build…"
                className="ui-input resize-y"
              />
              <p className="mt-1.5 text-right text-xs tabular-nums text-ink-500">
                {form.bio.length}/500
              </p>
            </div>
          </section>

          {/* ---------------------------------------------- account type */}
          <section className="ui-card p-6">
            <h2 className="text-base font-bold text-ink-900">Account type</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              {isDeveloper
                ? 'You can publish, edit and delete your own templates. Admin rights are granted by an administrator only.'
                : 'Switch to a developer account to upload templates. You can switch back at any time.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span
                className={`ui-badge ${
                  isDeveloper ? '!bg-emerald-50 !text-emerald-700' : '!bg-ink-100 !text-ink-700'
                }`}
              >
                Current: {isDeveloper ? 'Developer' : 'User'}
              </span>
              <button
                type="button"
                onClick={switchRole}
                disabled={saving || user?.role === 'admin'}
                className="ui-btn ui-btn--soft !px-4 !py-2 text-sm disabled:opacity-50"
              >
                {isDeveloper ? 'Switch to normal account' : 'Become a developer'}
              </button>
              {user?.role === 'admin' && (
                <span className="text-xs text-ink-500">Admin accounts cannot switch.</span>
              )}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className="ui-btn ui-btn--primary !px-6 !py-3">
              {saving ? (
                <>
                  <span className="ui-spinner" aria-hidden /> Saving…
                </>
              ) : (
                'Save changes'
              )}
            </button>
            <Link to="/dashboard" className="ui-btn ui-btn--soft !px-5 !py-3">
              Back to dashboard
            </Link>
          </div>
        </form>

        {/* ---------------------------------------- change password (§11) */}
        <form onSubmit={handlePassword} className="ui-card mt-6 space-y-5 p-6">
          <div>
            <h2 className="text-base font-bold text-ink-900">Change password</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              The current password is always required — even while you are signed in — so an
              unattended session cannot take your account over.
            </p>
          </div>

          {pwError && (
            <div className="ui-alert ui-alert--error" role="alert">
              {pwError}
            </div>
          )}

          <div>
            <label htmlFor="current-password" className="ui-label">
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={pw.current}
              onChange={updatePw('current')}
              className="ui-input"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="new-password" className="ui-label">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={pw.next}
                onChange={updatePw('next')}
                className="ui-input"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="ui-label">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={pw.confirm}
                onChange={updatePw('confirm')}
                className="ui-input"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pwSaving}
              className="ui-btn ui-btn--primary !px-6 !py-3"
            >
              {pwSaving ? (
                <>
                  <span className="ui-spinner" aria-hidden /> Updating…
                </>
              ) : (
                'Update password'
              )}
            </button>
            <span className="text-xs text-ink-500">At least 6 characters.</span>
          </div>
        </form>
      </main>

      <Footer />
    </div>
  );
}
