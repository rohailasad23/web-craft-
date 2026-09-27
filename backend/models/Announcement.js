'use strict';

const mongoose = require('mongoose');

/** Spec §13's four types, verbatim. */
const TYPES = ['information', 'update', 'warning', 'maintenance'];

/**
 * Spec §13: platform-wide messages shown on the main site while active.
 *
 * Window semantics: `startsAt` in the future = scheduled; `endsAt` empty =
 * runs until an admin disables it. Only enabled rows inside their window are
 * ever handed to the public API -- a stale announcement cannot keep showing
 * because nobody remembered to delete it.
 */
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    type: { type: String, enum: TYPES, default: 'information' },

    startsAt: { type: Date, default: () => new Date() },
    // null = no end date; the announcement runs until switched off.
    endsAt: { type: Date, default: null },
    enabled: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

announcementSchema.index({ enabled: 1, startsAt: 1, endsAt: 1 });

/** Live announcements only -- used by the public payload. */
announcementSchema.statics.activeQuery = function activeQuery(now = new Date()) {
  return { enabled: true, startsAt: { $lte: now }, $or: [{ endsAt: null }, { endsAt: { $gte: now } }] };
};

module.exports = mongoose.model('Announcement', announcementSchema);
module.exports.TYPES = TYPES;
