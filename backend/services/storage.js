'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Local-disk file storage behind a tiny interface.
 *
 * Only `key` (e.g. "templates/abc.zip") is ever written to MongoDB -- never the
 * bytes. Swapping in S3 / R2 / Cloudinary later means rewriting `resolve`,
 * `urlFor` and `downloadStream` and touching nothing else; routes only ever
 * call these three functions.
 */

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const SUBDIRS = ['templates', 'thumbnails', 'screenshots'];

/** Create the upload tree if it does not exist yet (called at boot). */
function ensureStorage() {
  for (const dir of SUBDIRS) {
    fs.mkdirSync(path.join(UPLOAD_ROOT, dir), { recursive: true });
  }
}

/** Absolute path for a stored key, rejecting anything outside uploads/. */
function resolveKey(key) {
  const abs = path.resolve(UPLOAD_ROOT, String(key || ''));
  // path.resolve collapses "..", so a prefix check is enough -- this is what
  // stops ?file=../../../server.js style traversal from ever being read.
  if (abs !== UPLOAD_ROOT && !abs.startsWith(UPLOAD_ROOT + path.sep)) {
    throw Object.assign(new Error('Invalid file path'), { status: 400 });
  }
  return abs;
}

/** Public URL the browser can fetch, prefixed with API_URL on the client. */
function urlFor(key) {
  return key ? `/uploads/${String(key).replace(/^\/+/, '')}` : '';
}

/** Delete a stored file; missing files are not an error. */
function remove(key) {
  if (!key) return;
  try {
    fs.rmSync(resolveKey(key), { force: true });
  } catch {
    // Best effort -- a leaked temp file must never fail a delete request.
  }
}

module.exports = { UPLOAD_ROOT, SUBDIRS, ensureStorage, resolveKey, urlFor, remove };
