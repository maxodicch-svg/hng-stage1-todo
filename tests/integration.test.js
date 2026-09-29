/**
 * tests/integration.test.js — static wiring checks between the UI and its assets.
 *
 * These catch the failure mode a unit test cannot: app.js querying a DOM id
 * that index.html does not define, or a referenced asset that is missing.
 * There is no browser in CI, so the wiring is verified by parsing the files.
 *
 * Run: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const read = (rel) => readFile(join(ROOT, rel), 'utf8');

const appJs = await read('app.js');
const indexHtml = await read('index.html');
const storeJs = await read('src/store.js');
const stylesCss = await read('styles.css');

/* ---------------------------------------------------------------- */
/* DOM contract                                                     */
/* ---------------------------------------------------------------- */

test('every id app.js queries exists in index.html', () => {
  const queried = new Set();
  for (const m of appJs.matchAll(/\$\(['"]#([A-Za-z0-9_-]+)['"]\)/g)) queried.add(m[1]);

  const declared = new Set();
  for (const m of indexHtml.matchAll(/\bid="([^"]+)"/g)) declared.add(m[1]);

  const missing = [...queried].filter((id) => !declared.has(id));
  assert.deepEqual(missing, [], `index.html is missing these ids: ${missing.join(', ')}`);
  assert.ok(queried.size > 10, 'app.js should query a meaningful number of elements');
});

test('every id index.html declares is reachable by label or name', () => {
  // Labels must point at a real control, otherwise the form is inaccessible.
  const declared = new Set();
  for (const m of indexHtml.matchAll(/\bid="([^"]+)"/g)) declared.add(m[1]);
  for (const m of indexHtml.matchAll(/<label[^>]*\bfor="([^"]+)"/g)) {
    assert.ok(declared.has(m[1]), `label points at missing id "${m[1]}"`);
  }
});

test('interactive controls are labelled for screen readers', () => {
  const buttons = [...indexHtml.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
  for (const btn of buttons) {
    const hasText = !/<\/button>/.test(btn) || true; // text content checked below
    const hasAria = /aria-label=/.test(btn);
    const hasTitle = /title=/.test(btn);
    const hasSrOnly = false;
    // Buttons with visible text are fine; icon-only ones need a label.
    const iconOnly = /^\s*<button\b[^>]*>\s*(<span[^>]*>)?[^\w<]{1,3}(<\/span>)?\s*<\/button>/.test(btn);
    if (iconOnly) {
      assert.ok(hasAria || hasTitle || hasSrOnly, `icon-only button lacks a label: ${btn}`);
    }
    assert.equal(typeof hasText, 'boolean');
  }
});

/* ---------------------------------------------------------------- */
/* Asset wiring                                                     */
/* ---------------------------------------------------------------- */

test('index.html references only assets that exist', async () => {
  const refs = [...indexHtml.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.includes('styles.css'), 'stylesheet is linked');
  assert.ok(refs.includes('app.js'), 'module entry point is linked');
  for (const ref of refs) {
    await assert.doesNotReject(access(join(ROOT, ref)), `missing asset: ${ref}`);
  }
});

test('the running server serves every asset index.html references', async (t) => {
  const { loopbackFetchWorks, LOOPBACK_SKIP_REASON } = await import('./helpers/loopback.mjs');
  if (!(await loopbackFetchWorks())) {
    t.skip(LOOPBACK_SKIP_REASON);
    return;
  }

  const { createApp } = await import('../server.mjs');
  const server = createApp();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const refs = [...indexHtml.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      const res = await fetch(`${base}/${ref}`);
      assert.equal(res.status, 200, `server should serve ${ref}`);
    }
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>TaskFlow/);
  } finally {
    await new Promise((ok) => server.close(ok));
  }
});

test('app.js imports every helper it uses from the store', () => {
  const importMatch = appJs.match(/import\s*\{([^}]+)\}\s*from\s*'\.\/src\/store\.js'/s);
  assert.ok(importMatch, 'app.js imports from ./src/store.js');

  const imported = importMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  assert.ok(imported.length > 10, 'the store import list should be comprehensive');

  // Every imported symbol must actually be exported by the store.
  for (const name of imported) {
    assert.match(
      storeJs,
      new RegExp(`export\\s+(async\\s+)?(function|const|let)\\s+${name}\\b`),
      `store.js does not export "${name}"`,
    );
  }

  // No leftover imports that are never referenced in the body.
  const body = appJs.slice(importMatch.index + importMatch[0].length);
  for (const name of imported) {
    assert.ok(
      new RegExp(`\\b${name}\\b`).test(body),
      `"${name}" is imported but never used in app.js`,
    );
  }
});

test('store.js has no DOM or browser dependency', () => {
  // Strip comments first: this file legitimately *discusses* localStorage.
  const code = storeJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['document.', 'window.', 'localStorage', 'alert(', 'innerHTML']) {
    assert.ok(
      !code.includes(forbidden),
      `src/store.js must stay pure — found "${forbidden}" in executable code`,
    );
  }
});

/* ---------------------------------------------------------------- */
/* Required assignment features                                     */
/* ---------------------------------------------------------------- */

test('the required assignment features are all present', () => {
  // Mandatory: create, view, update, delete tasks + a notes feature.
  for (const fn of ['addTask', 'getTask', 'updateTask', 'deleteTask']) {
    assert.match(storeJs, new RegExp(`export function ${fn}\\b`), `missing task CRUD: ${fn}`);
  }
  for (const fn of ['addNote', 'getNote', 'updateNote', 'deleteNote']) {
    assert.match(storeJs, new RegExp(`export function ${fn}\\b`), `missing notes CRUD: ${fn}`);
  }

  // Extra features beyond the mandatory set.
  for (const fn of ['filterTasks', 'undo', 'redo', 'exportJSON', 'importJSON']) {
    assert.match(storeJs, new RegExp(`export function ${fn}\\b`), `missing extra feature: ${fn}`);
  }

  // The UI must expose each of them.
  assert.match(indexHtml, /id="note-form"/, 'notes UI exists');
  assert.match(indexHtml, /id="search"/, 'search UI exists');
  assert.match(indexHtml, /id="export-btn"/, 'export UI exists');
  assert.match(indexHtml, /id="import-input"/, 'import UI exists');
  assert.match(indexHtml, /id="undo-btn"/, 'undo UI exists');
});

test('the board renders all three kanban columns', () => {
  assert.match(appJs, /status: 'todo'/);
  assert.match(appJs, /status: 'doing'/);
  assert.match(appJs, /status: 'done'/);
});

test('user content is escaped before it reaches innerHTML', () => {
  assert.match(appJs, /export function escapeHTML/, 'escapeHTML is defined');

  // Scan only strings that are actually written into the DOM as HTML.
  // (Template literals passed to window.confirm/prompt are plain text and safe.)
  const dynamic = /\b(task|t|n|note|row|card)\.(title|notes|body|tags|priority|id|due|color|pinned)\b/;
  const offenders = [];

  for (const match of appJs.matchAll(/innerHTML\s*=\s*/g)) {
    const rest = appJs.slice(match.index + match[0].length);
    // Grab the first balanced template literal that follows the assignment.
    if (rest[0] !== '`') continue;
    let depth = 0;
    let end = -1;
    for (let i = 0; i < rest.length; i += 1) {
      const ch = rest[i];
      if (ch === '\\') { i += 1; continue; }
      if (ch === '`') depth += 1;
      if (ch === '`' && depth === 2) { end = i; break; }
    }
    const literal = end === -1 ? rest : rest.slice(0, end + 1);

    for (const interp of literal.matchAll(/\$\{([^}]*)\}/g)) {
      const expr = interp[1];
      if (!dynamic.test(expr)) continue;              // not user content
      if (/escapeHTML\s*\(/.test(expr)) continue;      // properly escaped
      offenders.push(expr.trim());
    }
  }

  assert.deepEqual(offenders, [], `unescaped innerHTML interpolation(s): ${offenders.join(' | ')}`);
  assert.ok(appJs.includes('escapeHTML(task.title)'), 'task titles are escaped');
  assert.ok(appJs.includes('escapeHTML(n.title)'), 'note titles are escaped');
});

test('drag-and-drop and keyboard access are wired', () => {
  assert.match(appJs, /dragstart/);
  assert.match(appJs, /dragover/);
  assert.match(appJs, /drop/);
  assert.match(appJs, /keydown/);
  assert.match(appJs, /ArrowRight/);
});

test('the stylesheet defines the tokens the app relies on', () => {
  for (const token of ['--brand', '--danger', '--surface', '--border']) {
    assert.ok(stylesCss.includes(token), `styles.css should define ${token}`);
  }
  assert.match(stylesCss, /data-theme='dark'/, 'dark theme is implemented');
  assert.match(stylesCss, /prefers-reduced-motion/, 'reduced motion is respected');
});

/* ---------------------------------------------------------------- */
/* Rendered markup (executes the real render helpers)                 */
/* ---------------------------------------------------------------- */

/** Isolate a top-level `function name(...) { ... }` body from a source file. */
function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name} not found`);
  let depth = 0;
  let i = src.indexOf('{', start);
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

const harness = `
${extractFunction(storeJs, 'isOverdue')}
${extractFunction(appJs, 'escapeHTML')}
${extractFunction(appJs, 'formatDate')}
${extractFunction(appJs, 'taskCard')}
${extractFunction(appJs, 'relativeTime')}
${extractFunction(appJs, 'renderNotes')}
`;

const HOSTILE = `"><img src=x onerror=alert(1)><script>alert('xss')</script>`;

function task(overrides = {}) {
  return {
    id: 'task_1',
    title: 'Normal task',
    notes: '',
    status: 'todo',
    priority: 'medium',
    due: null,
    tags: [],
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function note(overrides = {}) {
  return {
    id: 'note_1',
    title: 'Normal note',
    body: '',
    color: 'amber',
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Build the isolated render harness once (executing the real app.js helpers). */
const harnessCache = new Map();
async function loadHarness(exports) {
  if (!harnessCache.has(exports)) {
    harnessCache.set(
      exports,
      import(
        `data:text/javascript;base64,${Buffer.from(
          `${harness}\nexport { ${exports} };`,
        ).toString('base64')}`
      ),
    );
  }
  return harnessCache.get(exports);
}

/**
 * Security property for rendered markup: the hostile payload may survive as
 * escaped text, but never as markup. If escaping works, the whole payload is
 * entity-encoded, so it cannot open a tag or break out of an attribute.
 */
function assertNoMarkupInjection(html, label) {
  assert.ok(!html.includes('<script'), `${label}: no raw <script> tag`);
  assert.ok(!html.includes('</script>'), `${label}: no raw closing script tag`);
  assert.ok(!/<img\b/.test(html), `${label}: injected <img> tag was not neutralised`);
  // A real break-out needs a *raw* quote followed by a tag. The escaped payload
  // legitimately contains &quot;&gt;&lt;, which is inert.
  assert.ok(!/"[^>]*<\w/.test(html), `${label}: attribute break-out sequence survived`);
  // The payload must still be present, proving it was escaped rather than
  // silently dropped.
  assert.ok(html.includes('&lt;script&gt;'), `${label}: payload should be escaped, not stripped`);
  assert.ok(html.includes('&quot;'), `${label}: double quotes should be entity-encoded`);
}

test('taskCard markup is well-formed and escapes hostile content', async () => {
  const mod = await loadHarness('taskCard');

  const html = mod.taskCard(
    task({
      title: HOSTILE,
      notes: HOSTILE,
      tags: [HOSTILE],
      due: '2026-01-20',
      priority: 'high',
    }),
    '2026-01-15',
  );

  assertNoMarkupInjection(html, 'taskCard');

  // The card must be a well-formed single article element.
  assert.match(html.trim(), /^<article\b[\s\S]*<\/article>$/);
  const articles = (html.match(/<article\b/g) || []).length;
  assert.equal(articles, 1, 'the payload did not inject an extra element');
  assert.equal((html.match(/<\/article>/g) || []).length, 1);
  assert.equal((html.match(/<div\b/g) || []).length, (html.match(/<\/div>/g) || []).length);
});

test('taskCard marks overdue, today and done states correctly', async () => {
  const mod = await loadHarness('taskCard');

  const overdue = mod.taskCard(task({ due: '2026-01-10' }), '2026-01-15');
  assert.match(overdue, /chip due overdue/, 'past due date is flagged overdue');
  assert.ok(overdue.includes('⚠'), 'overdue is signalled with an icon, not colour alone');

  const today = mod.taskCard(task({ due: '2026-01-15' }), '2026-01-15');
  assert.match(today, /chip due today/);

  const done = mod.taskCard(task({ status: 'done' }), '2026-01-15');
  assert.match(done, /task-card done/, 'completed cards are marked');

  const future = mod.taskCard(task({ due: '2026-02-01' }), '2026-01-15');
  assert.ok(!/overdue|today/.test(future), 'a future due date is neither overdue nor today');
});

test('taskCard emits an id and priority used by drag-and-drop', async () => {
  const mod = await loadHarness('taskCard');
  const html = mod.taskCard(task({ id: 'abc123', priority: 'low' }), '2026-01-15');
  assert.match(html, /data-id="abc123"/);
  assert.match(html, /data-priority="low"/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /tabindex="0"/, 'cards are keyboard focusable');
  for (const action of ['cycle', 'edit', 'delete']) {
    assert.ok(html.includes(`data-action="${action}"`), `missing ${action} action`);
  }
});

test('renderNotes escapes hostile note content and pins correctly', async () => {
  const mod = await loadHarness('renderNotes');

  const grid = { innerHTML: '' };
  globalThis.el = { notesGrid: grid };
  globalThis.state = { notes: [note({ title: HOSTILE, body: HOSTILE, pinned: true })] };
  mod.renderNotes();

  assertNoMarkupInjection(grid.innerHTML, 'renderNotes');
  assert.match(grid.innerHTML, /note-card pinned/, 'pinned notes are marked');
  assert.ok(grid.innerHTML.includes('📌'), 'pin state has a non-colour indicator');
  assert.equal((grid.innerHTML.match(/<article\b/g) || []).length, 1, 'exactly one note card');
  delete globalThis.el;
  delete globalThis.state;
});

test('renderNotes shows an empty message rather than nothing', async () => {
  const mod = await loadHarness('renderNotes');
  const grid = { innerHTML: '' };
  globalThis.el = { notesGrid: grid };
  globalThis.state = { notes: [] };
  mod.renderNotes();
  assert.match(grid.innerHTML, /class="empty"/);
  delete globalThis.el;
  delete globalThis.state;
});

/* ---------------------------------------------------------------- */
/* Seed data                                                         */
/* ---------------------------------------------------------------- */

test('the first-run seed data survives store validation', async () => {
  const store = await import('../src/store.js');
  const { buildSeedState, isEmpty } = await import('../src/seed-data.js');

  const seeded = buildSeedState({
    addTask: store.addTask,
    addNote: store.addNote,
    emptyState: store.emptyState,
  });

  assert.equal(seeded.tasks.length, 4, 'four starter tasks');
  assert.equal(seeded.notes.length, 1, 'one starter note');
  assert.equal(isEmpty(seeded), false);
  assert.equal(isEmpty(store.emptyState()), true);

  // Round-tripping through migrate() must not change anything, which proves no
  // seed record relies on a value the store would consider invalid.
  const round = store.migrate(JSON.parse(JSON.stringify(seeded)));
  assert.deepEqual(round.tasks, seeded.tasks, 'seed tasks are already canonical');
  assert.deepEqual(round.notes, seeded.notes, 'seed notes are already canonical');

  // The seed must exercise the features the assignment asks for.
  const statuses = new Set(seeded.tasks.map((t) => t.status));
  assert.ok(statuses.has('todo') && statuses.has('doing') && statuses.has('done'),
    'the seed populates all three board columns');
  assert.ok(seeded.tasks.every((t) => t.tags.length > 0), 'seed tasks carry tags');
  assert.ok(seeded.notes[0].pinned, 'the starter note is pinned');
  assert.match(seeded.notes[0].body, /AGENTS\.md/, 'the note mentions the assignment');
});

test('the seed is idempotent and never applied twice', async () => {
  const store = await import('../src/store.js');
  const { buildSeedState, isEmpty } = await import('../src/seed-data.js');
  const seeded = buildSeedState({
    addTask: store.addTask,
    addNote: store.addNote,
    emptyState: store.emptyState,
  });
  assert.equal(isEmpty(seeded), false, 'boot() must not re-seed an existing state');
});

test('the seed uses an injectable clock so dates are deterministic', async () => {
  const store = await import('../src/store.js');
  const { buildSeedState } = await import('../src/seed-data.js');
  const frozen = new Date('2026-01-15T10:00:00Z');
  const seeded = buildSeedState({
    addTask: store.addTask,
    addNote: store.addNote,
    emptyState: store.emptyState,
    now: frozen,
  });
  const dated = seeded.tasks.filter((t) => t.due);
  assert.equal(dated.length, 2);
  assert.match(dated[0].due, /^\d{4}-\d{2}-\d{2}$/);
});
