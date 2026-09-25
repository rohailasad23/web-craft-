'use strict';

const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const User = require('../models/User');
const Template = require('../models/Template');
const Download = require('../models/Download');
const Favorite = require('../models/Favorite');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const notify = require('../services/notify');
const { STATUSES } = require('../models/Template');
const storage = require('../services/storage');

const router = express.Router();

// Admin only. requireRole re-reads the role from the database, so a demoted
// admin loses access on their very next request. It also re-reads account
// status (spec §9): a suspended admin cannot moderate.
router.use(verifyToken, requireRole('admin'));

/**
 * Spec §35: append one line to the audit log.
 *
 * Fire-and-forget for the same reason notifications are -- a moderator's
 * decision is already made, and losing the receipt because the log write
 * failed would turn a working action into a failed one. `metadata` carries
 * ids, names and statuses only; §35 is explicit that no password or other
 * sensitive value belongs here.
 */
async function record(adminId, action, targetId, metadata = {}) {
  if (!adminId || !action) return;
  try {
    await AuditLog.create({ adminId, action, targetId, metadata });
  } catch (err) {
    console.error('audit log not written:', err.message);
  }
}

/** GET /api/admin/stats -- platform numbers for the admin overview. */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [users, developers, templates, approved, pending, downloads, reports, suspended] =
      await Promise.all([
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
      topTemplates: top,
    });
  })
);

/** GET /api/admin/templates?status=pending -- moderation queue. */
router.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;
    const query = status ? { status } : {};
    const templates = await Template.find(query).sort({ createdAt: -1 }).limit(200);
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
    const counts = await Download.aggregate([
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

    const user = await User.findByIdAndUpdate(req.params.id, { role }, { returnDocument: 'after' });
    if (!user) return res.status(404).json({ error: 'User not found' });

    record(req.user.id, 'user.role_changed', user._id, {
      userName: user.name,
      to: role,
    });
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

/** GET /api/admin/reports?status=pending -- spec §7/§8: the report queue. */
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

    const counts = {};
    for (const s of Report.STATUSES) counts[s] = await Report.countDocuments({ status: s });

    res.json({ success: true, reports, counts });
  })
);

/**
 * PATCH /api/admin/reports/:id -- spec §7: move a report through its lifecycle.
 * Body: { status: 'pending' | 'reviewed' | 'resolved' | 'dismissed' }
 */
router.patch(
  '/reports/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Report not found' });
    }
    const status = String(req.body.status || '');
    if (!Report.STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ error: `Status must be one of: ${Report.STATUSES.join(', ')}` });
    }

    const report = await Report.findById(req.params.id).select('_id status userId reason');
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const previous = report.status;
    report.status = status;
    await report.save();

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
