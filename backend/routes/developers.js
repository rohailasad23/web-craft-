'use strict';

const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/asyncHandler');
const User = require('../models/User');
const Template = require('../models/Template');

const router = express.Router();

/** Public profile shape -- never includes email or any internal field. */
function publicDeveloper(user, stats = {}) {
  return {
    id: user._id,
    name: user.name,
    avatar: user.avatar || '',
    bio: user.bio || '',
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
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const q = String(req.query.q || '').trim().slice(0, 60);

    const query = { role: { $in: ['developer', 'admin'] } };
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [{ name: new RegExp(safe, 'i') }, { bio: new RegExp(safe, 'i') }];
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
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Developer not found' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Developer not found' });

    res.json({ success: true, developer: publicDeveloper(user, await statsFor(user._id)) });
  })
);

// ===== THEIR TEMPLATES =====
// GET /api/developers/:id/templates
router.get(
  '/:id/templates',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Developer not found' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Developer not found' });

    const templates = await Template.find({ author: user._id, status: 'approved' })
      .sort({ downloadCount: -1, createdAt: -1 });

    res.json({ success: true, templates });
  })
);

module.exports = router;
