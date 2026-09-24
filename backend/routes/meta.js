'use strict';

const express = require('express');
const { CATEGORIES, TECHNOLOGIES, SORTS, FILTERS } = require('../constants/catalog');

const router = express.Router();

/**
 * GET /api/meta -- the taxonomy the UI renders.
 *
 * The frontend never hardcodes category or filter lists; they arrive from here
 * so adding a category is a one-file change on the server.
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    categories: CATEGORIES,
    technologies: TECHNOLOGIES,
    filters: FILTERS,
    sorts: SORTS,
  });
});

module.exports = router;
