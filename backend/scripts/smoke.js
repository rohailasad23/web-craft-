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
const path = require('path');

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

function startServer() {
  console.log(`⏳ Starting API on :${PORT} (isolated database)…`);
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
    check('listing envelope has templates/total/page/pages', ['templates', 'total', 'page', 'pages'].every((k) => k in data));
    check('both fixture templates are listed', data.total === 2, `got ${data.total}`);
    check('only approved templates are public', data.templates.every((t) => t.status === 'approved'));

    const paged = await req('GET', '/api/templates?limit=1');
    check('pagination honours limit', paged.data.templates.length === 1 && paged.data.total === 2);
    check('hasMore is reported', paged.data.hasMore === true);

    const q = await req('GET', '/api/templates?q=' + encodeURIComponent(`Smoke Alpha`));
    check('search by title works', q.res.ok && q.data.total >= 1, `got ${q.data.total}`);

    const qTech = await req('GET', '/api/templates?q=next');
    check('search is case-insensitive', qTech.res.ok && qTech.data.total >= 1, `got ${qTech.data.total}`);

    const filter = await req('GET', '/api/templates?filter=Portfolio');
    check('filter=Portfolio matches the category field', filter.res.ok && filter.data.total === 1, `got ${filter.data.total}`);

    const tech = await req('GET', '/api/templates?filter=React');
    check('filter=React matches the technology field', tech.res.ok && tech.data.total === 1, `got ${tech.data.total}`);

    const all = await req('GET', '/api/templates?filter=All');
    check('filter=All returns everything', all.res.ok && all.data.total === 2, `got ${all.data.total}`);

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
    check('listing is empty again', empty.data.total === 0, `got ${empty.data.total}`);
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
