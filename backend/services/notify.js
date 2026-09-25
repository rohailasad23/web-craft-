'use strict';

const Notification = require('../models/Notification');

/**
 * Spec §12: one-way notes about things that happened to your own content.
 *
 * Deliberately fire-and-forget. A notification is a courtesy -- if writing one
 * fails, the approval/rejection/upload it describes must still succeed, so the
 * error is logged and swallowed rather than thrown into the caller's request.
 *
 *   await notify({ userId, type: 'approved', title, message, href });
 */
async function notify({ userId, type, title, message = '', relatedId = null, href = '' }) {
  if (!userId || !title) return null;

  try {
    return await Notification.create({ userId, type, title, message, relatedId, href });
  } catch (err) {
    console.error('notification not written:', err.message);
    return null;
  }
}

module.exports = notify;
module.exports.notify = notify;
