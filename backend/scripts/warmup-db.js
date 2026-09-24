'use strict';

/**
 * Pre-downloads the local MongoDB binary so the very first `npm run dev`
 * does not stall for minutes waiting on a 600MB download.
 *
 *   node scripts/warmup-db.js
 *
 * Safe to re-run: it is a no-op once the binary is cached.
 */

const fs = require('fs');
const path = require('path');

// Mirrors services/database.js defaults without pulling in the whole module.
const { MongoMemoryServer } = require('mongodb-memory-server');

const version = process.env.LOCAL_MONGO_VERSION || '7.0.21';
const dbPath = process.env.LOCAL_DB_PATH || path.join(__dirname, '..', '.data', 'mongo');
const port = Number(process.env.LOCAL_DB_PORT || 27017);

(async () => {
  fs.mkdirSync(dbPath, { recursive: true });
  const started = Date.now();
  console.log(`Downloading/starting MongoDB ${version}…`);

  const mongod = await MongoMemoryServer.create({
    instance: { port, storageEngine: 'wiredTiger', dbPath },
    binary: { version },
  });

  console.log(`Ready in ${((Date.now() - started) / 1000).toFixed(1)}s at ${mongod.getUri()}`);
  await mongod.stop();
  console.log('Binary cached. Done.');
  process.exit(0);
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
