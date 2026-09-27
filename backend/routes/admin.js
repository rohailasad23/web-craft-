'use strict';

const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const record = require('../utils/audit');
const recordSecurityEvent = require('../services/securityEvent');
const trending = require('../services/trending');
const User = require('../models/User');
const Template = require('../models/Template');
const Download = require('../models/Download');
const Favorite = require('../models/Favorite');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const SecurityEvent = require('../models/SecurityEvent');
const notify = require('../services/notify');
const { STATUSES } = require('../models/Template');
const { PRIORITIES } = require('../models/Report');
const storage = require('../services/storage');

const router = express.Router();

// Admin only. requireRole re-reads the role from the database, so a demoted
// admin loses access on their very next request. It also re-reads account
// status (spec §9): a suspended admin cannot moderate.
router.use(verifyToken, requireRole('admin'));

/** GET /api/admin/stats -- platform numbers for the admin overview. */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [
      users,
      developers,
      templates,
      approved,
      pending,
      downloads,
      reports,
      suspended,
      flaggedContent,
      flaggedUsers,
      duplicates,
      critical24h,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: { $in: ['developer', 'admin'] } }),
      Template.countDocuments(),
      Template.countDocuments({ status: 'approved' }),
      Template.countDocuments({ status: 'pending' }),
      Download.countDocuments(),
      // §14's "total reports" -- the OPEN ones, which is the number that
      // tells a moderator whether there is work waiting.
      Report.countDocuments({ status: 'pending' }),
      User.countDocuments({ status: 'suspended' }),
      // §21's "Action Required" is built from work that genuinely exists --
      // flagged content, uncleared duplicate warnings and critical security
      // events are counted here so the dashboard never needs a second call.
      Template.countDocuments({ 'content.state': 'flagged' }),
      User.countDocuments({ 'content.state': 'flagged' }),
      Template.countDocuments({ 'duplicateCheck.matches.0': { $exists: true }, 'duplicateCheck.reviewed': false }),
      SecurityEvent.countDocuments({
        severity: 'critical',
        createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
      }),
    ]);

    const top = await Template.find({ status: 'approved' })
      .sort({ downloadCount: -1 })
      .limit(5)
      .select('title slug downloadCount category');

    res.json({
      success: true,
      stats: {
        users,
        developers,
        templates,
        approved,
        pending,
        downloads,
        uniqueDownloads: downloads,
        reports,
        suspended,
      },
      // §21: one number per kind of attention. Every figure is a real count
      // of open work -- nothing here is simulated to make the panel look
      // busy, and zero means "nothing needs you", not "not implemented".
      actionRequired: {
        templates: pending,
        reports,
        content: flaggedContent + flaggedUsers,
        duplicates,
        security: critical24h,
      },
      topTemplates: top,
    });
  })
);

/** GET /api/admin/templates?status=pending -- moderation queue. */
router.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;
    // With no filter this means "every status". Written as an explicit $in
    // rather than `{}` so the { status, createdAt } index can both filter and
    // order it -- `{}` left the sort with nothing to hang off, sorting the
    // whole catalogue in memory to return 200 rows.
    const query = status ? { status } : { status: { $in: STATUSES } };
    const templates = await Template.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      // The moderation table renders a thumbnail, a title, a badge and one line
      // of metadata. The prose and version history it never shows were the bulk
      // of every row, on a request capped at 200 rows.
      .select('-description -changelog -file');
    res.json({ success: true, templates });
  })
);

/**
 * PATCH /api/admin/templates/:id/status -- approve / reject / restore.
 * Body: { status: 'approved' | 'rejected' | 'pending' }
 */
router.patch(
  '/templates/:id/status',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const status = String(req.body.status || '');
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}` });
    }

    const existing = await Template.findById(req.params.id)
      .select('_id status author authorName title slug');
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    const previous = existing.status;

    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: 'after', runValidators: true }
    );
    if (!template) return res.status(404).json({ error: 'Template not found' });

    // Nothing changed -> nothing to announce and nothing to log. Repeating
    // the same click should not fill the author's feed or the audit trail.
    if (previous !== status) {
      // A moderation move can add or remove the template from the trending
      // candidate list, so the cached answer must not outlive the decision.
      trending.invalidate();

      const action =
        status === 'approved'
          ? 'template.approved'
          : status === 'rejected'
            ? 'template.rejected'
            : 'template.restored';

      record(req.user.id, action, template._id, {
        title: template.title,
        from: previous,
        to: status,
        authorName: template.authorName,
      });

      // §12: the author hears about their own submission, in their words.
      await notify({
        userId: template.author,
        type: status === 'approved' ? 'approved' : 'rejected',
        title:
          status === 'approved'
            ? `“${template.title}” is now live`
            : `“${template.title}” was not approved`,
        message:
          status === 'approved'
            ? 'Your template has been approved and is visible in the catalogue.'
            : status === 'rejected'
              ? 'A moderator reviewed it and it was not approved. You can edit and resubmit.'
              : 'It has been returned to the review queue.',
        relatedId: template._id,
        href: `/templates/${template.slug}`,
      });
    }

    res.json({ success: true, message: `Template marked as ${status}`, template });
  })
);

/** DELETE /api/admin/templates/:id -- remove a template and its files. */
router.delete(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const template = await Template.findByIdAndDelete(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    // The deleted row may be sitting in the cached trending candidate list.
    trending.invalidate();

    // The owner's DELETE route already does this; the admin path must match,
    // otherwise a moderated deletion leaves favourite rows pointing at
    // nothing and inflates everyone's saved count with ghosts.
    await Promise.all([
      Download.deleteMany({ templateId: template._id }),
      Favorite.deleteMany({ templateId: template._id }),
      Report.deleteMany({ templateId: template._id }),
    ]);

    const keys = [
      template.thumbnail,
      ...(template.screenshots || []),
      template.file?.key ? storage.urlFor(template.file.key) : null,
    ].filter(Boolean);

    for (const url of keys) {
      const m = /^\/uploads\/(.+)$/.exec(url);
      if (m) storage.remove(m[1]);
    }

    record(req.user.id, 'template.deleted', template._id, {
      title: template.title,
      authorName: template.authorName,
    });

    await notify({
      userId: template.author,
      type: 'removed',
      title: `“${template.title}” was removed`,
      message: 'A moderator removed this template from the catalogue.',
      href: '/developer/templates',
    });

    res.json({ success: true, message: 'Template deleted' });
  })
);

/** GET /api/admin/users -- list accounts for management. */
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const users = await User.find().sort({ createdAt: -1 }).limit(200).select('-passwordHash');
    // Only the downloads of the accounts actually on screen. Grouping the whole
    // Download collection cost a row per download ever written to answer for at
    // most 200 of them.
    const userIds = users.map((u) => u._id);
    const counts = await Download.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', downloads: { $sum: 1 } } },
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c.downloads]));

    res.json({
      success: true,
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        // §9: surfaced so the admin UI can show and reverse a suspension.
        status: u.status || 'active',
        createdAt: u.createdAt,
        downloads: byId.get(String(u._id)) || 0,
        // §7's trust ladder, §4's spotlight state and §14's moderation flag
        // -- the three judgements the Users screen now lets an admin see and
        // change without leaving the row.
        trustLevel: u.trustLevel || 'new',
        spotlight: u.spotlight || { enabled: false },
        contentState: u.content?.state || 'visible',
        // The whole content sub-doc too (state + any override), so the Manage
        // dialog can open on the truth -- "is an override active?" cannot be
        // answered from the flattened state alone.
        content: u.content || { state: 'visible' },
      })),
    });
  })
);

/**
 * PATCH /api/admin/users/:id/role -- the ONLY place a role can be changed.
 * Body: { role: 'user' | 'developer' | 'admin' }
 */
router.patch(
  '/users/:id/role',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'User not found' });
    }
    const role = String(req.body.role || '');
    if (!User.ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${User.ROLES.join(', ')}` });
    }

    // Read the current role first: the security event below says what it
    // CHANGED from, and a post-update read no longer knows that.
    const existing = await User.findById(req.params.id).select('_id role').lean();
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const user = await User.findByIdAndUpdate(req.params.id, { role }, { returnDocument: 'after' });
    if (!user) return res.status(404).json({ error: 'User not found' });

    record(req.user.id, 'user.role_changed', user._id, {
      userName: user.name,
      to: role,
    });

    // §9: permission changes belong in the security log as well as the audit
    // log -- "who granted this account admin?" has to sit next to the failed
    // logins, which is where a reviewer already looks.
    if (existing.role !== role) {
      recordSecurityEvent('role.changed', {
        req,
        severity: 'warning',
        actorId: req.user.id,
        email: user.email,
        roleAtEvent: req.user.role,
        meta: { targetId: String(user._id), userName: user.name, from: existing.role, to: role },
      });
    }
    await notify({
      userId: user._id,
      type: 'account',
      title: `Your account is now ${role}`,
      message:
        role === 'developer'
          ? 'You can publish and manage templates.'
          : role === 'user'
            ? 'You can browse, download and save templates.'
            : 'You now have administrative access.',
      href: '/dashboard',
    });

    res.json({ success: true, message: `${user.name} is now ${role}`, user: { id: user._id, role: user.role } });
  })
);

/**
 * PATCH /api/admin/users/:id/status -- spec §9: suspend / unsuspend.
 * Body: { status: 'active' | 'suspended' }
 *
 * Refusing to suspend yourself is not a security control -- an admin could
 * just use the other account -- it is a footgun guard: this endpoint would
 * otherwise lock the operator out of the panel they are standing in, with no
 * way back in.
 */
router.patch(
  '/users/:id/status',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'User not found' });
    }
    const status = String(req.body.status || '');
    if (!User.STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${User.STATUSES.join(', ')}` });
    }
    if (String(req.params.id) === String(req.user.id) && status === 'suspended') {
      return res.status(400).json({ error: 'You cannot suspend your own account' });
    }

    const user = await User.findById(req.params.id).select('_id name email status');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const previous = user.status || 'active';
    if (previous === status) {
      return res.json({ success: true, message: `${user.name} is already ${status}`, changed: false });
    }

    user.status = status;
    await user.save();

    record(req.user.id, status === 'suspended' ? 'user.suspended' : 'user.unsuspended', user._id, {
      userName: user.name,
      from: previous,
      to: status,
    });

    // §9's "account status changes": who suspended this account, when, and
    // which account it was -- beside the login events that will show the
    // effect the very next time they try to sign in.
    recordSecurityEvent(status === 'suspended' ? 'account.suspended' : 'account.unsuspended', {
      req,
      severity: 'warning',
      actorId: req.user.id,
      email: user.email,
      roleAtEvent: req.user.role,
      meta: { targetId: String(user._id), userName: user.name, from: previous, to: status },
    });

    // The account owner needs to know why they suddenly cannot sign in.
    await notify({
      userId: user._id,
      type: 'account',
      title: status === 'suspended' ? 'Your account has been suspended' : 'Your account is active again',
      message:
        status === 'suspended'
          ? 'You cannot sign in while this is in place. Contact support if you think this is a mistake.'
          : 'You can sign in and use web craft as usual.',
      href: '/',
    });

    res.json({
      success: true,
      message: `${user.name} is now ${status}`,
      changed: true,
      user: { id: user._id, status },
    });
  })
);

/**
 * GET /api/admin/reports?status=pending -- spec §7/§8: the report queue.
 */
router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const status = Report.STATUSES.includes(req.query.status) ? req.query.status : undefined;
    const query = status ? { status } : {};

    const reports = await Report.find(query)
      .sort({ status: 1, createdAt: -1 })
      .limit(200)
      .populate({ path: 'templateId', select: 'title slug status author' })
      .populate({ path: 'userId', select: 'name' });

    // Four counts for four tabs -- run together rather than one after another,
    // which added four round trips to every load of the report queue.
    const statusCounts = await Promise.all(
      Report.STATUSES.map((s) => Report.countDocuments({ status: s }))
    );
    const counts = Object.fromEntries(Report.STATUSES.map((s, i) => [s, statusCounts[i]]));

    res.json({ success: true, reports, counts });
  })
);

/**
 * PATCH /api/admin/reports/:id -- spec §7: move a report through its lifecycle,
 * and §20: let an admin re-rank it once they know more than the reason did.
 * Body: { status?: one of STATUSES, priority?: one of PRIORITIES }
 */
router.patch(
  '/reports/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const hasStatus = req.body.status !== undefined;
    const hasPriority = req.body.priority !== undefined;
    if (!hasStatus && !hasPriority) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const status = hasStatus ? String(req.body.status) : undefined;
    if (hasStatus && !Report.STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ error: `Status must be one of: ${Report.STATUSES.join(', ')}` });
    }
    const priority = hasPriority ? String(req.body.priority) : undefined;
    if (hasPriority && !PRIORITIES.includes(priority)) {
      return res
        .status(400)
        .json({ error: `Priority must be one of: ${PRIORITIES.join(', ')}` });
    }

    const report = await Report.findById(req.params.id).select(
      '_id status priority userId reason'
    );
    if (!report) return res.status(404).json({ error: 'Report not found' });

    // Priority on its own is a re-rank, not a lifecycle move: it gets its own
    // audit line and must not notify the reporter (nothing was decided).
    // When both fields arrive, the priority change is applied first and the
    // status logic below persists them together in one save.
    let priorityFrom = null;
    if (hasPriority && priority !== report.priority) {
      priorityFrom = report.priority;
      report.priority = priority;
    }

    if (!hasStatus) {
      if (priorityFrom) {
        await report.save();
        record(req.user.id, 'report.priority', report._id, {
          reason: report.reason,
          from: priorityFrom,
          to: priority,
        });
        return res.json({ success: true, message: `Priority set to ${priority}`, report, changed: true });
      }
      return res.json({ success: true, changed: false, report });
    }

    const previous = report.status;
    report.status = status;
    await report.save();

    if (priorityFrom) {
      record(req.user.id, 'report.priority', report._id, {
        reason: report.reason,
        from: priorityFrom,
        to: priority,
      });
    }

    if (previous !== status) {
      record(req.user.id, status === 'dismissed' ? 'report.dismissed' : 'report.resolved', report._id, {
        reason: report.reason,
        from: previous,
        to: status,
      });

      // The reporter asked a question; silence would be worse than either
      // answer. Wording stays neutral because the outcome does not imply the
      // template was guilty (a copyright claim can be dismissed as unfounded).
      if (previous === 'pending') {
        await notify({
          userId: report.userId,
          type: 'report',
          title: status === 'dismissed' ? 'Your report was reviewed' : 'Your report was actioned',
          message:
            status === 'dismissed'
              ? 'Thanks for flagging it -- on review, no action was needed.'
              : 'Thanks, the issue you reported has been dealt with.',
          href: '/templates',
        });
      }
    }

    res.json({ success: true, message: `Report marked as ${status}`, report });
  })
);

/**
 * GET /api/admin/audit -- spec §35: read the log back.
 * Newest first, optionally narrowed to a single action.
 */
router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const action = AuditLog.ACTIONS.includes(req.query.action) ? req.query.action : undefined;
    const query = action ? { action } : {};

    const entries = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate({ path: 'adminId', select: 'name' });

    res.json({ success: true, entries });
  })
);

module.exports = router;
