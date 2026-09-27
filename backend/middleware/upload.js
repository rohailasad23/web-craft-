'use strict';

const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { UPLOAD_ROOT } = require('../services/storage');
const recordSecurityEvent = require('../services/securityEvent');

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

/* ------------------------------------------------------------- content */
/*
 * Spec §20: "Never trust the extension alone."
 *
 * The extension and the MIME type are both the client's claim about its own
 * bytes -- an <input type=file> accepts any name with any type string, so
 * phish.html arrives as image/png. The first bytes on disk are not a claim.
 */
function matchesMagic(head, ext) {
  const at = (hex, offset = 0) => {
    const sig = Buffer.from(hex, 'hex');
    if (head.length < offset + sig.length) return false;
    return head.subarray(offset, offset + sig.length).equals(sig);
  };
  switch (ext) {
    case 'zip':
      // PK\x03\x04 local header, PK\x05\x06 empty archive, PK\x07\x08 spanned.
      return at('504b0304') || at('504b0506') || at('504b0708');
    case 'png':
      return at('89504e470d0a1a0a');
    case 'jpg':
    case 'jpeg':
      return at('ffd8ff');
    case 'gif':
      return at('47494638'); // GIF87a / GIF89a
    case 'webp':
      return at('52494646') && at('57454250', 8); // RIFF....WEBP
    default:
      return false;
  }
}

/** Read the head of a stored file and say whether it is what its name claims. */
async function reallyIs(filePath, ext) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const head = Buffer.alloc(16);
    const { bytesRead } = await handle.read(head, 0, 16, 0);
    return matchesMagic(head.subarray(0, bytesRead), ext);
  } catch {
    // A file we cannot even read is a file we must not keep.
    return false;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

/** Everything multer wrote, removed -- a rejected upload leaves no bytes. */
function discard(files) {
  for (const list of Object.values(files || {})) {
    for (const f of list || []) {
      try {
        fs.rmSync(f.path, { force: true });
      } catch {
        // Best effort: a stray temp file must never turn into a 500.
      }
    }
  }
}

/**
 * Post-write checks. Multer's size budget has to be the ARCHIVE's 25MB (see
 * above), so images are checked against their own 5MB cap here, and then every
 * file is matched against its real signature rather than its name.
 *
 * Returns `{ status, error }` for the first problem, or null when it is clean.
 */
async function inspectUploads(files) {
  for (const [field, list] of Object.entries(files || {})) {
    for (const f of list || []) {
      if (field !== 'file' && f.size > LIMITS.image) {
        return {
          status: 413,
          error: `Images must be ${Math.round(LIMITS.image / 1024 / 1024)}MB or less`,
        };
      }
      const ext = path.extname(f.originalname || '').toLowerCase().slice(1);
      if (!ext || !(await reallyIs(f.path, ext))) {
        return {
          status: 400,
          error:
            field === 'file'
              ? 'That file is not a valid .zip archive'
              : 'That image is not a real PNG, JPEG, GIF or WebP file',
        };
      }
    }
  }
  return null;
}

/**
 * Wrap multer so its errors come back as the same friendly JSON the rest of
 * the API returns, instead of an HTML stack trace.
 */
function handleUpload(req, res, next) {
  archiveUpload(req, res, async (err) => {
    if (!err) {
      let problem = null;
      try {
        problem = await inspectUploads(req.files || {});
      } catch {
        problem = { status: 400, error: 'Could not read that upload, please try again' };
      }
      if (problem) {
        discard(req.files || {});
        // Spec §9: "unusual upload activity" is this exact moment -- bytes
        // that claim to be a template but are not, or an image that is not an
        // image. Logged before answering so a rejected probe still leaves a
        // trail; the reply itself is unchanged.
        recordSecurityEvent('upload.rejected', {
          req,
          severity: 'warning',
          actorId: req.user?.id,
          meta: { reason: problem.error },
        });
        return res.status(problem.status).json({ error: problem.error });
      }
      return next();
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      recordSecurityEvent('upload.rejected', {
        req,
        severity: 'warning',
        actorId: req.user?.id,
        meta: { reason: 'size limit' },
      });
      return res.status(413).json({
        error: `File is too large (max ${Math.round(LIMITS.file / 1024 / 1024)}MB for archives, ${Math.round(LIMITS.image / 1024 / 1024)}MB for images)`,
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      recordSecurityEvent('upload.rejected', {
        req,
        severity: 'warning',
        actorId: req.user?.id,
        meta: { reason: 'unexpected field' },
      });
      return res.status(400).json({ error: 'Unexpected file field' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      recordSecurityEvent('upload.rejected', {
        req,
        severity: 'warning',
        actorId: req.user?.id,
        meta: { reason: 'too many files' },
      });
      return res.status(400).json({ error: 'Too many files uploaded' });
    }
    // The storage engine's own refusals land here: a non-.zip archive, an
    // image whose extension is not on the allowlist, an SVG. Those are
    // exactly §9's "unusual upload activity" (a browser does not send them
    // by accident), so they leave the same trace as the magic-byte check.
    recordSecurityEvent('upload.rejected', {
      req,
      severity: 'warning',
      actorId: req.user?.id,
      meta: { reason: err.code || 'rejected by storage engine' },
    });
    return res.status(err.status || 400).json({ error: err.message || 'Upload failed' });
  });
}

module.exports = { handleUpload, LIMITS, FIELD_DIRS };
