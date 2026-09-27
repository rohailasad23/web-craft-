'use strict';

const mongoose = require('mongoose');

/** Spec §18: the same four entity types an admin takes notes on. */
const TARGET_TYPES = ['user', 'developer', 'template', 'report'];

/**
 * Spec §18: "Watch this developer" -- an admin's own bookmark of items to
 * keep an eye on. Scoped per admin (adminId is part of the unique key), so
 * one person's watchlist never shows up in another's, and toggling is
 * idempotent: watching something twice is one row.
 */
const watchSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: TARGET_TYPES, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Denormalised label so the watchlist renders without populating four
    // different collections for a handful of rows.
    label: { type: String, default: '', maxlength: 200 },
    href: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);

watchSchema.index({ adminId: 1, targetType: 1, targetId: 1 }, { unique: true });
watchSchema.index({ adminId: 1, createdAt: -1 });

module.exports = mongoose.model('Watchlist', watchSchema);
module.exports.TARGET_TYPES = TARGET_TYPES;
