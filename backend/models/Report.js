'use strict';

const mongoose = require('mongoose');

/** Spec §7's list, verbatim. */
const REASONS = [
  'Broken download',
  'Broken demo',
  'Copyright issue',
  'Malicious/suspicious content',
  'Incorrect information',
  'Other',
];

/** Spec §7's lifecycle: a moderator moves it forward, never deletes history. */
const STATUSES = ['pending', 'reviewed', 'resolved', 'dismissed'];

/**
 * Spec §20: queue priority. The DEFAULT is derived from the report's own
 * reason -- a malicious-content claim genuinely is more urgent than a broken
 * demo, and deriving it from real input is not a fabricated signal. An admin
 * can always override it either way.
 */
const PRIORITIES = ['low', 'normal', 'high', 'critical'];

/** Reason -> starting priority. Everything unlisted is 'normal'. */
const REASON_PRIORITY = {
  'Malicious/suspicious content': 'critical',
  'Copyright issue': 'high',
};

const reportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Template',
      required: true,
      index: true,
    },
    reason: { type: String, enum: REASONS, required: true },
    // Optional. Kept short so a report cannot be used as free-form storage.
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    // §20: sorted into the moderation queue by this, then by age.
    priority: { type: String, enum: PRIORITIES, default: 'normal', index: true },
  },
  { timestamps: true }
);

/**
 * Spec §7: "Users should not be able to spam unlimited duplicate reports for
 * the same template without reasonable protection."
 *
 * A partial unique index makes the database itself refuse a second OPEN
 * report from the same person about the same template -- no counter to
 * reset, no window to game. Once the first one is resolved or dismissed the
 * slot frees up again, which is correct: the concern was addressed, so
 * raising it again is legitimate.
 */
reportSchema.index(
  { userId: 1, templateId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
reportSchema.index({ status: 1, createdAt: -1 });
// The queue's sort: status first, then §20 priority (mapped to a rank in
// routes), then age.
reportSchema.index({ status: 1, priority: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
module.exports.REASONS = REASONS;
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
module.exports.REASON_PRIORITY = REASON_PRIORITY;
