import { useEffect, useState } from 'react';
import api from './api';

/**
 * The category / technology / filter lists.
 *
 * They come from GET /api/meta and are cached for the whole session, so
 * adding a category on the server is enough to change the UI -- the frontend
 * never keeps its own copy that could drift out of sync.
 */
const FALLBACK = {
  categories: [],
  technologies: [],
  filters: ['All'],
  sorts: ['newest'],
};

let cached = null;
let inflight = null;

function load() {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api
      .get('/api/meta')
      .then((res) => {
        cached = res.data;
        return cached;
      })
      .catch(() => cached || FALLBACK)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Fire it early (App shell) so the first paint already has the chips. */
export function loadCatalog() {
  return load();
}

export function useCatalog() {
  const [catalog, setCatalog] = useState(() => cached || FALLBACK);

  useEffect(() => {
    let alive = true;
    load().then((data) => {
      if (alive && data) setCatalog(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { ...catalog, ready: cached !== null };
}
