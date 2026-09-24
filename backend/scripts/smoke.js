'use strict';

/**
 * End-to-end smoke test.
 *
 * Spawns the API server, exercises every user-facing flow, and reports a
 * pass/fail table. Run with:
 *
 *     npm run smoke
 *
 * Exit code is non-zero on any failure, so it can gate CI.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

const ROOT = path.resolve(__dirname, '..');

// SMOKE_PORT pins a port; otherwise one is discovered at runtime so a stale
// listener left behind by an earlier (crashed) run cannot break the suite.
let PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 0;
let BASE = '';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function buildEnv() {
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'test' };
  // Only override when explicitly provided; otherwise backend/.env supplies it.
  if (process.env.MONGODB_URI) env.MONGODB_URI = process.env.MONGODB_URI;
  return env;
}

const results = [];
let server;
let failures = 0;

async function request(method, urlPath, { body, token, expect = [200] } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data, ok: expect.includes(res.status), headers: res.headers };
}

function check(name, condition, detail = '') {
  results.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures += 1;
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: buildEnv(), stdio: 'pipe' });
    let output = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    // Generous overall budget: Mongo can take up to its 30s selection
    // timeout before the server starts listening.
    const timer = setTimeout(
      () => finish(reject, new Error(`Server did not start in time.\n--- server output ---\n${output}`)),
      90_000
    );

    // Fail fast on a startup crash instead of burning the whole timeout.
    const fatal = /EADDRINUSE|FATAL ERROR|Error: listen|Invalid configuration/;
    const checkFatal = () => {
      if (fatal.test(output)) {
        finish(reject, new Error(`Server crashed on startup.\n--- server output ---\n${output}`));
      }
    };

    server.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('Server running')) finish(resolve, undefined);
      else checkFatal();
    });

    server.stderr.on('data', (chunk) => {
      output += chunk;
      checkFatal();
    });

    server.on('error', (err) => finish(reject, err));
    server.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        finish(reject, new Error(`Server exited with code ${code}.\n--- server output ---\n${output}`));
      }
    });
  });
}

async function waitForHealth() {
  // Generous budget: the server only starts listening once Mongo connects.
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return res.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Server health check never passed');
}

async function run() {
  if (!PORT) PORT = await getFreePort();
  BASE = `http://localhost:${PORT}`;
  console.log(`🚀 Starting server on port ${PORT}...\n`);

  await startServer();
  const health = await waitForHealth();
  check('Server starts', true);
  check('Health endpoint reports db connected', health.db === 'connected', `db=${health.db}`);

  const email = `smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`;
  const password = 'secret123';

  // --- Auth -------------------------------------------------------------
  let r = await request('POST', '/api/auth/register', {
    body: { name: 'Smoke Tester', email, password, confirmPassword: password },
    expect: [201],
  });
  check('POST /api/auth/register -> 201', r.ok, `got ${r.status}`);
  const token = r.data?.token;
  check('Register returns a token', Boolean(token));

  r = await request('POST', '/api/auth/login', {
    body: { email: email.toUpperCase(), password },
    expect: [200],
  });
  check('POST /api/auth/login (case-insensitive email) -> 200', r.ok, `got ${r.status}`);
  const loginToken = r.data?.token || token;

  // Regression: these used to 500 because /api/auth was mounted without auth.
  r = await request('GET', '/api/auth/profile', { token: loginToken, expect: [200] });
  check('GET /api/auth/profile -> 200 (was 500)', r.ok, `got ${r.status}`);

  r = await request('PUT', '/api/auth/profile', {
    token: loginToken,
    body: { businessName: 'Acme Ltd' },
    expect: [200],
  });
  check('PUT /api/auth/profile -> 200 (was 500)', r.ok, `got ${r.status}`);

  r = await request('GET', '/api/auth/profile');
  check('Profile requires a token -> 401', r.status === 401, `got ${r.status}`);

  r = await request('GET', '/api/pages', { token: 'not-a-token' });
  check('Bad token -> 401', r.status === 401, `got ${r.status}`);

  // --- Generation (the original P0) -------------------------------------
  r = await request('POST', '/api/generator/generate', {
    token,
    body: {
      businessName: 'Acme Rockets',
      businessType: 'saas',
      description: 'We build fast deployment tooling for small teams who need to ship daily.',
      features: ['Blazing Fast', 'Simple Pricing', 'Live Support'],
      colorScheme: '#FF5733',
    },
    expect: [200, 201],
  });
  check('POST /api/generator/generate -> 2xx (was 500)', r.ok, `got ${r.status} ${JSON.stringify(r.data)}`);
  const pageId = r.data?.pageId;
  check('Generation returns a pageId', Boolean(pageId));
  check(
    'Generation reports its copy source',
    ['claude', 'openai', 'ollama', 'template'].includes(r.data?.provider),
    `provider=${r.data?.provider}`
  );

  // --- Editor ------------------------------------------------------------
  r = await request('GET', `/api/editor/${pageId}`, { token, expect: [200] });
  check('GET /api/editor/:id -> 200', r.ok, `got ${r.status}`);
  const sections = r.data?.currentState?.sections || [];
  check('Page has the 4 expected sections', sections.length === 4, `got ${sections.length}`);
  check(
    'Every section has a styling object (used to crash Object.assign)',
    sections.every((s) => s.styling && typeof s.styling === 'object'),
    JSON.stringify(sections.map((s) => [s.type, typeof s.styling]))
  );

  const featureSection = sections.find((s) => s.type === 'features');
  if (featureSection) {
    r = await request('PUT', `/api/editor/${pageId}/sections`, {
      token,
      body: {
        sectionId: featureSection.id,
        updates: { content: { title: 'Why Acme Rules' } },
      },
      expect: [200],
    });
    check('PUT /api/editor/:id/sections -> 200 (features section)', r.ok, `got ${r.status}`);

    const saved = r.data?.currentState?.sections?.find((s) => s.type === 'features');
    check('Section edit persisted', saved?.content?.title === 'Why Acme Rules');
    check(
      'htmlOutput regenerated after edit',
      String(r.data?.htmlOutput || '').includes('Why Acme Rules')
    );
  }

  r = await request('PUT', `/api/editor/${pageId}/colors`, {
    token,
    body: { colors: '#123456' },
    expect: [200],
  });
  check('PUT /api/editor/:id/colors -> 200', r.ok, `got ${r.status}`);
  check('Color scheme applied to htmlOutput (was ignored)', String(r.data?.htmlOutput || '').includes('#123456'));

  // --- Security regressions ---------------------------------------------
  r = await request('PUT', `/api/editor/${pageId}`, {
    token,
    body: { paymentStatus: 'paid', status: 'published', userId: '000000000000000000000000' },
    expect: [200],
  });
  const afterInject = r.data || {};
  check(
    'Mass assignment blocked: paymentStatus not settable by client',
    afterInject.paymentStatus !== 'paid',
    `paymentStatus=${afterInject.paymentStatus}`
  );
  check(
    'Mass assignment blocked: userId not settable by client',
    String(afterInject.userId) !== '000000000000000000000000',
    `userId=${afterInject.userId}`
  );

  r = await request('POST', `/api/pages/${pageId}/publish`, { token, body: {}, expect: [402] });
  check('Publishing without payment -> 402', r.ok, `got ${r.status}`);

  r = await request('POST', `/api/payment/create-order`, { token, body: { pageId, amount: 1 } });
  check(
    'Payment gateway not configured -> 503 (not a crash)',
    r.status === 503,
    `got ${r.status}`
  );

  r = await request('GET', '/sites/000000000000000000000000', { expect: [404] });
  check('Unknown /sites/:id -> 404', r.ok, `got ${r.status}`);

  r = await request('GET', `/api/editor/${pageId}`, { token, expect: [200] });
  check('Editor still returns a page owned by the caller', r.ok, `got ${r.status}`);

  // --- XSS ---------------------------------------------------------------
  r = await request('POST', '/api/generator/generate', {
    token,
    body: {
      businessName: '<script>alert(1)</script>',
      businessType: 'service',
      description: 'desc',
      features: ['<img src=x onerror=alert(1)>'],
    },
    expect: [200, 201],
  });
  if (r.ok) {
    const xssId = r.data.pageId;
    const view = await request('GET', `/api/editor/${xssId}`, { token, expect: [200] });
    const html = String(view.data?.htmlOutput || '');
    check('XSS: raw <script> not emitted into htmlOutput', !html.includes('<script>alert(1)</script>'));
    check('XSS: raw onerror handler not emitted', !html.includes('<img src=x onerror'));
    check('XSS: content is escaped', html.includes('&lt;script&gt;'));
  } else {
    check('XSS generation request', false, `got ${r.status}`);
  }

  // --- 404 / error handling ---------------------------------------------
  r = await request('GET', '/api/definitely-not-a-route', { expect: [404] });
  check('Unknown API route -> 404 JSON', r.ok && typeof r.data?.error === 'string', `got ${r.status}`);

  r = await request('POST', '/api/auth/login', { body: { email: 'x@y.com' } });
  check('Missing password -> 400', r.status === 400, `got ${r.status}`);
}

async function main() {
  let fatalError = null;
  try {
    await run();
  } catch (error) {
    failures += 1;
    fatalError = error;
    results.push({ name: 'Smoke test execution', pass: false, detail: error.message });
  }

  console.log('\n-------- SMOKE TEST RESULTS --------');
  for (const { name, pass, detail } of results) {
    const badge = pass ? 'PASS' : 'FAIL';
    console.log(`  ${badge}  ${name}${!pass && detail ? `  -- ${detail}` : ''}`);
  }
  console.log('------------------------------------');
  console.log(`${results.length - failures}/${results.length} passed`);

  if (server) server.kill();
  if (failures) console.error(`${failures} failure(s)`);
  if (fatalError) console.error(fatalError.message);

  // Give the child a moment to exit before we do (Windows).
  setTimeout(() => process.exit(failures ? 1 : 0), 400);
}

main();
