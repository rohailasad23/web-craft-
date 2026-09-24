'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const { requireSecret } = require('../utils/secrets');
const User = require('../models/User');

const router = express.Router();

/** Emails must be compared case-insensitively or duplicates slip through. */
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    // Resolved once at first use; missing config now fails loudly instead of
    // silently falling back to the hardcoded 'secret-key'.
    process.env.JWT_SECRET || requireSecret('JWT_SECRET'),
    { expiresIn: '7d' }
  );
}

/** The only shape ever sent to the client -- never the hash, never internals. */
function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar || '',
    bio: user.bio || '',
    createdAt: user.createdAt,
  };
}

// ===== REGISTER =====
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    // confirmPassword is optional at the API level, but when supplied it must match.
    if (req.body.confirmPassword !== undefined && req.body.confirmPassword !== password) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Spec §3: registration may only ever produce `user` or `developer`.
    // Anything else in the body -- including "admin" -- is coerced to `user`,
    // so nobody can promote themselves by editing the request.
    const role = User.ASSIGNABLE_ROLES.includes(req.body.role) ? req.body.role : 'user';

    if (await User.findOne({ email })) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await User.create({
      name: String(name).trim().slice(0, 80),
      email,
      passwordHash: password,
      role,
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token: signToken(user),
      user: publicUser(user),
    });
  })
);

// ===== LOGIN =====
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // passwordHash is select:false, so opt in explicitly for the comparison.
    const user = await User.findOne({ email }).select('+passwordHash');
    // Same message for both cases: do not reveal which half was wrong.
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    res.json({
      success: true,
      message: 'Login successful',
      token: signToken(user),
      user: publicUser(user),
    });
  })
);

// ===== SESSION =====
// GET /api/auth/me -- who am I? Used by the frontend on boot and after refresh.
router.get('/me', verifyToken, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account no longer exists' });
  res.json({ success: true, user: publicUser(user) });
}));

// POST /api/auth/logout -- JWTs are stateless, so the server has nothing to
// destroy; the endpoint exists so the client has one call to make, and the
// real logout is clearing the token in lib/api.js + App.jsx.
router.post('/logout', verifyToken, (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

module.exports = router;
module.exports.publicUser = publicUser;
