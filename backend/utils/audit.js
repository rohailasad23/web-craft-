'use strict';

const AuditLog = require('../models/AuditLog');

/**
 * Spec §35: append one line to the audit log.
 *
 * Fire-and-forget for the same reason notifications are -- a moderator's
 * decision is already made, and losing the receipt because the log write
 * failed would turn a working action into a failed one. `metadata` carries
 * ids, names and statuses only; §35 is explicit that no password or other
 * sensitive value belongs here.
 *
 * Shared by every admin router so "who changed this?" answers the same way
 * wherever the change was made (§25: trace who changed something).
 */
async function record(adminId, action, targetId, metadata = {}) {
  if (!adminId || !action) return;
  try {
    await AuditLog.create({ adminId, action, targetId, metadata });
  } catch (err) {
    console.error('audit log not written:', err.message);
  }
}

module.exports = record;
