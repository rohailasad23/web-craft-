import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatDate, formatCount } from '../../lib/format';
import { useToast } from '../../components/Common/Toast';
import { useConfirm } from '../../components/Common/ConfirmDialog';
import { RowSkeleton } from '../../components/Common/Skeletons';
import { useSession } from '../../lib/session';

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
    </div>
  );
}
