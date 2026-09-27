import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from './api';

/**
 * Platform Control & Trust (spec §3/§11/§12/§13) -- context, hook and the
 * flag helpers. The provider component lives in platformProvider.jsx so this
 * file exports no components (fast-refresh stays happy) while every call site
 * keeps importing from one path.
 *
 * Failure handling is deliberately asymmetric: a fetch that fails leaves
 * every feature at its default (on), because a missing config must never
 * blank the homepage or disable the site. Maintenance and flag OFF states are
 * therefore only ever honoured once `loaded` is true -- "unknown" behaves
 * exactly like "everything enabled", which is how the platform ran before
 * this layer existed.
 */

const DEFAULTS = {
  flags: {},
  flagInfo: [],
  maintenance: { enabled: false, message: '' },
  sections: [],
  announcements: [],
  spotlight: [],
};

export const PlatformContext = createContext(null);

/** Shared by the provider's mount effect and its exposed reload(). */
export async function fetchPlatform(setData) {
  try {
    const res = await api.get('/api/platform');
    setData({ ...DEFAULTS, ...res.data, loaded: true });
  } catch {
    // Keep whatever we had; just mark the attempt as done so gates stop
    // waiting. An admin who just flipped a switch can hit reload again.
    setData((prev) => ({ ...prev, loaded: true }));
  }
}

export function usePlatformState() {
  const [data, setData] = useState({ ...DEFAULTS, loaded: false });

  const reload = useCallback(() => fetchPlatform(setData), []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload is stable
  }, []);

  return useMemo(() => ({ ...data, reload }), [data, reload]);
}

/** Never returns undefined: a component outside the provider still works. */
export function usePlatform() {
  return useContext(PlatformContext) || { ...DEFAULTS, loaded: false, reload: async () => {} };
}

/** True only when config HAS loaded and the flag is explicitly false. */
export function flagOff(platform, key) {
  return Boolean(platform?.loaded && platform.flags && platform.flags[key] === false);
}

/**
 * The exact sentence the API would return for this flag, quoted back to the
 * user before they click. Sourced from the backend's flagInfo so the banner
 * and the 403 can never disagree about the wording.
 */
export function flagMessage(platform, key) {
  const info = platform?.flagInfo?.find?.((f) => f.key === key);
  if (info?.message) return info.message;
  return 'This feature is temporarily disabled.';
}

/** Label for a flag (Settings page, banners); falls back to the raw key. */
export function flagLabel(platform, key) {
  const info = platform?.flagInfo?.find?.((f) => f.key === key);
  return info?.label || key;
}
