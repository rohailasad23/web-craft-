'use strict';

const jwt = require('jsonwebtoken');
const { requireSecret } = require('../utils/secrets');

const authMiddleware = (req, res, next) => {
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
};

module.exports = authMiddleware;
