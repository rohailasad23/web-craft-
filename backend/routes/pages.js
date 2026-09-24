'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const LandingPage = require('../models/LandingPage');

const router = express.Router();
const notFound = (res) => res.status(404).json({ error: 'Page not found' });

// Every query is scoped by userId: one user can never see another's pages.

// ===== GET ALL USER PAGES =====
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pages = await LandingPage.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, pages });
  })
);

// ===== GET ONE PAGE =====
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const page = await LandingPage.findOne({ _id: req.params.id, userId: req.user.id });
    if (!page) return notFound(res);
    res.json({ success: true, page });
  })
);

// ===== DELETE PAGE =====
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const page = await LandingPage.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!page) return notFound(res);
    res.json({ success: true, message: 'Page deleted' });
  })
);

// ===== DUPLICATE PAGE =====
router.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const page = await LandingPage.findOne({ _id: req.params.id, userId: req.user.id });
    if (!page) return notFound(res);

    const copy = page.toObject();
    delete copy._id;
    delete copy.__v;
    delete copy.publicUrl;
    // A copy starts life unpurchased and unpublished.
    copy.status = 'draft';
    copy.paymentStatus = 'pending';
    copy.paymentId = undefined;
    copy.editCount = 0;
    copy.views = 0;
    copy.createdAt = new Date();
    copy.updatedAt = new Date();

    const newPage = await LandingPage.create(copy);
    res.json({ success: true, page: newPage });
  })
);

// ===== PUBLISH PAGE =====
router.post(
  '/:id/publish',
  asyncHandler(async (req, res) => {
    const page = await LandingPage.findOne({ _id: req.params.id, userId: req.user.id });
    if (!page) return notFound(res);

    if (page.paymentStatus !== 'paid') {
      return res.status(402).json({ error: 'Payment required before publishing' });
    }

    const base = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8080}`)
      .replace(/\/$/, '');

    page.status = 'published';
    page.publicUrl = `${base}/sites/${page._id}`;
    page.updatedAt = new Date();
    await page.save();

    res.json({ success: true, publicUrl: page.publicUrl });
  })
);

module.exports = router;
