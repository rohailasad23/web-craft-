'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { CATEGORIES, TECHNOLOGIES, SORTS, FILTERS } = require('../constants/catalog');
const Template = require('../models/Template');

const router = express.Router();

/**
 * GET /api/meta -- the taxonomy the UI renders.
 *
 * Categories, technologies and sorts are server-owned constants so adding one
 * is a one-file change. Tags are deliberately NOT a constant: spec §2 wants
 * their options to come from the database rather than a hardcoded list, so
 * they are whatever developers have actually written on their templates.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tags = await Template.distinct('tags', { status: 'approved' });

    res.json({
      success: true,
      categories: CATEGORIES,
      technologies: TECHNOLOGIES,
      filters: FILTERS,
      sorts: SORTS,
      // lowercased on write, so this ordering is already stable
      tags: tags.filter(Boolean).sort((a, b) => a.localeCompare(b)),
    });
  })
);

module.exports = router;
