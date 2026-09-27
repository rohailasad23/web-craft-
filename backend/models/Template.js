'use strict';

const mongoose = require('mongoose');
const { CATEGORIES } = require('../constants/catalog');

/**
 * pending | approved | rejected.
 *
 * V1 auto-approves on submit (see routes/templates.js) so developers are not
 * blocked, but the field -- and the admin status endpoint -- already exist, so
 * turning moderation on later is a one-line default change.
 */
const STATUSES = ['pending', 'approved', 'rejected'];

/**
 * Spec §32: an OPTIONAL licence the developer states for their own work.
 * The empty string is the honest default -- a template ships with no licence
 * unless its author says so, and the UI renders that as "License not
 * specified." rather than inventing one (§31: do not invent information).
 */
const LICENSES = ['', 'MIT', 'Apache 2.0', 'GPL', 'Personal Use', 'Other'];

/**
 * Spec §5: the admin's quality verdict, set by a person, never computed.
 * 'unchecked' is the honest default -- §5 forbids claiming a template is
 * verified without admin action or a real automated check.
 */
const QUALITY_STATUSES = ['unchecked', 'quality_checked', 'needs_improvement', 'verified'];

/** §5's checklist keys. `ok` lives per row: unchecked boxes simply are absent. */
const QUALITY_CHECKS = [
  'responsive',
  'working_demo',
  'valid_download',
  'clean_structure',
  'documentation',
  'technologies',
  'no_suspicious_files',
  'screenshots',
  'license_info',
];

/**
 * Spec §2: trending is driven by real activity, with a manual override for
 * the cases an admin can see and a signal cannot ('auto' = normal rules).
 */
const TRENDING_OVERRIDES = ['auto', 'force', 'off'];

/**
 * Spec §14: content moderation state for this template's DESCRIPTION.
 * 'flagged' is visible but marked for review; 'hidden' is withheld publicly
 * (never deleted -- the original text stays, §14: restore must be possible).
 */
const CONTENT_STATES = ['visible', 'flagged', 'hidden'];

/**
 * Spec §6: one entry per published update. Deliberately a flat list, not a
 * version tree -- the spec explicitly asks NOT to build a Git-like system
 * (§5). Newest first is the order the details page reads.
 */
const changelogSchema = new mongoose.Schema(
  {
    version: { type: String, trim: true, maxlength: 20, default: '' },
    notes: { type: [String], default: [] },
  },
  { timestamps: true }
);

/** URL-friendly slug: lowercase, alphanumerics and single dashes. */
function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

const templateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    // Declared via schema.index() below, not path-level `unique: true` --
    // declaring both makes mongoose warn and drop the duplicate definition.
    slug: { type: String, required: true, lowercase: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },

    category: { type: String, required: true, enum: CATEGORIES },
    technologies: {
      type: [String],
      default: [],
      validate: {
        validator: (list) => Array.isArray(list) && list.length > 0,
        message: 'At least one technology is required',
      },
    },

    // Spec §2: a free-form tag list, so a template is findable by keyword and
    // advanced filters read their options from the database instead of a
    // hardcoded list. Deliberately separate from `technologies` -- technologies
    // answer "what is it built with", tags answer "what is it like" ("one-page",
    // "dark mode", "animated", "minimal").
    tags: { type: [String], default: [] },

    thumbnail: { type: String, default: '' },
    screenshots: { type: [String], default: [] },

    previewUrl: { type: String, trim: true, default: '' },
    githubUrl: { type: String, trim: true, default: '' },

    // Only a REFERENCE lives here -- the bytes stay on disk (storage.js), so
    // MongoDB documents never bloat with archives.
    file: {
      key: { type: String, required: true },
      filename: { type: String, default: '' },
      size: { type: Number, default: 0 },
      contentType: { type: String, default: 'application/zip' },
      // Spec §8: sha256 of the archive, computed server-side at upload. It is
      // what makes "same file hash" a fact instead of a guess -- two uploads
      // with identical bytes match even when the title was reworded.
      hash: { type: String, default: '', maxlength: 64, index: true },
    },

    // Template.author -> User._id (spec §18). authorName is a denormalised
    // copy so list cards do not need a $lookup for every row.
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, trim: true },

    downloadCount: { type: Number, default: 0 },
    // Kept in step by routes/templates.js on every successful save/unsave, the
    // same way downloadCount tracks distinct downloads. It is what makes
    // spec §3's "Most Popular" a different answer from "Most Downloaded".
    favoriteCount: { type: Number, default: 0 },

    // Spec §5: the developer's own version string for this template. It is
    // authored, never computed -- there is no diffing, no history tree and no
    // auto-bumping, exactly as §5 asks to avoid.
    version: { type: String, trim: true, maxlength: 20, default: '1.0.0' },
    // Spec §6: optional notes the developer writes when they update it.
    changelog: { type: [changelogSchema], default: [] },
    // Spec §32: empty means "not specified", never a default licence.
    license: { type: String, enum: LICENSES, default: '' },

    status: { type: String, enum: STATUSES, default: 'approved' },

    // Spec §1: an admin curates the homepage shelf; `featuredOrder` is the
    // "featured priority" §1 asks for, so an admin decides the order instead
    // of download count deciding for them.
    featured: { type: Boolean, default: false },
    featuredOrder: { type: Number, default: 0 },

    // Spec §2: 'auto' follows real activity, 'force' pins it in, 'off'
    // excludes it. Never written by the trending calculation itself, so the
    // admin's decision cannot be silently overwritten.
    trendingOverride: { type: String, enum: TRENDING_OVERRIDES, default: 'auto' },

    // Spec §5/§6: admin-entered verdict + optional 0-10 score. Internal by
    // design -- public template responses strip this (utils/publicTemplate),
    // because an unexposed score is the only kind that cannot look like a
    // marketing claim.
    quality: {
      status: { type: String, enum: QUALITY_STATUSES, default: 'unchecked' },
      score: { type: Number, min: 0, max: 10, default: null },
      checks: {
        type: [{ key: { type: String }, ok: { type: Boolean, default: false }, _id: false }],
        default: [],
      },
      note: { type: String, trim: true, maxlength: 500, default: '' },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reviewedAt: { type: Date, default: null },
    },

    // Spec §14: description moderation. The original `description` field is
    // never rewritten by moderation; `editedDescription` is an admin override
    // layered on top, so "restore" is clearing one field instead of digging
    // through history.
    content: {
      state: { type: String, enum: CONTENT_STATES, default: 'visible' },
      editedDescription: { type: String, maxlength: 4000, default: null },
      editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      editedAt: { type: Date, default: null },
    },

    // Spec §8: what the duplicate check found at upload time, plus an
    // `reviewed` bit so an admin's "not a duplicate, keep it" decision stops
    // it reappearing in the queue. Detection is advisory only -- §8: never
    // auto-delete, the admin decides.
    duplicateCheck: {
      checkedAt: { type: Date, default: null },
      matches: {
        type: [
          {
            _id: false,
            type: { type: String, enum: ['title', 'github', 'hash', 'author'] },
            templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
            title: { type: String, default: '' },
            reason: { type: String, default: '' },
          },
        ],
        default: [],
      },
      reviewed: { type: Boolean, default: false },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
  },
  { timestamps: true }
);

// Queries this index does NOT cover: free-text search is a case-insensitive
// regex over title/description (routes/templates.js). Regex can't use a normal
// index for substring matching -- acceptable here, and far better UX than
// $text, which cannot match a partial word like "port" -> "Portfolio".
//
// Every catalogue query starts from `{ status: 'approved' }` and then sorts on
// a spec §3 key, so `status` leads each sort index and the sort fields follow
// it in the same object. They used to be written the other way round -- or
// stop short of the sort's secondary key -- which left four of the five sort
// options unable to use an index and fall back to a blocking in-memory sort
// over every matching document.
templateSchema.index({ slug: 1 }, { unique: true });
templateSchema.index({ status: 1, createdAt: -1 }); // "Latest" + moderation queue
templateSchema.index({ status: 1, favoriteCount: -1, downloadCount: -1, createdAt: -1 }); // "Most popular"
templateSchema.index({ status: 1, downloadCount: -1, createdAt: -1 }); // "Most downloaded" + admin top
templateSchema.index({ status: 1, updatedAt: -1, createdAt: -1 }); // "Recently updated" + §5 marker
templateSchema.index({ status: 1, title: 1 }); // "A-Z"

// Filter chips (spec §2) narrow status first. { status, tags } also lets
// GET /api/meta read the tag bar from the index instead of walking every
// approved document with distinct().
templateSchema.index({ status: 1, category: 1 });
templateSchema.index({ status: 1, technologies: 1 });
templateSchema.index({ status: 1, tags: 1 });

// Per-developer reads: /mine is newest-first across every status, while the
// public profile (spec §10) and the dashboard are most-downloaded-first.
templateSchema.index({ author: 1, createdAt: -1 });
templateSchema.index({ author: 1, downloadCount: -1, createdAt: -1 });

// Featured shelf on the home page (spec §3): { status, featured } narrow, then
// the admin's featuredOrder decides, with download count as the tie-break.
templateSchema.index({ status: 1, featured: 1, featuredOrder: 1, downloadCount: -1 });

/**
 * Keep the storage key off the wire.
 *
 * `file.key` ("templates/mugtnsig-resume-one.zip") is only meaningful to
 * someone with direct read access to the uploads directory -- and server.js
 * deliberately does not serve that directory, because the archive must go
 * through POST /:slug/download, which checks the session and records the
 * download first. Dropping the key here covers every response shape at once
 * (list, detail, create, update, admin), so a future route cannot re-open the
 * hole, and a later swap to a public object store cannot turn a leaked key
 * into anonymous archive access. Server-side code reads `doc.file.key`
 * directly, which is unaffected: transforms only apply to toObject/toJSON.
 */
function hideStorageKey(doc, ret) {
  if (ret && ret.file) delete ret.file.key;
  return ret;
}

templateSchema.set('toObject', { transform: hideStorageKey });
templateSchema.set('toJSON', { transform: hideStorageKey });

module.exports = mongoose.model('Template', templateSchema);
module.exports.STATUSES = STATUSES;
module.exports.LICENSES = LICENSES;
module.exports.slugify = slugify;
module.exports.QUALITY_STATUSES = QUALITY_STATUSES;
module.exports.QUALITY_CHECKS = QUALITY_CHECKS;
module.exports.TRENDING_OVERRIDES = TRENDING_OVERRIDES;
module.exports.CONTENT_STATES = CONTENT_STATES;
