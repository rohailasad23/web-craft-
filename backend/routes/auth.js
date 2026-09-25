'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const { requireActive } = require('../middleware/auth');
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
    // Spec §9: surfaced so the client can explain WHY actions are blocked
    // instead of leaving the user to guess at a string of failed requests.
    status: user.status || 'active',
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

    // Spec §9: a suspended account keeps its data but cannot sign in. Checked
    // AFTER the password so this cannot be used to fish for suspended
    // accounts, and answered with 403 rather than 401 -- the credentials were
    // correct, the account itself is what is refused. 401 would also be read
    // by the client as "wrong password", which is not what happened.
    if (user.status === 'suspended') {
      return res.status(403).json({
        error:
          'This account is suspended. Please contact support if you believe this is a mistake.',
        code: 'ACCOUNT_SUSPENDED',
      });
    }

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

// ===== CHANGE PASSWORD =====
// Spec §11: the current password is required even though the caller already
// holds a valid session -- an unlocked laptop or a stolen token must not be
// enough to take the account over.
router.post(
  '/change-password',
  verifyToken,
  // Spec §9: a frozen account does not get to change its credentials either.
  requireActive,
  asyncHandler(async (req, res) => {
    const current = String(req.body.currentPassword || '');
    const next = String(req.body.newPassword || '');

    if (!current || !next) {
      return res
        .status(400)
        .json({ error: 'Current password and new password are required' });
    }
    if (next.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    if (current === next) {
      return res
        .status(400)
        .json({ error: 'New password must be different from the current one' });
    }

    const user = await User.findById(req.user.id).select('+passwordHash');
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });

    if (!(await user.comparePassword(current))) {
      // 400, not 401: the session is perfectly valid, only this field is
      // wrong. The frontend treats a 401 as "your session has expired" and
      // tears it down, so answering 401 here would log the person out
      // mid-form and bury the one message they need to see.
      return res.status(400).json({ error: 'Your current password is incorrect' });
    }

    // The schema's pre('save') hook re-hashes because passwordHash changed.
    user.passwordHash = next;
    await user.save();

    res.json({ success: true, message: 'Password updated' });
  })
);

// POST /api/auth/logout -- JWTs are stateless, so the server has nothing to
// destroy; the endpoint exists so the client has one call to make, and the
// real logout is clearing the token in lib/api.js + App.jsx.
router.post('/logout', verifyToken, (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

module.exports = router;
module.exports.publicUser = publicUser;
