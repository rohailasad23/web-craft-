'use strict';

/**
 * Wraps an async route handler so rejected promises are forwarded to the
 * Express error-handling middleware instead of being swallowed or causing an
 * unhandled rejection.
 *
 * Usage: router.get('/thing', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
