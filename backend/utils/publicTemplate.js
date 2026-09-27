'use strict';

/**
 * The public projection of a template.
 *
 * Admin-controlled internals must not leak into public responses (spec §5:
 * the quality score is internal; §8: duplicate matches describe OTHER
 * templates; §2: the trending override is an admin's decision, not a fact
 * about the template; §14: moderation plumbing is nobody's business but the
 * moderator's). Applying this in one place keeps every public route honest
 * without trusting each caller to remember.
 *
 * The developer's OWN text is never touched here -- moderation reads it
 * through the same projection:
 *   - `content.editedDescription` replaces the description (admin edit),
 *   - `content.state === 'hidden'` withholds it and says so (`contentHidden`),
 *   - nothing is deleted, so "restore" is always possible (§14).
 */
function publicTemplate(doc) {
  const t = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };

  delete t.quality;
  delete t.duplicateCheck;
  delete t.trendingOverride;
  delete t.featuredOrder;

  const state = t.content?.state || 'visible';
  if (state === 'hidden') {
    // Withheld means withheld: an empty string, never the original text with
    // a flag beside it (the flag alone would still ship the prose to anyone
    // reading the JSON). The stored text is untouched -- see the model.
    t.description = '';
  } else if (t.content?.editedDescription) {
    t.description = t.content.editedDescription;
  }
  t.contentHidden = state === 'hidden';
  // Flagged content stays visible (it is still under review, not withheld);
  // only the hidden state changes what the public sees.
  delete t.content;

  return t;
}

/** Same rules for a bare lean() row that never had a .toObject(). */
publicTemplate.lean = (row) => publicTemplate(row);

module.exports = publicTemplate;
