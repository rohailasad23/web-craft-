import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatDate, formatCount } from '../../lib/format';
import { useToast } from '../../components/Common/Toast';
import { useConfirm } from '../../components/Common/ConfirmDialog';
import { RowSkeleton } from '../../components/Common/Skeletons';
import Modal from '../../components/Common/Modal';
import AdminNotes from '../../components/Admin/AdminNotes';
import { useSession } from '../../lib/session';

/* §7's ladder and §14's states -- labels and badge colours for the enums
   that live on the server (models/User.js). */
const TRUST_LABELS = { new: 'New', active: 'Active', trusted: 'Trusted', verified: 'Verified' };
const TRUST_STYLES = {
  new: 'bg-ink-100 text-ink-600',
  active: 'bg-brand-50 text-brand-700',
  trusted: 'bg-amber-50 text-amber-700',
  verified: 'bg-emerald-50 text-emerald-700',
};
const STATE_LABELS = { visible: 'Visible', flagged: 'Flagged', hidden: 'Hidden' };

const ROLES = [
  { value: 'all', label: 'Everyone' },
  { value: 'user', label: 'Users' },
  { value: 'developer', label: 'Developers' },
  { value: 'admin', label: 'Admins' },
];

const STATUS = [
  { value: 'all', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

/**
 * /admin/users -- view users and developers, change roles, suspend accounts
 * (spec §8 + §9).
 *
 * Filtering and search happen in the browser rather than in the query. The
 * endpoint already returns the full roster in one request, and doing it here
 * means the boxes below filter instantly instead of round-tripping per
 * keystroke. If the roster ever outgrows that, this is the thing to change.
 *
 * Suspending confirms first (it locks someone out of their account) and is
 * disabled for your own row -- the API refuses it anyway, and a button that
 * always fails is worse than no button.
 */
export default function AdminUsers() {
  const [params, setParams] = useSearchParams();
  const { user: me } = useSession();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [query, setQuery] = useState('');
  const toast = useToast();
  const confirm = useConfirm();

  const statusFilter = STATUS.some((s) => s.value === params.get('status'))
    ? params.get('status')
    : 'all';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/admin/users');
      setUsers(res.data.users || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load users'));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Only on mount: the list is refetched after each action instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStatusFilter = (next) => {
    const merged = new URLSearchParams(params);
    // Written explicitly so the URL says which view it is, and so every admin
    // filter follows one rule. See Templates.jsx.
    merged.set('status', next);
    setParams(merged, { replace: true });
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users || [])
      .filter((u) => (roleFilter === 'all' ? true : u.role === roleFilter))
      .filter((u) => (statusFilter === 'all' ? true : u.status === statusFilter))
      .filter((u) =>
        q ? `${u.name} ${u.email}`.toLowerCase().includes(q) : true
      );
  }, [users, roleFilter, statusFilter, query]);

  const changeRole = async (u, role) => {
    const self = String(u.id) === String(me?.id);
    const ok = await confirm({
      title: `Make ${u.name} ${role}?`,
      body: self
        ? 'You are changing your own role. If you drop yourself from admin you will lose access to these screens immediately.'
        : `${u.name} will get the ${role} navigation and permissions on their next request.`,
      confirmLabel: 'Change role',
      tone: self || role === 'user' ? 'danger' : 'default',
    });
    if (!ok) return;

    setBusyId(u.id);
    try {
      const res = await api.patch(`/api/admin/users/${u.id}/role`, { role });
      toast.success(res.data?.message || 'Role updated');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not change the role'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (u) => {
    const suspending = u.status !== 'suspended';
    const ok = await confirm({
      title: suspending ? `Suspend ${u.name}?` : `Reinstate ${u.name}?`,
      body: suspending
        ? `${u.name} will not be able to sign in, and any open session will stop saving, downloading and editing. Their templates and data are kept.`
        : `${u.name} will be able to sign in and use web craft again.`,
      confirmLabel: suspending ? 'Suspend account' : 'Reinstate account',
      tone: suspending ? 'danger' : 'default',
    });
    if (!ok) return;

    setBusyId(u.id);
    try {
      const res = await api.patch(`/api/admin/users/${u.id}/status`, {
        status: suspending ? 'suspended' : 'active',
      });
      toast.success(res.data?.message || 'Account status updated');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the account'));
    } finally {
      setBusyId(null);
    }
  };

  const list = users || [];

  /* ------------------------------------------- manage dialog (§7/§14/§17) */

  // Rows read from `list` (every save calls load()), form state is seeded on
  // open -- same contract as the Templates dialog, see that file for why.
  const [selectedId, setSelectedId] = useState(null);
  const [bioForm, setBioForm] = useState('');
  const [watchIds, setWatchIds] = useState(() => new Set());
  const [modalBusy, setModalBusy] = useState(false);
  const selected = list.find((u) => String(u.id) === String(selectedId)) || null;

  // One watchlist request covers every row's button (§18).
  useEffect(() => {
    let alive = true;
    api
      .get('/api/admin/watchlist')
      .then((res) => {
        if (!alive) return;
        setWatchIds(
          new Set(
            (res.data.items || [])
              .filter((i) => i.targetType === 'user' || i.targetType === 'developer')
              .map((i) => String(i.targetId))
          )
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const openManage = (u) => {
    setSelectedId(u.id);
    setBioForm(u.content?.editedBio || '');
  };

  const closeManage = () => {
    setSelectedId(null);
    setBioForm('');
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

  const setTrust = (level) =>
    patch(`/api/admin/users/${selected.id}/trust`, { trustLevel: level }, `Trust level: ${TRUST_LABELS[level]}`);

  // §4: this modal is where a developer is SELECTED into the spotlight -- the
  // Content page can only edit or remove whoever is already on it, so without
  // this button the homepage spotlight could only ever be filled through the
  // raw API.
  const setSpotlight = async (enabled) => {
    if (!enabled) {
      const ok = await confirm({
        title: 'Remove from the homepage spotlight?',
        body: 'They leave the homepage immediately. You can add them back here at any time.',
        confirmLabel: 'Remove',
        tone: 'danger',
      });
      if (!ok) return;
    }
    patch(
      `/api/admin/users/${selected.id}/spotlight`,
      { enabled },
      enabled
        ? 'Added to the homepage spotlight — set the blurb, image and priority under Content → Spotlight'
        : 'Removed from the homepage spotlight'
    );
  };

  const setBioState = async (next) => {
    if (next === 'hidden') {
      const ok = await confirm({
        title: 'Hide this bio?',
        body: 'The profile text disappears from public pages and from search. The developer’s original bio is kept untouched — restoring later brings it back exactly as it was.',
        confirmLabel: 'Hide it',
        tone: 'danger',
      });
      if (!ok) return;
    }
    patch(
      `/api/admin/users/${selected.id}/content`,
      { state: next },
      `Bio marked as ${STATE_LABELS[next].toLowerCase()}`
    );
  };

  const saveBio = () => {
    const text = bioForm.trim();
    patch(
      `/api/admin/users/${selected.id}/content`,
      { bio: text || null },
      text ? 'Public bio overridden' : 'Original bio restored'
    );
  };

  const restoreBio = () => patch(`/api/admin/users/${selected.id}/content`, { bio: null }, 'Original bio restored');

  const toggleWatch = async () => {
    try {
      const res = await api.post('/api/admin/watch', {
        targetType: selected.role === 'user' ? 'user' : 'developer',
        targetId: selected.id,
        label: selected.name,
        href: selected.role === 'user' ? '/admin/users' : `/developers/${selected.id}`,
      });
      const id = String(selected.id);
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Filter by role"
          className="flex flex-wrap gap-1.5 rounded-xl border border-ink-200 bg-white p-1"
        >
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              role="tab"
              aria-selected={roleFilter === r.value}
              onClick={() => setRoleFilter(r.value)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                roleFilter === r.value
                  ? 'bg-brand-600 text-white shadow-soft'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="admin-user-search">
            Search users
          </label>
          <input
            id="admin-user-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="ui-input !w-auto min-w-[12rem] !py-2 text-sm"
          />
          <label className="sr-only" htmlFor="admin-status-filter">
            Filter by status
          </label>
          <select
            id="admin-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ui-input !w-auto !py-2 text-sm"
          >
            {STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="ui-alert ui-alert--error mt-5" role="alert">
          {error}
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <RowSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <div className="ui-card p-10 text-center">
            <h2 className="ui-title text-lg">No accounts match</h2>
            <p className="mt-1.5 text-sm text-ink-500">Try a different role, status or search.</p>
          </div>
        ) : (
          <ul className="ui-card divide-y divide-ink-100 !p-0">
            {rows.map((u) => {
              const self = String(u.id) === String(me?.id);
              const suspended = u.status === 'suspended';
              return (
                <li
                  key={u.id}
                  className={`flex flex-wrap items-center gap-4 p-4 ${suspended ? 'bg-red-50/40' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-ink-900">{u.name}</span>
                      <span className="ui-badge !bg-ink-100 !text-ink-700">{u.role}</span>
                      {suspended && (
                        <span className="ui-badge !bg-red-100 !text-red-700">suspended</span>
                      )}
                      {self && (
                        <span className="ui-badge !bg-brand-100 !text-brand-700">you</span>
                      )}
                      {/* §7/§14/§4 judgements at a glance; every one of them
                          is set by a person in Manage, never auto-assigned. */}
                      {u.trustLevel && u.trustLevel !== 'new' && (
                        <span
                          className={`ui-badge ${TRUST_STYLES[u.trustLevel] || TRUST_STYLES.new}`}
                          title="Admin-set trust level"
                        >
                          {TRUST_LABELS[u.trustLevel] || u.trustLevel}
                        </span>
                      )}
                      {u.contentState && u.contentState !== 'visible' && (
                        <span className="ui-badge bg-red-50 text-red-600" title="Bio moderation state">
                          {STATE_LABELS[u.contentState]}
                        </span>
                      )}
                      {u.spotlight?.enabled && (
                        <span className="ui-badge bg-purple-50 text-purple-700" title="On the homepage spotlight">
                          ✦ Spotlight
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {u.email} · joined {formatDate(u.createdAt)} · ↓{' '}
                      {formatCount(u.downloads)}
                    </p>
                  </div>

                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <select
                      value={u.role}
                      disabled={busyId === u.id}
                      aria-label={`Role for ${u.name}`}
                      onChange={(e) => e.target.value !== u.role && changeRole(u, e.target.value)}
                      className="ui-input !w-auto !py-1.5 !text-xs"
                    >
                      <option value="user">user</option>
                      <option value="developer">developer</option>
                      <option value="admin">admin</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => toggleStatus(u)}
                      disabled={busyId === u.id || self}
                      title={self ? 'You cannot suspend your own account' : undefined}
                      className={`ui-btn !px-3 !py-1.5 !text-xs ${
                        suspended
                          ? 'ui-btn--success'
                          : 'ui-btn--ghost hover:!border-red-200 hover:!bg-red-50 hover:!text-red-600'
                      }`}
                    >
                      {suspended ? 'Reinstate' : 'Suspend'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openManage(u)}
                      className="ui-btn ui-btn--soft !px-3 !py-1.5 !text-xs"
                    >
                      Manage
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!loading && (
        <p className="mt-4 text-xs text-ink-500">
          {rows.length} of {list.length} account{list.length === 1 ? '' : 's'} shown
        </p>
      )}

      {/* §7 trust, §4 spotlight, §14 bio moderation, §17 notes, §18 watch --
          the five judgements an admin makes about a PERSON, in one place. */}
      <Modal
        open={!!selected}
        onClose={closeManage}
        title={selected ? `Manage ${selected.name}` : ''}
        description="Trust, spotlight, bio moderation and internal notes for this account. Every change lands in the audit log."
        panelClassName="max-w-xl"
      >
        {selected && (
          <div className="space-y-5">
            <section aria-label="Trust level">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Trust level
                </h4>
                <span className="text-[11px] text-ink-400">Set by hand — never automatic</span>
              </div>
              <select
                value={selected.trustLevel || 'new'}
                onChange={(event) => setTrust(event.target.value)}
                disabled={modalBusy}
                className="ui-input mt-2 !w-auto !py-1.5 text-sm"
              >
                {Object.entries(TRUST_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-relaxed text-ink-500">
                Only “Trusted” and “Verified” ever appear publicly, beside the developer’s name.
                A downgrade is recorded just like an upgrade.
              </p>
            </section>

            <section aria-label="Homepage spotlight" className="border-t border-ink-100 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Homepage spotlight
                </h4>
                <span className="text-[11px] text-ink-400">Selected by hand — never automatic</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={modalBusy}
                  onClick={() => setSpotlight(!selected.spotlight?.enabled)}
                  className={`ui-btn !py-1.5 text-sm ${
                    selected.spotlight?.enabled ? 'ui-btn--soft' : 'ui-btn--primary'
                  }`}
                >
                  {selected.spotlight?.enabled ? 'Remove from spotlight' : 'Add to homepage spotlight'}
                </button>
                <p className="text-xs text-ink-500">
                  {selected.spotlight?.enabled
                    ? 'On the homepage right now.'
                    : 'Not on the homepage.'}
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-500">
                The spotlight description, image and priority are edited under Content → Spotlight,
                where everyone currently selected is listed.
              </p>
            </section>

            <section aria-label="Bio moderation" className="border-t border-ink-100 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Bio moderation
                </h4>
                <span className="text-[11px] text-ink-400">The original bio is never overwritten</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-ink-600">
                  State
                  <select
                    value={selected.contentState || 'visible'}
                    onChange={(event) => setBioState(event.target.value)}
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
                  {selected.contentState === 'visible'
                    ? 'The bio shows on the public profile and in search.'
                    : selected.contentState === 'flagged'
                      ? 'Flagged: still visible, marked for review.'
                      : 'Hidden: withheld from the profile and from search.'}
                </p>
              </div>

              <label className="mt-3 block text-xs font-semibold text-ink-600">
                Public bio override
                <textarea
                  value={bioForm}
                  onChange={(event) => setBioForm(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Replacement text shown publicly instead of the developer’s original bio…"
                  disabled={modalBusy}
                  className="ui-input mt-1 resize-y text-sm"
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] text-ink-500">
                  {selected.content?.editedBio
                    ? 'Override active — the stored original stays untouched.'
                    : 'Showing the developer’s original bio.'}
                </span>
                <span className="flex gap-2">
                  {selected.content?.editedBio && (
                    <button
                      type="button"
                      onClick={restoreBio}
                      disabled={modalBusy}
                      className="ui-btn ui-btn--ghost !px-3 !py-1.5 !text-xs"
                    >
                      Restore original
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={saveBio}
                    disabled={modalBusy || !bioForm.trim()}
                    className="ui-btn ui-btn--soft !px-3 !py-1.5 !text-xs"
                  >
                    Save override
                  </button>
                </span>
              </div>
            </section>

            <section aria-label="Internal notes" className="border-t border-ink-100 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Internal notes
                </h4>
                <span className="text-[11px] text-ink-400">Admins only — never public</span>
              </div>
              <div className="mt-2">
                <AdminNotes key={selected.id} targetType="user" targetId={selected.id} />
              </div>
            </section>

            <section
              aria-label="Watchlist"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4"
            >
              <p className="text-xs text-ink-500">
                {watchIds.has(String(selected.id))
                  ? 'You are watching this account — it shows up in your watchlist.'
                  : 'Track this account in your personal watchlist.'}
              </p>
              <button
                type="button"
                onClick={toggleWatch}
                disabled={modalBusy}
                className="ui-btn ui-btn--soft !px-4 !py-2 !text-xs"
              >
                {watchIds.has(String(selected.id)) ? '👁 Watching' : '👁 Watch'}
              </button>
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}
