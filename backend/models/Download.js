'use strict';

const mongoose = require('mongoose');

/**
 * One document per (user, template) -- the unique compound index is the whole
 * design.
 *
 * Spec §9 asks to "prevent duplicate/inconsistent download counting". Doing it
 * at the storage layer means:
 *   - a double-click / refresh cannot inflate downloadCount (we only $inc on
 *     the insert, never on the update),
 *   - "My Downloads" is a clean list of distinct templates,
 *   - downloadCount == number of distinct users who downloaded it.
 */
const downloadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  downloadedAt: { type: Date, default: Date.now },
});

downloadSchema.index({ userId: 1, templateId: 1 }, { unique: true });
downloadSchema.index({ userId: 1, downloadedAt: -1 });
downloadSchema.index({ templateId: 1, downloadedAt: -1 });

module.exports = mongoose.model('Download', downloadSchema);
