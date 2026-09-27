'use strict';

const mongoose = require('mongoose');

/**
 * Spec §3 / §11 / §12: one document that answers "how is this platform
 * behaving right now?" -- homepage layout, feature switches and maintenance.
 *
 * A singleton on purpose. Every read is `findOne({ singleton: true })` and
 * every admin write updates one of three sub-documents, so two admins
 * editing different sections never clobber each other's rows. Defaults live
 * in code (below) and represent exactly today's behaviour: every section
 * visible, every feature on, maintenance off. Nothing is ever seeded as
 * "featured" or pre-enabled -- spec §1/§22: do not fake data.
 */

/** The homepage sections §3 lets an admin reorder, rename or switch off. */
const SECTION_KEYS = [
  'categories',
  'featured',
  'trending',
  'latest',
  'popular',
  'spotlight',
  'contributors',
];

/**
 * Built-in titles. An admin edit stores its own title; an empty stored title
 * means "use this", so clearing the field restores the default instead of
 * rendering a blank heading.
 */
const DEFAULT_SECTION_TITLES = {
  categories: 'Popular categories',
  featured: 'Featured templates',
  trending: 'Trending now',
  latest: 'Latest templates',
  popular: 'Most downloaded',
  spotlight: 'Developer spotlight',
  contributors: 'Meet the contributors',
};

/** Default order mirrors the current page: categories, then template grids. */
const DEFAULT_SECTION_ORDER = ['categories', 'featured', 'trending', 'latest', 'popular', 'spotlight', 'contributors'];

/** Spec §11's switchboard. Off = the gate blocks it with a clear message. */
const FLAGS = [
  { key: 'submissions', label: 'New template submissions', message: 'New template submissions are paused right now.' },
  { key: 'uploads', label: 'Template uploads', message: 'Template uploads are temporarily disabled.' },
  { key: 'registration', label: 'User registration', message: 'Registration is temporarily closed.' },
  { key: 'developerRegistration', label: 'Developer registration', message: 'Developer accounts cannot be created right now.' },
  { key: 'downloads', label: 'Downloads', message: 'Downloads are temporarily disabled.' },
  { key: 'reports', label: 'Reports', message: 'Reporting is temporarily disabled.' },
  { key: 'favorites', label: 'Favourites', message: 'Saving favourites is temporarily disabled.' },
  { key: 'publicDeveloperProfiles', label: 'Public developer profiles', message: 'Developer profiles are temporarily unavailable.' },
];

const FLAG_KEYS = FLAGS.map((f) => f.key);

/** §12's full-maintenance switch. Per-feature modes live in `flags`. */
const DEFAULT_MAINTENANCE_MESSAGE =
  'Website is temporarily under maintenance. Please try again later.';

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, enum: SECTION_KEYS, required: true },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    // '' means "use the built-in title", which is how a rename gets undone.
    title: { type: String, trim: true, maxlength: 80, default: '' },
    blurb: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false }
);

const platformConfigSchema = new mongoose.Schema(
  {
    // The one row. unique so a race cannot create a second copy.
    singleton: { type: Boolean, default: true, unique: true },

    homepage: {
      sections: { type: [sectionSchema], default: [] },
    },

    // A plain { key: Boolean } bag. Mongoose's Map type would serialise to
    // { values: {...} } in JSON and force every caller to unwrap it; Mixed
    // with an explicit default keeps the API shape flat and obvious.
    // Default is "every flag on" unless an admin has turned it off.
    flags: {
      type: mongoose.Schema.Types.Mixed,
      default: () => Object.fromEntries(FLAG_KEYS.map((k) => [k, true])),
    },

    maintenance: {
      enabled: { type: Boolean, default: false },
      message: { type: String, trim: true, maxlength: 300, default: '' },
    },
  },
  { timestamps: true }
);

/**
 * The document the whole platform reads. Missing (first boot) or partially
 * written (an older doc before a flag was added) is merged over the defaults,
 * so a new flag is ON unless an admin turned it off -- never undefined.
 */
platformConfigSchema.statics.load = async function load() {
  const defaults = {
    homepage: {
      sections: DEFAULT_SECTION_ORDER.map((key, i) => ({
        key,
        enabled: true,
        order: (i + 1) * 10,
        title: '',
        blurb: '',
      })),
    },
    flags: Object.fromEntries(FLAG_KEYS.map((k) => [k, true])),
    maintenance: { enabled: false, message: '' },
  };

  let doc = await this.findOne({ singleton: true });
  if (!doc) {
    // First admin read wins the race; a duplicate key just means someone
    // else created it a millisecond ago, so read theirs.
    try {
      doc = await this.create({ singleton: true, ...defaults });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      doc = await this.findOne({ singleton: true });
    }
  }
  return doc;
};

module.exports = mongoose.model('PlatformConfig', platformConfigSchema);
module.exports.SECTION_KEYS = SECTION_KEYS;
module.exports.DEFAULT_SECTION_TITLES = DEFAULT_SECTION_TITLES;
module.exports.DEFAULT_SECTION_ORDER = DEFAULT_SECTION_ORDER;
module.exports.FLAGS = FLAGS;
module.exports.FLAG_KEYS = FLAG_KEYS;
module.exports.DEFAULT_MAINTENANCE_MESSAGE = DEFAULT_MAINTENANCE_MESSAGE;
