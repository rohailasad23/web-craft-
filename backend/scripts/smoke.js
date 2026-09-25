'use strict';

/**
 * End-to-end smoke test: `npm run smoke` (root: `npm run smoke`).
 *
 * Boots a throwaway API instance on its own port, with its own MongoDB, then
 * walks the whole product surface spec §24 / §26 asks to verify:
 *
 *   registration, login, logout, session, protected routes, CRUD, template
 *   create/list/details/edit/delete, search + filters, download tracking,
 *   developer dashboard data, and role protection.
 *
 * It seeds its OWN fixtures, so it does not depend on `npm run seed` and is
 * safe to run whether or not a dev server is already up. The instance is
 * killed on exit, whatever happens.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const PORT = process.env.SMOKE_PORT || 8099;
const API = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const STAMP = Date.now().toString(36);

let child = null;
let shuttingDown = false;
let passed = 0;
let failed = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? `  -- ${detail}` : ''}`);
  }
  return ok;
}

function section(title) {
  console.log(`\n${title}`);
}

/** 1x1 transparent PNG -- enough for the image validator. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** A couple of bytes with a .zip name; the API stores what it is given. */
const ZIP = Buffer.from('PK\x03\x04smoke-test-archive');

async function req(method, url, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers['content-type'] = 'application/json';

  const res = await fetch(API + url, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  if (raw) return { res, buffer: Buffer.from(await res.arrayBuffer()) };

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _nonJson: text.slice(0, 80) };
  }
  return { res, data };
}

async function waitHealthy(timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'not started';
  while (Date.now() < deadline) {
    try {
      const { res, data } = await req('GET', '/health');
      if (res.ok && data.db === 'connected') return data;
      last = `http=${res.status} db=${data.db || '?'}`;
    } catch (e) {
      last = e.cause?.code || e.message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API never became healthy (${last})`);
}

/**
 * Reset the throwaway data directory before booting.
 *
 * `.data/mongo-smoke` is only ever written by this script, and the instance it
 * feeds is killed on exit -- but a run that is hard-killed (Ctrl+C during the
 * download, an OOM, a lost shell) still leaves its fixtures behind, and the
 * next run would then fail on "listing is empty again" for a reason that has
 * nothing to do with the code under test. Wiping on start makes every run
 * start from the same state.
 */
function resetSmokeDb() {
  try {
    fs.rmSync(path.join(ROOT, '.data', 'mongo-smoke'), { recursive: true, force: true });
  } catch (e) {
    // A mongod left over from a crashed run can hold the directory open on
    // Windows. Warn and continue rather than blocking the test entirely.
    console.warn(`⚠️  Could not reset the smoke database (${e.code || e.message})`);
  }
}

/**
 * Promote a fixture to admin directly in the database.
 *
 * Deliberately not an HTTP path: the WHOLE POINT of spec §22 is that no
 * request can grant admin, so the test has to step around its own API for
 * this single step. Same URI the child server builds in services/database.js.
 */
async function promoteToAdmin(email) {
  const port = process.env.SMOKE_DB_PORT || '27018';
  const uri = `mongodb://127.0.0.1:${port}/web-craft-smoke`;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    const r = await mongoose.connection
      .collection('users')
      .updateOne({ email }, { $set: { role: 'admin' } });
    return r.modifiedCount === 1;
  } finally {
    await mongoose.disconnect();
  }
}

function startServer() {
  console.log(`⏳ Starting API on :${PORT} (isolated database)…`);
  resetSmokeDb();
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      // Its own mongod on its own port with its own data directory, so the
      // test runs beside a dev server and never sees seeded documents.
      DB_MODE: 'local',
      LOCAL_DB_PORT: process.env.SMOKE_DB_PORT || '27018',
      LOCAL_DB_PATH: path.join(ROOT, '.data', 'mongo-smoke'),
      LOCAL_DB_NAME: 'web-craft-smoke',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const log = (chunk) => {
    const line = String(chunk).trimEnd();
    if (line) process.stdout.write(`   server | ${line}\n`);
  };
  child.stdout.on('data', log);
  child.stderr.on('data', log);
  child.on('exit', (code) => {
    if (code && code !== 0 && !shuttingDown) {
      console.error(`❌ Server exited early with code ${code}`);
    }
  });
}

function stopServer() {
  shuttingDown = true;
  if (child && !child.killed) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

async function run() {
  startServer();
  await waitHealthy();
  console.log('✅ API healthy');

  const devEmail = `smoke-dev-${STAMP}@example.com`;
  const otherEmail = `smoke-other-${STAMP}@example.com`;
  const userEmail = `smoke-user-${STAMP}@example.com`;
  let devToken;
  let otherToken;
  let userToken;
  let devUser;
  let otherUser;
  let templateA;
  let templateB;

  /* ------------------------------------------------------------- taxonomy */
  section('Meta');
  {
    const { res, data } = await req('GET', '/api/meta');
    check('GET /api/meta -> 200', res.ok);
    check('filters include "All"', Array.isArray(data.filters) && data.filters.includes('All'));
    check(
      'filters include every required chip',
      ['HTML/CSS', 'JavaScript', 'React', 'Next.js', 'Vue', 'Node.js', 'Portfolio', 'E-commerce', 'Landing Page', 'Dashboard', 'Blog']
        .every((f) => data.filters.includes(f)),
      JSON.stringify(data.filters)
    );
  }

  /* ----------------------------------------------------------------- auth */
  section('Authentication');
  {
    const { res, data } = await req('POST', '/api/auth/register', {
      // The STAMP keeps names unique across runs -- the smoke database is
      // persistent, so a bare "Smoke Developer" would also match the accounts
      // left behind by every previous run and make counts ambiguous.
      body: { name: `Smoke Developer ${STAMP}`, email: devEmail, password: 'secret123', confirmPassword: 'secret123', role: 'developer' },
    });
    check('register developer -> 201', res.status === 201, JSON.stringify(data).slice(0, 120));
    check('role is developer', data.user?.role === 'developer', `got ${data.user?.role}`);
    devToken = data.token;
    devUser = data.user;
  }
  {
    const { res, data } = await req('POST', '/api/auth/register', {
      body: { name: `Other Developer ${STAMP}`, email: otherEmail, password: 'secret123', role: 'developer' },
    });
    check('second developer -> 201', res.status === 201);
    otherToken = data.token;
    otherUser = data.user;
  }
  {
    const { res, data } = await req('POST', '/api/auth/register', {
      body: { name: 'Smoke User', email: userEmail, password: 'secret123', role: 'user' },
    });
    check('register normal user -> 201', res.status === 201);
    check('default role is user', data.user?.role === 'user', `got ${data.user?.role}`);
    userToken = data.token;
  }
  {
    const { data } = await req('POST', '/api/auth/register', {
      body: {
        name: 'Sneaky',
        email: `smoke-elev-${STAMP}@example.com`,
        password: 'secret123',
        role: 'admin',
      },
    });
    check('self-assigned role "admin" is coerced to user', data.user?.role === 'user', `got ${data.user?.role}`);
  }
  {
    const { res, data } = await req('POST', '/api/auth/login', { body: { email: devEmail, password: 'secret123' } });
    check('login -> 200 + token', res.ok && !!data.token);

    const me = await req('GET', '/api/auth/me', { token: devToken });
    check('GET /api/auth/me returns the session', me.res.ok && me.data.user?.email === devEmail);
    check(
      'session payload carries id, name, email, role',
      ['id', 'name', 'email', 'role'].every((k) => k in (me.data.user || {}))
    );

    const out = await req('POST', '/api/auth/logout', { token: devToken });
    check('POST /api/auth/logout -> 200', out.res.ok);

    const bad = await req('POST', '/api/auth/login', { body: { email: devEmail, password: 'wrong' } });
    check(
      'wrong password -> 401 with a friendly message',
      bad.res.status === 401 && /invalid email or password/i.test(bad.data.error || ''),
      JSON.stringify(bad.data)
    );

    const dupe = await req('POST', '/api/auth/register', {
      body: { name: 'Dup', email: devEmail.toUpperCase(), password: 'secret123' },
    });
    check('duplicate email -> 409 (case-insensitive)', dupe.res.status === 409, `got ${dupe.res.status}`);
  }

  /* ----------------------------------------------------- protected routes */
  section('Protected routes + role protection');
  {
    const anon = await req('GET', '/api/auth/me');
    check('anonymous GET /api/auth/me -> 401', anon.res.status === 401);

    const noToken = await req('POST', '/api/templates', { body: { title: 'x' } });
    check('anonymous POST /api/templates -> 401', noToken.res.status === 401);

    const user = await req('POST', '/api/templates', {
      token: userToken,
      body: { title: 'Normal user attempt', description: 'Trying to upload without the developer role.' },
    });
    check('normal user POST /api/templates -> 403', user.res.status === 403, `got ${user.res.status}`);
    check('403 message is understandable', /permission/i.test(user.data.error || ''));

    const mine = await req('GET', '/api/templates/mine', { token: userToken });
    check('normal user GET /api/templates/mine -> 403', mine.res.status === 403);

    const admin = await req('GET', '/api/admin/stats', { token: userToken });
    check('normal user GET /api/admin/stats -> 403', admin.res.status === 403);

    // Spec §26: a developer is powerful, but still not an admin.
    const devAdmin = await req('GET', '/api/admin/stats', { token: devToken });
    check('developer GET /api/admin/stats -> 403', devAdmin.res.status === 403);

    const anonMine = await req('GET', '/api/templates/mine');
    check('anonymous GET /api/templates/mine -> 401', anonMine.res.status === 401);

    const settings = await req('PUT', '/api/users/me', { body: { bio: 'x' } });
    check('anonymous PUT /api/users/me -> 401', settings.res.status === 401);
  }

  /* ------------------------------------------------------------ create */
  section('Template upload (developer)');
  {
    const form = new FormData();
    form.set('title', `Smoke Alpha ${STAMP}`);
    form.set('description', 'A portfolio template created by the smoke test to prove the full upload path works.');
    form.set('category', 'Portfolio');
    form.set('technologies', JSON.stringify(['React', 'Tailwind CSS']));
    // Spec §2: free-form tags, lowercased and de-duped by the API.
    form.set('tags', 'One-Page, Minimal, one-page');
    form.set('previewUrl', 'https://example.com/demo');
    form.set('githubUrl', 'https://github.com/example/smoke');
    form.set('file', new Blob([ZIP], { type: 'application/zip' }), 'smoke.zip');
    form.set('thumbnail', new Blob([PNG], { type: 'image/png' }), 'thumb.png');
    // append, NOT set: FormData.set() *replaces* any existing entry with the
    // same name, so a second set() would silently upload just one screenshot.
    form.append('screenshots', new Blob([PNG], { type: 'image/png' }), 'shot-1.png');
    form.append('screenshots', new Blob([PNG], { type: 'image/png' }), 'shot-2.png');

    const { res, data } = await req('POST', '/api/templates', { token: devToken, body: form });
    if (check('POST /api/templates -> 201', res.status === 201, JSON.stringify(data).slice(0, 200))) {
      templateA = data.template;
      check('slug was generated', !!templateA.slug && templateA.slug !== templateA.title);
      check('authorName denormalised onto the document', templateA.authorName === `Smoke Developer ${STAMP}`);
      check('thumbnail stored as a URL reference, not bytes', String(templateA.thumbnail || '').startsWith('/uploads/thumbnails/'));
      check('screenshots saved', (templateA.screenshots || []).length === 2);
      check('archive stored as a key reference', typeof templateA.file?.key === 'string');
      check('technologies kept as given (free-form allowed)', templateA.technologies.includes('Tailwind CSS'));
      check(
        'tags are lowercased and de-duped (§2)',
        JSON.stringify(templateA.tags) === JSON.stringify(['one-page', 'minimal']),
        JSON.stringify(templateA.tags)
      );
      check('status auto-approved for V1', templateA.status === 'approved');
      check('downloadCount starts at zero', templateA.downloadCount === 0);
    }
  }

  {
    // Second template, owned by a DIFFERENT developer -- used below to prove
    // that ownership, not just the role, is enforced.
    const form = new FormData();
    form.set('title', `Smoke Beta ${STAMP}`);
    form.set('description', 'A blog template owned by another developer so ownership checks have a target.');
    form.set('category', 'Blog');
    form.set('technologies', 'Next.js');
    form.set('file', new Blob([ZIP], { type: 'application/zip' }), 'beta.zip');
    const { res, data } = await req('POST', '/api/templates', { token: otherToken, body: form });
    if (check('second developer uploads -> 201', res.status === 201, JSON.stringify(data).slice(0, 160))) {
      templateB = data.template;
      check('upload without a thumbnail falls back to a generated one', String(templateB.thumbnail || '').startsWith('/uploads/'));
    }
  }

  section('Upload validation');
  {
    const badCat = new FormData();
    badCat.set('title', 'Bad category');
    badCat.set('description', 'This has a category that is not on the list at all.');
    badCat.set('category', 'Cryptocurrency');
    badCat.set('technologies', 'React');
    const { res, data } = await req('POST', '/api/templates', { token: devToken, body: badCat });
    check('invalid category -> 400 with a useful message', res.status === 400 && /category/i.test(data.error || ''), `got ${res.status} ${data.error}`);

    const noFile = new FormData();
    noFile.set('title', 'No archive');
    noFile.set('description', 'Missing the required zip upload for this template.');
    noFile.set('category', 'Blog');
    noFile.set('technologies', 'React');
    const r2 = await req('POST', '/api/templates', { token: devToken, body: noFile });
    check('missing .zip -> 400', r2.res.status === 400, `got ${r2.res.status}`);

    const noTech = new FormData();
    noTech.set('title', 'No technologies');
    noTech.set('description', 'A template that forgot to declare what it is built with.');
    noTech.set('category', 'Blog');
    noTech.set('file', new Blob([ZIP], { type: 'application/zip' }), 'x.zip');
    const r3 = await req('POST', '/api/templates', { token: devToken, body: noTech });
    check('missing technologies -> 400', r3.res.status === 400);

    const wrongType = new FormData();
    wrongType.set('title', 'Bad file type');
    wrongType.set('description', 'Uploading something that is not a zip archive at all.');
    wrongType.set('category', 'Blog');
    wrongType.set('technologies', 'React');
    wrongType.set('file', new Blob([PNG], { type: 'image/png' }), 'not-a-zip.png');
    const r4 = await req('POST', '/api/templates', { token: devToken, body: wrongType });
    check('non-zip archive -> 400', r4.res.status === 400 && /zip/i.test(r4.data.error || ''), JSON.stringify(r4.data));

    const badUrl = new FormData();
    badUrl.set('title', 'Bad URL');
    badUrl.set('description', 'A preview URL using a scheme we must never open.');
    badUrl.set('category', 'Blog');
    badUrl.set('technologies', 'React');
    badUrl.set('previewUrl', 'javascript:alert(1)');
    badUrl.set('file', new Blob([ZIP], { type: 'application/zip' }), 'x.zip');
    const r5 = await req('POST', '/api/templates', { token: devToken, body: badUrl });
    check('javascript: preview URL rejected -> 400', r5.res.status === 400, `got ${r5.res.status}`);
  }

  /* ---------------------------------------------------- listing + search */
  section('Template listing + search');
  {
    const { res, data } = await req('GET', '/api/templates');
    check('GET /api/templates -> 200', res.ok);
    check(
      'listing envelope carries the spec §4 pagination fields',
      ['templates', 'currentPage', 'totalPages', 'totalTemplates', 'hasNextPage', 'hasPreviousPage'].every((k) => k in data),
      Object.keys(data).join(',')
    );
    check('both fixture templates are listed', data.totalTemplates === 2, `got ${data.totalTemplates}`);
    check('only approved templates are public', data.templates.every((t) => t.status === 'approved'));
    check('anonymous visitor sees favourited=false', data.templates.every((t) => t.favorited === false));

    const paged = await req('GET', '/api/templates?limit=1');
    check('pagination honours limit', paged.data.templates.length === 1 && paged.data.totalTemplates === 2);
    check(
      'hasNextPage / hasPreviousPage are honest',
      paged.data.hasNextPage === true && paged.data.hasPreviousPage === false
    );

    const q = await req('GET', '/api/templates?q=' + encodeURIComponent(`Smoke Alpha`));
    check('search by title works', q.res.ok && q.data.totalTemplates >= 1, `got ${q.data.totalTemplates}`);

    const qTech = await req('GET', '/api/templates?q=next');
    check('search is case-insensitive', qTech.res.ok && qTech.data.totalTemplates >= 1, `got ${qTech.data.totalTemplates}`);

    const qTag = await req('GET', '/api/templates?q=minimal');
    check('search matches a tag (§2)', qTag.res.ok && qTag.data.totalTemplates === 1, `got ${qTag.data.totalTemplates}`);

    const filter = await req('GET', '/api/templates?filter=Portfolio');
    check('filter=Portfolio matches the category field', filter.res.ok && filter.data.totalTemplates === 1, `got ${filter.data.totalTemplates}`);

    const tech = await req('GET', '/api/templates?filter=React');
    check('filter=React matches the technology field', tech.res.ok && tech.data.totalTemplates === 1, `got ${tech.data.totalTemplates}`);

    const tag = await req('GET', '/api/templates?filter=minimal');
    check('filter=one tag matches the tags field (§2)', tag.res.ok && tag.data.totalTemplates === 1, `got ${tag.data.totalTemplates}`);

    const all = await req('GET', '/api/templates?filter=All');
    check('filter=All returns everything', all.res.ok && all.data.totalTemplates === 2, `got ${all.data.totalTemplates}`);

    const upd = await req('GET', '/api/templates?sort=updated');
    check('sort=recently updated -> 200 with everything', upd.res.ok && upd.data.totalTemplates === 2, `got ${upd.res.status}`);

    const meta = await req('GET', '/api/meta');
    check('meta exposes database-driven tags (§2)', meta.res.ok && Array.isArray(meta.data.tags) && meta.data.tags.includes('minimal'), JSON.stringify(meta.data.tags));

    const az = await req('GET', '/api/templates?sort=az');
    const titles = az.data.templates.map((t) => t.title);
    check(
      'sort=az is alphabetical',
      JSON.stringify(titles) === JSON.stringify([...titles].sort((a, b) => a.localeCompare(b))),
      JSON.stringify(titles)
    );

    const dl = await req('GET', '/api/templates?sort=downloads');
    check('sort=downloads -> 200', dl.res.ok);

    const hack = await req('GET', '/api/templates?q=' + encodeURIComponent('.*('));
    check('regex metacharacters in q are neutralised', hack.res.ok, JSON.stringify(hack.data).slice(0, 100));
  }

  /* ------------------------------------------------------------- details */
  section('Template details');
  {
    const { res, data } = await req('GET', `/api/templates/${templateA.slug}`);
    check('GET /api/templates/:slug -> 200', res.ok);
    check('details include author + file reference', !!data.template?.author && !!data.template?.file?.key);
    check('author is populated for the profile link', !!data.template?.author?._id && String(data.template?.author?.name).startsWith('Smoke Developer'));
    check('canEdit is false for an anonymous visitor', data.canEdit === false);

    const asOwner = await req('GET', `/api/templates/${templateA.slug}`, { token: devToken });
    check('canEdit is true for the owner', asOwner.data.canEdit === true);

    const missing = await req('GET', '/api/templates/does-not-exist');
    check('unknown slug -> 404', missing.res.status === 404);

    const badId = await req('GET', '/api/templates/' + 'x'.repeat(200));
    check('oversized slug -> 404, not a crash', badId.res.status === 404, `got ${badId.res.status}`);
  }

  /* -------------------------------------------------- developer dashboard */
  section('Developer dashboard');
  {
    const { res, data } = await req('GET', '/api/templates/mine', { token: devToken });
    check('GET /api/templates/mine returns own templates only', res.ok && data.templates.length === 1, `got ${data.templates?.length}`);
    check('mine includes the newly created template', data.templates.some((t) => t._id === templateA._id));
    check('mine does not leak another developer\'s work', !data.templates.some((t) => t._id === templateB._id));
  }

  /* ------------------------------------------------------- edit + delete */
  section('Edit + ownership');
  {
    const upd = await req('PUT', `/api/templates/${templateA._id}`, {
      token: devToken,
      body: { title: templateA.title + ' v2', technologies: 'React,Vue' },
    });
    check('PUT /api/templates/:id updates metadata', upd.res.ok && upd.data.template.title.endsWith('v2'), JSON.stringify(upd.data).slice(0, 140));
    check('PUT re-parses a comma list into an array', JSON.stringify(upd.data.template.technologies) === JSON.stringify(['React', 'Vue']));
    templateA.title = upd.data.template.title;

    const badTech = await req('PUT', `/api/templates/${templateA._id}`, { token: devToken, body: { technologies: '  ' } });
    check('PUT with empty technologies -> 400', badTech.res.status === 400);

    const foreign = await req('PUT', `/api/templates/${templateA._id}`, { token: otherToken, body: { title: 'Hijacked' } });
    check('another developer cannot edit it -> 403', foreign.res.status === 403, `got ${foreign.res.status}`);

    const asUser = await req('PUT', `/api/templates/${templateA._id}`, { token: userToken, body: { title: 'Hijacked' } });
    check('a normal user cannot edit it -> 403', asUser.res.status === 403, `got ${asUser.res.status}`);

    const noId = await req('PUT', '/api/templates/aaaaaaaaaaaaaaaaaaaaaaaa', { token: devToken, body: { title: 'Ghost' } });
    check('PUT on an unknown id -> 404', noId.res.status === 404);

    const deleteForeign = await req('DELETE', `/api/templates/${templateA._id}`, { token: otherToken });
    check('developer cannot delete someone else\'s template -> 403', deleteForeign.res.status === 403, `got ${deleteForeign.res.status}`);

    const deleteUser = await req('DELETE', `/api/templates/${templateA._id}`, { token: userToken });
    check('normal user DELETE -> 403', deleteUser.res.status === 403);
  }

  /* ------------------------------------------------------------ download */
  section('Download tracking');
  {
    const anon = await req('POST', `/api/templates/${templateA.slug}/download`, {});
    check(
      'anonymous download -> 401 with a helpful message',
      anon.res.status === 401 && /log in to download/i.test(anon.data.error || ''),
      JSON.stringify(anon.data)
    );

    const first = await req('POST', `/api/templates/${templateA.slug}/download`, { token: userToken, raw: true });
    check('first download returns the file', first.res.status === 200 && first.buffer.length > 0, `status ${first.res.status}`);
    check('download sets Content-Disposition: attachment', String(first.res.headers.get('content-disposition') || '').startsWith('attachment'));
    check('download sets Content-Type: application/zip', first.res.headers.get('content-type') === 'application/zip');
    check('the archive bytes came back intact', first.buffer.slice(0, 2).toString() === 'PK');

    const after1 = (await req('GET', `/api/templates/${templateA.slug}`)).data.template;
    check('downloadCount incremented to 1', after1.downloadCount === 1, `got ${after1.downloadCount}`);

    const second = await req('POST', `/api/templates/${templateA.slug}/download`, { token: userToken, raw: true });
    check('second download still serves the file', second.res.status === 200 && second.buffer.length > 0);

    const after2 = (await req('GET', `/api/templates/${templateA.slug}`)).data.template;
    check('repeat download does NOT double-count', after2.downloadCount === 1, `got ${after2.downloadCount}`);

    const secondUser = await req('POST', `/api/templates/${templateA.slug}/download`, { token: otherToken, raw: true });
    check('a different user can download it', secondUser.res.status === 200);

    const after3 = (await req('GET', `/api/templates/${templateA.slug}`)).data.template;
    check('downloadCount is now 2 (one per user)', after3.downloadCount === 2, `got ${after3.downloadCount}`);

    const mine = await req('GET', '/api/users/me/downloads', { token: userToken });
    check('GET /api/users/me/downloads lists it', mine.res.ok && mine.data.total === 1, `got ${mine.data?.total}`);
    check('My Downloads returns the populated template', mine.data.downloads?.[0]?.template?.slug === templateA.slug);
    check('My Downloads carries a timestamp', !!mine.data.downloads?.[0]?.downloadedAt);

    const thumbnail = await req('GET', templateA.thumbnail);
    check('thumbnail URL is publicly reachable', thumbnail.res.ok, `status ${thumbnail.res.status}`);

    const unknown = await req('POST', '/api/templates/no-such-template/download', { token: userToken });
    check('download of an unknown template -> 404', unknown.res.status === 404, `got ${unknown.res.status}`);

    const missingAuth = await req('POST', '/api/templates/no-such-template/download', {});
    check('unknown template download while logged out -> 401 first', missingAuth.res.status === 401);
  }

  /* ------------------------------------------------------ developer pages */
  section('Developer profiles');
  {
    const list = await req('GET', '/api/developers');
    check('GET /api/developers -> 200', list.res.ok);
    const listedIds = (list.data.developers || []).map((d) => String(d.id));
    check(
      'lists both of this run\'s developers',
      listedIds.includes(String(devUser.id)) && listedIds.includes(String(otherUser.id)),
      `got ${listedIds.length}`
    );

    const profile = await req('GET', `/api/developers/${devUser.id}`);
    check('GET /api/developers/:id -> profile', profile.res.ok && profile.data.developer?.name === `Smoke Developer ${STAMP}`);
    check('profile exposes template + download totals', 'templateCount' in profile.data.developer && 'totalDownloads' in profile.data.developer);
    check('profile reports the real template count', profile.data.developer.templateCount === 1, `got ${profile.data.developer.templateCount}`);
    check('profile does not leak email', !('email' in profile.data.developer));

    const theirs = await req('GET', `/api/developers/${devUser.id}/templates`);
    check('GET /api/developers/:id/templates', theirs.res.ok && theirs.data.templates.length === 1);

    // Unique per run, so a hit can only come from THIS run's accounts --
    // proving search narrows results rather than returning everyone.
    const q = await req('GET', `/api/developers?q=${encodeURIComponent(STAMP)}`);
    check(
      'developer search narrows to this run',
      q.res.ok && q.data.developers.length === 2,
      `got ${q.data.developers?.length}`
    );

    const noHit = await req('GET', '/api/developers?q=zzz-no-such-developer');
    check('developer search with no match returns empty', noHit.res.ok && noHit.data.developers.length === 0);

    const missing = await req('GET', '/api/developers/aaaaaaaaaaaaaaaaaaaaaaaa');
    check('unknown developer -> 404', missing.res.status === 404);

    const invalid = await req('GET', '/api/developers/not-an-id');
    check('malformed developer id -> 404, not a 500', invalid.res.status === 404, `got ${invalid.res.status}`);
  }

  /* ---------------------------------------------------------- account */
  section('Account settings');
  {
    const upd = await req('PUT', '/api/users/me', { token: userToken, body: { bio: 'Smoke test bio.' } });
    check('PUT /api/users/me updates the bio', upd.res.ok && upd.data.user?.bio === 'Smoke test bio.');

    await req('PUT', '/api/users/me', { token: userToken, body: { role: 'admin' } });
    const after = (await req('GET', '/api/auth/me', { token: userToken })).data.user;
    check('profile update cannot change the role', after.role === 'user', `role became ${after.role}`);

    const empty = await req('PUT', '/api/users/me', { token: userToken, body: {} });
    check('empty profile update -> 400', empty.res.status === 400);
  }

  /* ----------------------------------------------------------- saved (§1) */
  section('Saved templates');
  {
    const anon = await req('POST', `/api/templates/${templateA._id}/favorite`);
    check(
      'anonymous save -> 401 with a useful message',
      anon.res.status === 401 && /log in/i.test(anon.data.error || ''),
      `got ${anon.res.status} ${anon.data.error}`
    );

    const first = await req('POST', `/api/templates/${templateA._id}/favorite`, { token: userToken });
    check('saving a template -> 200', first.res.ok && first.data.favorited === true, JSON.stringify(first.data));
    check('save reports the new total', first.data.favorites === 1, `got ${first.data.favorites}`);

    const again = await req('POST', `/api/templates/${templateA._id}/favorite`, { token: userToken });
    check('saving twice does not duplicate (§1)', again.res.ok && again.data.favorites === 1, `got ${again.data.favorites}`);

    const list = await req('GET', '/api/users/me/favorites', { token: userToken });
    check(
      'GET /api/users/me/favorites lists it',
      list.res.ok && list.data.total === 1 && list.data.templates.length === 1,
      JSON.stringify(list.data).slice(0, 160)
    );
    check('saved row carries favourited=true', list.data.templates[0]?.favorited === true);

    const theirs = await req('GET', '/api/users/me/favorites', { token: otherToken });
    check('the saved list is scoped to its owner', theirs.res.ok && theirs.data.total === 0, `got ${theirs.data.total}`);

    const marked = await req('GET', `/api/templates/${templateA.slug}`, { token: userToken });
    check('details reflect the saved state', marked.data.template?.favorited === true);
    check(
      'favoriteCount incremented exactly once (§1)',
      marked.data.template?.favoriteCount === 1,
      `got ${marked.data.template?.favoriteCount}`
    );

    const anonDetails = await req('GET', `/api/templates/${templateA.slug}`);
    check('anonymous details are not marked favourited', anonDetails.data.template?.favorited === false);

    const off = await req('DELETE', `/api/templates/${templateA._id}/favorite`, { token: userToken });
    check('unsaving -> favourited false, total 0', off.res.ok && off.data.favorited === false && off.data.favorites === 0);

    const offAgain = await req('DELETE', `/api/templates/${templateA._id}/favorite`, { token: userToken });
    check('unsaving twice is not an error', offAgain.res.ok && offAgain.data.favorites === 0);

    const unknown = await req('DELETE', '/api/templates/aaaaaaaaaaaaaaaaaaaaaaaa/favorite', { token: userToken });
    check('unsave an unknown template -> 404', unknown.res.status === 404, `got ${unknown.res.status}`);

    const afterOff = await req('GET', `/api/templates/${templateA.slug}`);
    check(
      'favoriteCount decrements back to zero',
      afterOff.data.template?.favoriteCount === 0,
      `got ${afterOff.data.template?.favoriteCount}`
    );

    const after = await req('GET', '/api/users/me/favorites', { token: userToken });
    check('saved list is empty again', after.data.total === 0, `got ${after.data.total}`);
  }

  /* -------------------------------------------------- change password (§11) */
  section('Change password');
  {
    const NEW_PASS = `smoke-changed-${STAMP}`;

    const noCurrent = await req('POST', '/api/auth/change-password', {
      token: userToken,
      body: { newPassword: NEW_PASS },
    });
    check('current password is required', noCurrent.res.status === 400, `got ${noCurrent.res.status}`);

    const wrong = await req('POST', '/api/auth/change-password', {
      token: userToken,
      body: { currentPassword: 'definitely-not-it', newPassword: NEW_PASS },
    });
    // 400, not 401: the session is perfectly good, only the field was wrong.
    // A 401 here reads as "expired session" to the browser and would tear the
    // session down mid-form (spec §11).
    check('wrong current password -> 400', wrong.res.status === 400, `got ${wrong.res.status}`);

    const stillMe = await req('GET', '/api/auth/me', { token: userToken });
    check(
      'a rejected password change leaves the session intact',
      stillMe.res.status === 200,
      `got ${stillMe.res.status}`
    );

    const short = await req('POST', '/api/auth/change-password', {
      token: userToken,
      body: { currentPassword: 'secret123', newPassword: 'abc' },
    });
    check('short new password -> 400', short.res.status === 400, `got ${short.res.status}`);

    const anon = await req('POST', '/api/auth/change-password', {
      body: { currentPassword: 'secret123', newPassword: NEW_PASS },
    });
    check('anonymous change-password -> 401', anon.res.status === 401);

    const ok = await req('POST', '/api/auth/change-password', {
      token: userToken,
      body: { currentPassword: 'secret123', newPassword: NEW_PASS },
    });
    check('password change succeeds', ok.res.ok, JSON.stringify(ok.data));

    const oldLogin = await req('POST', '/api/auth/login', {
      body: { email: userEmail, password: 'secret123' },
    });
    check('old password no longer works', oldLogin.res.status === 401, `got ${oldLogin.res.status}`);

    const newLogin = await req('POST', '/api/auth/login', {
      body: { email: userEmail, password: NEW_PASS },
    });
    check('new password works', newLogin.res.ok, JSON.stringify(newLogin.data).slice(0, 120));
  }

  /* ------------------------------------------------- versioning + changelog */
  section('Versioning, changelog + license (§5, §6, §32)');
  {
    const badVersion = await req('PUT', `/api/templates/${templateA._id}`, {
      token: devToken,
      body: { version: 'not a version' },
    });
    check('nonsense version -> 400', badVersion.res.status === 400, `got ${badVersion.res.status}`);

    const badLicense = await req('PUT', `/api/templates/${templateA._id}`, {
      token: devToken,
      body: { license: 'Do What You Want' },
    });
    check('unknown license -> 400', badLicense.res.status === 400, `got ${badLicense.res.status}`);

    const upd = await req('PUT', `/api/templates/${templateA._id}`, {
      token: devToken,
      body: {
        version: '2.1.0',
        license: 'MIT',
        changelogNotes:
          '- Improved responsive layout\n• Fixed mobile navigation\nUpdated dependencies',
      },
    });
    check(
      'update with version + license + changelog -> 200',
      upd.res.ok,
      JSON.stringify(upd.data).slice(0, 140)
    );
    check('version stored', upd.data.template?.version === '2.1.0', `got ${upd.data.template?.version}`);
    check('license stored', upd.data.template?.license === 'MIT', `got ${upd.data.template?.license}`);

    const entry = upd.data.template?.changelog?.[0];
    check('newest changelog entry is first', entry?.version === '2.1.0', JSON.stringify(upd.data.template?.changelog));
    check(
      'bullet markers stripped, notes kept in order',
      Array.isArray(entry?.notes) &&
        entry.notes.length === 3 &&
        entry.notes[0] === 'Improved responsive layout' &&
        entry.notes[1] === 'Fixed mobile navigation' &&
        entry.notes[2] === 'Updated dependencies',
      JSON.stringify(entry?.notes)
    );

    const pub = await req('GET', `/api/templates/${templateA.slug}`);
    check(
      'public details page exposes version, license and changelog',
      pub.data.template?.version === '2.1.0' &&
        pub.data.template?.license === 'MIT' &&
        (pub.data.template?.changelog || []).length === 1,
      JSON.stringify(pub.data.template?.changelog)
    );

    // §31: do not invent information. A template submitted with no licence
    // must come back saying so rather than being handed one.
    check(
      'template submitted without a license stays unlicensed',
      (templateB.license || '') === '',
      `got ${JSON.stringify(templateB.license)}`
    );
    check('unspecified version falls back to 1.0.0', (templateB.version || '') === '1.0.0', `got ${templateB.version}`);
  }

  /* ------------------------------------------------------- template reports */
  section('Reporting (§7)');
  {
    const anon = await req('POST', `/api/templates/${templateB._id}/report`, {
      body: { reason: 'Broken demo' },
    });
    check('anonymous report -> 401 with a helpful message', anon.res.status === 401 && /log in/i.test(anon.data.error || ''), JSON.stringify(anon.data));

    const badReason = await req('POST', `/api/templates/${templateB._id}/report`, {
      token: userToken,
      body: { reason: 'I just do not like it' },
    });
    check('reason outside the list -> 400', badReason.res.status === 400, `got ${badReason.res.status}`);

    const vague = await req('POST', `/api/templates/${templateB._id}/report`, {
      token: userToken,
      body: { reason: 'Other', description: ' ' },
    });
    check('"Other" with no description -> 400', vague.res.status === 400, `got ${vague.res.status}`);

    const first = await req('POST', `/api/templates/${templateB._id}/report`, {
      token: userToken,
      body: { reason: 'Broken download', description: 'The link 404s.' },
    });
    check('valid report -> 201', first.res.status === 201, JSON.stringify(first.data));
    check('report starts pending', first.data.report?.status === 'pending', `got ${first.data.report?.status}`);
    const reportId = first.data.report?.id;

    const dupe = await req('POST', `/api/templates/${templateB._id}/report`, {
      token: userToken,
      body: { reason: 'Broken demo' },
    });
    check(
      'second open report for the same template -> 409, not a second row',
      dupe.res.status === 409 && /already/i.test(dupe.data.error || ''),
      `got ${dupe.res.status} ${JSON.stringify(dupe.data)}`
    );

    const otherUser = await req('POST', `/api/templates/${templateB._id}/report`, {
      token: otherToken,
      body: { reason: 'Copyright issue' },
    });
    check('a different person CAN report the same template', otherUser.res.status === 201, `got ${otherUser.res.status}`);

    const nonAdmin = await req('GET', '/api/admin/reports', { token: userToken });
    check('normal user GET /api/admin/reports -> 403', nonAdmin.res.status === 403, `got ${nonAdmin.res.status}`);
    const nonAdminDev = await req('GET', '/api/admin/reports', { token: devToken });
    check('developer GET /api/admin/reports -> 403', nonAdminDev.res.status === 403, `got ${nonAdminDev.res.status}`);

    // Remembered for the moderation section below.
    global.__smokeReportId = reportId;
  }

  /* ------------------------------------------------------ admin moderation */
  section('Admin moderation, notifications + audit (§8, §12, §14, §35)');
  {
    const adminEmail = `smoke-admin-${STAMP}@example.com`;
    const reg = await req('POST', '/api/auth/register', {
      body: { name: `Smoke Admin ${STAMP}`, email: adminEmail, password: 'secret123', role: 'user' },
    });
    check('admin fixture registered', reg.res.status === 201, JSON.stringify(reg.data).slice(0, 120));

    const promoted = await promoteToAdmin(adminEmail);
    check('admin fixture promoted in the database (no HTTP path grants admin)', promoted === true);

    const login = await req('POST', '/api/auth/login', { body: { email: adminEmail, password: 'secret123' } });
    check('admin can log in', login.res.ok && !!login.data.token, JSON.stringify(login.data).slice(0, 120));
    const adminToken = login.data.token;
    check('role is admin after promotion', login.data.user?.role === 'admin', `got ${login.data.user?.role}`);

    /* ---- §14 platform statistics */
    const stats = await req('GET', '/api/admin/stats', { token: adminToken });
    check('GET /api/admin/stats -> 200', stats.res.ok);
    check(
      'stats cover users, developers, templates, downloads and reports',
      ['users', 'developers', 'templates', 'downloads', 'reports', 'suspended'].every(
        (k) => typeof stats.data.stats?.[k] === 'number'
      ),
      JSON.stringify(stats.data.stats)
    );
    check('open reports are counted', stats.data.stats.reports >= 1, `got ${stats.data.stats.reports}`);

    /* ---- §8 moderation queue */
    const queue = await req('GET', '/api/admin/templates', { token: adminToken });
    check('GET /api/admin/templates -> 200', queue.res.ok);
    check('queue lists templates', Array.isArray(queue.data.templates) && queue.data.templates.length >= 2);

    const pending = await req('GET', '/api/admin/templates?status=nonexistent', { token: adminToken });
    check('unknown status filter is ignored rather than erroring', pending.res.ok);

    /* ---- notifications arrive when a moderator decides (§12) */
    const anonFeed = await req('GET', '/api/notifications');
    check('anonymous GET /api/notifications -> 401', anonFeed.res.status === 401);

    const reject = await req('PATCH', `/api/admin/templates/${templateA._id}/status`, {
      token: adminToken,
      body: { status: 'rejected' },
    });
    check('admin rejects a template -> 200', reject.res.ok, JSON.stringify(reject.data).slice(0, 140));

    const feed = await req('GET', '/api/notifications', { token: devToken });
    check('the author was notified', feed.data.unread >= 1, JSON.stringify(feed.data).slice(0, 200));
    check(
      'notification is about the right template',
      (feed.data.notifications || []).some((n) => n.type === 'rejected'),
      JSON.stringify(feed.data.notifications)
    );

    const again = await req('PATCH', `/api/admin/templates/${templateA._id}/status`, {
      token: adminToken,
      body: { status: 'rejected' },
    });
    check('repeating the same decision -> 200 but no duplicate notice', again.res.ok);
    const feed2 = await req('GET', '/api/notifications', { token: devToken });
    check('unread count did not move on a no-op', feed2.data.unread === feed.data.unread, `${feed2.data.unread} vs ${feed.data.unread}`);

    /* ---- §35 audit log */
    const audit = await req('GET', '/api/admin/audit', { token: adminToken });
    check('GET /api/admin/audit -> 200', audit.res.ok);
    check(
      'rejection was recorded',
      (audit.data.entries || []).some((e) => e.action === 'template.rejected' && e.adminId),
      JSON.stringify((audit.data.entries || []).slice(0, 3))
    );
    const nonAdminAudit = await req('GET', '/api/admin/audit', { token: userToken });
    check('normal user GET /api/admin/audit -> 403', nonAdminAudit.res.status === 403);

    // Put it back so the catalogue looks the way it did.
    const restore = await req('PATCH', `/api/admin/templates/${templateA._id}/status`, {
      token: adminToken,
      body: { status: 'approved' },
    });
    check('template restored to approved', restore.res.ok);

    /* ---- §7 the report queue */
    const reports = await req('GET', '/api/admin/reports', { token: adminToken });
    check('GET /api/admin/reports -> 200', reports.res.ok);
    check(
      'the report we filed is in the queue with its author and template',
      (reports.data.reports || []).some((r) => String(r._id) === String(global.__smokeReportId) && r.userId && r.templateId),
      JSON.stringify((reports.data.reports || []).slice(0, 1))
    );
    check('status counts are returned', typeof reports.data.counts?.pending === 'number', JSON.stringify(reports.data.counts));

    const badStatus = await req('PATCH', `/api/admin/reports/${global.__smokeReportId}`, {
      token: adminToken,
      body: { status: 'shrugged' },
    });
    check('invalid report status -> 400', badStatus.res.status === 400, `got ${badStatus.res.status}`);

    const resolve = await req('PATCH', `/api/admin/reports/${global.__smokeReportId}`, {
      token: adminToken,
      body: { status: 'resolved' },
    });
    check('report resolved -> 200', resolve.res.ok, JSON.stringify(resolve.data).slice(0, 140));

    const rer = await req('POST', `/api/templates/${templateB._id}/report`, {
      token: userToken,
      body: { reason: 'Broken download' },
    });
    check('once the old report is closed, a new one may be filed', rer.res.status === 201, `got ${rer.res.status}`);

    const reporterFeed = await req('GET', '/api/notifications', { token: userToken });
    check('the reporter was told the outcome', (reporterFeed.data.notifications || []).some((n) => n.type === 'report'), JSON.stringify(reporterFeed.data.notifications));

    /* ---- reading the feed (re-read first: restoring the template above
            handed the developer a second notification) */
    const feedNow = await req('GET', '/api/notifications', { token: devToken });
    const unreadBefore = feedNow.data.unread;
    check('there is still something unread to work with', unreadBefore >= 1, `got ${unreadBefore}`);

    const firstUnread = (feedNow.data.notifications || []).find((n) => !n.read);
    if (firstUnread) {
      const readOne = await req('PATCH', `/api/notifications/${firstUnread.id}/read`, { token: devToken });
      check('mark one notification read -> 200', readOne.res.ok);
      check('unread count dropped by one', readOne.data.unread === unreadBefore - 1, `${readOne.data.unread} vs ${unreadBefore}`);
      const againRead = await req('PATCH', `/api/notifications/${firstUnread.id}/read`, { token: devToken });
      check('marking it again is harmless', againRead.res.ok);
      check('and does not move the counter below what is left', againRead.data.unread === unreadBefore - 1, `${againRead.data.unread}`);

      const wrongOwner = await req('PATCH', `/api/notifications/${firstUnread.id}/read`, { token: otherToken });
      check("another user's notification -> 404, never 200", wrongOwner.res.status === 404, `got ${wrongOwner.res.status}`);
    } else {
      check('a notification existed to mark read', false);
    }

    const all = await req('PATCH', '/api/notifications/read-all', { token: devToken });
    check('mark all read -> 200', all.res.ok);
    check('unread is 0 afterwards', all.data.unread === 0, `got ${all.data.unread}`);
    const empty = await req('GET', '/api/notifications', { token: devToken });
    check('feed confirms nothing is left unread', empty.data.unread === 0, `got ${empty.data.unread}`);
    check('read notifications are still visible, not deleted', (empty.data.notifications || []).length >= 1, JSON.stringify(empty.data.notifications));

    const badId = await req('PATCH', '/api/notifications/aaaaaaaaaaaaaaaaaaaaaaaa/read', { token: devToken });
    check('unknown notification id -> 404', badId.res.status === 404, `got ${badId.res.status}`);

    global.__smokeAdminToken = adminToken;
  }

  /* ------------------------------------------------- account status (§9) */
  section('Account suspension (§9)');
  {
    const adminToken = global.__smokeAdminToken;
    const victimEmail = `smoke-suspended-${STAMP}@example.com`;
    const reg = await req('POST', '/api/auth/register', {
      body: { name: 'Soon Suspended', email: victimEmail, password: 'secret123', role: 'user' },
    });
    check('suspension fixture registered', reg.res.status === 201);
    const victimToken = reg.data.token;
    const victimId = reg.data.user?.id;

    const list = await req('GET', '/api/admin/users', { token: adminToken });
    check('GET /api/admin/users -> 200', list.res.ok);
    check(
      'user list reports each account status',
      (list.data.users || []).every((u) => u.status === 'active' || u.status === 'suspended'),
      JSON.stringify((list.data.users || []).slice(0, 1))
    );

    const suspend = await req('PATCH', `/api/admin/users/${victimId}/status`, {
      token: adminToken,
      body: { status: 'suspended' },
    });
    check('admin suspends an account -> 200', suspend.res.ok, JSON.stringify(suspend.data).slice(0, 140));
    check('reply says which account and to what', suspend.data.changed === true);

    const login = await req('POST', '/api/auth/login', { body: { email: victimEmail, password: 'secret123' } });
    check(
      'a suspended account cannot log in',
      login.res.status === 403 && login.data.code === 'ACCOUNT_SUSPENDED',
      `got ${login.res.status} ${JSON.stringify(login.data)}`
    );
    check('the message is understandable', /suspended/i.test(login.data.error || ''), JSON.stringify(login.data));

    // The token was issued BEFORE the suspension and is still valid for days,
    // so this is the check that actually matters.
    const saved = await req('POST', `/api/templates/${templateA._id}/favorite`, { token: victimToken, body: {} });
    check(
      "an existing token cannot save while suspended",
      saved.res.status === 403 && saved.data.code === 'ACCOUNT_SUSPENDED',
      `got ${saved.res.status} ${JSON.stringify(saved.data)}`
    );
    const settings = await req('PUT', '/api/users/me', { token: victimToken, body: { bio: 'still here' } });
    check('an existing token cannot edit the profile while suspended', settings.res.status === 403, `got ${settings.res.status}`);
    const dl = await req('POST', `/api/templates/${templateA.slug}/download`, { token: victimToken });
    check('an existing token cannot download while suspended', dl.res.status === 403, `got ${dl.res.status}`);

    // Reads stay open so the client can explain what happened.
    const me = await req('GET', '/api/auth/me', { token: victimToken });
    check('GET /api/auth/me still answers while suspended', me.res.ok, JSON.stringify(me.data).slice(0, 140));
    check('the session payload says the account is suspended', me.data.user?.status === 'suspended', `got ${me.data.user?.status}`);

    const feed = await req('GET', '/api/notifications', { token: victimToken });
    check('the account was told why it was suspended', (feed.data.notifications || []).some((n) => n.type === 'account' && /suspend/i.test(n.title)), JSON.stringify(feed.data.notifications));

    const audit = await req('GET', '/api/admin/audit', { token: adminToken });
    check('suspension was written to the audit log', (audit.data.entries || []).some((e) => e.action === 'user.suspended'), JSON.stringify((audit.data.entries || []).slice(0, 3)));

    /* ---- an admin cannot lock themselves out */
    const adminMe = await req('GET', '/api/auth/me', { token: adminToken });
    const adminId = adminMe.data.user?.id;
    const selfSuspend2 = await req('PATCH', `/api/admin/users/${adminId}/status`, {
      token: adminToken,
      body: { status: 'suspended' },
    });
    check('self-suspension refused -> 400', selfSuspend2.res.status === 400, `got ${selfSuspend2.res.status}`);

    /* ---- and it is reversible */
    const unsuspend = await req('PATCH', `/api/admin/users/${victimId}/status`, {
      token: adminToken,
      body: { status: 'active' },
    });
    check('admin lifts the suspension', unsuspend.res.ok && unsuspend.data.changed === true, JSON.stringify(unsuspend.data));

    const back = await req('POST', '/api/auth/login', { body: { email: victimEmail, password: 'secret123' } });
    check('the account can sign in again', back.res.ok, JSON.stringify(back.data).slice(0, 140));

    const badStatus = await req('PATCH', `/api/admin/users/${victimId}/status`, {
      token: adminToken,
      body: { status: 'banned' },
    });
    check('unknown status -> 400', badStatus.res.status === 400, `got ${badStatus.res.status}`);
  }

  /* --------------------------------------------------- developer analytics */
  section('Developer analytics (§13)');
  {
    const stats = await req('GET', '/api/templates/mine/stats', { token: devToken });
    check('GET /api/templates/mine/stats -> 200', stats.res.ok, JSON.stringify(stats.data).slice(0, 160));
    const t = stats.data.totals || {};
    check('totals cover templates, downloads and favorites', ['templates', 'downloads', 'favorites'].every((k) => typeof t[k] === 'number'), JSON.stringify(t));
    check('template totals reconcile with the list', t.templates === (stats.data.perTemplate || []).length, `${t.templates} vs ${(stats.data.perTemplate || []).length}`);
    check('downloads per template are listed', Array.isArray(stats.data.perTemplate) && stats.data.perTemplate.length >= 1);
    check('downloads reconcile with the total', t.downloads === (stats.data.perTemplate || []).reduce((n, p) => n + (p.downloadCount || 0), 0), JSON.stringify({ totals: t, perTemplate: stats.data.perTemplate }));
    check('most downloaded template identified', stats.data.mostDownloaded && stats.data.mostDownloaded.downloadCount > 0, JSON.stringify(stats.data.mostDownloaded));
    check('most downloaded is actually this developer\'s own work', stats.data.mostDownloaded ? (stats.data.perTemplate || []).some((p) => String(p.id) === String(stats.data.mostDownloaded._id)) : false);
    check('recent downloads listed', Array.isArray(stats.data.recentDownloads) && stats.data.recentDownloads.length >= 1, JSON.stringify(stats.data.recentDownloads.slice(0, 2)));
    check('recent downloads expose no user identity', (stats.data.recentDownloads || []).every((r) => !('userId' in r) && !('user' in r)));

    const asUser = await req('GET', '/api/templates/mine/stats', { token: userToken });
    check('normal user GET /mine/stats -> 403', asUser.res.status === 403, `got ${asUser.res.status}`);
    const anon = await req('GET', '/api/templates/mine/stats');
    check('anonymous GET /mine/stats -> 401', anon.res.status === 401);
  }

  /* ------------------------------------------------------------------ cors */
  // A failure mode node can never see: this suite sends no Origin header and
  // no preflight, so a method missing from the CORS allow-list passes every
  // check below and still breaks the app in a browser. PATCH is what every
  // moderation decision, account-status change and notification read uses
  // (§8, §9, §12), so each verb the client actually sends is named here.
  section('CORS preflight (browser)');
  {
    const preflight = async (method, path) => {
      const res = await fetch(API + path, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': method,
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      return {
        status: res.status,
        methods: (res.headers.get('access-control-allow-methods') || '').toUpperCase(),
        origin: res.headers.get('access-control-allow-origin'),
      };
    };

    for (const [method, path] of [
      ['GET', '/api/templates'],
      ['POST', '/api/auth/login'],
      ['PUT', '/api/users/me'],
      ['PATCH', '/api/admin/templates/000000000000000000000000/status'],
      ['PATCH', '/api/notifications/read-all'],
      ['DELETE', '/api/templates/000000000000000000000000'],
    ]) {
      const r = await preflight(method, path);
      check(
        `preflight ${method} is allowed`,
        r.status < 400 && r.methods.includes(method) && !!r.origin,
        `status=${r.status} allow-methods="${r.methods}" allow-origin="${r.origin}"`
      );
    }

    const simple = await fetch(`${API}/api/templates`, {
      headers: { origin: 'http://localhost:5173' },
    });
    check(
      'cross-origin GET echoes Origin',
      !!simple.headers.get('access-control-allow-origin'),
      String(simple.headers.get('access-control-allow-origin'))
    );
  }

  /* --------------------------------------------------------------- health */
  section('Health + errors');
  {
    const h = await req('GET', '/health');
    check('GET /health reports db=connected', h.res.ok && h.data.db === 'connected');

    const nf = await req('GET', '/api/nope');
    check('unknown API route -> 404 JSON', nf.res.status === 404 && typeof nf.data.error === 'string');

    const bad = await req('POST', '/api/auth/login', { body: '{"broken"' });
    check('malformed JSON -> 400, not a crash', bad.res.status === 400, `got ${bad.res.status}`);
  }

  /* ------------------------------------------------------------- cleanup */
  section('Teardown');
  {
    const del = await req('DELETE', `/api/templates/${templateA._id}`, { token: devToken });
    check('developer deletes own template', del.res.ok, JSON.stringify(del.data));
    const gone = await req('GET', `/api/templates/${templateA.slug}`);
    check('deleted template is gone', gone.res.status === 404);

    const b = await req('DELETE', `/api/templates/${templateB._id}`, { token: otherToken });
    check('second developer deletes their own template', b.res.ok);
    const empty = await req('GET', '/api/templates');
    check(
      'listing is empty again',
      empty.data.totalTemplates === 0,
      `got ${empty.data.totalTemplates}: ${(empty.data.templates || [])
        .map((t) => t.slug)
        .join(', ')}`
    );
  }

  section('Summary');
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nFailed checks:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  return failed === 0;
}

run()
  .then((ok) => {
    stopServer();
    setTimeout(() => process.exit(ok ? 0 : 1), 500);
  })
  .catch((err) => {
    console.error('\n❌ Smoke test crashed:', err.message);
    stopServer();
    setTimeout(() => process.exit(1), 500);
  });

process.on('SIGINT', () => {
  stopServer();
  setTimeout(() => process.exit(130), 300);
});
