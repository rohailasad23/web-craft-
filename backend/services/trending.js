'use strict';

const Template = require('../models/Template');
const Download = require('../models/Download');
const Favorite = require('../models/Favorite');

/**
 * Spec §2: the trending candidate list, built from REAL behaviour.
 *
 * Downloads count double, saves count once, both inside a 14-day window so
 * the list answers "what is hot NOW" instead of repeating all-time rank
 * (which is what "Most downloaded" already answers). Admin overrides join in:
 * 'force' with no activity still lists (it is an admin's explicit call) but
 * sorts AFTER everything with genuine signal, and 'off' is removed outright.
 * No number on this list is invented; the homepage shows the usual stats,
 * never a fabricated "trending score".
 *
 * Lives in its own module so both the public route and the admin override
 * can reach the cache: the admin writes `trendingOverride` in a different
 * router, and without invalidate() the change would take five minutes to
 * show up -- or worse, an "off" template would keep appearing.
 */

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const CACHE_MS = 5 * 60 * 1000;
let cache = { ids: null, at: 0 };

async function candidateIds() {
  if (cache.ids && Date.now() - cache.at < CACHE_MS) return cache.ids;

  const since = new Date(Date.now() - WINDOW_MS);
  const [downloads, favorites, forced, switchedOff] = await Promise.all([
    Download.aggregate([
      { $match: { downloadedAt: { $gte: since } } },
      { $group: { _id: '$templateId', hits: { $sum: 1 } } },
    ]),
    Favorite.aggregate([
      { $match: { savedAt: { $gte: since } } },
      { $group: { _id: '$templateId', hits: { $sum: 1 } } },
    ]),
    Template.find({ status: 'approved', trendingOverride: 'force' }).select('_id'),
    Template.find({ status: 'approved', trendingOverride: 'off' }).select('_id'),
  ]);

  const score = new Map();
  for (const row of downloads) score.set(String(row._id), (score.get(String(row._id)) || 0) + row.hits * 2);
  for (const row of favorites) score.set(String(row._id), (score.get(String(row._id)) || 0) + row.hits);

  for (const t of switchedOff) score.delete(String(t._id));
  // Forced-but-idle: present, but honest about having no recent activity.
  for (const t of forced) if (!score.has(String(t._id))) score.set(String(t._id), -1);

  const ids = [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  cache = { ids, at: Date.now() };
  return ids;
}

/**
 * Drop the cache. Called whenever a write can change the answer: an admin
 * flipping the override (the case a stale cache would actively contradict),
 * and a template being deleted or moderated away.
 */
function invalidate() {
  cache = { ids: null, at: 0 };
}

module.exports = { candidateIds, invalidate };
