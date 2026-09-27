'use strict';

const mongoose = require('mongoose');

/** Spec §17: notes attach to the four things admins actually review. */
const TARGET_TYPES = ['user', 'developer', 'template', 'report'];

/**
 * Spec §17: internal notes, never publicly visible.
 *
 * There is no public route to this collection -- the only reader is
 * GET /api/admin/notes behind verifyToken + requireRole('admin'). Storing
 * the author and timestamp makes the note a lightweight audit entry in its
 * own right ("admin said X about Y on date Z"), which is exactly the
 * traceability §25 asks for.
 */
const adminNoteSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: TARGET_TYPES, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, default: '', maxlength: 80 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

adminNoteSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('AdminNote', adminNoteSchema);
module.exports.TARGET_TYPES = TARGET_TYPES;
