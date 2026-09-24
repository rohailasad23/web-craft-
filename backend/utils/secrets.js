'use strict';

/**
 * Helpers for reading configuration safely.
 * Placeholder values left in a committed `.env` must never be sent to a
 * third-party API -- doing so leaks a (bad) secret and wastes a round trip.
 */

/** True when a value looks like a real, usable credential. */
function isUsableSecret(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  // Real provider keys are long and never contain runs of "x" placeholders.
  return v.length >= 16 && !/x{4,}/i.test(v);
}

/** Read a secret, returning null when it is missing or still a placeholder. */
function readSecret(name) {
  const raw = process.env[name];
  if (!isUsableSecret(raw)) return null;
  return raw.trim();
}

/**
 * Read a required secret. Fails fast at boot instead of failing per-request.
 * Never prints the value itself.
 */
function requireSecret(name) {
  const value = readSecret(name);
  if (value) return value;
  console.error(
    `❌ Missing or placeholder value for ${name}. ` +
      `Set a real value in backend/.env and restart the server.`
  );
  throw new Error(`Invalid configuration: ${name}`);
}

module.exports = { isUsableSecret, readSecret, requireSecret };
