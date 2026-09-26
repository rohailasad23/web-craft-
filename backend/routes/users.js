'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const { requireActive } = require('../middleware/auth');
const User = require('../models/User');
const Download = require('../models/Download');
const Favorite = require('../models/Favorite');
const Template = require('../models/Template');
const { normalizeUrl } = require('../utils/urls');

const { MAX_SKILLS, MAX_SOCIAL_LINKS } = User;

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

    // Spec §10 -- the developer half of the profile. Everything here is
    // optional, every URL goes through the same http(s)-only rule as the
    // template links, and rubbish is a 400 rather than a silent drop: a
    // saved profile must not quietly disagree with what was typed.
    if ('skills' in req.body) {
      if (!Array.isArray(req.body.skills)) {
        return res.status(400).json({ error: 'Skills must be a list' });
      }
      const seen = new Set();
      const skills = [];
      for (const raw of req.body.skills) {
        const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!s) continue;
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        skills.push(s);
        if (skills.length >= MAX_SKILLS) break; // capped, never rejected on length
      }
      updates.skills = skills;
    }

    const URL_FIELDS = { website: 'Website', github: 'GitHub' };
    for (const [field, label] of Object.entries(URL_FIELDS)) {
      if (!(field in req.body)) continue;
      const url = normalizeUrl(req.body[field]);
      if (url === null) {
        return res.status(400).json({ error: `${label} must be a valid http(s) URL` });
      }
      updates[field] = url;
    }

    if ('socialLinks' in req.body) {
      const raw = req.body.socialLinks;
      if (!Array.isArray(raw)) {
        return res.status(400).json({ error: 'Social links must be a list' });
      }
      if (raw.length > MAX_SOCIAL_LINKS) {
        return res
          .status(400)
          .json({ error: `You can keep up to ${MAX_SOCIAL_LINKS} social links` });
      }
      const links = [];
      for (const item of raw) {
        const label = String(item?.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
        const url = normalizeUrl(item?.url);
        if (!label) return res.status(400).json({ error: 'Every social link needs a name' });
        if (!url) {
          return res
            .status(400)
            .json({ error: `"${label}" needs a valid http(s) URL` });
        }
        links.push({ label, url });
      }
      updates.socialLinks = links;
    }

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
 *
 * `?limit=N` narrows the rows without touching `total`, which is counted
 * separately -- the Dashboard only ever shows six, so it should not pay for
 * sixty populated templates to get them.
 */
router.get(
  '/me/downloads',
  asyncHandler(async (req, res) => {
    const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 60));
    const [rows, total] = await Promise.all([
      Download.find({ userId: req.user.id })
        .sort({ downloadedAt: -1 })
        .limit(limit)
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
    // A limit at the cap returns the whole list, so the length still *is* the
    // total; only a genuine summary request (one that truncates) suppresses it.
    const limit = Math.min(120, Math.max(1, parseInt(req.query.limit, 10) || 120));
    const wantsSummary = req.query.limit !== undefined && limit < 120;
    const rows = await Favorite.find({ userId: req.user.id })
      .sort({ savedAt: -1 })
      .limit(limit)
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

    res.json({
      success: true,
      // `templates.length` is the total only when everything was returned.
      // A caller asking for a summary (the Dashboard shows four cards) is
      // explicitly asking for a page, and reporting its size as the total
      // would show "All 4 saved". `null` means "not counted here", and the
      // Dashboard already falls back to a link with no number on it.
      total: wantsSummary ? null : templates.length,
      templates,
    });
  })
);

module.exports = router;
