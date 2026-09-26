import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../components/Common/Toast';
import { initials } from '../lib/format';
import Footer from '../components/Common/Footer';

// Spec §10 ceilings, mirrored from backend/models/User.js so the form caps
// the list itself instead of finding out from a 400 after the round trip.
const MAX_SKILLS = 12;
const MAX_LINKS = 6;

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

  // Spec §10 -- the developer half of the profile, kept in its own object so
  // the section can be skipped for a normal account without the payload
  // carrying four fields the server would only store back as blanks.
  const [dev, setDev] = useState({
    skills: user?.skills || [],
    website: user?.website || '',
    github: user?.github || '',
    socialLinks: user?.socialLinks || [],
  });
  const [skillDraft, setSkillDraft] = useState('');

  const isDeveloper = user?.role === 'developer' || user?.role === 'admin';

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const updatePw = (field) => (e) => setPw({ ...pw, [field]: e.target.value });
  const updateDev = (field) => (e) => setDev({ ...dev, [field]: e.target.value });

  // Skills are a chip list, same interaction as the upload form's tags: type,
  // Enter or Add, click a chip to take it off. Deduplicated case-insensitively
  // so "React" and "react" cannot both sit in the list.
  const addSkill = () => {
    const s = skillDraft.replace(/\s+/g, ' ').trim().slice(0, 40);
    setSkillDraft('');
    if (!s || dev.skills.length >= MAX_SKILLS) return;
    if (dev.skills.some((k) => k.toLowerCase() === s.toLowerCase())) return;
    setDev({ ...dev, skills: [...dev.skills, s] });
  };
  const removeSkill = (skill) =>
    setDev({ ...dev, skills: dev.skills.filter((s) => s !== skill) });

  const setLink = (index, field, value) =>
    setDev({
      ...dev,
      socialLinks: dev.socialLinks.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    });
  const addLink = () =>
    setDev({ ...dev, socialLinks: [...dev.socialLinks, { label: '', url: '' }] });
  const removeLink = (index) =>
    setDev({ ...dev, socialLinks: dev.socialLinks.filter((_, i) => i !== index) });

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
      const body = {
        name: form.name.trim(),
        bio: form.bio.trim(),
        avatar: form.avatar.trim(),
      };

      // Spec §10: only sent for an account that can actually show these.
      // Rows left entirely blank are dropped rather than sent to be refused;
      // a half-filled row is kept, because the server has the clearer
      // message for it ("Every social link needs a name").
      if (isDeveloper) {
        body.skills = dev.skills;
        body.website = dev.website.trim();
        body.github = dev.github.trim();
        body.socialLinks = dev.socialLinks
          .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
          .filter((l) => l.label || l.url);
      }

      await api.put('/api/users/me', body);
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

          {/* ------------------------------------ developer profile (§10) */}
          {isDeveloper && (
            <section className="ui-card space-y-6 p-6">
              <div>
                <h2 className="text-base font-bold text-ink-900">Developer profile</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                  What shows on your public developer page. Everything here is optional — leave a
                  field empty and it simply does not appear.
                </p>
              </div>

              {/* --------------------------------------------------- skills */}
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="skill" className="ui-label">
                    Skills
                  </label>
                  {/* Live count, so the cap is never a surprise. */}
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      dev.skills.length >= MAX_SKILLS ? 'text-red-600' : 'text-ink-500'
                    }`}
                    aria-live="polite"
                  >
                    {dev.skills.length}/{MAX_SKILLS}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    id="skill"
                    type="text"
                    value={skillDraft}
                    onChange={(e) => setSkillDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter adds the chip. Without this it would submit the
                      // whole profile form from a field that only holds one word.
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                    maxLength={40}
                    placeholder="React, Figma, SCSS…"
                    aria-describedby="skill-help"
                    className="ui-input"
                  />
                  <button type="button" onClick={addSkill} className="ui-btn ui-btn--soft shrink-0">
                    Add
                  </button>
                </div>
                <p id="skill-help" className="mt-2 text-xs text-ink-500">
                  The things you actually work with. Up to {MAX_SKILLS}.
                </p>

                {dev.skills.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {dev.skills.map((skill) => (
                      <li key={skill}>
                        <button
                          type="button"
                          onClick={() => removeSkill(skill)}
                          aria-label={`Remove skill ${skill}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        >
                          {skill} <span aria-hidden>×</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ------------------------------------------ website / github */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="website" className="ui-label">
                    Website <span className="font-normal text-ink-500">(optional)</span>
                  </label>
                  <input
                    id="website"
                    type="url"
                    value={dev.website}
                    onChange={updateDev('website')}
                    maxLength={300}
                    placeholder="https://yoursite.com"
                    aria-describedby="website-help"
                    className="ui-input"
                  />
                  <p id="website-help" className="mt-2 text-xs text-ink-500">
                    Saved exactly as typed, so it has to be a full http(s) address.
                  </p>
                </div>
                <div>
                  <label htmlFor="github" className="ui-label">
                    GitHub <span className="font-normal text-ink-500">(optional)</span>
                  </label>
                  <input
                    id="github"
                    type="url"
                    value={dev.github}
                    onChange={updateDev('github')}
                    maxLength={300}
                    placeholder="https://github.com/username"
                    className="ui-input"
                  />
                </div>
              </div>

              {/* ---------------------------------------------- social links */}
              <fieldset className="space-y-3">
                <legend className="ui-label flex w-full items-baseline justify-between gap-3">
                  <span>Social links</span>
                  <span
                    className="text-xs font-semibold tabular-nums text-ink-500"
                    aria-live="polite"
                  >
                    {dev.socialLinks.length}/{MAX_LINKS}
                  </span>
                </legend>

                {dev.socialLinks.map((link, i) => (
                  <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
                    <div className="min-w-0 sm:w-44">
                      <label htmlFor={`link-label-${i}`} className="sr-only">
                        Link name {i + 1}
                      </label>
                      <input
                        id={`link-label-${i}`}
                        type="text"
                        value={link.label}
                        onChange={(e) => setLink(i, 'label', e.target.value)}
                        maxLength={30}
                        placeholder="Twitter"
                        className="ui-input"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`link-url-${i}`} className="sr-only">
                        Link address {i + 1}
                      </label>
                      <input
                        id={`link-url-${i}`}
                        type="url"
                        value={link.url}
                        onChange={(e) => setLink(i, 'url', e.target.value)}
                        maxLength={300}
                        placeholder="https://…"
                        className="ui-input"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLink(i)}
                      aria-label={`Remove link ${link.label || i + 1}`}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white px-3.5 text-ink-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      <span aria-hidden>×</span>
                    </button>
                  </div>
                ))}

                <p className="text-xs text-ink-500">
                  Name the site and paste the full address — both are needed before it appears.
                </p>

                <button
                  type="button"
                  onClick={addLink}
                  disabled={dev.socialLinks.length >= MAX_LINKS}
                  className="ui-btn ui-btn--soft px-4 py-2 text-sm disabled:opacity-50"
                >
                  Add social link
                </button>
              </fieldset>
            </section>
          )}

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
