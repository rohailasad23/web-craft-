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

module.exports = mongoose.model('Template', templateSchema);
module.exports.STATUSES = STATUSES;
module.exports.slugify = slugify;
