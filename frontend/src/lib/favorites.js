import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from './api';
import { useSession } from './session';
import { useToast } from '../components/Common/Toast';

/**
 * Save / unsave a template (spec §1).
 *
 * One hook for the card and the details page so the two cannot drift: the
 * optimistic flip, the rollback when the request fails and the "log in first"
 * detour all live in one place.
 *
 * The answer is derived from the payload rather than snapshotted into state,
 * because the details page mounts with `template === null` and only fills in a
 * moment later -- a value read at mount would be wrong for a signed-in visitor
 * who already saved this template.
 */
export function useFavorite(template, onChange) {
  const { isAuthenticated } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const flag = Boolean(template?.favorited);

  // `null` until the person touches the control. After that their own answer
  // wins, so a flip that is still in flight cannot be undone by a payload that
  // was already on its way. Every surface refetches on navigation, so it never
  // has a chance to go stale.
  const [local, setLocal] = useState(null);
  const [busy, setBusy] = useState(false);

  const saved = local === null ? flag : local;

  async function toggle(event) {
    // The control sits beside a card link and inside a details page, so never
    // let the tap fall through to whatever else is under it.
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (busy || !template?._id) return;

    if (!isAuthenticated) {
      toast.info('Please log in to save this template.');
      // `from` sends the visitor straight back here once they have signed in,
      // instead of dropping them on the dashboard mid-heart.
      navigate('/login', { state: { from: location } });
      return;
    }

    const previous = local;
    const next = !saved;
    setLocal(next);
    setBusy(true);

    try {
      const res = next
        ? await api.post(`/api/templates/${template._id}/favorite`)
        : await api.delete(`/api/templates/${template._id}/favorite`);
      const nowSaved = Boolean(res.data.favorited);
      setLocal(nowSaved);
      if (res.data.message) toast.success(res.data.message);
      // Only fired once the server has agreed -- a caller that drops the row
      // (the saved list) never drops it on a request that then failed.
      onChange?.(template, nowSaved);
    } catch (err) {
      // Hand the decision back exactly as it was, `null` included: the server
      // never agreed to the change.
      setLocal(previous);
      toast.error(getErrorMessage(err, 'Could not update your saved list'));
    } finally {
      setBusy(false);
    }
  }

  return { saved, busy, toggle };
}

/**
 * Drop one template from a saved-list payload.
 *
 * Used by every screen that renders saved templates as a list, so unsaving
 * takes the item off the dashboard preview and off /saved in exactly the same
 * way -- and only after the server has confirmed the change.
 */
export function dropSaved(data, template) {
  if (!data) return data;
  return {
    ...data,
    templates: (data.templates || []).filter((row) => row._id !== template._id),
    total: Math.max(0, (data.total ?? 0) - 1),
  };
}
