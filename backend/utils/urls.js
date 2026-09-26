'use strict';

/**
 * One URL rule for the whole API.
 *
 * Only http(s) survives -- `javascript:`, `data:`, `vbscript:` and anything a
 * browser might execute instead of navigating are rejected. Returns '' for a
 * blank value (so an optional field can simply be left empty) and `null` for
 * something that was supplied but is not a usable URL, so callers can tell
 * "cleared it" apart from "gave me rubbish" and answer 400 for the second.
 */
function normalizeUrl(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

module.exports = { normalizeUrl };
