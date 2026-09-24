'use strict';

const mongoose = require('mongoose');

/**
 * Section sub-schema.
 *
 * IMPORTANT: this MUST be an explicit Schema, not an inline array literal like
 * `sections: [{ id: String, type: String, ... }]`.
 *
 * Mongoose treats any object containing a `type` key as a *type definition*,
 * so the inline form silently compiled to `sections: [String]`. Saving then
 * failed with `Cast to [string] failed`, which made the whole generate
 * endpoint 500 regardless of the AI provider. Naming the field `type` is
 * required by the editor, so the explicit sub-schema is the correct fix.
 *
 * `_id:false, id:false` stop Mongoose injecting its own `_id`/`id` virtuals
 * on top of our real `id` field.
 */
const sectionSchema = new mongoose.Schema(
  {
    id: String,
    type: String,
    content: mongoose.Schema.Types.Mixed,
    styling: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false, id: false, minimize: false }
);

const landingPageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    businessName: String,
    businessType: String,
    description: String,
    targetAudience: String,
    features: [String],
    colorScheme: { type: String, default: '#3B82F6' },

    generatedContent: {
      headline: String,
      subheadline: String,
      benefits: [String],
      ctaText: String,
      featureDescriptions: [String],
      footerText: String,
      images: [{ url: String, alt: String }],
      templateUsed: String,
      // Which backend produced the copy: claude | openai | ollama | template
      provider: String,
    },

    currentState: {
      type: new mongoose.Schema({ sections: { type: [sectionSchema], default: [] } }, {
        _id: false,
        id: false,
        minimize: false,
      }),
      default: () => ({ sections: [] }),
    },

    htmlOutput: String,
    publicUrl: String,

    status: { type: String, enum: ['draft', 'ready', 'published', 'archived'], default: 'draft' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    amount: { type: Number, default: 1500, min: 0 },
    paymentId: String,

    editCount: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
  },
  {
    timestamps: true, // auto updatedAt -- the old pre('save') hook never ran on findOneAndUpdate
    // Only derived/searchable fields are stored; htmlOutput can be large.
    minimize: false,
  }
);

module.exports = mongoose.model('LandingPage', landingPageSchema);
