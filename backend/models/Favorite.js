'use strict';

const mongoose = require('mongoose');

/**
 * One document per (user, template) -- the unique compound index is the whole
 * design, exactly like Download.
 *
 * Spec §1 asks for "favorites/saved templates" that "must not create
 * duplicate records". Doing it at the storage layer means a double-tap on the
 * heart can never write two rows, and the saved list is a clean set of
 * distinct templates with no de-duplication pass afterwards.
 */
const favoriteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  savedAt: { type: Date, default: Date.now },
});

favoriteSchema.index({ userId: 1, templateId: 1 }, { unique: true });
favoriteSchema.index({ userId: 1, savedAt: -1 });
favoriteSchema.index({ templateId: 1, savedAt: -1 });

module.exports = mongoose.model('Favorite', favoriteSchema);
