'use strict';

const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/asyncHandler');
const { flagGate } = require('../middleware/platform');
const { safeRegex } = require('../utils/safeRegex');
const publicTemplate = require('../utils/publicTemplate');
const User = require('../models/User');
const Template = require('../models/Template');

const router = express.Router();

/**
 * Who has a directory page at all (spec §10). The list has always filtered on
 * this; the profile routes used to look the account up by id alone, so a plain
 * account could be opened at /developers/:id and rendered as "Developer" --
 * while `publicDeveloper()` claimed the opposite.
 */
const PROFILE_ROLES = ['developer', 'admin'];

/** Public profile shape -- never includes email or any internal field. */
function publicDeveloper(user, stats = {}) {
  // Spec §14: the bio an admin edited replaces the developer's own text, and
  // a hidden bio is withheld (the profile still exists -- only the prose is
  // withheld, nothing is deleted).
  const content = user.content || {};
  const bioHidden = content.state === 'hidden';
  const bio = bioHidden ? '' : content.editedBio || user.bio || '';

  return {
    id: user._id,
    name: user.name,
    avatar: user.avatar || '',
    bio,
    bioHidden,
    // Spec §7's public face: 'trusted'/'verified' exist only because an admin
    // set them, so showing them reports that judgement rather than inventing
    // one. 'new' and 'active' stay internal -- no badge, no claim.
    trustBadge: ['trusted', 'verified'].includes(user.trustLevel) ? user.trustLevel : null,
    // Deliberate, and reviewed: this endpoint only ever serves accounts with
    // role developer/admin (the query filters on it), and the profile page
    // renders the value as its "Admin"/"Developer" badge. What it can never
    // contain is a plain account, an email, a status or anything internal --
    // see publicUser() in routes/auth.js for the session shape.
    role: user.role,
    joinedAt: user.createdAt,
    templateCount: stats.templateCount || 0,
    totalDownloads: stats.totalDownloads || 0,
    // Spec §10. Links only ever surface if the developer filled them in --
    // there is no verification here, so nothing is claimed that was not typed.
    skills: user.skills || [],
    website: user.website || '',
    github: user.github || '',
    socialLinks: user.socialLinks || [],
  };
}

/** Aggregate template totals for one author (single round trip). */
async function statsFor(authorId) {
  const [row] = await Template.aggregate([
    {
      $match: {
        author: new mongoose.Types.ObjectId(String(authorId)),
        status: 'approved',
      },
    },
    {
      $group: {
        _id: null,
        templateCount: { $sum: 1 },
        totalDownloads: { $sum: '$downloadCount' },
      },
    },
  ]);
  return row || { templateCount: 0, totalDownloads: 0 };
}

// ===== LIST DEVELOPERS =====
// GET /api/developers?q=&page=&limit=
// §11: the whole directory sits behind the public-developer-profiles switch.
router.get(
  '/',
  flagGate('publicDeveloperProfiles'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const q = String(req.query.q || '').trim().slice(0, 60);

    const query = { role: { $in: PROFILE_ROLES } };
    if (q) {
      // One escaped pattern shared by both fields. It used to be built twice
      // from the same input -- same escape, same flags, two objects.
      //
      // §14: a hidden bio must not be findable -- search matches the bio only
      // while it is visible/flagged, and it matches the admin's edited version
      // when one exists (that is the text the public page actually shows).
      const rx = safeRegex(q, 60);
      query.$or = [
        { name: rx },
        { 'content.state': { $ne: 'hidden' }, $or: [{ bio: rx }, { 'content.editedBio': rx }] },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(query),
    ]);

    // One aggregation for the whole page instead of 2 queries per developer.
    const counts = await Template.aggregate([
      {
        $match: {
          status: 'approved',
          author: { $in: users.map((u) => u._id) },
        },
      },
      {
        $group: {
          _id: '$author',
          templateCount: { $sum: 1 },
          totalDownloads: { $sum: '$downloadCount' },
        },
      },
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c]));

    res.json({
      success: true,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      developers: users.map((u) => publicDeveloper(u, byId.get(String(u._id)) || {})),
    });
  })
);

// ===== ONE DEVELOPER =====
// GET /api/developers/:id
router.get(
  '/:id',
  flagGate('publicDeveloperProfiles'),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Developer not found' });
    }
    // Same gate as the directory listing: an id on its own is not a profile,
    // so a plain account cannot be opened here and rendered as "Developer".
    const user = await User.findOne({ _id: req.params.id, role: { $in: PROFILE_ROLES } });
    if (!user) return res.status(404).json({ error: 'Developer not found' });

    res.json({ success: true, developer: publicDeveloper(user, await statsFor(user._id)) });
  })
);

// ===== THEIR TEMPLATES =====
// GET /api/developers/:id/templates
router.get(
  '/:id/templates',
  flagGate('publicDeveloperProfiles'),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Developer not found' });
    }
    // Same gate as the directory listing: an id on its own is not a profile,
    // so a plain account cannot be opened here and rendered as "Developer".
    const user = await User.findOne({ _id: req.params.id, role: { $in: PROFILE_ROLES } });
    if (!user) return res.status(404).json({ error: 'Developer not found' });

    const templates = await Template.find({ author: user._id, status: 'approved' })
      .sort({ downloadCount: -1, createdAt: -1 })
      // Bounded like every other list endpoint: without this a long-standing
      // developer returned their whole back catalogue in one response, no
      // matter how many submissions they had.
      .limit(200);

    // Same public projection as the catalogue: no quality score, duplicate
    // matches or moderation plumbing on a public profile page.
    res.json({ success: true, templates: templates.map((t) => publicTemplate(t)) });
  })
);

module.exports = router;
