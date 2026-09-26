'use strict';

/**
 * Database bootstrap with three modes, selected by DB_MODE in backend/.env:
 *
 *   auto   (default)  Try MONGODB_URI first; if it is unreachable, fall back
 *                     to a local on-disk MongoDB so development never hard-stops.
 *   atlas             Use MONGODB_URI only. Fails fast if it is unreachable.
 *   local             Skip Atlas entirely and run a local MongoDB.
 *
 * "local" uses mongodb-memory-server, which downloads a real mongod binary on
 * first use and stores data under backend/.data/mongo, so accounts and pages
 * survive restarts. No Atlas account or IP allow-listing is required.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Required on use, not at import: mongodb-memory-server only matters when we
// are about to start an embedded mongod, and loading it eagerly made every
// process -- including `DB_MODE=atlas`, which can never need it -- pay for a
// package whose first job is checking a multi-ten-megabyte binary cache.
function loadMemoryServer() {
  const mod = require('mongodb-memory-server');
  return mod.MongoMemoryServer || mod.default?.MongoMemoryServer;
}

/**
 * Driver failures quote the connection string, and a bad MONGODB_URI produces
 * things like `Invalid connection string mongodb+srv://user:password@cluster…`
 * -- so a mistyped option would print the live credential straight to stdout
 * and into any log file it lands in. Everything printed here is redacted first.
 */
function redact(message) {
  return String(message || '')
    .replace(/\/\/[^@\s]*@/g, '//***@')
    .replace(/mongodb(\+srv)?:\/\/\S+/gi, 'mongodb$1://***');
}

const MODE = String(process.env.DB_MODE || 'auto').trim().toLowerCase();
const ATLAS_URI = process.env.MONGODB_URI || '';

// Pinned so a future "latest" release cannot silently change the wire version
// we were tested against.
const LOCAL_BINARY_VERSION = process.env.LOCAL_MONGO_VERSION || '7.0.21';
const LOCAL_DB_PATH =
  process.env.LOCAL_DB_PATH || path.join(__dirname, '..', '.data', 'mongo');
const LOCAL_PORT = Number(process.env.LOCAL_DB_PORT || 27017);
// Separate databases for the dev server and the smoke test -- both are stored
// under backend/.data/ and neither can see the other's documents.
const LOCAL_DB_NAME = process.env.LOCAL_DB_NAME || 'web-craft';

// Short on purpose: in `auto` mode a blocked Atlas costs startup time on
// every boot, so fail over quickly rather than making `npm run dev` feel hung.
const CONNECT_OPTIONS = { serverSelectionTimeoutMS: 10000 };
const ATLAS_PROBE_OPTIONS = { serverSelectionTimeoutMS: 5000 };

let memoryServer = null;
let started = null;

function ensureLocalDbPath() {
  fs.mkdirSync(LOCAL_DB_PATH, { recursive: true });
  return LOCAL_DB_PATH;
}

function startLocalMongo() {
  if (!started) {
    started = (async () => {
      ensureLocalDbPath();
      console.log(`⏳ Starting local MongoDB ${LOCAL_BINARY_VERSION} (first run downloads it)…`);
      const MemoryServer = loadMemoryServer();
      memoryServer = await MemoryServer.create({
        instance: {
          port: LOCAL_PORT,
          storageEngine: 'wiredTiger',
          dbPath: LOCAL_DB_PATH,
        },
        binary: { version: LOCAL_BINARY_VERSION },
      });
      console.log(`✅ Local MongoDB ready at ${memoryServer.getUri()}`);
      return memoryServer.getUri();
    })().catch((err) => {
      started = null;
      throw err;
    });
  }
  return started;
}

async function tryAtlas() {
  if (!ATLAS_URI) return null;
  console.log('⏳ Connecting to MongoDB Atlas…');
  try {
    await mongoose.connect(ATLAS_URI, ATLAS_PROBE_OPTIONS);
    console.log('✅ Connected to MongoDB Atlas');
    return 'atlas';
  } catch (err) {
    const reason = redact(String(err.message || err)).split('\n')[0];
    console.warn(`⚠️  Atlas unreachable: ${reason}`);
    await mongoose.disconnect().catch(() => {});
    return null;
  }
}

async function connectLocal() {
  const uri = `mongodb://127.0.0.1:${LOCAL_PORT}/${LOCAL_DB_NAME}`;

  // A mongod may already be running on this port with this data directory --
  // left by a previous run, or by `npm run seed` / the smoke test. Starting a
  // second one fails on the WiredTiger lock ("DBPathInUse"), so reuse the one
  // that is already up instead of fighting it for the lock.
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
    console.log(`✅ Reusing the local MongoDB already listening on :${LOCAL_PORT}`);
    return 'local';
  } catch {
    // Nothing answered -- fall through and start our own instance.
  }

  const started = await startLocalMongoWithRetry();
  await mongoose.connect(started, { ...CONNECT_OPTIONS, dbName: LOCAL_DB_NAME });
  console.log(`✅ Connected to local MongoDB (data in backend/.data/mongo, db "${LOCAL_DB_NAME}")`);
  return 'local';
}

/**
 * Start mongod, retrying a couple of times.
 *
 * The only startup failure we expect is DBPathInUSE -- a mongod from the run
 * we just killed still releasing the lock. That clears in well under a second,
 * and without this retry the user sees a hard crash on every restart.
 */
async function startLocalMongoWithRetry(attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await startLocalMongo();
    } catch (err) {
      lastError = err;
      const locked = /DBPathInUse|lock file/i.test(String(err.message || ''));
      if (!locked || i === attempts - 1) break;
      console.log(`⏳ Local data directory still locked, retrying (${i + 2}/${attempts})…`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastError;
}

async function connectDB() {
  if (MODE === 'local') return connectLocal();

  if (MODE === 'atlas') {
    if (!ATLAS_URI) {
      throw new Error('DB_MODE=atlas but MONGODB_URI is not set in backend/.env');
    }
    await mongoose.connect(ATLAS_URI, CONNECT_OPTIONS);
    console.log('✅ Connected to MongoDB Atlas');
    return 'atlas';
  }

  // auto
  const hit = await tryAtlas();
  if (hit) return hit;
  console.log('🔁 Falling back to a local MongoDB so the app can still run.');
  return connectLocal();
}

/** Stop the embedded mongod; called on shutdown so the port is released. */
async function disconnectDB() {
  await mongoose.disconnect().catch(() => {});
  if (memoryServer) {
    await memoryServer.stop().catch(() => {});
    memoryServer = null;
  }
}

module.exports = { connectDB, disconnectDB };
