import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useToast } from '../../components/Common/Toast';
import { useConfirm } from '../../components/Common/ConfirmDialog';
import { RowSkeleton } from '../../components/Common/Skeletons';

const ANNOUNCEMENT_TYPES = [
  { value: 'information', label: 'Information' },
  { value: 'update', label: 'Update' },
  { value: 'warning', label: 'Warning' },
  { value: 'maintenance', label: 'Maintenance' },
];

/** Same four tones the public banner uses, expressed as badge colours. */
const TYPE_CLS = {
  information: '!bg-sky-50 !text-sky-700',
  update: '!bg-brand-50 !text-brand-700',
  warning: '!bg-amber-50 !text-amber-700',
  maintenance: '!bg-red-50 !text-red-700',
};

const TRENDING_OPTIONS = [
  { value: 'auto', label: 'Auto (follow real activity)' },
  { value: 'force', label: 'Force on' },
  { value: 'off', label: 'Never show' },
];

const EMPTY_FORM = {
  title: '',
  message: '',
  type: 'information',
  startsAt: '',
  endsAt: '',
  enabled: true,
};

function titleCaseKey(key) {
  return String(key || '').charAt(0).toUpperCase() + String(key || '').slice(1);
}

/**
 * /admin/content -- §3's homepage layout, §1/§2's featured shelf and trending
 * overrides, §4's spotlight picks and §13's announcements, all on one screen.
 *
 * Sections and spotlight are loaded from GET /api/admin/content. Featured and
 * trending are read from GET /api/admin/templates because /content does not
 * carry them: the template list is the one admin payload that already ships
 * `featured`, `featuredOrder` and `trendingOverride` for every row, so no
 * endpoint has to be invented to edit them.
 *
 * Nothing here is optimistic: a mutation toasts the server's own message and
 * refetches, so what is on screen is always what was stored.
 */
export default function AdminContent() {
  const [content, setContent] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [announcements, setAnnouncements] = useState(null);
  const [draft, setDraft] = useState([]);
  const [spotDrafts, setSpotDrafts] = useState({});
  const [orderDrafts, setOrderDrafts] = useState({});
  const [addId, setAddId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const draftsFrom = (spotlight) =>
    Object.fromEntries(
      (spotlight || []).map((u) => [
        u.id,
        {
          blurb: u.spotlight?.blurb || '',
          image: u.spotlight?.image || '',
          priority: u.spotlight?.priority ?? 0,
        },
      ])
    );

  const applyContent = (data) => {
    const spotlight = data.spotlight || [];
    setContent(data);
    setDraft(data.sections || []);
    setSpotDrafts(draftsFrom(spotlight));
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [c, t, a] = await Promise.all([
        api.get('/api/admin/content'),
        api.get('/api/admin/templates'),
        api.get('/api/admin/announcements'),
      ]);
      applyContent(c.data);
      setTemplates(t.data.templates || []);
      setAnnouncements(a.data.announcements || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load the content controls'));
      setTemplates(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // One load on mount; every action below refetches only what it touched,
    // so a half-typed announcement is never wiped by a spotlight save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshTemplates = async () => {
    const res = await api.get('/api/admin/templates');
    setTemplates(res.data.templates || []);
  };

  const refreshAnnouncements = async () => {
    const res = await api.get('/api/admin/announcements');
    setAnnouncements(res.data.announcements || []);
  };

  // Only the spotlight slice is replaced: the section draft above may still
  // hold unsaved edits, and a spotlight save must not silently discard them.
  const refreshSpotlight = async () => {
    const res = await api.get('/api/admin/content');
    const spotlight = res.data.spotlight || [];
    setContent((prev) => ({ ...(prev || {}), ...res.data }));
    setSpotDrafts(draftsFrom(spotlight));
  };

  const run = async (key, action, fallback) => {
    setBusy(key);
    try {
      const res = await action();
      toast.success(res?.data?.message || fallback);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  };

  /* ------------------------------------------------------- §3 sections */

  const updateSection = (key, patch) =>
    setDraft((rows) => rows.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const saveSections = () =>
    run(
      'sections',
      () =>
        api.put('/api/admin/content/sections', {
          sections: draft.map((s) => ({
            key: s.key,
            enabled: s.enabled !== false,
            order: Number(s.order) || 0,
            title: String(s.title || '').trim(),
            blurb: String(s.blurb || '').trim(),
          })),
        }),
      'Homepage layout updated'
    );

  /* ------------------------------------------------- §1 featured shelf */

  const featured = (templates || []).filter((t) => t.featured);
  const candidates = (templates || []).filter((t) => !t.featured && t.status === 'approved');

  const removeFeatured = (t) =>
    run(`feat:${t._id}`, () => api.patch(`/api/admin/templates/${t._id}/featured`, { featured: false }), 'Removed from featured');

  const addFeatured = () => {
    const t = candidates.find((c) => c._id === addId);
    if (!t) return;
    run(`feat:${t._id}`, async () => {
      const res = await api.patch(`/api/admin/templates/${t._id}/featured`, { featured: true });
      await refreshTemplates();
      setAddId('');
      return res;
    }, 'Added to featured');
  };

  const commitOrder = (t) => {
    const raw = orderDrafts[t._id];
    if (raw === undefined) return;
    const order = Number(raw);
    setOrderDrafts((prev) => {
      const next = { ...prev };
      delete next[t._id];
      return next;
    });
    if (!Number.isFinite(order) || order === Number(t.featuredOrder)) return;
    run(`feat:${t._id}`, async () => {
      const res = await api.patch(`/api/admin/templates/${t._id}/featured`, { featured: true, order });
      await refreshTemplates();
      return res;
    }, 'Featured order updated');
  };

  /* ---------------------------------------------------- §2 trending */

  const overridden = (templates || []).filter(
    (t) => t.trendingOverride && t.trendingOverride !== 'auto'
  );

  const setTrending = (t, value) =>
    run(
      `trend:${t._id}`,
      async () => {
        const res = await api.patch(`/api/admin/templates/${t._id}/trending`, {
          trendingOverride: value,
        });
        await refreshTemplates();
        return res;
      },
      `Trending set to ${value}`
    );

  /* ------------------------------------------------ §13 announcements */

  const createAnnouncement = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      toast.error('A title and a message are required');
      return;
    }
    setBusy('ann:new');
    try {
      const body = {
        title: form.title.trim(),
        message: form.message.trim(),
        type: form.type,
        enabled: form.enabled,
      };
      // Absent means "default to now" server-side; an empty end field means
      // "no end date", which is a value the API distinguishes from missing.
      if (form.startsAt) body.startsAt = form.startsAt;
      if (form.endsAt) body.endsAt = form.endsAt;
      await api.post('/api/admin/announcements', body);
      toast.success('Announcement created');
      setForm(EMPTY_FORM);
      await refreshAnnouncements();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not create the announcement'));
    } finally {
      setBusy(null);
    }
  };

  const toggleAnnouncement = (a) =>
    run(
      `ann:${a._id}`,
      async () => {
        const res = await api.patch(`/api/admin/announcements/${a._id}`, { enabled: !a.enabled });
        await refreshAnnouncements();
        return res;
      },
      !a.enabled ? 'Announcement is live' : 'Announcement switched off'
    );

  const deleteAnnouncement = async (a) => {
    const ok = await confirm({
      title: `Delete “${a.title}”?`,
      body: 'The announcement disappears from the site for everyone. It cannot be brought back, and the history stays in the audit log.',
      confirmLabel: 'Delete announcement',
      tone: 'danger',
    });
    if (!ok) return;
    await run(
      `ann:${a._id}`,
      async () => {
        const res = await api.delete(`/api/admin/announcements/${a._id}`);
        await refreshAnnouncements();
        return res;
      },
      'Announcement deleted'
    );
  };

  /* ------------------------------------------------------ §4 spotlight */

  const updateSpotDraft = (id, patch) =>
    setSpotDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));

  const saveSpotlight = (u) =>
    run(
      `spot:${u.id}`,
      async () => {
        const d = spotDrafts[u.id] || {};
        const res = await api.patch(`/api/admin/users/${u.id}/spotlight`, {
          blurb: String(d.blurb || '').trim(),
          image: String(d.image || '').trim(),
          priority: Number(d.priority) || 0,
        });
        await refreshSpotlight();
        return res;
      },
      'Spotlight updated'
    );

  const removeSpotlight = async (u) => {
    const ok = await confirm({
      title: `Remove ${u.name} from the spotlight?`,
      body: 'They leave the homepage immediately. This list only shows developers who are currently spotlighted, so there is no way to put them back from this screen.',
      confirmLabel: 'Remove from spotlight',
      tone: 'danger',
    });
    if (!ok) return;
    await run(
      `spot:${u.id}`,
      async () => {
        const res = await api.patch(`/api/admin/users/${u.id}/spotlight`, { enabled: false });
        await refreshSpotlight();
        return res;
      },
      'Removed from the spotlight'
    );
  };

  const spotlight = content?.spotlight || [];
  const list = announcements || [];

  return (
    <div>
      {error && (
        <div className="ui-alert ui-alert--error mb-6" role="alert">
          {error}
        </div>
      )}

      <div className="space-y-10">
        {/* ---------------------------------------------------- §3 */}
        <section aria-labelledby="sections-heading">
          <h2 id="sections-heading" className="ui-title text-xl">
            Homepage sections
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">
            Switch a block off, move it up or down, or give it its own heading and blurb. Clearing a
            heading puts the built-in one back.
          </p>

          <div className="mt-4">
            {loading ? (
              <RowSkeleton rows={4} />
            ) : draft.length === 0 ? (
              <div className="ui-card p-8 text-center">
                <p className="text-sm text-ink-500">No homepage sections were returned.</p>
              </div>
            ) : (
              <ul className="ui-card divide-y divide-ink-100 !p-0">
                {draft.map((s) => (
                  <li key={s.key} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-bold text-ink-900">{titleCaseKey(s.key)}</span>
                      <label className="flex items-center gap-2 text-xs font-semibold text-ink-600">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-600"
                          checked={s.enabled !== false}
                          onChange={(e) => updateSection(s.key, { enabled: e.target.checked })}
                          aria-label={`Show the ${s.key} section`}
                        />
                        {s.enabled !== false ? 'Visible' : 'Hidden'}
                      </label>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                          Order
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          value={s.order}
                          onChange={(e) =>
                            updateSection(s.key, {
                              order: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          className="ui-input !py-2 text-sm"
                        />
                      </label>

                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                          Heading
                        </span>
                        <input
                          type="text"
                          maxLength={80}
                          value={s.title}
                          placeholder="Leave empty to use the built-in heading"
                          onChange={(e) => updateSection(s.key, { title: e.target.value })}
                          className="ui-input !py-2 text-sm"
                        />
                        {s.title === '' && (
                          <span className="mt-1 block text-xs text-ink-500">
                            Using the built-in heading.
                          </span>
                        )}
                      </label>

                      <label className="block sm:col-span-3">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                          Blurb
                        </span>
                        <input
                          type="text"
                          maxLength={200}
                          value={s.blurb}
                          placeholder="Optional line shown under the heading"
                          onChange={(e) => updateSection(s.key, { blurb: e.target.value })}
                          className="ui-input !py-2 text-sm"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-500">
              Lower numbers sit higher on the page. The saved layout is what the homepage renders.
            </p>
            <button
              type="button"
              onClick={saveSections}
              disabled={busy === 'sections'}
              className="ui-btn ui-btn--primary !px-4 !py-2 !text-sm"
            >
              {busy === 'sections' ? 'Saving…' : 'Save layout'}
            </button>
          </div>
        </section>

        {/* ---------------------------------------------------- §1 */}
        <section aria-labelledby="featured-heading">
          <h2 id="featured-heading" className="ui-title text-xl">
            Featured templates
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">
            The homepage shelf. The number you set decides the order; removing a template here only
            takes it off the shelf, never off the site.
          </p>

          <div className="mt-4">
            {loading ? (
              <RowSkeleton rows={3} />
            ) : templates === null ? null : featured.length === 0 ? (
              <div className="ui-card p-8 text-center">
                <p className="text-sm text-ink-500">Nothing is featured yet.</p>
              </div>
            ) : (
              <ul className="ui-card divide-y divide-ink-100 !p-0">
                {featured.map((t) => (
                  <li key={t._id} className="flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/templates/${t.slug}`}
                        className="block truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
                      >
                        {t.title}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        {t.authorName || 'Unknown'} · {t.status}
                      </p>
                    </div>

                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                      <label className="flex items-center gap-2 text-xs font-semibold text-ink-600">
                        Order
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          value={orderDrafts[t._id] ?? t.featuredOrder ?? 0}
                          onChange={(e) =>
                            setOrderDrafts((prev) => ({ ...prev, [t._id]: e.target.value }))
                          }
                          onBlur={() => commitOrder(t)}
                          aria-label={`Featured order for ${t.title}`}
                          className="ui-input !w-20 !py-1.5 !text-xs"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeFeatured(t)}
                        disabled={busy === `feat:${t._id}`}
                        className="ui-btn ui-btn--ghost !px-3 !py-1.5 !text-xs hover:!border-red-200 hover:!bg-red-50 hover:!text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {templates !== null && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 sm:max-w-sm">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                  Add to featured
                </span>
                <select
                  value={addId}
                  onChange={(e) => setAddId(e.target.value)}
                  className="ui-input !w-auto !py-2 text-sm"
                >
                  <option value="">Approved templates…</option>
                  {candidates.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={addFeatured}
                disabled={!addId || busy === `feat:${addId}`}
                className="ui-btn ui-btn--soft !px-4 !py-2 !text-sm"
              >
                Add
              </button>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------- §2 */}
        <section aria-labelledby="trending-heading">
          <h2 id="trending-heading" className="ui-title text-xl">
            Trending overrides
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">
            Force = always shown (it sorts after templates with real activity) · Off = never shown ·
            Auto = follows real activity, which is the default for everything else.
          </p>

          <div className="mt-4">
            {templates === null ? null : overridden.length === 0 ? (
              <div className="ui-card p-8 text-center">
                <p className="text-sm text-ink-500">
                  No overrides right now — every template follows real activity.
                </p>
              </div>
            ) : (
              <ul className="ui-card divide-y divide-ink-100 !p-0">
                {overridden.map((t) => (
                  <li key={t._id} className="flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/templates/${t.slug}`}
                        className="block truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
                      >
                        {t.title}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        {t.authorName || 'Unknown'}
                      </p>
                    </div>
                    <select
                      value={t.trendingOverride}
                      disabled={busy === `trend:${t._id}`}
                      aria-label={`Trending override for ${t.title}`}
                      onChange={(e) => setTrending(t, e.target.value)}
                      className="ui-input !w-auto !py-1.5 !text-xs"
                    >
                      {TRENDING_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* --------------------------------------------------- §13 */}
        <section aria-labelledby="announcements-heading">
          <h2 id="announcements-heading" className="ui-title text-xl">
            Announcements
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">
            Platform-wide notices shown above the navigation. Only an enabled announcement inside its
            window is ever handed to the public site.
          </p>

          <form onSubmit={createAnnouncement} className="ui-card mt-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                  Title
                </span>
                <input
                  type="text"
                  maxLength={120}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Scheduled maintenance on Saturday"
                  className="ui-input !py-2 text-sm"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                  Message
                </span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="What should every visitor read?"
                  className="ui-input text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                  Type
                </span>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="ui-input !w-full !py-2 text-sm"
                >
                  {ANNOUNCEMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                  Starts
                </span>
                {/* datetime-local sends local wall-clock text, which new Date()
                    parses as local time too -- so the raw value goes straight
                    to the API with no timezone conversion to get wrong. */}
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  className="ui-input !py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                  Ends
                </span>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  className="ui-input !py-2 text-sm"
                />
              </label>

              <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-ink-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-500">
                Leave the dates empty to start now and run until you switch it off.
              </p>
              <button
                type="submit"
                disabled={busy === 'ann:new'}
                className="ui-btn ui-btn--primary !px-4 !py-2 !text-sm"
              >
                {busy === 'ann:new' ? 'Creating…' : 'Create announcement'}
              </button>
            </div>
          </form>

          <div className="mt-4">
            {loading ? (
              <RowSkeleton rows={3} />
            ) : list.length === 0 ? (
              <div className="ui-card p-8 text-center">
                <p className="text-sm text-ink-500">No announcements yet.</p>
              </div>
            ) : (
              <ul className="ui-card divide-y divide-ink-100 !p-0">
                {list.map((a) => (
                  <li key={a._id} className="flex flex-wrap items-start gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`ui-badge ${TYPE_CLS[a.type] || ''}`}>{a.type}</span>
                        {!a.enabled && (
                          <span className="ui-badge !bg-ink-100 !text-ink-600">off</span>
                        )}
                        <span className="text-sm font-bold text-ink-900">{a.title}</span>
                      </div>
                      <p className="mt-1 max-w-2xl whitespace-pre-line break-words text-sm leading-relaxed text-ink-600">
                        {a.message}
                      </p>
                      <p className="mt-1.5 text-xs text-ink-500">
                        Starts {formatDate(a.startsAt) || 'immediately'} ·{' '}
                        {a.endsAt ? `ends ${formatDate(a.endsAt)}` : 'no end date'} · added{' '}
                        {formatDate(a.createdAt)}
                      </p>
                    </div>

                    <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                      <label className="flex items-center gap-2 text-xs font-semibold text-ink-600">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-600"
                          checked={a.enabled}
                          disabled={busy === `ann:${a._id}`}
                          onChange={() => toggleAnnouncement(a)}
                          aria-label={`Enable ${a.title}`}
                        />
                        Live
                      </label>
                      <button
                        type="button"
                        onClick={() => deleteAnnouncement(a)}
                        disabled={busy === `ann:${a._id}`}
                        className="ui-btn ui-btn--ghost !px-3 !py-1.5 !text-xs hover:!border-red-200 hover:!bg-red-50 hover:!text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------- §4 */}
        <section aria-labelledby="spotlight-heading">
          <h2 id="spotlight-heading" className="ui-title text-xl">
            Spotlight developers
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">
            The developers on the homepage spotlight, lowest priority number first. Blurb, image and
            priority are saved per row.
          </p>

          <div className="mt-4">
            {loading ? (
              <RowSkeleton rows={3} />
            ) : spotlight.length === 0 ? (
              <div className="ui-card p-8 text-center">
                <p className="text-sm text-ink-500">Nobody is in the spotlight right now.</p>
              </div>
            ) : (
              <ul className="ui-card divide-y divide-ink-100 !p-0">
                {spotlight.map((u) => {
                  const d = spotDrafts[u.id] || {};
                  return (
                    <li key={u.id} className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-bold text-ink-900">{u.name}</span>
                          {u.trustLevel && u.trustLevel !== 'new' && (
                            <span className="ui-badge !bg-brand-50 !text-brand-700">
                              {u.trustLevel}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-ink-500">
                          priority {u.spotlight?.priority ?? 0}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                            Priority
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={999}
                            value={d.priority ?? 0}
                            onChange={(e) =>
                              updateSpotDraft(u.id, {
                                priority: e.target.value === '' ? '' : Number(e.target.value),
                              })
                            }
                            className="ui-input !py-2 text-sm"
                          />
                        </label>

                        <label className="block sm:col-span-2">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                            Image URL
                          </span>
                          <input
                            type="text"
                            maxLength={500}
                            value={d.image || ''}
                            placeholder="/uploads/… or https://…"
                            onChange={(e) => updateSpotDraft(u.id, { image: e.target.value })}
                            className="ui-input !py-2 text-sm"
                          />
                        </label>

                        <label className="block sm:col-span-3">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">
                            Spotlight text
                          </span>
                          <input
                            type="text"
                            maxLength={300}
                            value={d.blurb || ''}
                            placeholder="At least 10 characters, shown on their card"
                            onChange={(e) => updateSpotDraft(u.id, { blurb: e.target.value })}
                            className="ui-input !py-2 text-sm"
                          />
                        </label>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => saveSpotlight(u)}
                          disabled={busy === `spot:${u.id}`}
                          className="ui-btn ui-btn--primary !px-3 !py-1.5 !text-xs"
                        >
                          {busy === `spot:${u.id}` ? 'Saving…' : 'Save row'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSpotlight(u)}
                          disabled={busy === `spot:${u.id}`}
                          className="ui-btn ui-btn--ghost !px-3 !py-1.5 !text-xs hover:!border-red-200 hover:!bg-red-50 hover:!text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
