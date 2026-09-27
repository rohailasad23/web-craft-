'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { getPlatform } = require('../middleware/platform');
const Announcement = require('../models/Announcement');
const PlatformConfig = require('../models/PlatformConfig');
const User = require('../models/User');

const router = express.Router();

/**
 * GET /api/platform -- everything the client needs to render itself the way
 * the platform is currently configured. Anonymous, read-only, cached nowhere
 * (the browser calls it once per boot).
 *
 *   flags        spec §11 -- so the UI can disable a button and SAY why
 *   maintenance  spec §12 -- so a non-admin sees the wall, not a broken site
 *   sections     spec §3   -- homepage layout, order, titles, blurbs
 *   announcements spec §13 -- live platform-wide messages
 *   spotlight    spec §4   -- the developers an admin actually selected
 *
 * No fake data: sections come from stored config merged over code defaults,
 * announcements must be enabled AND inside their window, and spotlight is
 * empty until an admin opts someone in.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const config = await getPlatform();
    const now = new Date();

    // Merge stored edits over the built-in layout, then sort. A section the
    // admin never touched keeps its default title and position; a key that
    // somehow vanished from storage comes back at its default place instead
    // of silently disappearing from the homepage.
    const stored = new Map(config.sections.map((s) => [s.key, s]));
    const sections = PlatformConfig.DEFAULT_SECTION_ORDER.map((key, i) => {
      const s = stored.get(key);
      return {
        key,
        enabled: s ? s.enabled : true,
        order: s && Number.isFinite(s.order) ? s.order : (i + 1) * 10,
        title: (s && s.title) || PlatformConfig.DEFAULT_SECTION_TITLES[key],
        blurb: (s && s.blurb) || '',
      };
    }).sort((a, b) => a.order - b.order || 0);

    const [announcements, spotlightDevs] = await Promise.all([
      Announcement.find(Announcement.activeQuery(now))
        .sort({ startsAt: -1 })
        .limit(5)
        .select('title message type startsAt endsAt'),
      User.find({ 'spotlight.enabled': true })
        .sort({ 'spotlight.priority': 1, name: 1 })
        .limit(6)
        .select('name avatar trustLevel spotlight skills'),
    ]);

    res.json({
      success: true,
      flags: config.flags,
      // The switchboard's own labels and user-facing reasons, so a disabled
      // button anywhere in the UI quotes the SAME sentence the API would
      // return as its error -- one source of truth, no drifted wording.
      flagInfo: PlatformConfig.FLAGS,
      maintenance: config.maintenance,
      sections,
      announcements: announcements.map((a) => ({
        id: a._id,
        title: a.title,
        message: a.message,
        type: a.type,
      })),
      // Only the fields the homepage card needs. `trustBadge` is the PUBLIC
      // face of §7: 'trusted'/'verified' are admin-set, so showing them is
      // reporting an admin's judgement, never inventing one.
      spotlight: spotlightDevs.map((d) => ({
        id: d._id,
        name: d.name,
        image: d.spotlight.image || d.avatar || '',
        blurb: d.spotlight.blurb || '',
        skills: (d.skills || []).slice(0, 3),
        trustBadge: ['trusted', 'verified'].includes(d.trustLevel) ? d.trustLevel : null,
      })),
    });
  })
);

module.exports = router;
