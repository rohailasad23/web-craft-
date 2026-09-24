'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const LandingPage = require('../models/LandingPage');
const { buildTemplate, renderHtml } = require('../services/render');

const router = express.Router();

/**
 * Only these fields may be changed by a client. Anything else in the request
 * body (userId, paymentStatus, status, paymentId, _id...) is ignored, which
 * closes the mass-assignment hole that let a client publish without paying.
 */
const EDITABLE_FIELDS = [
  'generatedContent',
  'currentState',
  'colorScheme',
  'businessName',
  'description',
  'targetAudience',
  'features',
];

function pickEditable(body) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

/** Persist derived HTML so edits are reflected on the published page. */
async function saveWithRenderedHtml(page) {
  if (!page.currentState?.sections?.length && page.generatedContent) {
    page.currentState = buildTemplate({
      businessName: page.businessName,
      content: page.generatedContent,
      images: page.generatedContent.images || [],
      colorScheme: page.colorScheme,
    });
  }
  page.htmlOutput = renderHtml(page);
  page.editCount = (page.editCount || 0) + 1;
  page.updatedAt = new Date();
  await page.save();
  return page;
}

const notFound = (res, msg) => res.status(404).json({ error: msg });

// ===== GET LP FOR EDITING =====
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const page = await LandingPage.findOne({ _id: req.params.id, userId: req.user.id });
    if (!page) return notFound(res, 'Landing page not found');
    res.json(page);
  })
);

// ===== UPDATE WHOLE LP (content/meta) =====
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const page = await LandingPage.findOne({ _id: req.params.id, userId: req.user.id });
    if (!page) return notFound(res, 'Landing page not found');

    Object.assign(page, pickEditable(req.body));
    const updated = await saveWithRenderedHtml(page);
    res.json(updated);
  })
);

// ===== UPDATE ONE SECTION =====
router.put(
  '/:id/sections',
  asyncHandler(async (req, res) => {
    const { sectionId, updates = {} } = req.body || {};
    if (!sectionId) return res.status(400).json({ error: 'sectionId is required' });

    const page = await LandingPage.findOne({ _id: req.params.id, userId: req.user.id });
    if (!page) return notFound(res, 'Landing page not found');

    // Sections generated before the styling fix may not have the field.
    if (!page.currentState) page.currentState = { sections: [] };

    const section = page.currentState.sections.find((s) => s.id === sectionId);
    if (!section) return notFound(res, 'Section not found');

    section.content = section.content || {};
    section.styling = section.styling || {};

    Object.assign(section.content, updates.content || {});
    if (updates.styling) Object.assign(section.styling, updates.styling);

    page.markModified('currentState');
    const updated = await saveWithRenderedHtml(page);
    res.json(updated);
  })
);

// ===== UPDATE COLORS =====
router.put(
  '/:id/colors',
  asyncHandler(async (req, res) => {
    const { colors } = req.body || {};
    if (typeof colors !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(colors)) {
      return res.status(400).json({ error: 'colors must be a hex color like #3B82F6' });
    }

    const page = await LandingPage.findOne({ _id: req.params.id, userId: req.user.id });
    if (!page) return notFound(res, 'Landing page not found');

    page.colorScheme = colors;
    // Keep the sections that were generated with the old color in sync too.
    if (Array.isArray(page.currentState?.sections)) {
      for (const section of page.currentState.sections) {
        if (section.styling && section.styling.backgroundColor) {
          section.styling.backgroundColor = colors;
        }
      }
      page.markModified('currentState');
    }

    const updated = await saveWithRenderedHtml(page);
    res.json(updated);
  })
);

// ===== LIVE PREVIEW =====
router.get(
  '/:id/preview',
  asyncHandler(async (req, res) => {
    const page = await LandingPage.findOne({ _id: req.params.id, userId: req.user.id });
    if (!page) return notFound(res, 'Landing page not found');
    res.json({ html: page.htmlOutput });
  })
);

module.exports = router;
