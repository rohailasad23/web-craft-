'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, // otherwise A@x.com and a@x.com create two accounts
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    // select:false keeps the hash out of every query result by default.
    password: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    businessName: { type: String, trim: true },
    subscription: { type: String, enum: ['free', 'pro', 'premium'], default: 'free' },
    landingPages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LandingPage' }],
    totalRevenue: { type: Number, default: 0 },
    totalSitesGenerated: { type: Number, default: 0 },
  },
  { timestamps: true } // replaces the manual createdAt/updatedAt fields
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

/** Compare a candidate password against the stored hash. */
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
