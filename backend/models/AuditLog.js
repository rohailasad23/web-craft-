'use strict';

const mongoose = require('mongoose');

/**
 * Spec §35: a short, append-only record of the admin decisions that matter.
 *
 * Every value here is an id, a name or a status -- never a password, token,
 * email body or any other secret. `metadata` is Mixed on purpose: the point
 * is a human-readable breadcrumb ("which template, moved from pending to
 * rejected"), not a typed contract nobody reads.
 */
const ACTIONS = [
  'template.approved',
  'template.rejected',
  'template.restored',
  'template.deleted',
  'user.suspended',
  'user.unsuspended',
  'user.role_changed',
  'report.resolved',
  'report.dismissed',
];

const auditLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, enum: ACTIONS, required: true, index: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // e.g. { templateTitle, from, to, userName, email? -> never }
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// The admin log page reads newest-first for everyone, optionally filtered by
// one action.
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
module.exports.ACTIONS = ACTIONS;
