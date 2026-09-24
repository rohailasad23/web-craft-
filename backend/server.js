'use strict';

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

dotenv.config();

const { requireSecret } = require('./utils/secrets');
const asyncHandler = require('./middleware/asyncHandler');
const LandingPage = require('./models/LandingPage');

// ===== FAIL FAST ON BAD CONFIGURATION =====
// Resolve these once at boot. Previously each fell back to a hardcoded
// 'secret-key', which would have let anyone forge a token.
requireSecret('JWT_SECRET');

const app = express();

app.set('trust proxy', 1); // correct client IPs (and rate limits) behind a proxy

// ===== SECURITY HEADERS =====
app.use(
  helmet({
    // The API returns JSON; a restrictive CSP belongs on the published pages,
    // where it is set below and where inline <style> blocks are required.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// ===== CORS =====
const defaultOrigins = ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173'];
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowOrigin = (origin, callback) => {
  if (!origin) return callback(null, true); // server-to-server / curl
  if (!configuredOrigins.length) return callback(null, true); // not restricted
  callback(null, configuredOrigins.includes(origin));
};

if (process.env.NODE_ENV === 'production' && !configuredOrigins.length) {
  console.warn('⚠️  CORS_ORIGINS is not set -- allowing requests from any origin.');
}

app.use(cors({ origin: allowOrigin, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

// ===== BODY PARSING =====
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ===== RATE LIMITING =====
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Credential stuffing is the main risk on these two endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in 15 minutes' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ===== DATABASE =====
mongoose.connection.on('error', (err) => console.error('❌ MongoDB error:', err.message));

// ===== ROUTES =====
const authMiddleware = require('./middleware/auth');

app.use('/api/auth', require('./routes/auth'));
app.use('/api/generator', authMiddleware, require('./routes/generator'));
app.use('/api/editor', authMiddleware, require('./routes/editor'));
app.use('/api/pages', authMiddleware, require('./routes/pages'));
app.use('/api/payment', authMiddleware, require('./routes/payment'));
app.use('/api/admin', authMiddleware, require('./routes/admin'));

// ===== PUBLIC PUBLISHED PAGES =====
// Pages link to /sites/:id after publishing; this route did not exist, so
// every published URL was a 404.
app.get(
  '/sites/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).type('text/plain').send('Not found');
    }

    const page = await LandingPage.findById(req.params.id);
    if (!page || page.status !== 'published' || !page.htmlOutput) {
      return res.status(404).type('text/plain').send('Not found');
    }

    res
      .status(200)
      .type('html')
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        // Defense in depth: even if escaping ever missed a character, the
        // published page cannot execute a script.
        'Content-Security-Policy':
          "default-src 'self' https: data:; " +
          "style-src 'unsafe-inline'; " +
          "script-src 'none'; script-src-attr 'none'; " +
          "img-src 'self' https: data:; " +
          "font-src 'self' https: data:; " +
          "object-src 'none'; base-uri 'self'; form-action 'none'",
      })
      .send(page.htmlOutput);
  })
);

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ===== 404 (must come after all real routes) =====
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ===== ERROR HANDLING =====
// asyncHandler forwards rejected promises here, so this finally runs.
app.use((err, req, res, next) => {
  // Mongoose: a malformed ObjectId reaching a query.
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  // Never log the whole error object: axios/razorpay errors embed credentials.
  console.error(
    `❌ ${req.method} ${req.originalUrl} ->`,
    err.status || 500,
    err.message || err.name || 'error'
  );

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error',
  });
});

// ===== START =====
// Only listen once the DB is connected: every route needs it, and it stops
// /health from reporting "disconnected" during startup.
const PORT = process.env.PORT || 8080;

async function start() {
  // Log before awaiting: connection can take up to serverSelectionTimeoutMS,
  // and a silent await makes startup failures look like a hang.
  console.log('⏳ Connecting to MongoDB…');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/landing-builder');
  console.log('✅ MongoDB connected');

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`💻 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    console.error('   Check MONGODB_URI in backend/.env');
    process.exit(1);
  });
}

module.exports = app;
