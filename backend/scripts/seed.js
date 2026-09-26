'use strict';

/**
 * Development seed: `npm run seed` inside backend/.
 *
 * Creates a developer account, a normal user, and one template in every
 * category so the homepage is never empty after a fresh database (spec §21).
 *
 * Safe to re-run -- every seeded document carries `seeded: true` and is
 * replaced rather than duplicated, so counts never inflate. Nothing here
 * creates an admin, and no fake production credentials are written anywhere.
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../services/database');
const { CATEGORIES, TECHNOLOGIES } = require('../constants/catalog');
const User = require('../models/User');
const Template = require('../models/Template');
const Download = require('../models/Download');
const Favorite = require('../models/Favorite');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { makeThumbnail } = require('../services/placeholders');
const storage = require('../services/storage');

const SEED_USER = {
  name: 'Ayesha Khan',
  email: 'ayesha@example.com',
  passwordHash: 'seed-dev-1234',
  role: 'developer',
  bio: 'Front-end developer building clean, responsive templates. I care about typography, spacing and shipping things that work on a phone first.',
};

const SEED_BROWSERS = {
  name: 'Demo User',
  email: 'demo@example.com',
  passwordHash: 'seed-user-1234',
  role: 'user',
  bio: 'Just here to grab a few templates.',
};

/**
 * Spec §8 ships a moderation console that deliberately has NO HTTP path to
 * grant admin -- so without a seeded account there would be no way to ever see
 * it. This is that account, and it exists only as long as you run `npm run
 * seed`; nothing in the running app creates one.
 */
const SEED_ADMIN = {
  name: 'Sam Admin',
  email: 'admin@example.com',
  passwordHash: 'seed-admin-1234',
  role: 'admin',
  bio: 'Keeps the catalogue clean.',
};

/** title, category, technologies, blurb, tags */
const SEED_TEMPLATES = [
  ['Nordic Portfolio', 'Portfolio', ['HTML/CSS', 'JavaScript'], 'A calm, editorial portfolio with large type, generous whitespace and a dark-mode toggle. Ships with project, about and contact views.', ['minimal', 'dark mode', 'portfolio']],
  ['Studio Agency', 'Landing Page', ['React', 'Next.js'], 'A conversion-focused agency landing page with a pricing-free layout, testimonial rail and sticky call-to-action bar.', ['agency', 'landing', 'animated']],
  ['Aurora Store', 'E-commerce', ['Vue', 'JavaScript'], 'A modern storefront shell: product grid, filter drawer, cart summary and a checkout step that is already wired to mock data.', ['ecommerce', 'responsive', 'modern']],
  ['Pulse Dashboard', 'Dashboard', ['React', 'Tailwind CSS'], 'An analytics dashboard with stat cards, a date-range switcher, sortable tables and an empty state that does not look broken.', ['dashboard', 'charts', 'responsive']],
  ['Ink & Paper', 'Blog', ['HTML/CSS', 'Node.js'], 'A typography-first blog theme with a reading-time indicator, tag pages and an RSS feed already generated.', ['typography', 'blog', 'minimal']],
  ['Frame Folio', 'Portfolio', ['Vue', 'HTML/CSS'], 'A grid-driven portfolio that keeps every thumbnail the same aspect ratio, with keyboard navigation between projects.', ['grid', 'portfolio', 'keyboard']],
  ['Signal SaaS', 'Landing Page', ['Next.js', 'JavaScript'], 'A SaaS marketing page with a feature grid, FAQ accordion and a waitlist form validated entirely on the client.', ['saas', 'landing', 'startup']],
  ['Marketplace Kit', 'E-commerce', ['React', 'Node.js'], 'A two-sided marketplace starter with seller profiles, review cards and search that survives a page refresh.', ['ecommerce', 'search', 'responsive']],
  ['Metric Console', 'Dashboard', ['JavaScript', 'HTML/CSS'], 'A lightweight admin console: sidebar navigation, breadcrumb trail, form validation and toasts for every mutation.', ['dashboard', 'admin', 'forms']],
  ['Longform', 'Blog', ['Next.js', 'React'], 'A long-form writing theme with footnote support, a table of contents that tracks scroll position and full-bleed images.', ['blog', 'typography', 'reading']],
  ['Craft Commerce', 'E-commerce', ['HTML/CSS', 'JavaScript'], 'A product landing page for a single-item shop: gallery, size selector, reviews and an add-to-cart micro-interaction.', ['landing', 'ecommerce', 'micro-interactions']],
  ['Resume One', 'Portfolio', ['HTML/CSS'], 'A single-page resume template that prints cleanly to A4, with skills, timeline and a downloadable PDF stylesheet.', ['one page', 'print', 'portfolio']],
];

/**
 * Spec §5 / §6 / §32: release metadata for a few of the seeded templates, so
 * the details page can be reviewed against real version, licence and changelog
 * data. The rest are submitted without a licence on purpose -- §32 requires an
 * unspecified licence to read as "License not specified." rather than quietly
 * defaulting to a real one.
 *
 * `daysAgo` is converted to a real date below so the changelog has a believable
 * spread instead of every entry stamped with the moment you ran the seed.
 */
const SEED_RELEASES = {
  'Nordic Portfolio': {
    version: '2.1.0',
    license: 'MIT',
    changelog: [
      { version: '2.1.0', notes: ['Added a print stylesheet for the resume view', 'Cut the hero image by about 60%'], daysAgo: 6 },
      { version: '2.0.0', notes: ['Rebuilt the navigation as a sticky rail', 'Switched to system fonts'], daysAgo: 24 },
    ],
  },
  'Aurora Store': {
    version: '1.4.2',
    license: 'Apache 2.0',
    changelog: [
      { version: '1.4.2', notes: ['Fixed the filter drawer on iOS Safari', 'Cart totals now round correctly'], daysAgo: 3 },
    ],
  },
  'Pulse Dashboard': { version: '0.9.0', license: '', changelog: [] },
};

/** Write an SVG thumbnail to disk and return its public URL. */
function writeThumbnail(title, category) {
  const key = `thumbnails/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.svg`;
  const abs = storage.resolveKey(key);
  require('fs').mkdirSync(path.dirname(abs), { recursive: true });
  require('fs').writeFileSync(abs, makeThumbnail(title, category), 'utf8');
  return storage.urlFor(key);
}

/**
 * A real, tiny .zip so the download button returns actual bytes instead of a
 * 404 -- 50 files of generated HTML across the shared categories.
 */
function writeArchive(slug, title) {
  const key = `templates/${Date.now().toString(36)}-${slug}.zip`;
  const abs = storage.resolveKey(key);
  require('fs').mkdirSync(path.dirname(abs), { recursive: true });

  const files = [
    ['README.md', `# ${title}\n\nSeeded sample template for web craft.\n\n## Categories\n${CATEGORIES.map((c) => `- ${c}`).join('\n')}\n`],
    ['index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="style.css"></head><body><main><h1>${title}</h1><p>Sample template seeded by web craft.</p></main></body></html>`],
    ['style.css', `:root{--brand:#4f46e5}*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;color:#0f172a;background:#f8fafc}main{max-width:64rem;margin:0 auto;padding:4rem 1.5rem}h1{font-size:clamp(2rem,6vw,3.5rem);letter-spacing:-.03em;color:var(--brand)}p{font-size:1.125rem;line-height:1.7;color:#334155}`],
    ['package.json', JSON.stringify({ name: slug, version: '1.0.0', private: true, description: title }, null, 2)],
  ];

  for (let i = 1; i <= 46; i++) {
    files.push([`sections/section-${String(i).padStart(2, '0')}.html`, `<section class="block"><h2>Section ${i}</h2><p>Placeholder block for ${title}.</p></section>`]);
  }

  const zip = buildZip(files);
  require('fs').writeFileSync(abs, zip);
  return { key, size: zip.length, filename: `${slug}.zip` };
}

/* ---- minimal store-only ZIP writer (no dependency) ---------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Builds a valid ZIP with STORED (uncompressed) entries. */
function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed
    local.writeUInt32LE(data.length, 22); // uncompressed
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, eocd]);
}

/* ------------------------------------------------------------------ seed */

async function seed() {
  storage.ensureStorage();

  const backend = await connectDB();
  console.log(`🗄  Database backend: ${backend}`);

  // Seeding is destructive by design: it drops every template, download,
  // favourite, report, notification and audit row, then writes well-known
  // accounts. That is right for the local development database -- but
  // connectDB() prefers MONGODB_URI whenever it is reachable, so an accidental
  // `npm run seed` can reach a shared cluster and wipe it in one command.
  if (backend === 'atlas' && process.env.SEED_FORCE !== 'yes') {
    console.error('❌ Refusing to seed a remote database.');
    console.error('   `npm run seed` deletes all templates, downloads, favorites, reports,');
    console.error('   notifications and audit entries, then recreates fixed accounts.');
    console.error('   Use DB_MODE=local for the development database, or set SEED_FORCE=yes');
    console.error('   if you really intend to overwrite the remote one.');
    await disconnectDB();
    process.exit(1);
  }

  // Start from a known state so re-running never doubles the data. Favorites
  // go too: every template below is about to be recreated with a new id, and
  // leaving rows behind would orphan them. Reports, notifications and audit
  // entries all reference the ids being thrown away, so they go with them.
  await Promise.all([
    Template.deleteMany({}),
    Download.deleteMany({}),
    Favorite.deleteMany({}),
    Report.deleteMany({}),
    Notification.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
  await User.deleteMany({
    email: { $in: [SEED_USER.email, SEED_BROWSERS.email, SEED_ADMIN.email] },
  });

  const dev = await User.create(SEED_USER);
  const browser = await User.create(SEED_BROWSERS);
  const admin = await User.create(SEED_ADMIN);
  // Spec §35: credentials are documentation, not log output. They belong in
  // the README, where they can be read on purpose -- not in CI output or a
  // terminal scrollback that gets pasted into an issue.
  console.log(`👤 Developer: ${SEED_USER.email}  (password in README.md, "Seeded logins")`);
  console.log(`👤 User:      ${SEED_BROWSERS.email}  (password in README.md, "Seeded logins")`);
  console.log(`👤 Admin:     ${SEED_ADMIN.email}  (password in README.md, "Seeded logins")`);

  const docs = [];
  for (const [title, category, technologies, description, tags] of SEED_TEMPLATES) {
    const slug = Template.slugify(title);
    const archive = writeArchive(slug, title);
    const release = SEED_RELEASES[title] || { version: '1.0.0', license: '', changelog: [] };
    docs.push({
      title,
      slug,
      description,
      category,
      technologies,
      tags,
      thumbnail: writeThumbnail(title, category),
      screenshots: [],
      previewUrl: 'https://example.com',
      githubUrl: 'https://github.com/rohailasad23/web-craft-',
      version: release.version,
      license: release.license,
      changelog: release.changelog.map((entry) => ({
        version: entry.version,
        notes: entry.notes,
        createdAt: new Date(Date.now() - entry.daysAgo * 864e5),
      })),
      file: { key: archive.key, filename: archive.filename, size: archive.size, contentType: 'application/zip' },
      author: dev._id,
      authorName: dev.name,
      downloadCount: 0,
      // One submission is deliberately left awaiting review so /admin opens
      // onto a real queue rather than a well-designed empty state. Everything
      // else is live, which is also why this one is not in `featured` below.
      status: title === 'Resume One' ? 'pending' : 'approved',
      featured: ['Nordic Portfolio', 'Studio Agency', 'Aurora Store', 'Pulse Dashboard'].includes(title),
      createdAt: new Date(Date.now() - Math.random() * 30 * 864e5),
    });
  }

  const created = await Template.insertMany(docs);
  console.log(`📦 ${created.length} templates across ${CATEGORIES.length} categories`);

  // A couple of downloads so "popular" and the developer stats are not zero.
  const picks = created.slice(0, 5);
  for (const t of picks) {
    await Download.create({ userId: browser._id, templateId: t._id });
    await Template.updateOne({ _id: t._id }, { $inc: { downloadCount: 1 } });
  }
  console.log(`⬇️  ${picks.length} sample downloads recorded`);

  // Spec §7: one open report, so the admin queue is not empty on a fresh
  // install and the whole report lifecycle can be walked through.
  const reported = created.find((t) => t.title === 'Studio Agency');
  if (reported) {
    await Report.create({
      userId: browser._id,
      templateId: reported._id,
      reason: 'Broken demo',
      description:
        'The live preview loads a blank page for me on Chrome -- the hero image never appears.',
    });
    console.log('⚑  1 sample report waiting in the admin queue');
  }

  console.log('\n✅ Seed complete');
  console.log(`   Categories: ${CATEGORIES.join(', ')}`);
  console.log(`   Technologies: ${TECHNOLOGIES.join(', ')}`);
  console.log('   Admin queue: 1 template pending review, 1 report open');
}

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB().finally(() => process.exit(process.exitCode || 0)));
