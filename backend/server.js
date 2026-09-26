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
const { connectDB, disconnectDB } = require('./services/database');
const storage = require('./services/storage');

// ===== FAIL FAST ON BAD CONFIGURATION =====
// Resolve these once at boot. Previously each fell back to a hardcoded
// 'secret-key', which would have let anyone forge a token.
requireSecret('JWT_SECRET');

const app = express();

// Rate limiting keys on req.ip. With `1` and no proxy actually in front, the
// rightmost X-Forwarded-For entry is read from the request itself, so any
// client could rotate it and reset its own window -- unlimited password
// guessing on /api/auth/login. So this is off unless a proxy is really there.
// Set TRUST_PROXY=1 (or =loopback, =<ips>) when deploying behind one.
const trustProxyEnv = String(process.env.TRUST_PROXY || '').trim();
function parseTrustProxy(raw) {
  if (!raw || raw === 'false') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw; // 'loopback', 'uniquelocal', a CIDR list -- handled by proxy-addr
}
app.set('trust proxy', parseTrustProxy(trustProxyEnv));

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

// CORS_ORIGINS wins when it is set. When it is not, fall back to the dev
// origins above rather than to "anything": the empty-list case is the
// documented dev default, and silently allowing every origin there meant the
// intended list below was dead code and any website could read API responses.
const allowOrigin = (origin, callback) => {
  if (!origin) return callback(null, true); // server-to-server / curl
  const list = configuredOrigins.length ? configuredOrigins : defaultOrigins;
  callback(null, list.includes(origin));
};

if (process.env.NODE_ENV === 'production' && !configuredOrigins.length) {
  console.warn('⚠️  CORS_ORIGINS is not set -- falling back to the dev origins.');
}

// PATCH is load-bearing: moderation decisions (§8/§14), account status (§9)
// and notification reads (§12) are all partial updates. Without it the
// preflight rejects them -- a failure that only shows up in a browser, since
// the node-based smoke suite never sends an Origin header or a preflight.
app.use(
  cors({
    origin: allowOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

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

// Spec §21 wants the sensitive endpoints covered individually, not only by the
// blanket 300/15-min. The two below write to disk, so they are also an
// unauthenticated bandwidth/disk amplifier worth their own budget.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many uploads, please try again in 15 minutes' },
});

const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many reports, please try again in 15 minutes' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
// A stolen token can be used to grind the current password here, so it gets
// the same budget as login rather than the generic one.
app.use('/api/auth/change-password', authLimiter);
// Mounted with the method, not the path: GET /api/templates is the whole
// catalogue and must never be throttled at 15 requests.
app.post('/api/templates', uploadLimiter);
app.post('/api/templates/:id/report', reportLimiter);

// ===== DATABASE =====
mongoose.connection.on('error', (err) => console.error('❌ MongoDB error:', err.message));

// ===== ROUTES =====
const verifyToken = require('./middleware/auth');

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/meta', require('./routes/meta'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/developers', require('./routes/developers'));
app.use('/api/admin', require('./routes/admin'));
// Spec §12. Mounted as its own resource so the navbar bell does not have to
// reach into /api/users for something that is not a user setting.
app.use('/api/notifications', require('./routes/notifications'));

// ===== UPLOADED FILES =====
// Only the image directories are public, so cards render without a token.
//
// Template archives are deliberately NOT mounted: mounting UPLOAD_ROOT would
// serve /uploads/templates/<key>.zip straight from disk, letting anyone fetch
// a full archive anonymously -- skipping the login gate and downloadCount on
// POST /api/templates/:slug/download, and even retrieving the archive of a
// pending or rejected template that GET /api/templates/:slug refuses to
// describe at all. They go through that download route, which checks the
// session and records the download first.
const { FIELD_DIRS } = require('./middleware/upload');
const PUBLIC_UPLOAD_DIRS = storage.SUBDIRS.filter((dir) => dir !== FIELD_DIRS.file);

storage.ensureStorage();

const publicUploadOptions = {
  index: false,
  dotfiles: 'deny',
  maxAge: '7d',
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Defense in depth: nothing that lives in uploads/ may ever execute a
    // script, even if a malformed file somehow reached disk.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; sandbox"
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
};

PUBLIC_UPLOAD_DIRS.forEach((dir) => {
  app.use(
    `/uploads/${dir}`,
    express.static(path.join(storage.UPLOAD_ROOT, dir), publicUploadOptions)
  );
});

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

  // Never log the whole error object: some third-party SDK errors embed the
  // credentials they were initialised with.
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
  // connectDB() picks Atlas or a local mongod based on DB_MODE -- see
  // services/database.js.
  const backend = await connectDB();
  console.log(`🗄  Database backend: ${backend}`);

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`💻 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('❌ Database connection failed:', err.message);
    console.error('   Check DB_MODE / MONGODB_URI in backend/.env');
    process.exit(1);
  });

  // Release the port (and the embedded mongod) on Ctrl+C.
  const shutdown = () => {
    disconnectDB().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

module.exports = app;
