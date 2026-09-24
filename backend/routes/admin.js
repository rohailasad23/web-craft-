'use strict';

const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const User = require('../models/User');
const Template = require('../models/Template');
const Download = require('../models/Download');
const { STATUSES } = require('../models/Template');
const storage = require('../services/storage');

const router = express.Router();

// Admin only. requireRole re-reads the role from the database, so a demoted
// admin loses access on their very next request.
router.use(verifyToken, requireRole('admin'));

/** GET /api/admin/stats -- platform numbers for the admin overview. */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [users, developers, templates, approved, pending, downloads] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: { $in: ['developer', 'admin'] } }),
        Template.countDocuments(),
        Template.countDocuments({ status: 'approved' }),
        Template.countDocuments({ status: 'pending' }),
        Download.countDocuments(),
      ]);

    const top = await Template.find({ status: 'approved' })
      .sort({ downloadCount: -1 })
      .limit(5)
      .select('title slug downloadCount category');

    res.json({
      success: true,
      stats: { users, developers, templates, approved, pending, downloads, uniqueDownloads: downloads },
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

    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: 'after', runValidators: true }
    );
    if (!template) return res.status(404).json({ error: 'Template not found' });

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

    await Download.deleteMany({ templateId: template._id });

    const keys = [
      template.thumbnail,
      ...(template.screenshots || []),
      template.file?.key ? storage.urlFor(template.file.key) : null,
    ].filter(Boolean);

    for (const url of keys) {
      const m = /^\/uploads\/(.+)$/.exec(url);
      if (m) storage.remove(m[1]);
    }

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

    res.json({ success: true, message: `${user.name} is now ${role}`, user: { id: user._id, role: user.role } });
  })
);

module.exports = router;
