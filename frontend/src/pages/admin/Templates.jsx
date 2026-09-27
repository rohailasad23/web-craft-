import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatDate, formatCount } from '../../lib/format';
import { useToast } from '../../components/Common/Toast';
import { useConfirm } from '../../components/Common/ConfirmDialog';
import { RowSkeleton } from '../../components/Common/Skeletons';
import Modal from '../../components/Common/Modal';
import AdminNotes from '../../components/Admin/AdminNotes';
import { StatusBadge } from '../developer/Dashboard';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

/* Human labels for the enums that live on the server (models/Template.js). */
const QUALITY_LABELS = {
  unchecked: 'Unchecked',
  quality_checked: 'Quality checked',
  needs_improvement: 'Needs improvement',
  verified: 'Verified',
};

const CHECK_LABELS = {
  responsive: 'Responsive layout',
  working_demo: 'Working demo',
  valid_download: 'Valid download',
  clean_structure: 'Clean code structure',
  documentation: 'Documentation',
  technologies: 'Technologies declared',
  no_suspicious_files: 'No suspicious files',
  screenshots: 'Screenshots',
  license_info: 'Licence information',
};

const STATE_LABELS = { visible: 'Visible', flagged: 'Flagged', hidden: 'Hidden' };

const TRENDING_LABELS = {
  auto: 'Automatic — real activity',
  force: 'Always shown (sorts after real activity)',
  off: 'Never shown',
};

/**
 * /admin/templates -- the moderation queue (spec §8).
 *
 * The selected filter lives in the URL, so "the pending queue" is a link a
 * moderator can share and Back works after opening a template. Approving is a
 * single click because it is reversible (the queue can send it back to
 * pending); rejecting and deleting both confirm first (spec §19).
 */
export default function AdminTemplates() {
  const [params, setParams] = useSearchParams();
  const status = FILTERS.some((f) => f.value === params.get('status'))
    ? params.get('status')
    : 'pending';

  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = status === 'all' ? '' : `?status=${status}`;
      const res = await api.get(`/api/admin/templates${qs}`);
      setTemplates(res.data.templates || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load templates'));
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = (next) => {
    const merged = new URLSearchParams(params);
    // Always written, even for "all": when this parameter is missing the page
    // defaults to "pending", so deleting it would claim we were already there
    // -- the URL would not change, no re-render would happen, and the tab
    // would sit still.
    merged.set('status', next);
    setParams(merged, { replace: true });
  };

  const act = async (fn) => {
    try {
      await fn();
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'That action failed'));
      setBusyId(null);
    }
  };

  const change = (t, next) =>
    act(async () => {
      setBusyId(t._id);
      const res = await api.patch(`/api/admin/templates/${t._id}/status`, { status: next });
      toast.success(res.data?.message || `Template marked as ${next}`);
      setBusyId(null);
    });

  const remove = async (t) => {
    const ok = await confirm({
      title: `Delete “${t.title}”?`,
      body: 'This removes the template, its files and its download history for everyone. It cannot be undone.',
      confirmLabel: 'Delete template',
      tone: 'danger',
    });
    if (!ok) return;
    act(async () => {
      setBusyId(t._id);
      await api.delete(`/api/admin/templates/${t._id}`);
      toast.success('Template deleted');
      setBusyId(null);
    });
  };

  const list = templates || [];

  /* -------------------------------------------------- manage modal (§5-§8) */

  // The dialog reads its row from `list`: every save calls load(), so the
  // open modal can never show a stale copy of what it just wrote. Form state
  // is seeded when a row is OPENED rather than in an effect keyed on the
  // list, so an unrelated refresh cannot wipe half-typed answers.
  const [selectedId, setSelectedId] = useState(null);
  const [watchIds, setWatchIds] = useState(() => new Set());
  const [qForm, setQForm] = useState(null);
  const [descForm, setDescForm] = useState('');
  const [orderDraft, setOrderDraft] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const selected = list.find((t) => t._id === selectedId) || null;

  // One watchlist request per page mount covers every row's button.
  useEffect(() => {
    let alive = true;
    api
      .get('/api/admin/watchlist')
      .then((res) => {
        if (!alive) return;
        setWatchIds(
          new Set(
            (res.data.items || [])
              .filter((i) => i.targetType === 'template')
              .map((i) => String(i.targetId))
          )
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const openManage = (t) => {
    setSelectedId(t._id);
    setQForm({
      status: t.quality?.status || 'unchecked',
      score: t.quality?.score ?? '',
      note: t.quality?.note || '',
      checks: Object.keys(CHECK_LABELS).map((key) => ({
        key,
        ok: !!t.quality?.checks?.find((c) => c.key === key)?.ok,
      })),
    });
    setDescForm(t.content?.editedDescription || '');
    setOrderDraft(String(t.featuredOrder ?? 0));
  };

  const closeManage = () => {
    setSelectedId(null);
    setQForm(null);
    setDescForm('');
    setOrderDraft('');
  };

  const patch = async (path, body, message) => {
    setModalBusy(true);
    try {
      const res = await api.patch(path, body);
      toast.success(message || res.data?.message || 'Saved');
      await load();
      return res.data;
    } catch (err) {
      toast.error(getErrorMessage(err, 'That action failed'));
      return null;
    } finally {
      setModalBusy(false);
    }
  };

  const toggleFeatured = () =>
    patch(
      `/api/admin/templates/${selected._id}/featured`,
      { featured: !selected.featured },
      !selected.featured ? 'Added to the featured shelf' : 'Removed from the featured shelf'
    );

  const saveOrder = () => {
    const n = Number(orderDraft);
    const current = selected.featuredOrder ?? 0;
    if (!Number.isFinite(n) || n < 0 || n > 9999) {
      setOrderDraft(String(current));
      return;
    }
    if (n === current) return;
    patch(
      `/api/admin/templates/${selected._id}/featured`,
      { featured: !!selected.featured, order: n },
      'Featured order updated'
    );
  };

  const saveTrending = (event) =>
    patch(
      `/api/admin/templates/${selected._id}/trending`,
      { trendingOverride: event.target.value },
      `Trending: ${TRENDING_LABELS[event.target.value]}`
    );

  const saveQuality = async () => {
    const score = qForm.score === '' || qForm.score === null ? null : Number(qForm.score);
    const data = await patch(`/api/admin/templates/${selected._id}/quality`, {
      status: qForm.status,
      score,
      checks: qForm.checks,
      note: qForm.note,
    });
    if (data?.quality) {
      setQForm((f) =>
        f && {
          status: data.quality.status,
          score: data.quality.score ?? '',
          note: data.quality.note || '',
          checks: Object.keys(CHECK_LABELS).map((key) => ({
            key,
            ok: !!data.quality.checks?.find((c) => c.key === key)?.ok,
          })),
        }
      );
    }
  };

  const setContentState = async (next) => {
    if (next === 'hidden') {
      const ok = await confirm({
        title: 'Hide this description?',
        body: 'The text disappears from the public page and from search results. The author’s original is kept untouched — restoring later brings it back exactly as it was.',
        confirmLabel: 'Hide it',
        tone: 'danger',
      });
      if (!ok) return;
    }
    patch(
      `/api/admin/templates/${selected._id}/content`,
      { state: next },
      `Content marked as ${STATE_LABELS[next].toLowerCase()}`
    );
  };

  const saveDescription = () => {
    const text = descForm.trim();
    patch(
      `/api/admin/templates/${selected._id}/content`,
      { description: text || null },
      text ? 'Public description overridden' : 'Original description restored'
    );
  };

  const restoreDescription = () =>
    patch(`/api/admin/templates/${selected._id}/content`, { description: null }, 'Original description restored');

  const reviewDuplicate = (reviewed) =>
    patch(
      `/api/admin/templates/${selected._id}/duplicates`,
      { reviewed },
      reviewed ? 'Duplicate warning cleared' : 'Duplicate warning reopened'
    );

  const toggleWatch = async () => {
    try {
      const res = await api.post('/api/admin/watch', {
        targetType: 'template',
        targetId: selected._id,
        label: selected.title,
        href: `/templates/${selected.slug}`,
      });
      const id = String(selected._id);
      setWatchIds((prev) => {
        const next = new Set(prev);
        if (res.data.watching) next.add(id);
        else next.delete(id);
        return next;
      });
      toast.success(res.data?.message || 'Watchlist updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Watchlist update failed'));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter templates by status"
          className="flex flex-wrap gap-1.5 rounded-xl border border-ink-200 bg-white p-1"
        >
          {FILTERS.map((f) => {
            const active = f.value === status;
            return (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(f.value)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-brand-600 text-white shadow-soft'
                    : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-ink-500" aria-live="polite">
          {loading ? 'Loading…' : `${list.length} template${list.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {error && (
        <div className="ui-alert ui-alert--error mt-5" role="alert">
          {error}
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <RowSkeleton rows={5} />
        ) : list.length === 0 ? (
          <div className="ui-card p-10 text-center">
            <span aria-hidden className="text-3xl">
              ✅
            </span>
            <h2 className="ui-title mt-3 text-lg">
              {status === 'pending' ? 'The queue is clear' : 'Nothing here'}
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
              {status === 'pending'
                ? 'Every submission has been reviewed. New ones will appear here.'
                : 'No templates match this filter.'}
            </p>
          </div>
        ) : (
          <ul className="ui-card divide-y divide-ink-100 !p-0">
            {list.map((t) => (
              <li key={t._id} className="p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <img
                    src={t.thumbnail}
                    alt=""
                    aria-hidden
                    className="h-16 w-24 shrink-0 rounded-lg border border-ink-100 bg-ink-50 object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/templates/${t.slug}`}
                        className="truncate text-sm font-bold text-ink-900 transition-colors hover:text-brand-700"
                      >
                        {t.title}
                      </Link>
                      <StatusBadge status={t.status} />
                      {/* Curation state at a glance -- badges only, no hidden
                          actions: the row still approves and rejects exactly
                          as before, and Manage holds the rest. */}
                      {t.featured && (
                        <span className="ui-badge bg-amber-50 text-amber-700" title="On the featured shelf">
                          ★ Featured
                        </span>
                      )}
                      {t.trendingOverride && t.trendingOverride !== 'auto' && (
                        <span
                          className={`ui-badge ${
                            t.trendingOverride === 'force' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-600'
                          }`}
                          title="Admin trending override"
                        >
                          {t.trendingOverride === 'force' ? 'Trending ↑' : 'Trending off'}
                        </span>
                      )}
                      {t.quality?.status && t.quality.status !== 'unchecked' && (
                        <span className="ui-badge bg-purple-50 text-purple-700" title="Internal quality review">
                          {QUALITY_LABELS[t.quality.status]}
                        </span>
                      )}
                      {t.content?.state && t.content.state !== 'visible' && (
                        <span className="ui-badge bg-red-50 text-red-600" title="Content moderation state">
                          {STATE_LABELS[t.content.state]}
                        </span>
                      )}
                      {t.duplicateCheck?.matches?.length > 0 && !t.duplicateCheck.reviewed && (
                        <span className="ui-badge bg-orange-50 text-orange-700" title="Possible duplicate, not yet reviewed">
                          ⚠ Duplicate
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-500">
                      {t.authorName || 'Unknown'} · {t.category} · ↓{' '}
                      {formatCount(t.downloadCount)} · added {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => change(t, 'approved')}
                      disabled={busyId === t._id || t.status === 'approved'}
                      className="ui-btn ui-btn--success !px-3 !py-1.5 !text-xs"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        confirm({
                          title: `Reject “${t.title}”?`,
                          body: 'The developer is told it was not approved, and can edit and resubmit it. You can approve it later.',
                          confirmLabel: 'Reject',
                          tone: 'danger',
                        }).then((ok) => ok && change(t, 'rejected'))
                      }
                      disabled={busyId === t._id || t.status === 'rejected'}
                      className="ui-btn ui-btn--ghost !px-3 !py-1.5 !text-xs hover:!border-red-200 hover:!bg-red-50 hover:!text-red-600"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(t)}
                      disabled={busyId === t._id}
                      className="ui-btn ui-btn--ghost !px-3 !py-1.5 !text-xs hover:!border-red-200 hover:!bg-red-50 hover:!text-red-600"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => openManage(t)}
                      className="ui-btn ui-btn--soft !px-3 !py-1.5 !text-xs"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* One dialog, five concerns (§1-§8, §14, §17-§18): curation, the
          internal quality form, content moderation, duplicate evidence and
          admin notes all act on the same row, so a moderator never has to
          chase one template across four screens. */}
      <Modal
        open={!!selected}
        onClose={closeManage}
        title={selected ? `Manage “${selected.title}”` : ''}
        description="Curation, quality and moderation for this template. Every change lands in the audit log."
        panelClassName="max-w-2xl"
      >
        {selected && qForm && (
          <div className="space-y-5">
            {/* ------------------------------------------------ curation */}
            <section aria-label="Curation">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">Curation</h4>
                <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
                  <input
                    type="checkbox"
                    checked={!!selected.featured}
                    onChange={toggleFeatured}
                    disabled={modalBusy}
                    className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  />
                  Featured on the homepage
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-4">
                <label className="text-xs font-semibold text-ink-600">
                  Featured order
                  <input
                    type="number"
                    min={0}
                    max={9999}
                    value={orderDraft}
                    onChange={(event) => setOrderDraft(event.target.value)}
                    onBlur={saveOrder}
                    disabled={modalBusy}
                    className="ui-input mt-1 !w-24 !py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-ink-600">
                  Trending override
                  <select
                    value={selected.trendingOverride || 'auto'}
                    onChange={saveTrending}
                    disabled={modalBusy}
                    className="ui-input mt-1 !w-auto !py-1.5 text-sm"
                  >
                    {Object.entries(TRENDING_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-500">
                Trending is counted from real downloads and saves over the last two weeks.
                “Always shown” keeps an idle template on the list but sorts it after anything
                with genuine activity.
              </p>
            </section>

            {/* -------------------------------------------------- quality */}
            <section aria-label="Quality review" className="border-t border-ink-100 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Quality review
                </h4>
                <span className="text-[11px] text-ink-400">Internal only — never shown publicly</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-3">
                <label className="text-xs font-semibold text-ink-600">
                  Status
                  <select
                    value={qForm.status}
                    onChange={(event) => setQForm({ ...qForm, status: event.target.value })}
                    disabled={modalBusy}
                    className="ui-input mt-1 !w-auto !py-1.5 text-sm"
                  >
                    {Object.entries(QUALITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink-600">
                  Score (0–10)
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={qForm.score}
                    onChange={(event) => setQForm({ ...qForm, score: event.target.value })}
                    placeholder="—"
                    disabled={modalBusy}
                    className="ui-input mt-1 !w-24 !py-1.5 text-sm"
                  />
                </label>
              </div>

              <fieldset className="mt-3">
                <legend className="text-xs font-semibold text-ink-600">Checks</legend>
                <div className="mt-1.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {qForm.checks.map((c, i) => (
                    <label key={c.key} className="flex items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={c.ok}
                        onChange={(event) =>
                          setQForm({
                            ...qForm,
                            checks: qForm.checks.map((x, j) =>
                              j === i ? { ...x, ok: event.target.checked } : x
                            ),
                          })
                        }
                        disabled={modalBusy}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                      />
                      {CHECK_LABELS[c.key]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="mt-3 block text-xs font-semibold text-ink-600">
                Reviewer note
                <input
                  type="text"
                  maxLength={500}
                  value={qForm.note}
                  onChange={(event) => setQForm({ ...qForm, note: event.target.value })}
                  placeholder="What did you actually check?"
                  disabled={modalBusy}
                  className="ui-input mt-1 text-sm"
                />
              </label>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] text-ink-500">
                  {selected.quality?.reviewedAt
                    ? `Last reviewed ${formatDate(selected.quality.reviewedAt)}`
                    : 'Never reviewed'}
                </span>
                <button
                  type="button"
                  onClick={saveQuality}
                  disabled={modalBusy}
                  className="ui-btn ui-btn--primary !px-4 !py-2 !text-xs"
                >
                  Save quality
                </button>
              </div>
            </section>

            {/* --------------------------------------- content moderation */}
            <section aria-label="Content moderation" className="border-t border-ink-100 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Content moderation
                </h4>
                <span className="text-[11px] text-ink-400">The author’s original is never overwritten</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-ink-600">
                  State
                  <select
                    value={selected.content?.state || 'visible'}
                    onChange={(event) => setContentState(event.target.value)}
                    disabled={modalBusy}
                    className="ui-input mt-1 !w-auto !py-1.5 text-sm"
                  >
                    {Object.entries(STATE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-ink-500">
                  {selected.content?.state === 'visible'
                    ? 'Visitors see this description as written.'
                    : selected.content?.state === 'flagged'
                      ? 'Flagged: still visible, marked for review.'
                      : 'Hidden: withheld from the public page and from search.'}
                </p>
              </div>

              <label className="mt-3 block text-xs font-semibold text-ink-600">
                Public description override
                <textarea
                  value={descForm}
                  onChange={(event) => setDescForm(event.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Replacement text shown publicly instead of the author’s original (at least 10 characters)…"
                  disabled={modalBusy}
                  className="ui-input mt-1 resize-y text-sm"
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] text-ink-500">
                  {selected.content?.editedDescription
                    ? 'Override active — the stored original stays untouched.'
                    : 'Showing the author’s original text.'}
                </span>
                <span className="flex gap-2">
                  {selected.content?.editedDescription && (
                    <button
                      type="button"
                      onClick={restoreDescription}
                      disabled={modalBusy}
                      className="ui-btn ui-btn--ghost !px-3 !py-1.5 !text-xs"
                    >
                      Restore original
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={saveDescription}
                    disabled={modalBusy || descForm.trim().length < 10}
                    className="ui-btn ui-btn--soft !px-3 !py-1.5 !text-xs"
                  >
                    Save override
                  </button>
                </span>
              </div>
            </section>

            {/* ---------------------------------------------- duplicates */}
            {selected.duplicateCheck?.matches?.length > 0 && (
              <section aria-label="Duplicate check" className="border-t border-ink-100 pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">
                    Possible duplicates
                  </h4>
                  <span className="text-[11px] text-ink-400">Advisory only — nothing was deleted</span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {selected.duplicateCheck.matches.map((m, i) => (
                    <li
                      key={`${m.templateId}-${i}`}
                      className="rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2 text-xs text-ink-700"
                    >
                      <span className="font-semibold">{m.title}</span>
                      <span className="text-ink-500"> — {m.reason}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] text-ink-500">
                    Checked {selected.duplicateCheck.checkedAt ? formatDate(selected.duplicateCheck.checkedAt) : '—'}
                    {selected.duplicateCheck.reviewed ? ' · reviewed' : ' · not reviewed yet'}
                  </span>
                  <button
                    type="button"
                    onClick={() => reviewDuplicate(!selected.duplicateCheck.reviewed)}
                    disabled={modalBusy}
                    className="ui-btn ui-btn--soft !px-3 !py-1.5 !text-xs"
                  >
                    {selected.duplicateCheck.reviewed ? 'Reopen warning' : 'Clear warning'}
                  </button>
                </div>
              </section>
            )}

            {/* ---------------------------------------------------- notes */}
            <section aria-label="Internal notes" className="border-t border-ink-100 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Internal notes
                </h4>
                <span className="text-[11px] text-ink-400">Admins only — never public</span>
              </div>
              <div className="mt-2">
                <AdminNotes key={selected._id} targetType="template" targetId={selected._id} />
              </div>
            </section>

            {/* ------------------------------------------- watch (§18) */}
            <section
              aria-label="Watchlist"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4"
            >
              <p className="text-xs text-ink-500">
                {watchIds.has(String(selected._id))
                  ? 'You are watching this template — it shows up in your watchlist.'
                  : 'Track this template in your personal watchlist.'}
              </p>
              <button
                type="button"
                onClick={toggleWatch}
                disabled={modalBusy}
                className="ui-btn ui-btn--soft !px-4 !py-2 !text-xs"
              >
                {watchIds.has(String(selected._id)) ? '👁 Watching' : '👁 Watch'}
              </button>
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}
