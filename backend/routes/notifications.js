'use strict';

const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const Notification = require('../models/Notification');

const router = express.Router();

// Every endpoint here is about your own account, so the token guard applies to
// the whole router rather than being repeated on each handler.
router.use(verifyToken);

/** How many the bell ever shows. Beyond that the user has moved on. */
const FEED_LIMIT = 50;

/**
 * GET /api/notifications -- spec §12: view notifications.
 *
 * Newest first, with the unread ones floated to the top so an old note does
 * not hide behind a pile of read ones. `unread` is the badge count; `total` is
 * how many exist at all, so the client can tell "there is more" from
 * "you have seen everything".
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows, unread, total] = await Promise.all([
      Notification.find({ userId: req.user.id })
        .sort({ read: 1, createdAt: -1 })
        .limit(FEED_LIMIT)
        .lean(),
      Notification.countDocuments({ userId: req.user.id, read: false }),
      Notification.countDocuments({ userId: req.user.id }),
    ]);

    res.json({
      success: true,
      notifications: rows.map((n) => ({
        id: n._id,
        type: n.type,
        title: n.title,
        message: n.message,
        read: n.read,
        href: n.href || '',
        createdAt: n.createdAt,
      })),
      unread,
      total,
    });
  })
);

/**
 * PATCH /api/notifications/read-all -- spec §12: mark all as read.
 *
 * Registered before `/:id/read` for readability; the paths cannot actually
 * collide (one segment versus two), but keeping the special case first is how
 * the rest of this codebase reads.
 */
router.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    // Scoped to this user: an id-less update cannot reach anyone else's feed,
    // which is what makes it safe without a list of ids to check.
    const result = await Notification.updateMany(
      { userId: req.user.id, read: false },
      { $set: { read: true } }
    );

    res.json({ success: true, updated: result.modifiedCount || 0, unread: 0 });
  })
);

/** PATCH /api/notifications/:id/read -- mark one as read. */
router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // userId is part of the filter, so guessing an id still returns 404 rather
    // than confirming that someone else's notification exists.
    const row = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { read: true } },
      { returnDocument: 'after' }
    ).lean();

    if (!row) return res.status(404).json({ error: 'Notification not found' });

    const unread = await Notification.countDocuments({
      userId: req.user.id,
      read: false,
    });

    res.json({ success: true, notification: { id: row._id, read: row.read }, unread });
  })
);

module.exports = router;
