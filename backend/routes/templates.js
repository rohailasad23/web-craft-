'use strict';

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');

const asyncHandler = require('../middleware/asyncHandler');
const verifyToken = require('../middleware/auth');
const { requireRole, optionalAuth, requireActive } = require('../middleware/auth');
const { handleUpload } = require('../middleware/upload');
const { SORTS, CATEGORIES } = require('../constants/catalog');
const { normalizeUrl } = require('../utils/urls');
const { safeRegex } = require('../utils/safeRegex');
const User = require('../models/User');
const Template = require('../models/Template');
const { LICENSES } = require('../models/Template');
const Download = require('../models/Download');
const Favorite = require('../models/Favorite');
const Report = require('../models/Report');
const { makeThumbnail } = require('../services/placeholders');
const storage = require('../services/storage');

const router = express.Router();

/* ------------------------------------------------------------------ helpers */

const MAX_TECHS = 10;
const MAX_TAGS = 8;

/**
 * Accepts a real array, a JSON array string (`["React","Vue"]`, which is how
 * the upload form posts list fields) or a plain comma list.
 */
function parseList(raw) {
  if (Array.isArray(raw)) return raw;
  const s = String(raw || '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to comma splitting */
    }
  }
  return s.split(',');
}

function cleanTechnologies(raw) {
  return [...new Set(parseList(raw).map((t) => String(t).trim()).filter(Boolean))]
    .slice(0, MAX_TECHS)
    .map((t) => t.slice(0, 30));
}

/**
 * Spec §2: free-form keyword tags. Lowercased and de-duped so "Minimal" and
 * "minimal" never become two filter options, and capped so the chip list on
 * the details page cannot grow without bound.
 */
function cleanTags(raw) {
  return [...new Set(parseList(raw).map((t) => String(t).trim().toLowerCase()).filter(Boolean))]
    .slice(0, MAX_TAGS)
    .map((t) => t.slice(0, 30));
}

/**
 * Which of `ids` the current user has saved -- one query for a whole page
 * instead of one per card. Anonymous callers get an empty set.
 */
async function favoritedSet(userId, ids) {
  if (!userId || !ids.length) return new Set();
  const rows = await Favorite.find({ userId, templateId: { $in: ids } })
    .select('templateId')
    .lean();
  return new Set(rows.map((r) => String(r.templateId)));
}

/**
 * A free slug for `title`, without asking the database once per candidate.
 *
 * The base name, then `-2`, `-3`, … are all tested in a single query over the
 * slug range, which is what the unique index already guards anyway -- the loop
 * used to be one round trip per suffix, so a contested title cost up to 61.
 */
async function uniqueSlug(title) {
  const base = Template.slugify(title) || 'template';
  const range = new RegExp(`^${safeRegex(base).source}(?:-\\d+)?$`, 'i');
  const rows = await Template.find({ slug: range }).select('slug').lean();
  const taken = new Set(rows.map((r) => r.slug));

  if (!taken.has(base)) return base;
  for (let i = 2; i <= 60; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Write an SVG placeholder to disk and return its public URL.
 *
 * Async because it runs inside the upload handler: a synchronous write on the
 * request path parks the whole event loop behind a disk flush.
 */
async function generateThumbnail(title, category) {
  const key = `thumbnails/${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.svg`;
  await fs.promises.mkdir(path.dirname(storage.resolveKey(key)), { recursive: true });
  await fs.promises.writeFile(storage.resolveKey(key), makeThumbnail(title, category), 'utf8');
  return storage.urlFor(key);
}

/**
 * Turn multer's `req.files` into the fields we persist.
 * Returns `{ file, thumbnail, screenshots }`; each is `undefined` when the
 * caller did not upload that field (so an edit does not wipe existing data).
 */
function collectUploads(req) {
  const out = {};
  const keyOf = (file) => path.relative(storage.UPLOAD_ROOT, file.path).split(path.sep).join('/');

  const archive = req.files?.file?.[0];
  const thumb = req.files?.thumbnail?.[0];
  const shots = req.files?.screenshots || [];

  if (archive) {
    out.file = {
      key: keyOf(archive),
      filename: String(archive.originalname || 'template.zip').slice(0, 120),
      size: archive.size,
      contentType: 'application/zip',
    };
  }
  if (thumb) out.thumbnail = storage.urlFor(keyOf(thumb));
  if (shots.length) out.screenshots = shots.map((s) => storage.urlFor(keyOf(s)));
  return out;
}

/** Extract the storage key from a public URL we generated ("/uploads/x/y"). */
function keyFromUrl(url) {
  const m = /^\/uploads\/(.+)$/.exec(String(url || ''));
  return m ? m[1] : null;
}

function deleteUrls(urls) {
  for (const u of urls || []) {
    const key = keyFromUrl(u);
    if (key) storage.remove(key);
  }
}

function contentDisposition(filename) {
  const ascii = String(filename).replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Is the caller allowed to see/manage this template? */
function canManage(template, user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  // `author` is populated on the details route, so it is a User document there
  // and a bare ObjectId everywhere else -- read _id first, and String() a
  // populated document directly gives "[object Object]".
  const authorId = template.author?._id ?? template.author;
  return !!authorId && String(authorId) === String(user.id);
}

/* ------------------------------------------------------------------- routes */

/**
 * GET /api/templates
 *   q=        free text (title, description, category, technology, tag, developer)
 *   filter=   one entry of the flat chip list, or "All"
 *   sort=     newest | popular | downloads | updated | az
 *   page, limit
 *
 * `optionalAuth` exists only so the answer can say whether the signed-in
 * visitor has already saved each row; anonymous traffic is untouched.
 */
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const q = String(req.query.q || '').trim();
    const filter = String(req.query.filter || '').trim();
    const sort = SORTS.includes(req.query.sort) ? req.query.sort : 'newest';
    const featured = req.query.featured === 'true';

    const query = { status: 'approved' };
    const and = [];

    if (q) {
      const rx = safeRegex(q);
      and.push({
        $or: [
          { title: rx },
          { description: rx },
          { technologies: rx },
          { tags: rx },
          { category: rx },
          { authorName: rx },
        ],
      });
    }
    // One chip can name a category, a technology or a tag (spec §2), so it
    // matches whichever field applies -- see constants/catalog.js.
    if (filter && filter !== 'All') {
      and.push({
        $or: [{ category: filter }, { technologies: filter }, { tags: filter.toLowerCase() }],
      });
    }
    if (and.length) query.$and = and;
    if (featured) query.featured = true;

    const sortSpec = {
      newest: { createdAt: -1 },
      // Spec §3 wants "Most Popular" and "Most Downloaded" as two different
      // answers: popular ranks what people saved first, downloads ranks raw
      // transfer count. They used to share one sortSpec, which made the two
      // menu entries do the same thing.
      popular: { favoriteCount: -1, downloadCount: -1, createdAt: -1 },
      downloads: { downloadCount: -1, createdAt: -1 },
      updated: { updatedAt: -1, createdAt: -1 },
      az: { title: 1 },
    }[sort];

    const templates = await Template.find(query)
      .sort(sortSpec)
      .skip((page - 1) * limit)
      .limit(limit);

    const [total, saved] = await Promise.all([
      Template.countDocuments(query),
      favoritedSet(req.user?.id, templates.map((t) => t._id)),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      success: true,
      // Spec §4 names the pagination fields explicitly; they are the only
      // ones we return so there is a single envelope to keep in step.
      templates: templates.map((t) => ({
        ...t.toObject(),
        favorited: saved.has(String(t._id)),
      })),
      currentPage: page,
      totalPages,
      totalTemplates: total,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    });
  })
);

/**
 * GET /api/templates/mine -- the developer's own submissions, any status.
 * Registered before /:slug so the literal "mine" is never treated as a slug.
 */
router.get(
  '/mine',
  verifyToken,
  requireRole('developer', 'admin'),
  asyncHandler(async (req, res) => {
    // Capped at 200 like the moderation list above. This is the developer's
    // own management screen, so it is sorted oldest-to-newest for editing --
    // but it was the one Template query in the app with no bound at all.
    const templates = await Template.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ success: true, templates });
  })
);

/**
 * GET /api/templates/mine/stats -- spec §13: the developer dashboard's numbers.
 *
 * Deliberately built from the developer's OWN templates rather than an
 * aggregation over the whole collection: it keeps every figure explainable
 * ("these are your templates, added up"), needs no extra index, and §13 says
 * in as many words not to build complicated analytics yet.
 *
 * Sums are done in JavaScript because the list is small and bounded -- one
 * developer's submissions -- and it avoids mongoose's aggregate needing an
 * explicitly cast ObjectId for every run.
 */
router.get(
  '/mine/stats',
  verifyToken,
  requireRole('developer', 'admin'),
  asyncHandler(async (req, res) => {
    const own = await Template.find({ author: req.user.id })
      .select(
        'title slug downloadCount favoriteCount status thumbnail category createdAt updatedAt'
      )
      .sort({ downloadCount: -1, createdAt: -1 })
      .lean();

    const sum = (key) => own.reduce((n, t) => n + (t[key] || 0), 0);
    const count = (status) => own.filter((t) => t.status === status).length;

    const totals = {
      templates: own.length,
      downloads: sum('downloadCount'),
      favorites: sum('favoriteCount'),
      approved: count('approved'),
      pending: count('pending'),
      rejected: count('rejected'),
    };

    // "Most downloaded" is only meaningful once something HAS been downloaded;
    // reporting a zero-download template as a winner would be a made-up
    // statistic (§14: do not add fake statistics).
    const mostDownloaded = own.find((t) => (t.downloadCount || 0) > 0) || null;

    const ids = own.map((t) => t._id);
    const rows = ids.length
      ? await Download.find({ templateId: { $in: ids } })
          .sort({ downloadedAt: -1 })
          .limit(10)
          .populate({ path: 'templateId', select: 'title slug' })
          .lean()
      : [];

    res.json({
      success: true,
      totals,
      // A compact bar chart does not need the whole document.
      perTemplate: own.map((t) => ({
        id: t._id,
        title: t.title,
        slug: t.slug,
        status: t.status,
        category: t.category,
        downloadCount: t.downloadCount || 0,
        favoriteCount: t.favoriteCount || 0,
        // Included so the dashboard can serve every section it needs from
        // this one request instead of also calling /mine (§36).
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      mostDownloaded,
      // Template title + when, no downloader identity: the developer needs to
      // know their work is being used, not who is using it.
      recentDownloads: rows
        .filter((r) => r.templateId)
        .map((r) => ({
          template: { title: r.templateId.title, slug: r.templateId.slug },
          downloadedAt: r.downloadedAt,
        })),
    });
  })
);

/**
 * POST /api/templates -- developers submit a template (multipart or JSON).
 * Storage-first: only the file *reference* is written to MongoDB.
 */
router.post(
  '/',
  verifyToken,
  requireRole('developer', 'admin'),
  handleUpload,
  asyncHandler(async (req, res) => {
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const category = String(req.body.category || '').trim();
    const technologies = cleanTechnologies(req.body.technologies);
    const tags = cleanTags(req.body.tags);

    if (!title || title.length > 120) {
      return res.status(400).json({ error: 'Please provide a template title' });
    }
    if (!description || description.length < 10) {
      return res.status(400).json({
        error: 'Please write a description of at least 10 characters',
      });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Please choose a valid category' });
    }
    if (!technologies.length) {
      return res.status(400).json({ error: 'Add at least one technology' });
    }

    const previewUrl = normalizeUrl(req.body.previewUrl);
    const githubUrl = normalizeUrl(req.body.githubUrl);
    if (previewUrl === null) return res.status(400).json({ error: 'Demo URL must be a valid http(s) URL' });
    if (githubUrl === null) return res.status(400).json({ error: 'GitHub URL must be a valid http(s) URL' });

    // Spec §5 / §32: both optional. Omitting them leaves the schema defaults
    // ("1.0.0" and, importantly, NO licence) rather than inventing either.
    const version = String(req.body.version || '').trim().slice(0, 20) || '1.0.0';
    if (!/^\d[\dA-Za-z.\-+]{0,19}$/.test(version)) {
      return res.status(400).json({ error: 'Version should look like 1.0.0' });
    }
    const license = String(req.body.license || '').trim();
    if (!LICENSES.includes(license)) {
      return res.status(400).json({ error: 'Please choose a valid license' });
    }

    const uploads = collectUploads(req);
    if (!uploads.file) {
      return res.status(400).json({ error: 'Please upload the template .zip file' });
    }

    const author = await User.findById(req.user.id);
    if (!author) return res.status(401).json({ error: 'Account no longer exists' });

    const thumbnail = uploads.thumbnail || (await generateThumbnail(title, category));

    const template = await Template.create({
      title,
      slug: await uniqueSlug(title),
      description,
      category,
      technologies,
      tags,
      thumbnail,
      screenshots: uploads.screenshots || [],
      previewUrl: previewUrl || '',
      githubUrl: githubUrl || '',
      version,
      license,
      file: uploads.file,
      author: author._id,
      authorName: author.name,
      // Spec §3: auto-approve for now, but `status` + the admin endpoint are
      // already in place so moderation can be switched on later.
      status: 'approved',
    });

    res.status(201).json({ success: true, message: 'Template published', template });
  })
);

/**
 * GET /api/templates/:slug -- public details page.
 * optionalAuth adds `canEdit` for the owner/admin without requiring a login
 * for everyone else.
 */
router.get(
  '/:slug',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const template = await Template.findOne({ slug: req.params.slug }).populate(
      'author',
      'name avatar bio role createdAt'
    );
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const visible =
      template.status === 'approved' ||
      canManage(template, req.user) ||
      req.user?.role === 'admin';
    if (!visible) return res.status(404).json({ error: 'Template not found' });

    const saved = await favoritedSet(req.user?.id, [template._id]);

    res.json({
      success: true,
      template: { ...template.toObject(), favorited: saved.has(String(template._id)) },
      canEdit: canManage(template, req.user) || req.user?.role === 'admin',
    });
  })
);

/**
 * PUT /api/templates/:id -- edit metadata and/or replace files.
 * Accepts JSON (metadata only) or multipart (metadata + new files); multer
 * skips non-multipart bodies untouched, so both paths work through one route.
 */
router.put(
  '/:id',
  verifyToken,
  requireRole('developer', 'admin'),
  handleUpload,
  asyncHandler(async (req, res) => {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    if (!canManage(template, req.user) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own templates' });
    }

    const updates = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ error: 'Title cannot be empty' });
      updates.title = title.slice(0, 120);
    }
    if (req.body.description !== undefined) {
      const d = String(req.body.description).trim();
      if (d.length < 10) {
        return res.status(400).json({ error: 'Description must be at least 10 characters' });
      }
      updates.description = d.slice(0, 4000);
    }
    if (req.body.category !== undefined) {
      if (!CATEGORIES.includes(req.body.category)) {
        return res.status(400).json({ error: 'Please choose a valid category' });
      }
      updates.category = req.body.category;
    }
    if (req.body.technologies !== undefined) {
      const techs = cleanTechnologies(req.body.technologies);
      if (!techs.length) return res.status(400).json({ error: 'Add at least one technology' });
      updates.technologies = techs;
    }
    // Tags are optional (spec §2), so an empty list is a legitimate update --
    // the developer is clearing them, not forgetting them.
    if (req.body.tags !== undefined) {
      updates.tags = cleanTags(req.body.tags);
    }
    if (req.body.previewUrl !== undefined) {
      const u = normalizeUrl(req.body.previewUrl);
      if (u === null) return res.status(400).json({ error: 'Demo URL must be a valid http(s) URL' });
      updates.previewUrl = u;
    }
    if (req.body.githubUrl !== undefined) {
      const u = normalizeUrl(req.body.githubUrl);
      if (u === null) return res.status(400).json({ error: 'GitHub URL must be a valid http(s) URL' });
      updates.githubUrl = u;
    }

    // Spec §5: the developer's own version string for this release. Author-supplied
    // and free-form within reason -- there is nothing to diff or merge, so a
    // loose "looks like a version" check is the right level of strictness.
    if (req.body.version !== undefined) {
      const v = String(req.body.version).trim().slice(0, 20);
      if (!/^\d[\dA-Za-z.\-+]{0,19}$/.test(v)) {
        return res.status(400).json({ error: 'Version should look like 1.0.0' });
      }
      updates.version = v;
    }
    // Spec §32: '' means "not specified" and is the only way to clear it.
    if (req.body.license !== undefined) {
      const lic = String(req.body.license).trim();
      if (!LICENSES.includes(lic)) {
        return res.status(400).json({ error: 'Please choose a valid license' });
      }
      updates.license = lic;
    }

    const uploads = collectUploads(req);
    const stale = [];

    if (uploads.file) {
      if (template.file?.key) stale.push(storage.urlFor(template.file.key));
      updates.file = uploads.file;
    }
    if (uploads.thumbnail) {
      if (template.thumbnail) stale.push(template.thumbnail);
      updates.thumbnail = uploads.thumbnail;
    }
    if (uploads.screenshots) {
      stale.push(...template.screenshots);
      updates.screenshots = uploads.screenshots;
    }

    Object.assign(template, updates);

    // Spec §6: an OPTIONAL note about what changed. Written only when the
    // developer actually typed something, because an empty changelog entry is
    // noise on the details page. Bullets are stripped so "• Faster" and
    // "- Faster" and a bare "Faster" all read the same once rendered.
    const notes = String(req.body.changelogNotes || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 12);
    if (notes.length) {
      // Newest first, capped so a template updated 400 times cannot hand the
      // details page an unbounded list.
      template.changelog.unshift({ version: updates.version || template.version, notes });
      if (template.changelog.length > 20) template.changelog = template.changelog.slice(0, 20);
    }

    await template.save();

    // Only unlink old files once the new document is safely persisted.
    deleteUrls(stale);

    res.json({ success: true, message: 'Template updated', template });
  })
);

/**
 * DELETE /api/templates/:id -- owner or admin.
 * Removes the stored archive, images and every download or save row.
 */
router.delete(
  '/:id',
  verifyToken,
  requireRole('developer', 'admin'),
  asyncHandler(async (req, res) => {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    if (!canManage(template, req.user) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own templates' });
    }

    await Promise.all([
      Template.deleteOne({ _id: template._id }),
      Download.deleteMany({ templateId: template._id }),
      Favorite.deleteMany({ templateId: template._id }),
      // Reports are about this template and nothing else; leaving them would
      // hand the moderation queue a row whose subject no longer exists.
      Report.deleteMany({ templateId: template._id }),
    ]);

    deleteUrls([
      template.thumbnail,
      ...(template.screenshots || []),
      template.file?.key ? storage.urlFor(template.file.key) : null,
    ].filter(Boolean));

    res.json({ success: true, message: 'Template deleted' });
  })
);

/**
 * POST /api/templates/:id/favorite -- spec §1: save a template for later.
 *
 * Idempotent by design. The (userId, templateId) unique index means a
 * double-tap on the heart writes one row, not two, and the reply carries the
 * user's new total so the UI never has to refetch the whole list.
 */
router.post(
  '/:id/favorite',
  (req, res, next) => {
    // Distinct, human message for the common case (spec §19).
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Please log in to save this template.' });
    }
    next();
  },
  verifyToken,
  requireActive,
  asyncHandler(async (req, res) => {
    const template = await Template.findById(req.params.id).select('_id status author');
    if (!template || (!canManage(template, req.user) && template.status !== 'approved')) {
      return res.status(404).json({ error: 'Template not found' });
    }

    let justSaved = false;
    try {
      await Favorite.create({ userId: req.user.id, templateId: template._id });
      justSaved = true;
    } catch (err) {
      if (err?.code !== 11000) throw err; // 11000 = already saved, not an error
    }

    // Only touch the denormalised counter when we were the ones who inserted
    // the row, exactly like downloadCount -- a double-tap cannot inflate it.
    if (justSaved) {
      await Template.updateOne({ _id: template._id }, { $inc: { favoriteCount: 1 } });
    }

    res.json({
      success: true,
      message: 'Saved to your favourites',
      favorited: true,
      favorites: await Favorite.countDocuments({ userId: req.user.id }),
    });
  })
);

/**
 * DELETE /api/templates/:id/favorite -- spec §1: drop it from saved.
 * Unsaving something that was never saved is not an error either; the state
 * afterwards is the one that matters.
 */
router.delete(
  '/:id/favorite',
  (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Please log in to manage your saved templates.' });
    }
    next();
  },
  verifyToken,
  requireActive,
  asyncHandler(async (req, res) => {
    const template = await Template.findById(req.params.id).select('_id');
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const { deletedCount } = await Favorite.deleteOne({
      userId: req.user.id,
      templateId: template._id,
    });
    // Decrement only if a row actually went away, so a repeat delete cannot
    // drive the counter negative.
    if (deletedCount) {
      await Template.updateOne({ _id: template._id }, { $inc: { favoriteCount: -1 } });
    }

    res.json({
      success: true,
      message: 'Removed from your favourites',
      favorited: false,
      favorites: await Favorite.countDocuments({ userId: req.user.id }),
    });
  })
);

/**
 * POST /api/templates/:id/report -- spec §7.
 *
 * Logged-in users only. Two layers of protection, because a checkbox is not
 * protection:
 *   1. the partial unique index on Report refuses a second OPEN report from
 *      the same person about the same template (409, not a silent drop, so
 *      the UI can say "you already told us"), and
 *   2. the global /api rate limiter covers the rest.
 */
router.post(
  '/:id/report',
  (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Please log in to report this template.' });
    }
    next();
  },
  verifyToken,
  requireActive,
  asyncHandler(async (req, res) => {
    const template = await Template.findById(req.params.id).select('_id status author');
    if (!template || (!canManage(template, req.user) && template.status !== 'approved')) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const reason = String(req.body.reason || '').trim();
    if (!Report.REASONS.includes(reason)) {
      return res.status(400).json({ error: 'Please choose a reason for your report' });
    }

    // "Other" with no explanation sends a moderator nowhere; everything else
    // is self-describing and needs no typing.
    const description = String(req.body.description || '').trim().slice(0, 1000);
    if (reason === 'Other' && description.length < 5) {
      return res.status(400).json({ error: 'Please describe the problem so we can look into it' });
    }

    try {
      const report = await Report.create({
        userId: req.user.id,
        templateId: template._id,
        reason,
        description,
      });

      return res.status(201).json({
        success: true,
        message: 'Thanks -- your report has been sent for review.',
        report: { id: report._id, status: report.status },
      });
    } catch (err) {
      if (err?.code === 11000) {
        return res
          .status(409)
          .json({ error: 'You already have an open report for this template.' });
      }
      throw err;
    }
  })
);

/**
 * POST /api/templates/:slug/download -- spec §9:
 * verify login -> record the download -> increment -> start the file download.
 *
 * The (userId, templateId) unique index makes double-clicks harmless: we only
 * $inc when we were the ones who inserted the row.
 */
router.post(
  '/:slug/download',
  (req, res, next) => {
    // Distinct, human message for the most common failure (spec §19).
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Please log in to download this template.' });
    }
    next();
  },
  verifyToken,
  requireActive,
  asyncHandler(async (req, res) => {
    const template = await Template.findOne({ slug: req.params.slug });
    if (!template || (!canManage(template, req.user) && template.status !== 'approved')) {
      return res.status(404).json({ error: 'Template not found' });
    }
    if (!template.file?.key) {
      return res.status(404).json({ error: 'No file is attached to this template' });
    }

    let isNewDownload = false;
    try {
      await Download.create({ userId: req.user.id, templateId: template._id });
      isNewDownload = true;
    } catch (err) {
      if (err?.code !== 11000) throw err; // 11000 = already downloaded, not an error
    }

    if (isNewDownload) {
      await Template.updateOne({ _id: template._id }, { $inc: { downloadCount: 1 } });
    }

    const abs = storage.resolveKey(template.file.key);
    // Checked without blocking: existsSync() parks the event loop behind a
    // stat on every single download.
    const present = await fs.promises
      .access(abs)
      .then(() => true)
      .catch(() => false);
    if (!present) {
      return res.status(404).json({ error: 'The file is no longer available' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', contentDisposition(template.file.filename || `${template.slug}.zip`));
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(abs);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500);
      res.end();
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  })
);

module.exports = router;
