'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/** Everything the enum allows. `admin` is never taken from a request body. */
const ROLES = ['user', 'developer', 'admin'];
/** The only roles a client may choose between at registration. */
const ASSIGNABLE_ROLES = ['user', 'developer'];
/** Spec §9: a suspended account keeps its data but cannot sign in. */
const STATUSES = ['active', 'suspended'];

/**
 * Spec §7: the trust ladder. 'new' is the honest starting point -- nothing
 * in the platform auto-promotes anyone, because §7 forbids labelling a
 * developer "Trusted" without actual criteria. Only an admin moves an
 * account up (or down) this ladder, and the move is audited.
 */
const TRUST_LEVELS = ['new', 'active', 'trusted', 'verified'];

/** Spec §14: moderation state for this account's bio. */
const CONTENT_STATES = ['visible', 'flagged', 'hidden'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, // otherwise A@x.com and a@x.com create two accounts
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },

    // select:false keeps the hash out of every query result by default.
    // (The spec calls this passwordHash; it is a bcrypt hash, never plain text.)
    passwordHash: { type: String, required: true, select: false },

    // Spec: normal registration defaults to `user`, and nobody may promote
    // themselves to admin -- see routes/auth.js, which only accepts
    // ASSIGNABLE_ROLES and drops `role` entirely from profile updates.
    role: { type: String, enum: ROLES, default: 'user', index: true },

    // Spec §9: 'active' for everyone by default. Only an admin endpoint may
    // change it (routes/admin.js); registration and profile updates never
    // read this field, so nobody can un-suspend themselves.
    status: { type: String, enum: STATUSES, default: 'active', index: true },

    // Spec §33: architecture only. Nothing sets this to true -- the platform
    // does not verify anyone yet, and claiming otherwise would be a lie.
    // Registration and profile updates drop it, so it can only ever be
    // flipped by an admin later.
    isVerified: { type: Boolean, default: false, select: false },

    avatar: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, maxlength: 500, default: '' },

    // Spec §10 -- the developer half of the profile. None of it is required
    // and none of it is verified: the platform has no way to check a link, so
    // an empty field is left empty rather than filled with a placeholder.
    skills: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
    website: { type: String, trim: true, maxlength: 300, default: '' },
    github: { type: String, trim: true, maxlength: 300, default: '' },
    socialLinks: {
      type: [
        new mongoose.Schema(
          {
            label: { type: String, trim: true, maxlength: 30, required: true },
            url: { type: String, trim: true, maxlength: 300, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Spec §7: admin-set, never computed. Default 'new' means "no judgement
    // has been made", which is the only truthful default (§7: do not
    // automatically label developers).
    trustLevel: { type: String, enum: TRUST_LEVELS, default: 'new' },
    trustChangedAt: { type: Date, default: null },

    // Spec §4: admin-curated homepage spotlight. Disabled for everyone until
    // an admin opts a developer in -- no fake featured people (§4/§25).
    spotlight: {
      enabled: { type: Boolean, default: false },
      blurb: { type: String, trim: true, maxlength: 300, default: '' },
      // Optional image URL; empty means "use the normal avatar".
      image: { type: String, trim: true, default: '' },
      priority: { type: Number, default: 0 },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },

    // Spec §14: bio moderation, same shape as the template's content block.
    // `editedBio` is an override layered on `bio` -- the developer's own text
    // is never rewritten, so restore is one field away.
    content: {
      state: { type: String, enum: CONTENT_STATES, default: 'visible' },
      editedBio: { type: String, maxlength: 500, default: null },
      editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      editedAt: { type: Date, default: null },
    },
  },
  { timestamps: true } // replaces the manual createdAt/updatedAt fields
);

/** Spec §10 ceilings. Small enough to stay readable, big enough to be useful. */
const MAX_SKILLS = 12;
const MAX_SOCIAL_LINKS = 6;

userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
});

/** Compare a candidate password against the stored hash. */
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

// Every read path that is not a lookup by _id filters or sorts on these, and
// neither had an index: the developer directory (spec §10) and the admin roster
// (§9) both narrow by role and order by createdAt, the admin overview counts by
// status, and login reads by email -- the email one already exists as the
// unique constraint on the field, so these three are what was missing.
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ status: 1, createdAt: -1 });
// The homepage spotlight (§4): pick enabled accounts by priority.
userSchema.index({ 'spotlight.enabled': 1, 'spotlight.priority': 1 });

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.ASSIGNABLE_ROLES = ASSIGNABLE_ROLES;
module.exports.STATUSES = STATUSES;
module.exports.TRUST_LEVELS = TRUST_LEVELS;
module.exports.CONTENT_STATES = CONTENT_STATES;
module.exports.MAX_SKILLS = MAX_SKILLS;
module.exports.MAX_SOCIAL_LINKS = MAX_SOCIAL_LINKS;
