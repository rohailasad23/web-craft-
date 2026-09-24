'use strict';

const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const { UPLOAD_ROOT } = require('../services/storage');

/**
 * Multer config for template uploads (spec §6, §12, §13).
 *
 * Fields:
 *   file       1 x .zip          (the template archive)
 *   thumbnail  0..1 image        (optional -- one is generated if omitted)
 *   screenshots 0..5 images
 */

const LIMITS = {
  file: 25 * 1024 * 1024, // 25MB zip; C: only has a few GB free
  image: 5 * 1024 * 1024, // 5MB per image
  screenshots: 5,
};

const FIELD_DIRS = {
  file: 'templates',
  thumbnail: 'thumbnails',
  screenshots: 'screenshots',
};

// Browsers send image/svg+xml for .svg, and a malicious SVG opened directly on
// our origin would run script. SVGs we generate ourselves are safe, but we
// cannot tell the two apart once they are on disk -- so user uploads simply
// may not be SVG.
const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp)$/;
// Browsers report .zip as any of these three, and some send nothing at all.
const ZIP_TYPES = /^(application\/zip|application\/x-zip-compressed|application\/octet-stream)?$/;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, expose: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(UPLOAD_ROOT, FIELD_DIRS[file.fieldname] || 'misc');
    // ensureStorage() runs at boot, but a fresh checkout may not have it yet.
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    // Random, unguessable name: uploads are served publicly, so an attacker
    // must not be able to predict another developer's archive URL.
    cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const name = String(file.originalname || '');

  if (file.fieldname === 'file') {
    if (!/\.zip$/i.test(name) || !ZIP_TYPES.test(file.mimetype || '')) {
      return cb(badRequest('Template archive must be a .zip file'));
    }
    return cb(null, true);
  }

  if (file.fieldname === 'thumbnail' || file.fieldname === 'screenshots') {
    if (!IMAGE_TYPES.test(file.mimetype || '')) {
      return cb(badRequest('Only PNG, JPEG, GIF, WebP or SVG images are allowed'));
    }
    if (file.fieldname === 'screenshots') {
      // Count of files already accepted for this field.
      const seen = (req.files?.screenshots || []).length;
      if (seen >= LIMITS.screenshots) {
        return cb(badRequest(`You can upload at most ${LIMITS.screenshots} screenshots`));
      }
    }
    return cb(null, true);
  }

  return cb(badRequest(`Unexpected field "${file.fieldname}"`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: LIMITS.image,
    files: 1 + 1 + LIMITS.screenshots,
    fields: 40,
  },
});

/** The archive is allowed to be much larger than the image limit. */
const archiveUpload = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
  { name: 'screenshots', maxCount: LIMITS.screenshots },
]);

/**
 * Wrap multer so its errors come back as the same friendly JSON the rest of
 * the API returns, instead of an HTML stack trace.
 */
function handleUpload(req, res, next) {
  archiveUpload(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File is too large (max ${Math.round(LIMITS.file / 1024 / 1024)}MB for archives, ${Math.round(LIMITS.image / 1024 / 1024)}MB for images)`,
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Unexpected file field' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files uploaded' });
    }
    return res.status(err.status || 400).json({ error: err.message || 'Upload failed' });
  });
}

module.exports = { handleUpload, LIMITS };
