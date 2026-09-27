'use strict';

const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { invalidatePlatform } = require('../middleware/platform');
const trending = require('../services/trending');
const record = require('../utils/audit');
const Template = require('../models/Template');
const User = require('../models/User');
const Announcement = require('../models/Announcement');
const PlatformConfig = require('../models/PlatformConfig');
const { TRENDING_OVERRIDES } = require('../models/Template');

const router = express.Router();

// Admin only, same guard as routes/admin.js -- requireRole re-reads role and
// status from the database on every request.
router.use(verifyToken, requireRole('admin'));

/** Sections resolved exactly the way GET /api/platform resolves them. */
function resolvedSections(stored) {
  const byKey = new Map((stored || []).map((s) => [s.key, s]));
  return PlatformConfig.DEFAULT_SECTION_ORDER.map((key, i) => {
    const s = byKey.get(key);
    return {
      key,
      enabled: s ? s.enabled !== false : true,
      order: s && Number.isFinite(s.order) ? s.order : (i + 1) * 10,
      title: (s && s.title) || PlatformConfig.DEFAULT_SECTION_TITLES[key],
      blurb: (s && s.blurb) || '',
    };
  }).sort((a, b) => a.order - b.order);
}

/**
 * GET /api/admin/content -- everything §3/§4/§13 puts on the Content page:
 * the homepage layout, the announcements and the spotlight picks.
 */
router.get(
  '/content',
  asyncHandler(async (req, res) => {
    const doc = await PlatformConfig.load();
    const [announcements, spotlight] = await Promise.all([
      Announcement.find().sort({ createdAt: -1 }).limit(100),
      User.find({ 'spotlight.enabled': true })
        .sort({ 'spotlight.priority': 1, name: 1 })
        .select('name avatar spotlight trustLevel'),
    ]);

    res.json({
      success: true,
      sections: resolvedSections(doc.homepage?.sections),
      announcements,
      spotlight: spotlight.map((d) => ({
        id: d._id,
        name: d.name,
        avatar: d.avatar,
        trustLevel: d.trustLevel,
        spotlight: d.spotlight,
      })),
    });
  })
);

/**
 * PUT /api/admin/content/sections -- §3: enable/disable, reorder, retitle.
 * Body: { sections: [{ key, enabled, order, title, blurb }] }
 *
 * Unknown keys are dropped and missing keys fall back to their defaults (the
 * public payload merges anyway), so a partial save cannot corrupt the
 * homepage layout -- worst case it changes nothing.
 */
router.put(
  '/content/sections',
  asyncHandler(async (req, res) => {
    const raw = Array.isArray(req.body.sections) ? req.body.sections : null;
    if (!raw) return res.status(400).json({ error: 'sections must be an array' });
    if (raw.length > PlatformConfig.SECTION_KEYS.length) {
      return res.status(400).json({ error: 'Too many sections' });
    }

    const seen = new Set();
    const sections = [];
    for (const row of raw) {
      const key = String(row?.key || '');
      if (!PlatformConfig.SECTION_KEYS.includes(key) || seen.has(key)) continue;
      seen.add(key);

      const title = String(row.title ?? '').trim().slice(0, 80);
      const blurb = String(row.blurb ?? '').trim().slice(0, 200);
      const order = Math.max(0, Math.min(9999, Math.round(Number(row.order) || 0)));

      sections.push({ key, enabled: row.enabled !== false, order, title, blurb });
    }
    if (!sections.length) return res.status(400).json({ error: 'No valid sections supplied' });

    const doc = await PlatformConfig.load();
    doc.homepage.sections = sections;
    await doc.save();
    invalidatePlatform();

    record(req.user.id, 'content.sections', doc._id, {
      sections: sections.map((s) => `${s.key}:${s.enabled ? 'on' : 'off'}@${s.order}`),
    });

    res.json({ success: true, message: 'Homepage layout updated', sections: resolvedSections(sections) });
  })
);

/**
 * PATCH /api/admin/templates/:id/featured -- §1: feature / unfeature and set
 * the featured priority. The count stays real either way: featured: false
 * simply removes it from the shelf.
 */
router.patch(
  '/templates/:id/featured',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const template = await Template.findById(req.params.id).select('_id title featured featuredOrder');
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const featured = req.body.featured !== false;
    let order = template.featuredOrder || 0;
    if (req.body.order !== undefined) {
      const n = Number(req.body.order);
      if (!Number.isFinite(n)) return res.status(400).json({ error: 'order must be a number' });
      order = Math.max(0, Math.min(9999, Math.round(n)));
    }

    const changed = template.featured !== featured || (featured && template.featuredOrder !== order);
    template.featured = featured;
    if (featured) template.featuredOrder = order;
    await template.save();

    if (changed) {
      record(req.user.id, 'template.featured', template._id, {
        title: template.title,
        featured,
        order,
      });
    }

    res.json({
      success: true,
      message: featured ? `“${template.title}” is featured` : `“${template.title}” removed from featured`,
      changed,
      template: { id: template._id, featured: template.featured, order: template.featuredOrder },
    });
  })
);

/**
 * PATCH /api/admin/templates/:id/trending -- §2: the manual override.
 * Body: { trendingOverride: 'auto' | 'force' | 'off' }
 * The calculation itself never writes this field, so an admin's choice
 * survives every recalculation.
 */
router.patch(
  '/templates/:id/trending',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const trendingOverride = String(req.body.trendingOverride || '');
    if (!TRENDING_OVERRIDES.includes(trendingOverride)) {
      return res.status(400).json({ error: `trendingOverride must be one of: ${TRENDING_OVERRIDES.join(', ')}` });
    }

    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { trendingOverride },
      { returnDocument: 'after' }
    ).select('_id title trendingOverride');
    if (!template) return res.status(404).json({ error: 'Template not found' });

    // The candidate list is cached for five minutes; an admin's flip is the
    // one write that must not wait for that, or the API would keep serving
    // the very answer they just overrode.
    trending.invalidate();

    record(req.user.id, 'template.trending', template._id, {
      title: template.title,
      trendingOverride,
    });

    res.json({ success: true, message: `Trending set to ${trendingOverride}`, template });
  })
);

/**
 * PATCH /api/admin/users/:id/spotlight -- §4: select a developer, write the
 * blurb, set image/priority, switch it on or off.
 * Body: { enabled?, blurb?, image?, priority? } -- only the fields supplied
 * are touched, so the page can flip `enabled` without resending the blurb.
 */
router.patch(
  '/users/:id/spotlight',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = await User.findById(req.params.id).select('_id name spotlight');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const update = { 'spotlight.updatedBy': req.user.id };
    if (req.body.enabled !== undefined) update['spotlight.enabled'] = req.body.enabled === true;
    if (req.body.blurb !== undefined) {
      const blurb = String(req.body.blurb).trim().slice(0, 300);
      if (blurb.length && blurb.length < 10) {
        return res.status(400).json({ error: 'Spotlight text should be at least 10 characters' });
      }
      update['spotlight.blurb'] = blurb;
    }
    if (req.body.image !== undefined) {
      const image = String(req.body.image).trim().slice(0, 500);
      if (image && !/^https?:\/\//i.test(image) && !/^\/uploads\//.test(image)) {
        return res.status(400).json({ error: 'Image must be an http(s) or /uploads/ URL' });
      }
      update['spotlight.image'] = image;
    }
    if (req.body.priority !== undefined) {
      const n = Number(req.body.priority);
      if (!Number.isFinite(n)) return res.status(400).json({ error: 'priority must be a number' });
      update['spotlight.priority'] = Math.max(0, Math.min(999, Math.round(n)));
    }

    const updated = await User.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' }).select(
      '_id name spotlight'
    );

    record(req.user.id, 'user.spotlight', updated._id, {
      userName: updated.name,
      enabled: updated.spotlight.enabled,
      priority: updated.spotlight.priority,
    });

    res.json({ success: true, spotlight: updated.spotlight });
  })
);

/* --------------------------------------------------------- announcements */

/** GET /api/admin/announcements -- all of them, newest first (§13). */
router.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, announcements });
  })
);

/** Parse a date field; `null`/'' means "no end date". Invalid -> error. */
function parseDate(value, { nullable }) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return nullable ? null : undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return NaN;
  return d;
}

function validateAnnouncementBody(body, { partial }) {
  const out = {};
  const fail = (error) => ({ error });

  if (body.title !== undefined || !partial) {
    const title = String(body.title || '').trim().slice(0, 120);
    if (!title) return fail('Title is required');
    out.title = title;
  }
  if (body.message !== undefined || !partial) {
    const message = String(body.message || '').trim().slice(0, 500);
    if (!message) return fail('Message is required');
    out.message = message;
  }
  if (body.type !== undefined || !partial) {
    const type = String(body.type || 'information');
    if (!Announcement.TYPES.includes(type)) return fail(`Type must be one of: ${Announcement.TYPES.join(', ')}`);
    out.type = type;
  }
  if (body.startsAt !== undefined || !partial) {
    const startsAt = parseDate(body.startsAt ?? new Date(), { nullable: false });
    if (Number.isNaN(startsAt)) return fail('Start date is not a valid date');
    if (startsAt !== undefined) out.startsAt = startsAt;
  }
  if (body.endsAt !== undefined) {
    const endsAt = parseDate(body.endsAt, { nullable: true });
    if (Number.isNaN(endsAt)) return fail('End date is not a valid date');
    out.endsAt = endsAt;
  }
  if (body.enabled !== undefined) out.enabled = body.enabled === true;
  return { value: out };
}

/** POST /api/admin/announcements -- §13: create one. */
router.post(
  '/announcements',
  asyncHandler(async (req, res) => {
    const { error, value } = validateAnnouncementBody(req.body, { partial: false });
    if (error) return res.status(400).json({ error });
    if (value.endsAt && value.startsAt && value.endsAt < value.startsAt) {
      return res.status(400).json({ error: 'End date cannot be before the start date' });
    }

    const announcement = await Announcement.create({ ...value, createdBy: req.user.id });
    record(req.user.id, 'announcement.created', announcement._id, { title: announcement.title, type: announcement.type });
    res.status(201).json({ success: true, announcement });
  })
);

/** PATCH /api/admin/announcements/:id -- §13: edit window, text, state. */
router.patch(
  '/announcements/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    const { error, value } = validateAnnouncementBody(req.body, { partial: true });
    if (error) return res.status(400).json({ error });

    const existing = await Announcement.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Announcement not found' });

    const startsAt = value.startsAt !== undefined ? value.startsAt : existing.startsAt;
    const endsAt = value.endsAt !== undefined ? value.endsAt : existing.endsAt;
    if (endsAt && startsAt && endsAt < startsAt) {
      return res.status(400).json({ error: 'End date cannot be before the start date' });
    }

    Object.assign(existing, value);
    await existing.save();
    record(req.user.id, 'announcement.updated', existing._id, {
      title: existing.title,
      enabled: existing.enabled,
    });

    res.json({ success: true, announcement: existing });
  })
);

/** DELETE /api/admin/announcements/:id -- §13. History lives in the audit log. */
router.delete(
  '/announcements/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });

    record(req.user.id, 'announcement.deleted', announcement._id, { title: announcement.title });
    res.json({ success: true, message: 'Announcement deleted' });
  })
);

module.exports = router;
