'use strict';

const mongoose = require('mongoose');

/**
 * Spec §9: the security activity section -- what happened to the doors.
 *
 * Deliberately NOT the audit log (§35): AuditLog records admin *decisions*,
 * this records *security-relevant activity*, including things no admin
 * triggered (failed logins, rejected uploads).
 *
 * Spec §9 in one line: "Do not store passwords, tokens or sensitive secrets
 * in logs." Nothing here ever carries a password, a token, a hash or a
 * request body -- only ids, an attempted email (needed to answer "who is
 * hammering this account?"), a truncated user agent and the IP the request
 * actually came from. `ip` is stored because §10 asks admins to identify
 * suspicious access, and it is captured only at the moment of the event.
 */
const TYPES = [
  'login.success',
  'login.failed',
  'auth.rate_limited',
  'password.changed',
  'role.changed',
  'account.suspended',
  'account.unsuspended',
  'upload.rejected',
  'upload.duplicate',
  'report.malicious',
];

const SEVERITIES = ['info', 'warning', 'critical'];

/**
 * Retention rule (spec §16): security history is not casually deleted.
 * 365 days is the documented ceiling for THIS collection only; the audit log,
 * reports and download history have no prune at all. Exposed as a constant
 * so the policy is one place instead of folklore -- no timer runs it, because
 * deleting rows on a schedule the operator never chose would itself be
 * "casual deletion".
 */
const RETENTION_DAYS = 365;

const securityEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TYPES, required: true, index: true },
    severity: { type: String, enum: SEVERITIES, default: 'info', index: true },

    // Who, when known. null for anonymous probes.
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // The account a failed login TRIED to use -- never the password.
    email: { type: String, lowercase: true, trim: true, maxlength: 254, default: '' },
    // The actor's role at event time, so "admin logins" is one filter.
    roleAtEvent: { type: String, default: '', maxlength: 20 },
    ip: { type: String, trim: true, maxlength: 60, default: '' },
    userAgent: { type: String, trim: true, maxlength: 200, default: '' },

    // ids/names/statuses only -- see AuditLog's rule, same reasoning.
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// The security page reads newest-first, optionally by type or severity.
securityEventSchema.index({ createdAt: -1 });
securityEventSchema.index({ type: 1, createdAt: -1 });
securityEventSchema.index({ severity: 1, createdAt: -1 });
// "Admin login history" (§10): role + time.
securityEventSchema.index({ roleAtEvent: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('SecurityEvent', securityEventSchema);
module.exports.TYPES = TYPES;
module.exports.SEVERITIES = SEVERITIES;
module.exports.RETENTION_DAYS = RETENTION_DAYS;
