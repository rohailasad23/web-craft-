'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const LandingPage = require('../models/LandingPage');
const User = require('../models/User');

const router = express.Router();

// Scoped to the logged-in user's own stats. A real multi-tenant admin panel
// needs an isAdmin claim enforced by dedicated middleware.

router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const [totalPages, publishedPages, paidPages, user] = await Promise.all([
      LandingPage.countDocuments({ userId }),
      LandingPage.countDocuments({ userId, status: 'published' }),
      LandingPage.countDocuments({ userId, paymentStatus: 'paid' }),
      User.findById(userId),
    ]);

    res.json({
      success: true,
      analytics: {
        totalPages,
        publishedPages,
        paidPages,
        totalRevenue: user?.totalRevenue || 0,
        totalSitesGenerated: user?.totalSitesGenerated || 0,
      },
    });
  })
);

module.exports = router;
