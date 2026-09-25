import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { formatDate, formatCount } from '../../lib/format';
import { useToast } from '../../components/Common/Toast';
import { useConfirm } from '../../components/Common/ConfirmDialog';
import { RowSkeleton } from '../../components/Common/Skeletons';
import { StatusBadge } from '../developer/Dashboard';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

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
    if (next === 'all') merged.delete('status');
    else merged.set('status', next);
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
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
