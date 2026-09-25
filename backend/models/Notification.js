'use strict';

const mongoose = require('mongoose');

/**
 * Spec §12: a lightweight notification feed, deliberately NOT a messaging
 * system -- one-way notes about things that happened to your own content.
 *
 * `approved` / `rejected` / `removed` cover a moderator's verdict on a
 * submission, `account` covers anything about the account itself (role,
 * suspension), and `report` closes the loop with whoever raised one.
 */
const TYPES = ['approved', 'rejected', 'removed', 'account', 'report', 'submission', 'update'];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: { type: String, enum: TYPES, default: 'submission' },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, trim: true, maxlength: 500, default: '' },
    read: { type: Boolean, default: false },
    // Points at whichever Template/Report/User the note is about, so the
    // navbar can turn a notification into a link without guessing.
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Mirrored for routing: lets the bell link to the right page even when
    // relatedId is missing.
    href: { type: String, trim: true, default: '', maxlength: 300 },
  },
  { timestamps: true }
);

// The bell always runs the same query: this user's notes, unread first,
// newest first, capped at 20.
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.TYPES = TYPES;
