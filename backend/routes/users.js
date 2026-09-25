'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const { requireActive } = require('../middleware/auth');
const User = require('../models/User');
const Download = require('../models/Download');
const Favorite = require('../models/Favorite');
const Template = require('../models/Template');

const router = express.Router();

// Every route here needs a session; mounting the router itself behind
// verifyToken keeps that from being forgotten per-endpoint.
router.use(verifyToken);

/**
 * PUT /api/users/me -- account settings (spec §5).
 *
 * Deliberate allow-list: `email` and anything else sensitive are NOT here, so a
 * crafted body can never swap identities. Email changes would need
 * re-verification; V1 leaves it alone.
 *
 * `role` is special: the only self-serve move is user <-> developer (spec §22
 * "How to become a developer"). `admin` is rejected outright rather than
 * silently dropped, so nobody can even appear to promote themselves.
 */
router.put(
  '/me',
  // Spec §9: reads stay open so a suspended account can still SEE what it
  // owns and read the notice; changing it is what is refused.
  requireActive,
  asyncHandler(async (req, res) => {
    const updates = {};
    if (typeof req.body.name === 'string') updates.name = req.body.name.trim().slice(0, 80);
    if (typeof req.body.bio === 'string') updates.bio = req.body.bio.trim().slice(0, 500);
    if (typeof req.body.avatar === 'string') updates.avatar = req.body.avatar.trim().slice(0, 500);

    if ('role' in req.body) {
      const next = req.body.role;
      if (next !== 'user' && next !== 'developer') {
        return res
          .status(400)
          .json({ error: 'Account type must be either "user" or "developer"' });
      }

      const current = await User.findById(req.user.id).select('role');
      if (!current) return res.status(404).json({ error: 'User not found' });
      if (current.role === 'admin') {
        return res
          .status(403)
          .json({ error: 'Administrator accounts cannot change their account type' });
      }
      if (current.role !== next) updates.role = next;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    if ('name' in updates && !updates.name) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { publicUser } = require('./auth');
    res.json({ success: true, message: 'Profile updated', user: publicUser(user) });
  })
);

/**
 * GET /api/users/me/downloads -- "My Downloads" (spec §5).
 * Distinct templates only, because Download has a unique (user, template) index.
 */
router.get(
  '/me/downloads',
  asyncHandler(async (req, res) => {
    const [rows, total] = await Promise.all([
      Download.find({ userId: req.user.id })
        .sort({ downloadedAt: -1 })
        .limit(60)
        .populate({
          path: 'templateId',
          select: 'title slug thumbnail category technologies downloadCount author authorName',
        }),
      Download.countDocuments({ userId: req.user.id }),
    ]);

    // A template deleted by its author leaves a dangling reference; drop it.
    const templates = rows.map((r) => r.templateId).filter(Boolean);

    res.json({
      success: true,
      total,
      downloads: rows
        .filter((r) => r.templateId)
        .map((r) => ({
          downloadedAt: r.downloadedAt,
          template: r.templateId,
        })),
      templates,
    });
  })
);

/**
 * GET /api/users/me/favorites -- spec §1: the saved list.
 *
 * Templates come back as ordinary template objects (plus `favorited` and
 * `savedAt`) so this page renders with the same card component as the rest of
 * the catalogue instead of needing a second "saved" card variant.
 */
router.get(
  '/me/favorites',
  asyncHandler(async (req, res) => {
    const rows = await Favorite.find({ userId: req.user.id })
      .sort({ savedAt: -1 })
      .limit(120)
      .populate({
        path: 'templateId',
        select:
          'title slug description category technologies tags thumbnail previewUrl githubUrl ' +
          'downloadCount author authorName createdAt updatedAt status',
      });

    // A template deleted by its author leaves a dangling reference, and one an
    // admin later rejected should not keep showing up -- drop both.
    const templates = rows
      .filter((r) => {
        const t = r.templateId;
        return t && (t.status === 'approved' || String(t.author) === String(req.user.id));
      })
      .map((r) => ({
        ...r.templateId.toObject(),
        favorited: true,
        savedAt: r.savedAt,
      }));

    res.json({ success: true, total: templates.length, templates });
  })
);

module.exports = router;
