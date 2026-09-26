'use strict';

const crypto = require('crypto');
const fs = require('fs');
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
// The extension is what the file is stored and served under, and it comes from
// the client's filename. The MIME type above is only ever the client's claim
// about its own bytes, so it cannot be the sole gate: an <input> for images
// will happily accept phish.html, which would then be served on our origin.
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp)$/i;
// Browsers report .zip as any of these three, and some send nothing at all.
const ZIP_TYPES = /^(application\/zip|application\/x-zip-compressed|application\/octet-stream)?$/;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, expose: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(UPLOAD_ROOT, FIELD_DIRS[file.fieldname] || 'misc');
    // ensureStorage() runs at boot, but a fresh checkout may not have it yet.
    // mkdir without blocking: multer's callback fires when this settles, and a
    // sync mkdir on every part of every upload holds the event loop for all of
    // them.
    fs.promises.mkdir(dir, { recursive: true }).then(
      () => cb(null, dir),
      (err) => cb(err)
    );
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
    // Both gates, not either: the extension is stored and served, the MIME
    // type is only what the client said. (SVG is excluded on purpose -- see
    // IMAGE_TYPES above.)
    if (!IMAGE_EXTS.test(name) || !IMAGE_TYPES.test(file.mimetype || '')) {
      return cb(badRequest('Only PNG, JPEG, GIF or WebP images are allowed'));
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
    // busboy has no per-field size limit, so this one value applies to every
    // file in the request. It has to be the ARCHIVE limit, otherwise the
    // advertised 25MB cap was silently 5MB and a large zip was rejected with a
    // message claiming it was allowed. The tighter per-image cap is enforced
    // in handleUpload() once the sizes are known.
    fileSize: LIMITS.file,
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
    if (!err) {
      // multer has written the files by now, but its size limit had to be the
      // archive's 25MB (see above) -- so images are checked against their own
      // 5MB cap here. Anything over is deleted immediately, so a rejected
      // upload never leaves bytes on disk.
      const oversized = [];
      for (const [field, files] of Object.entries(req.files || {})) {
        if (field === 'file') continue;
        for (const f of files || []) {
          if (f.size > LIMITS.image) oversized.push(f);
        }
      }
      if (oversized.length) {
        for (const f of oversized) {
          try {
            fs.rmSync(f.path, { force: true });
          } catch {
            // Best effort: a stray temp file must never turn into a 500.
          }
        }
        return res.status(413).json({
          error: `Images must be ${Math.round(LIMITS.image / 1024 / 1024)}MB or less`,
        });
      }
      return next();
    }

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

module.exports = { handleUpload, LIMITS, FIELD_DIRS };
