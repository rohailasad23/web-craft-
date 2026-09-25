'use strict';

const jwt = require('jsonwebtoken');
const { requireSecret } = require('../utils/secrets');
const User = require('../models/User');

/**
 * Verifies the bearer token.
 *
 * The payload carries only { id, email, role } and is signed by us. The role is
 * NEVER taken from the request body -- spec §13 forbids trusting role info that
 * originates on the client, and a body field would be attacker-controlled.
 */
function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.slice(7);
    // No silent fallback to a hardcoded key: a missing JWT_SECRET would let
    // anyone forge tokens, so we fail closed instead.
    const decoded = jwt.verify(token, process.env.JWT_SECRET || requireSecret('JWT_SECRET'));
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.message && error.message.startsWith('Invalid configuration')) {
      console.error('❌ JWT_SECRET is not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Role guard. The role is re-read from the database rather than trusted from
 * the token payload, so promoting or demoting someone takes effect on their
 * very next request instead of when their 7-day token expires.
 *
 *   router.post('/', verifyToken, requireRole('developer', 'admin'), handler)
 */
function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });

    try {
      // One read answers both questions: role (never trusted from the token)
      // and account status (spec §9).
      const user = await User.findById(req.user.id).select('role status').lean();
      if (!user) return res.status(401).json({ error: 'Account no longer exists' });
      if (user.status === 'suspended') return suspended(res);
      if (!roles.includes(user.role)) {
        return res
          .status(403)
          .json({ error: 'You do not have permission to perform this action' });
      }
      req.user.role = user.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** The one message every guard gives a suspended account (spec §9). */
function suspended(res) {
  return res.status(403).json({
    error: 'This account is suspended. Please contact support if you believe this is a mistake.',
    code: 'ACCOUNT_SUSPENDED',
  });
}

/**
 * Spec §9: blocks a suspended account from taking ACTIONS, not from reading.
 *
 * A token is valid for 7 days, so blocking the login alone would still leave
 * a week in which a suspended user could upload, save or download. This
 * re-reads status from the database -- the token payload cannot be trusted
 * for it, because the suspension always happened AFTER the token was issued.
 *
 *   router.post('/', verifyToken, requireActive, handler)
 */
async function requireActive(req, res, next) {
  if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });

  try {
    const user = await User.findById(req.user.id).select('status').lean();
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    if (user.status === 'suspended') return suspended(res);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Verifies the token when one is present, otherwise continues anonymously.
 * Used by public detail pages that only need `canEdit` for the owner.
 * A bad/expired token degrades to "logged out" instead of 401 -- the client's
 * interceptor already handles the real logout.
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();

  try {
    req.user = jwt.verify(
      header.slice(7),
      process.env.JWT_SECRET || requireSecret('JWT_SECRET')
    );
  } catch {
    // Expired/garbage token: treat the caller as anonymous. The real logout is
    // handled by the client's 401 interceptor, not by failing a public page.
  }
  return next();
}

module.exports = verifyToken;
module.exports.requireRole = requireRole;
module.exports.optionalAuth = optionalAuth;
module.exports.requireActive = requireActive;
