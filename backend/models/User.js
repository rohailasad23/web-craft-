'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/** Everything the enum allows. `admin` is never taken from a request body. */
const ROLES = ['user', 'developer', 'admin'];
/** The only roles a client may choose between at registration. */
const ASSIGNABLE_ROLES = ['user', 'developer'];

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

    avatar: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true } // replaces the manual createdAt/updatedAt fields
);

userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
});

/** Compare a candidate password against the stored hash. */
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.ASSIGNABLE_ROLES = ASSIGNABLE_ROLES;
