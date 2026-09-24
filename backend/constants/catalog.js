'use strict';

/**
 * Single source of truth for the browsing taxonomy.
 *
 * The filter bar on /templates is one flat list (All, HTML/CSS, ... Blog), so
 * every entry can be either a *category* or a *technology* -- a filter matches
 * whichever field applies. See routes/templates.js.
 *
 * Adding a category later is a one-line change here: the frontend renders
 * whatever GET /api/meta returns and never keeps its own copy.
 */

const TECHNOLOGIES = ['HTML/CSS', 'JavaScript', 'React', 'Next.js', 'Vue', 'Node.js'];

const CATEGORIES = ['Portfolio', 'E-commerce', 'Landing Page', 'Dashboard', 'Blog'];

const SORTS = ['newest', 'popular', 'downloads', 'az'];

const FILTERS = ['All', ...TECHNOLOGIES, ...CATEGORIES];

module.exports = { TECHNOLOGIES, CATEGORIES, SORTS, FILTERS };
