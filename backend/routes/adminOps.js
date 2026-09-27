'use strict';

const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { getPlatform, invalidatePlatform } = require('../middleware/platform');
const record = require('../utils/audit');
const { safeRegex } = require('../utils/safeRegex');
const storage = require('../services/storage');
const Template = require('../models/Template');
const User = require('../models/User');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const SecurityEvent = require('../models/SecurityEvent');
const PlatformConfig = require('../models/PlatformConfig');

const router = express.Router();

// Same guard as routes/admin.js: role and status re-read from the database.
router.use(verifyToken, requireRole('admin'));

/** §20's queue ranking. Higher sorts first; ties fall back to age. */
const PRIORITY_RANK = { critical: 4, high: 3, normal: 2, low: 1 };

/* -------------------------------------------------------- feature flags §11 */

/** GET /api/admin/flags -- the switchboard with its current state. */
router.get(
  '/flags',
  asyncHandler(async (req, res) => {
    const config = await getPlatform();
    res.json({
      success: true,
      flags: PlatformConfig.FLAGS.map((f) => ({
        key: f.key,
        label: f.label,
        message: f.message,
        enabled: config.flags[f.key] !== false,
      })),
      maintenance: config.maintenance,
    });
  })
);

/**
 * PUT /api/admin/flags -- flip switches. Body: { flags: { key: Boolean } }.
 * Only known keys are honoured, and every changed switch is its own audit
 * line, so "who turned downloads off at 14:03?" has an exact answer.
 */
router.put(
  '/flags',
  asyncHandler(async (req, res) => {
    const supplied = req.body.flags;
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) {
      return res.status(400).json({ error: 'flags must be an object of booleans' });
    }

    const doc = await PlatformConfig.load();
    const current = doc.flags && typeof doc.flags === 'object' ? doc.flags : {};
    const next = { ...current };
    const changed = [];

    for (const key of PlatformConfig.FLAG_KEYS) {
      if (supplied[key] === undefined) continue;
      const value = supplied[key] === true;
      if ((current[key] !== false) === value) continue; // already in that state
      next[key] = value;
      changed.push({ key, from: current[key] !== false, to: value });
    }

    if (!changed.length) {
      return res.json({ success: true, changed: false, message: 'No switches changed' });
    }

    doc.flags = next;
    await doc.save();
    invalidatePlatform();

    for (const c of changed) {
      record(req.user.id, 'flag.changed', doc._id, { flag: c.key, from: c.from, to: c.to });
    }

    res.json({
      success: true,
      changed: true,
      message: `${changed.length} feature${changed.length > 1 ? 's' : ''} updated`,
      changedKeys: changed.map((c) => c.key),
    });
  })
);

/* ------------------------------------------------------- maintenance §12 */

/**
 * PUT /api/admin/maintenance -- the master switch. Body:
 * { enabled: Boolean, message?: string }
 * With the switch on, every non-admin API call gets 503 + the message; the
 * admin panel stays open (middleware/platform.js).
 */
router.put(
  '/maintenance',
  asyncHandler(async (req, res) => {
    const enabled = req.body.enabled === true;
    const doc = await PlatformConfig.load();

    const update = { enabled };
    if (req.body.message !== undefined) {
      update.message = String(req.body.message).trim().slice(0, 300);
    }

    const previous = doc.maintenance.enabled;
    doc.maintenance = { ...doc.maintenance.toObject?.() || doc.maintenance, ...update };
    await doc.save();
    invalidatePlatform();

    if (previous !== enabled) {
      record(req.user.id, 'maintenance.toggled', doc._id, { from: previous, to: enabled });
    }

    res.json({
      success: true,
      message: enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled',
      maintenance: { enabled: doc.maintenance.enabled, message: doc.maintenance.message },
    });
  })
);

/* ------------------------------------------------- security events §9/§10 */

/**
 * GET /api/admin/security -- §9's dedicated security activity section.
 *   type=     one SecurityEvent type
 *   severity= info | warning | critical
 *   scope=    logins  -> §10's admin login history (success/failure, who,
 *                        and the device/IP captured at the event)
 *   limit     default 100, capped at 200
 * Passwords/tokens never reach this collection (models/SecurityEvent.js).
 */
router.get(
  '/security',
  asyncHandler(async (req, res) => {
    const query = {};
    if (SecurityEvent.TYPES.includes(req.query.type)) query.type = req.query.type;
    if (SecurityEvent.SEVERITIES.includes(req.query.severity)) query.severity = req.query.severity;
    if (req.query.scope === 'logins') {
      // roleAtEvent is stamped at record time, including for FAILED attempts
      // against an admin account -- so "was anyone probing an admin?" is a
      // filter, not a guess.
      query.type = { $in: ['login.success', 'login.failed', 'auth.rate_limited'] };
      query.roleAtEvent = 'admin';
    }

    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const [events, all, failures, logins] = await Promise.all([
      SecurityEvent.find(query).sort({ createdAt: -1 }).limit(limit),
      SecurityEvent.countDocuments(),
      SecurityEvent.countDocuments({ type: { $in: ['login.failed', 'auth.rate_limited', 'upload.rejected'] } }),
      SecurityEvent.countDocuments({ type: { $in: ['login.success', 'login.failed', 'auth.rate_limited'] }, roleAtEvent: 'admin' }),
    ]);

    res.json({ success: true, events, counts: { all, failures, logins } });
  })
);

/* ------------------------------------------------------ health + backup §15/§22 */

/**
 * GET /api/admin/health -- §22's honest overview. Every check is measured,
 * never assumed:
 *   - storage is only "healthy" if the uploads directory is actually writable
 *   - moderation/security are real counts
 *   - anything unmeasurable says "Unknown"
 *   - backup says "not configured" because nothing HAS been configured (§15:
 *     "Never pretend that backups exist.")
 */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const now = Date.now();
    const readyState = mongoose.connection.readyState;
    const database =
      readyState === 1
        ? { state: 'healthy', label: 'Healthy' }
        : readyState === 0
          ? { state: 'unhealthy', label: 'Disconnected' }
          : { state: 'unknown', label: 'Unknown' };

    // Only claim the disk is fine once we have touched it.
    let storageCheck;
    try {
      fs.accessSync(storage.UPLOAD_ROOT, fs.constants.W_OK);
      storageCheck = { state: 'healthy', label: 'Healthy' };
    } catch {
      storageCheck = { state: 'unknown', label: 'Unknown' };
    }

    const [pendingTemplates, pendingReports, critical24h] = await Promise.all([
      Template.countDocuments({ status: 'pending' }),
      Report.countDocuments({ status: 'pending' }),
      SecurityEvent.countDocuments({ severity: 'critical', createdAt: { $gte: new Date(now - 24 * 3600 * 1000) } }),
    ]);
    const pending = pendingTemplates + pendingReports;

    // Honesty rule (§15/§22): if nothing configured a backup, say so. The
    // env vars are checked rather than a hard-coded "off" so a real backup
    // integration flips this display without touching code.
    const backupConfigured = ['BACKUP_URL', 'BACKUP_COMMAND', 'BACKUP_CRON'].some(
      (k) => String(process.env[k] || '').trim()
    );

    res.json({
      success: true,
      checks: {
        database: { state: database.state, label: database.label },
        api: { state: 'healthy', label: 'Healthy', uptimeSeconds: Math.round(process.uptime()) },
        storage: storageCheck,
        moderation: {
          state: pending ? 'attention' : 'healthy',
          label: pending ? `${pending} Pending` : 'Clear',
          pending,
        },
        security: {
          state: critical24h ? 'attention' : 'healthy',
          label: critical24h ? `${critical24h} critical (24h)` : 'No critical events',
          critical24h,
        },
        backup: backupConfigured
          ? { state: 'configured', label: 'Configured' }
          : { state: 'not_configured', label: 'Not configured', message: 'Backup service not configured.' },
      },
      generatedAt: new Date().toISOString(),
    });
  })
);

/* ------------------------------------------------- moderation queue §19/§20 */

/**
 * GET /api/admin/queue -- §19's unified queue. Real pending work only: no
 * invented "developer verifications" (nothing requests verification yet),
 * so every number here is a thing an admin can actually click through.
 * Reports come back sorted by §20 priority, oldest first inside a priority.
 */
router.get(
  '/queue',
  asyncHandler(async (req, res) => {
    const [templates, reports, flaggedTemplates, flaggedUsers, duplicates] = await Promise.all([
      Template.find({ status: 'pending' })
        .sort({ createdAt: 1 })
        .limit(50)
        .select('title slug thumbnail authorName category createdAt'),
      Report.find({ status: 'pending' })
        .limit(100)
        .populate({ path: 'templateId', select: 'title slug status' })
        .populate({ path: 'userId', select: 'name' }),
      Template.find({ 'content.state': 'flagged' })
        .sort({ updatedAt: -1 })
        .limit(50)
        .select('title slug authorName content.state updatedAt'),
      User.find({ 'content.state': 'flagged' })
        .sort({ updatedAt: -1 })
        .limit(50)
        .select('name email role content.state updatedAt'),
      Template.find({ 'duplicateCheck.matches.0': { $exists: true }, 'duplicateCheck.reviewed': false })
        .sort({ 'duplicateCheck.checkedAt': -1 })
        .limit(50)
        .select('title slug authorName duplicateCheck'),
    ]);

    // §20: priority first, oldest first within a priority -- done in JS
    // because the rank order (critical..low) is not the alphabetical order a
    // plain $sort would give, and the pending set is bounded at 100.
    const byPriority = reports
      .slice()
      .sort(
        (a, b) =>
          (PRIORITY_RANK[b.priority] || 2) - (PRIORITY_RANK[a.priority] || 2) ||
          new Date(a.createdAt) - new Date(b.createdAt)
      );

    const content = [
      ...flaggedTemplates.map((t) => ({
        targetType: 'template',
        targetId: t._id,
        label: t.title,
        detail: t.authorName,
        at: t.updatedAt,
      })),
      ...flaggedUsers.map((u) => ({
        targetType: 'user',
        targetId: u._id,
        label: u.name,
        detail: u.email,
        at: u.updatedAt,
      })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));

    const counts = {
      templates: templates.length,
      reports: reports.length,
      content: content.length,
      duplicates: duplicates.length,
    };

    res.json({
      success: true,
      templates,
      reports: byPriority,
      content,
      duplicates: duplicates.map((t) => ({
        id: t._id,
        title: t.title,
        slug: t.slug,
        authorName: t.authorName,
        checkedAt: t.duplicateCheck.checkedAt,
        matches: t.duplicateCheck.matches,
      })),
      counts: { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) },
    });
  })
);

/* ------------------------------------------------------ global search §23 */

/**
 * GET /api/admin/search?q= -- §23: one field, five categorised groups, each
 * with a count and its top rows. Counts are real (countDocuments over the
 * same query), never estimated.
 */
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q.length < 2) return res.status(400).json({ error: 'Type at least 2 characters to search' });

    // Already escaped and case-insensitive; used as a field value exactly the
    // way catalogue search does it (routes/templates.js).
    const rx = safeRegex(q);

    const developerMatch = { role: 'developer', $or: [{ name: rx }, { email: rx }, { github: rx }] };
    const userMatch = { role: { $ne: 'developer' }, $or: [{ name: rx }, { email: rx }] };
    const templateMatch = { $or: [{ title: rx }, { technologies: rx }, { tags: rx }, { authorName: rx }] };
    const reportMatch = { $or: [{ reason: rx }, { description: rx }] };
    const auditMatch = { $or: [{ action: rx }, { 'metadata.title': rx }, { 'metadata.userName': rx }] };

    const [tplCount, devCount, usrCount, rptCount, audCount, templates, developers, users, reports, audit] =
      await Promise.all([
        Template.countDocuments(templateMatch),
        User.countDocuments(developerMatch),
        User.countDocuments(userMatch),
        Report.countDocuments(reportMatch),
        AuditLog.countDocuments(auditMatch),
        Template.find(templateMatch).limit(5).select('title slug status category authorName'),
        User.find(developerMatch).limit(5).select('name email trustLevel'),
        User.find(userMatch).limit(5).select('name email role status'),
        Report.find(reportMatch)
          .limit(5)
          .populate({ path: 'templateId', select: 'title' })
          .populate({ path: 'userId', select: 'name' }),
        AuditLog.find(auditMatch)
          .limit(5)
          .populate({ path: 'adminId', select: 'name' }),
      ]);

    res.json({
      success: true,
      query: q,
      groups: [
        { key: 'templates', label: 'Templates', count: tplCount, items: templates },
        { key: 'developers', label: 'Developers', count: devCount, items: developers },
        { key: 'users', label: 'Users', count: usrCount, items: users },
        { key: 'reports', label: 'Reports', count: rptCount, items: reports },
        { key: 'audit', label: 'Audit logs', count: audCount, items: audit },
      ],
    });
  })
);

module.exports = router;
