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
const { MongoMemoryServer } = require('mongodb-memory-server');

const MODE = String(process.env.DB_MODE || 'auto').trim().toLowerCase();
const ATLAS_URI = process.env.MONGODB_URI || '';

// Pinned so a future "latest" release cannot silently change the wire version
// we were tested against.
const LOCAL_BINARY_VERSION = process.env.LOCAL_MONGO_VERSION || '7.0.21';
const LOCAL_DB_PATH =
  process.env.LOCAL_DB_PATH || path.join(__dirname, '..', '.data', 'mongo');
const LOCAL_PORT = Number(process.env.LOCAL_DB_PORT || 27017);

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
      memoryServer = await MongoMemoryServer.create({
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
    const reason = String(err.message || err).split('\n')[0];
    console.warn(`⚠️  Atlas unreachable: ${reason}`);
    await mongoose.disconnect().catch(() => {});
    return null;
  }
}

async function connectLocal() {
  const uri = await startLocalMongo();
  await mongoose.connect(uri, { ...CONNECT_OPTIONS, dbName: 'landing-builder' });
  console.log('✅ Connected to local MongoDB (data in backend/.data/mongo)');
  return 'local';
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
