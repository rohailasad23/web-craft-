'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const LandingPage = require('../models/LandingPage');
const User = require('../models/User');
const { generateContent } = require('../services/contentAI');
const { getImages } = require('../services/images');
const { buildTemplate, renderHtml } = require('../services/render');

const router = express.Router();

// ===== GENERATE LANDING PAGE =====
// Resilient by design: the AI service never throws, image sourcing always
// returns something renderable, so this endpoint cannot fail because a
// third-party API is down or a key is missing.
router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const { businessName, businessType, description, features, targetAudience, colorScheme } =
      req.body;

    if (!businessName || !businessType || !description) {
      return res.status(400).json({ error: 'businessName, businessType and description are required' });
    }

    console.log(`📝 Generating content for ${businessName}`);

    const { content, provider } = await generateContent({
      businessName,
      businessType,
      description,
      targetAudience,
      features,
    });

    const images = await getImages(businessType);
    const color = colorScheme || '#3B82F6';

    const currentState = buildTemplate({ businessName, content, images, colorScheme: color });
    const page = new LandingPage({
      userId: req.user.id,
      businessName,
      businessType,
      description,
      targetAudience: targetAudience || 'General',
      features: Array.isArray(features) ? features.filter(Boolean) : [],
      colorScheme: color,
      generatedContent: {
        ...content,
        images,
        templateUsed: 'template1',
        provider,
      },
      currentState,
      status: 'draft',
      amount: 1500,
    });

    // htmlOutput is derived from currentState, so it is always in sync.
    page.htmlOutput = renderHtml(page);
    await page.save();

    await User.findByIdAndUpdate(req.user.id, { $inc: { totalSitesGenerated: 1 } });

    console.log(`✅ Landing page created: ${page._id} (copy source: ${provider})`);

    res.status(201).json({
      success: true,
      pageId: page._id,
      businessName,
      provider,
      message:
        provider === 'template'
          ? 'Landing page generated with template copy (no AI provider configured)'
          : 'Landing page generated successfully',
      preview: { headline: content.headline, subheadline: content.subheadline },
    });
  })
);

// ===== GET AVAILABLE TEMPLATES =====
router.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const templates = [
      { id: 'template1', name: 'Modern Hero', description: 'Classic hero section with CTA' },
      { id: 'template2', name: 'Feature Focused', description: 'Highlights key features prominently' },
      { id: 'template3', name: 'Social Proof', description: 'Testimonials and social proof focused' },
      { id: 'template4', name: 'Minimal Clean', description: 'Minimal design, maximum impact' },
      { id: 'template5', name: 'E-Commerce', description: 'Product showcase and sales focused' },
    ];
    res.json({ success: true, templates });
  })
);

// ===== SANITY CHECK AI CONFIGURATION =====
// Lets the UI warn instead of silently degrading.
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const { readSecret } = require('../utils/secrets');
    res.json({
      success: true,
      aiConfigured: Boolean(readSecret('CLAUDE_API_KEY') || readSecret('OPENAI_API_KEY')),
      ollamaConfigured: Boolean(process.env.OLLAMA_URL),
      imagesConfigured: Boolean(readSecret('UNSPLASH_API_KEY')),
    });
  })
);

module.exports = router;
