'use strict';

const jwt = require('jsonwebtoken');
const PlatformConfig = require('../models/PlatformConfig');
const User = require('../models/User');
const { requireSecret } = require('../utils/secrets');

/**
 * Spec §11 (feature flags) and §12 (maintenance mode): the runtime switches
 * that let an admin change how the platform behaves without a code deploy.
 *
 * Three pieces:
 *   getPlatform()       -- the cached config every gate and payload reads
 *   flagGate(flag)      -- per-route guard for one §11 feature
 *   maintenanceGate     -- the §12 wall in front of the whole /api surface
 *
 * The cache exists because these run on hot paths (every download, every
 * favourite). It is invalidated the moment an admin saves a switch, so the
 * longest a change can lag is one in-flight request -- and a stuck cache
 * fails the same way the config reads do (an error goes to next(err), never
 * to "pretend the feature is on").
 */

let cache = { config: null, at: 0 };
const CACHE_TTL_MS = 60 * 1000;

/** Flags default ON; only an explicit `false` counts as off. */
function normaliseFlags(raw) {
  const flags = {};
  for (const key of PlatformConfig.FLAG_KEYS) {
    flags[key] = !raw || raw[key] !== false;
  }
  return flags;
}

async function getPlatform() {
  if (cache.config && Date.now() - cache.at < CACHE_TTL_MS) return cache.config;

  const doc = await PlatformConfig.load();
  cache.config = {
    flags: normaliseFlags(doc.flags),
    maintenance: {
      enabled: !!doc.maintenance?.enabled,
      message: (doc.maintenance?.message || '').trim(),
    },
    sections: (doc.homepage?.sections || []).map((s) => ({
      key: s.key,
      enabled: s.enabled !== false,
      order: Number.isFinite(s.order) ? s.order : 0,
      title: s.title || '',
      blurb: s.blurb || '',
    })),
  };
  cache.at = Date.now();
  return cache.config;
}

/** Called by every admin write that changes a switch or the layout. */
function invalidatePlatform() {
  cache = { config: null, at: 0 };
}

function flagMessage(key) {
  return PlatformConfig.FLAGS.find((f) => f.key === key)?.message || 'This feature is temporarily disabled.';
}

/**
 * Admins bypass a feature flag -- the panel (§12) and moderation work must
 * keep functioning while a feature is off for everyone else.
 *
 * The role is re-read from the database rather than taken from the token
 * (same rule as requireRole): a demoted admin does not keep special access
 * because their old token says so. This only runs on the OFF path, so the
 * common case (flag on) costs nothing.
 */
async function bypassesFlags(req) {
  if (!req.user?.id) return false;
  try {
    const user = await User.findById(req.user.id).select('role status').lean();
    return user?.role === 'admin' && user?.status !== 'suspended';
  } catch {
    return false;
  }
}

/**
 * Guard one §11 feature. Mount AFTER verifyToken on authenticated routes so
 * the admin bypass is available; on public routes it simply blocks.
 *
 *   router.post('/:id/download', flagGate('downloads'), handler)
 */
function flagGate(flag) {
  return async (req, res, next) => {
    try {
      const config = await getPlatform();
      if (config.flags[flag] !== false) return next();
      if (await bypassesFlags(req)) return next();
      // §11: "If a feature is disabled, show a clear message to users."
      // 403 + a stable code so the client can distinguish this from a bug.
      return res.status(403).json({ error: flagMessage(flag), code: 'FEATURE_DISABLED' });
    } catch (err) {
      next(err);
    }
  };
}

/** Endpoints full maintenance must leave running: status + signing in. */
const MAINTENANCE_ALWAYS_ON = ['/platform', '/auth/login', '/auth/me', '/auth/logout'];

/**
 * Full maintenance (§12): everything behind the wall except the payload that
 * explains the wall and the two calls an admin needs to get through it
 * (sign in, read own session). The admin panel itself stays reachable --
 * §12: "Admin panel itself should remain accessible to authorized
 * administrators."
 */
async function maintenanceGate(req, res, next) {
  try {
    const config = await getPlatform();
    if (!config.maintenance.enabled) return next();
    if (MAINTENANCE_ALWAYS_ON.includes(req.path)) return next();

    if (await passesAsAdmin(req)) return next();

    return res.status(503).json({
      error:
        config.maintenance.message ||
        'Website is temporarily under maintenance. Please try again later.',
      code: 'MAINTENANCE',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * The maintenance bypass must fail CLOSED: no token, bad token, expired
 * token or missing JWT_SECRET all mean "not an admin", because a config
 * error here would otherwise open the whole site while pretending to close
 * it.
 */
async function passesAsAdmin(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return false;

  let id;
  try {
    id = jwt.verify(header.slice(7), process.env.JWT_SECRET || requireSecret('JWT_SECRET')).id;
  } catch {
    return false;
  }
  if (!id) return false;

  try {
    const user = await User.findById(id).select('role status').lean();
    return user?.role === 'admin' && user?.status !== 'suspended';
  } catch {
    return false;
  }
}

module.exports = { getPlatform, invalidatePlatform, flagGate, maintenanceGate };
