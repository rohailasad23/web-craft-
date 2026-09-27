import React, { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useToast } from '../Common/Toast';
import { useConfirm } from '../Common/ConfirmDialog';

/**
 * Spec §17's internal notes, embedded anywhere a moderator reviews an entity
 * (templates, users, reports). Notes are admin-only by construction: they are
 * written to /api/admin and never appear in any public payload -- a template
 * page, a developer profile or the search index cannot leak one.
 *
 * Self-contained: it owns its fetch, so a modal just mounts it with a target
 * and never has to shuttle note state around.
 */
export default function AdminNotes({ targetType, targetId }) {
  const [notes, setNotes] = useState(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/notes', { params: { targetType, targetId } });
      // Cleared with the data, not before the request: every setState here
      // stays behind the await, which is the whole point of the boot pattern.
      setError('');
      setNotes(res.data.notes || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load notes'));
      setNotes([]);
    }
  }, [targetType, targetId]);

  useEffect(() => {
    // Fetching is the external-system sync this rule exists for; every
    // setState below lands after the request resolves, so there is no sync
    // cascade to avoid -- the diagnostic fires on the helper call, not on a
    // real render loop. Parents remount this panel per target (key).
    // eslint-disable-next-line react/set-state-in-effect
    if (targetId) load();
  }, [targetId, load]);

  const add = async (event) => {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      await api.post('/api/admin/notes', { targetType, targetId, body: text });
      setBody('');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the note'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (note) => {
    const ok = await confirm({
      title: 'Delete this note?',
      body: 'The note disappears for every admin. This is one record you cannot get back.',
      confirmLabel: 'Delete note',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/admin/notes/${note._id}`);
      await load();
      toast.success('Note deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the note'));
    }
  };

  return (
    <div>
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`note-${targetId}`}>
          Internal note
        </label>
        <input
          id={`note-${targetId}`}
          type="text"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add an internal note…"
          maxLength={1000}
          className="ui-input !py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="ui-btn ui-btn--soft shrink-0 !px-4 !py-2 !text-xs"
        >
          {busy ? 'Saving…' : 'Add note'}
        </button>
      </form>

      {error && (
        <p className="ui-alert ui-alert--error mt-3 !py-2 text-xs" role="alert">
          {error}
        </p>
      )}

      {notes && notes.length === 0 && (
        <p className="mt-3 text-xs text-ink-500">No notes yet. Only admins can read these.</p>
      )}

      {notes && notes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {notes.map((note) => (
            <li key={note._id} className="rounded-xl border border-ink-100 bg-ink-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                  {note.body}
                </p>
                <button
                  type="button"
                  onClick={() => remove(note)}
                  aria-label="Delete this note"
                  className="shrink-0 rounded-md px-1 text-sm text-ink-400 transition-colors hover:text-red-600"
                >
                  ×
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-ink-500">
                {note.authorName || 'Admin'} · {formatDate(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
