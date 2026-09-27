'use strict';

const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const record = require('../utils/audit');
const Template = require('../models/Template');
const User = require('../models/User');
const Report = require('../models/Report');
const AdminNote = require('../models/AdminNote');
const Watchlist = require('../models/Watchlist');
const { QUALITY_STATUSES, QUALITY_CHECKS, CONTENT_STATES } = require('../models/Template');
const { TRUST_LEVELS, CONTENT_STATES: USER_CONTENT_STATES } = require('../models/User');

const router = express.Router();

// Same guard as routes/admin.js: role and status re-read from the database.
router.use(verifyToken, requireRole('admin'));

/** §5-§8/§14/§17-§18 entity lookup: is this id a real thing we can act on? */
async function findTarget(targetType, targetId) {
  if (!mongoose.isValidObjectId(targetId)) return null;
  switch (targetType) {
    case 'template':
      return Template.findById(targetId).select('_id title slug');
    case 'report':
      return Report.findById(targetId).select('_id reason status');
    case 'user':
    case 'developer':
      return User.findById(targetId).select('_id name email role');
    default:
      return null;
  }
}

/* ------------------------------------------------------------- quality §5/§6 */

/**
 * PATCH /api/admin/templates/:id/quality -- §5's verdict and §6's score,
 * both entered by a person. Nothing here is ever computed: an untouched
 * template stays 'unchecked' rather than quietly becoming "verified".
 * Body: { status, score (0-10|null), checks: [{key, ok}], note }
 */
router.patch(
  '/templates/:id/quality',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const template = await Template.findById(req.params.id).select('_id title quality');
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const status = String(req.body.status ?? template.quality.status);
    if (!QUALITY_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${QUALITY_STATUSES.join(', ')}` });
    }

    let score = template.quality.score;
    if (req.body.score !== undefined) {
      if (req.body.score === null || req.body.score === '') score = null;
      else {
        const n = Number(req.body.score);
        if (!Number.isFinite(n) || n < 0 || n > 10) {
          return res.status(400).json({ error: 'Score must be between 0 and 10' });
        }
        score = Math.round(n * 10) / 10; // one decimal place, like 8.5
      }
    }

    const checks = Array.isArray(req.body.checks)
      ? req.body.checks
          .filter((c) => QUALITY_CHECKS.includes(c?.key))
          .map((c) => ({ key: c.key, ok: c.ok === true }))
          .slice(0, QUALITY_CHECKS.length)
      : template.quality.checks;

    const note = req.body.note !== undefined ? String(req.body.note).trim().slice(0, 500) : template.quality.note;

    template.quality = {
      status,
      score,
      checks,
      note,
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
    };
    await template.save();

    record(req.user.id, 'template.quality', template._id, {
      title: template.title,
      status,
      score,
      checked: checks.filter((c) => c.ok).length,
    });

    res.json({ success: true, message: `Quality set to ${status.replace('_', ' ')}`, quality: template.quality });
  })
);

/* ------------------------------------------------------ content moderation §14 */

/**
 * PATCH /api/admin/templates/:id/content -- flag / hide / restore / edit the
 * description. The developer's original text is NEVER overwritten: an edit
 * stores an override, a restore clears it (§14: restore must be possible,
 * and nothing is modified silently -- every change lands in the audit log).
 * Body: { state?: 'visible'|'flagged'|'hidden', description?: string|null }
 */
router.patch(
  '/templates/:id/content',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const template = await Template.findById(req.params.id).select('_id title description content');
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const update = {};
    const meta = { targetType: 'template', title: template.title };

    if (req.body.state !== undefined) {
      const state = String(req.body.state);
      if (!CONTENT_STATES.includes(state)) {
        return res.status(400).json({ error: `state must be one of: ${CONTENT_STATES.join(', ')}` });
      }
      if (state !== template.content.state) {
        update['content.state'] = state;
        record(req.user.id, 'template.content', template._id, {
          ...meta,
          op: state === 'visible' ? 'restored' : state === 'flagged' ? 'flagged' : 'hidden',
          from: template.content.state,
          to: state,
        });
      }
    }

    if (req.body.description !== undefined) {
      // null clears the override (that IS "restore"); a string replaces it.
      if (req.body.description === null) {
        if (template.content.editedDescription) {
          update['content.editedDescription'] = null;
          update['content.editedBy'] = null;
          record(req.user.id, 'template.content', template._id, { ...meta, op: 'restored_edit' });
        }
      } else {
        const d = String(req.body.description).trim().slice(0, 4000);
        if (d.length < 10) {
          return res.status(400).json({ error: 'Edited description must be at least 10 characters' });
        }
        update['content.editedDescription'] = d;
        update['content.editedBy'] = req.user.id;
        update['content.editedAt'] = new Date();
        record(req.user.id, 'template.content', template._id, {
          ...meta,
          op: 'edited',
          // The audit row keeps the PREVIOUS text (capped) so "what did this
          // say before the moderator touched it?" stays answerable (§14).
          previous: (template.content.editedDescription || template.description || '').slice(0, 500),
        });
      }
    }

    if (!Object.keys(update).length) {
      return res.json({ success: true, changed: false, content: template.content });
    }

    const updated = await Template.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' }).select(
      '_id content'
    );
    res.json({ success: true, changed: true, content: updated.content });
  })
);

/**
 * PATCH /api/admin/templates/:id/duplicates -- §8: the admin's decision on a
 * warning. { reviewed: true } keeps it out of the queue; re-opening sets it
 * back. Nothing is ever auto-deleted.
 */
router.patch(
  '/templates/:id/duplicates',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const template = await Template.findById(req.params.id).select('_id title duplicateCheck');
    if (!template) return res.status(404).json({ error: 'Template not found' });
    if (!template.duplicateCheck?.matches?.length) {
      return res.status(400).json({ error: 'This template has no duplicate warnings' });
    }

    const reviewed = req.body.reviewed !== false;
    template.duplicateCheck.reviewed = reviewed;
    template.duplicateCheck.reviewedBy = req.user.id;
    await template.save();

    record(req.user.id, 'template.duplicate_reviewed', template._id, {
      title: template.title,
      reviewed,
      matches: template.duplicateCheck.matches.length,
    });

    res.json({ success: true, message: reviewed ? 'Duplicate warning cleared' : 'Duplicate warning reopened', duplicateCheck: template.duplicateCheck });
  })
);

/* ------------------------------------------------------------ trust level §7 */

/**
 * PATCH /api/admin/users/:id/trust -- §7's ladder, admin-driven. Body:
 * { trustLevel: 'new' | 'active' | 'trusted' | 'verified' }
 * Recorded either way, including demotions -- "who downgraded them?" is
 * exactly the question §25 wants answerable.
 */
router.patch(
  '/users/:id/trust',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'User not found' });
    }
    const trustLevel = String(req.body.trustLevel || '');
    if (!TRUST_LEVELS.includes(trustLevel)) {
      return res.status(400).json({ error: `Trust level must be one of: ${TRUST_LEVELS.join(', ')}` });
    }

    const user = await User.findById(req.params.id).select('_id name trustLevel');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const previous = user.trustLevel || 'new';
    if (previous === trustLevel) {
      return res.json({ success: true, changed: false, trustLevel });
    }

    user.trustLevel = trustLevel;
    user.trustChangedAt = new Date();
    await user.save();

    record(req.user.id, 'user.trust', user._id, { userName: user.name, from: previous, to: trustLevel });

    res.json({ success: true, changed: true, message: `${user.name} is now “${trustLevel}”`, trustLevel });
  })
);

/** PATCH /api/admin/users/:id/content -- §14 for developer bios. */
router.patch(
  '/users/:id/content',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = await User.findById(req.params.id).select('_id name bio content');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const update = {};
    const meta = { targetType: 'user', userName: user.name };

    if (req.body.state !== undefined) {
      const state = String(req.body.state);
      if (!USER_CONTENT_STATES.includes(state)) {
        return res.status(400).json({ error: `state must be one of: ${USER_CONTENT_STATES.join(', ')}` });
      }
      if (state !== user.content.state) {
        update['content.state'] = state;
        record(req.user.id, 'user.content', user._id, {
          ...meta,
          op: state === 'visible' ? 'restored' : state === 'flagged' ? 'flagged' : 'hidden',
          from: user.content.state,
          to: state,
        });
      }
    }

    if (req.body.bio !== undefined) {
      if (req.body.bio === null) {
        if (user.content.editedBio) {
          update['content.editedBio'] = null;
          update['content.editedBy'] = null;
          record(req.user.id, 'user.content', user._id, { ...meta, op: 'restored_edit' });
        }
      } else {
        const bio = String(req.body.bio).trim().slice(0, 500);
        update['content.editedBio'] = bio;
        update['content.editedBy'] = req.user.id;
        update['content.editedAt'] = new Date();
        record(req.user.id, 'user.content', user._id, {
          ...meta,
          op: 'edited',
          previous: (user.content.editedBio || user.bio || '').slice(0, 500),
        });
      }
    }

    if (!Object.keys(update).length) {
      return res.json({ success: true, changed: false, content: user.content });
    }

    const updated = await User.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' }).select('_id content');
    res.json({ success: true, changed: true, content: updated.content });
  })
);

/* ------------------------------------------------------------ notes §17 */

/** GET /api/admin/notes?targetType=&targetId= -- one entity's private notes. */
router.get(
  '/notes',
  asyncHandler(async (req, res) => {
    const targetType = String(req.query.targetType || '');
    if (!AdminNote.TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ error: 'targetType must be one of: ' + AdminNote.TARGET_TYPES.join(', ') });
    }
    if (!mongoose.isValidObjectId(req.query.targetId)) {
      return res.status(400).json({ error: 'A targetId is required' });
    }

    const notes = await AdminNote.find({ targetType, targetId: req.query.targetId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, notes });
  })
);

/** POST /api/admin/notes -- §17: add an internal note. Never public. */
router.post(
  '/notes',
  asyncHandler(async (req, res) => {
    const targetType = String(req.body.targetType || '');
    const body = String(req.body.body || '').trim().slice(0, 1000);
    if (!AdminNote.TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ error: 'targetType must be one of: ' + AdminNote.TARGET_TYPES.join(', ') });
    }
    if (!body) return res.status(400).json({ error: 'The note cannot be empty' });

    const target = await findTarget(targetType, req.body.targetId);
    if (!target) return res.status(404).json({ error: 'Target not found' });

    // req.user carries only { id, email, role } from the JWT, so the note's
    // author label needs one lookup -- it is what makes the note traceable.
    const author = await User.findById(req.user.id).select('name').lean();

    const note = await AdminNote.create({
      targetType,
      targetId: target._id,
      authorId: req.user.id,
      authorName: author?.name || '',
      body,
    });
    res.status(201).json({ success: true, note });
  })
);

/** DELETE /api/admin/notes/:id -- the note's own author, or any admin. */
router.delete(
  '/notes/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Note not found' });
    }
    const note = await AdminNote.findByIdAndDelete(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json({ success: true, message: 'Note deleted' });
  })
);

/* ---------------------------------------------------------- watchlist §18 */

/**
 * POST /api/admin/watch -- toggle. Returns the resulting state, so the same
 * button serves "watch" and "unwatch" without the client tracking anything.
 * Body: { targetType, targetId, label?, href? }
 */
router.post(
  '/watch',
  asyncHandler(async (req, res) => {
    const targetType = String(req.body.targetType || '');
    if (!Watchlist.TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ error: 'targetType must be one of: ' + Watchlist.TARGET_TYPES.join(', ') });
    }
    const target = await findTarget(targetType, req.body.targetId);
    if (!target) return res.status(404).json({ error: 'Target not found' });

    const filter = { adminId: req.user.id, targetType, targetId: target._id };
    const existing = await Watchlist.findOne(filter);
    if (existing) {
      await existing.deleteOne();
      return res.json({ success: true, watching: false, message: 'Removed from your watchlist' });
    }

    const label =
      String(req.body.label || '').trim().slice(0, 200) ||
      target.title ||
      target.name ||
      target.reason ||
      'Item';
    await Watchlist.create({ ...filter, label, href: String(req.body.href || '').slice(0, 300) });
    res.json({ success: true, watching: true, message: 'Added to your watchlist' });
  })
);

/**
 * GET /api/admin/watchlist -- this admin's watched items, newest first.
 * Populated so the page renders names and links without four extra queries.
 */
router.get(
  '/watchlist',
  asyncHandler(async (req, res) => {
    const targetType = String(req.query.targetType || '');
    const filter = { adminId: req.user.id };
    if (Watchlist.TARGET_TYPES.includes(targetType)) filter.targetType = targetType;

    const items = await Watchlist.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, items });
  })
);

module.exports = router;
