/**
 * tests/api.test.js â€” endpoint validation for server.mjs.
 *
 * AGENTS.md requires tests for every endpoint that is created. The server
 * exposes /api/health and /api/version plus static file routes, so all of
 * them are exercised here against a real listening socket.
 *
 * Run: npm test
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { createApp, resolvePath, contentTypeFor } from '../server.mjs';
import { loopbackFetchWorks, LOOPBACK_SKIP_REASON } from './helpers/loopback.mjs';

let server;
let base;
let loopback = true;

before(async () => {
  // Detect a machine-level firewall block first, so the HTTP tests can skip
  // honestly instead of reporting failures the project did not cause.
  loopback = await loopbackFetchWorks();
  if (!loopback) {
    console.log(`\n  [notice] ${LOOPBACK_SKIP_REASON}\n`);
    return;
  }
  server = createApp();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((ok) => server.close(ok));
});

/** Skip a test when this machine blocks loopback HTTP. */
const httpTest = (name, fn) =>
  test(name, async (t) => {
    if (!loopback) {
      t.skip(LOOPBACK_SKIP_REASON);
      return;
    }
    await fn(t);
  });

/* ---------------------------------------------------------------- */
/* GET /api/health                                                   */
/* ---------------------------------------------------------------- */

httpTest('GET /api/health returns 200 with a healthy payload', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'taskflow');
  assert.equal(body.status, 'healthy');
  assert.equal(body.stage, 'HNG-15-Stage-1');
  assert.equal(typeof body.uptimeSeconds, 'number');
  assert.ok(!Number.isNaN(Date.parse(body.timestamp)), 'timestamp is a valid ISO date');
});

/* ---------------------------------------------------------------- */
/* GET /api/version                                                  */
/* ---------------------------------------------------------------- */

httpTest('GET /api/version reports the schema version and feature list', async () => {
  const res = await fetch(`${base}/api/version`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.schemaVersion, 2);
  assert.ok(Array.isArray(body.features));
  for (const feature of ['tasks', 'notes', 'search', 'undo-redo', 'import-export']) {
    assert.ok(body.features.includes(feature), `features should include ${feature}`);
  }
});

/* ---------------------------------------------------------------- */
/* Failure paths                                                     */
/* ---------------------------------------------------------------- */

httpTest('unknown /api routes return a JSON 404', async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /Unknown endpoint/);
});

httpTest('non-GET methods are rejected with 405', async () => {
  const res = await fetch(`${base}/api/health`, { method: 'POST' });
  assert.equal(res.status, 405);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /Method not allowed/);
});

httpTest('missing static files return a JSON 404', async () => {
  const res = await fetch(`${base}/no-such-page.html`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.ok, false);
});

/* ---------------------------------------------------------------- */
/* Static routes                                                     */
/* ---------------------------------------------------------------- */

httpTest('GET / serves the app shell', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /<title>TaskFlow/);
  assert.match(html, /id="task-form"/, 'task creation UI is present');
  assert.match(html, /id="note-form"/, 'notes UI is present');
  assert.match(html, /id="board"/, 'kanban board is present');
});

httpTest('static assets are served with the right content types', async () => {
  for (const [path, expected] of [
    ['/styles.css', /text\/css/],
    ['/app.js', /javascript/],
    ['/src/store.js', /javascript/],
  ]) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 200, `${path} should exist`);
    assert.match(res.headers.get('content-type'), expected, `${path} content type`);
  }
});

httpTest('HEAD requests return headers without a body', async () => {
  const res = await fetch(`${base}/`, { method: 'HEAD' });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text, '');
});

/* ---------------------------------------------------------------- */
/* Security: traversal, deny list, dotfiles                          */
/* ---------------------------------------------------------------- */

test('resolvePath rejects traversal, dotfiles and non-web extensions', () => {
  assert.equal(resolvePath('/../package.json'), null, 'literal .. segment');
  assert.equal(resolvePath('/..%2f..%2fpackage.json'), null, 'encoded .. segment');
  assert.equal(resolvePath('/%00'), null, 'null byte');
  assert.equal(resolvePath('/.env'), null, 'dotfile');
  assert.equal(resolvePath('/.git/config'), null, 'dot directory');
  assert.equal(resolvePath('/server.mjs'), null, 'backend source is not serveable');
  assert.equal(resolvePath('/tests/store.test.js'), null, 'test sources are not serveable');
  assert.equal(resolvePath('/README'), null, 'extension-less paths are not served');
});

test('resolvePath still returns real client assets', () => {
  const index = resolvePath('/');
  assert.ok(index && index.endsWith('index.html'));
  assert.ok(resolvePath('/styles.css').endsWith('styles.css'));
  assert.ok(resolvePath('/src/store.js').endsWith('store.js'));
});

httpTest('traversal over HTTP never leaks files outside the web root', async () => {
  for (const path of ['/../server.mjs', '/..%2fserver.mjs', '/.env', '/package-lock.json']) {
    const res = await fetch(`${base}${path}`);
    assert.notEqual(res.status, 200, `${path} must not be served`);
  }
});

httpTest('the server never returns backend source or docs', async () => {
  for (const path of ['/server.mjs', '/AGENTS.md', '/README.md', '/tests/api.test.js']) {
    const res = await fetch(`${base}${path}`);
    assert.notEqual(res.status, 200, `${path} must not be served`);
    const body = await res.text();
    assert.ok(!body.includes('createServer'), `${path} leaked source`);
  }
});

test('contentTypeFor falls back for unknown extensions', () => {
  assert.equal(contentTypeFor('a.unknown'), 'application/octet-stream');
  assert.match(contentTypeFor('a.html'), /text\/html/);
});

test('the serverless /api/health handler matches the local contract', async () => {
  const { default: handler } = await import('../api/health.js');

  const fake = () => {
    const res = { statusCode: 0, headers: {}, body: '' };
    res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
    res.end = (chunk) => { res.body = chunk || ''; };
    return res;
  };

  const ok = fake();
  handler({ method: 'GET' }, ok);
  assert.equal(ok.statusCode, 200);
  assert.match(ok.headers['content-type'], /application\/json/);
  const payload = JSON.parse(ok.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.service, 'taskflow');
  assert.equal(payload.status, 'healthy');
  assert.ok(!Number.isNaN(Date.parse(payload.timestamp)));

  const rejected = fake();
  handler({ method: 'POST' }, rejected);
  assert.equal(rejected.statusCode, 405);
  assert.equal(JSON.parse(rejected.body).ok, false);
});
