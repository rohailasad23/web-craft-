'use strict';

const SecurityEvent = require('../models/SecurityEvent');

/**
 * Spec §9: append one security event.
 *
 * Fire-and-forget for the same reason the audit log is -- a failed login
 * must never become a 500 because the log write failed. Every call site
 * passes ids, short names and statuses; this module's contract (and §9's
 * rule) is that no password, token or request body ever reaches `meta`.
 *
 * Best-effort caller identity: IP comes from req.ip (which honours the
 * TRUST_PROXY setting), the user agent is truncated at 200 chars -- long
 * enough to identify a browser, too short to become a log-filling vector.
 */
function context(req) {
  return {
    ip: String(req?.ip || '').slice(0, 60),
    userAgent: String(req?.headers?.['user-agent'] || '')
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 200),
  };
}

async function recordSecurityEvent(type, { req, severity, actorId, email, roleAtEvent, meta } = {}) {
  if (!SecurityEvent.TYPES.includes(type)) {
    console.error('unknown security event type:', type);
    return;
  }
  try {
    const { ip, userAgent } = context(req);
    await SecurityEvent.create({
      type,
      severity: severity || 'info',
      actorId: actorId || null,
      email: String(email || '').toLowerCase().slice(0, 254),
      roleAtEvent: String(roleAtEvent || ''),
      ip,
      userAgent,
      meta: meta || {},
    });
  } catch (err) {
    console.error('security event not written:', err.message);
  }
}

module.exports = recordSecurityEvent;
