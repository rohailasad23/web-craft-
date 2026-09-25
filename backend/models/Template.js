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
    featured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Queries this index does NOT cover: free-text search is a case-insensitive
// regex over title/description (routes/templates.js). Regex can't use a normal
// index for substring matching -- acceptable here, and far better UX than
// $text, which cannot match a partial word like "port" -> "Portfolio".
templateSchema.index({ slug: 1 }, { unique: true });
templateSchema.index({ status: 1, createdAt: -1 });
templateSchema.index({ category: 1, status: 1 });
templateSchema.index({ technologies: 1, status: 1 });
templateSchema.index({ author: 1, createdAt: -1 });
templateSchema.index({ downloadCount: -1 });
templateSchema.index({ featured: 1, downloadCount: -1 });
templateSchema.index({ tags: 1, status: 1 });
templateSchema.index({ favoriteCount: -1, downloadCount: -1 });
// Spec §3 "Recently updated" sorts on updatedAt, and §5's "updated recently"
// marker reads the same field -- both are index-backed, like every other sort.
templateSchema.index({ updatedAt: -1, status: 1 });

module.exports = mongoose.model('Template', templateSchema);
module.exports.STATUSES = STATUSES;
module.exports.LICENSES = LICENSES;
module.exports.slugify = slugify;
