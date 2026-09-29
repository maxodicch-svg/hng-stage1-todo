/**
 * tests/store.test.js — validation suite for the pure state logic.
 *
 * Run: npm test
 * Rule (see AGENTS.md): every exported store function has at least one test,
 * including its failure/edge path.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addNote,
  addTask,
  allTags,
  canRedo,
  canUndo,
  clearCompleted,
  createHistory,
  cycleStatus,
  deleteNote,
  deleteTask,
  emptyState,
  exportJSON,
  filterTasks,
  getNote,
  getTask,
  importJSON,
  isDueToday,
  isOverdue,
  isValidDate,
  loadState,
  mergeStates,
  migrate,
  normaliseTags,
  pushHistory,
  redo,
  reorderTask,
  saveState,
  setStatus,
  sortTasks,
  stats,
  todayISO,
  toggleNotePin,
  uid,
  undo,
  updateNote,
  updateTask,
} from '../src/store.js';

const TODAY = '2026-01-15';

/** Small helper: a state with three tasks in known states. */
function fixture() {
  let s = emptyState();
  s = addTask(s, { title: 'Alpha', priority: 'high', due: '2026-01-10', tags: 'work' });
  s = addTask(s, { title: 'Beta', priority: 'low', status: 'doing', tags: 'home, work' });
  s = addTask(s, { title: 'Gamma', priority: 'medium', status: 'done', notes: 'shipped' });
  return s;
}

/* ---------------------------------------------------------------- */
/* Utilities                                                         */
/* ---------------------------------------------------------------- */

test('uid returns unique, prefixed ids', () => {
  const a = uid('task');
  const b = uid('task');
  assert.notEqual(a, b);
  assert.match(a, /^task_/);
});

test('normaliseTags trims, lowercases, dedupes and accepts strings', () => {
  assert.deepEqual(normaliseTags([' Work ', 'work', 'HOME', '']), ['work', 'home']);
  assert.deepEqual(normaliseTags('a, b , a'), ['a', 'b']);
  assert.deepEqual(normaliseTags(null), []);
  assert.deepEqual(normaliseTags(undefined), []);
});

test('isValidDate accepts real dates and rejects rollovers', () => {
  assert.equal(isValidDate('2026-01-15'), true);
  assert.equal(isValidDate('2026-02-31'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('15-01-2026'), false);
  assert.equal(isValidDate(null), false);
});

test('todayISO returns a YYYY-MM-DD string', () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(todayISO(new Date('2026-03-04T12:00:00Z')).length, 10);
});

/* ---------------------------------------------------------------- */
/* migrate / emptyState                                              */
/* ---------------------------------------------------------------- */

test('emptyState has the documented shape', () => {
  const s = emptyState();
  assert.equal(s.version, 2);
  assert.deepEqual(s.tasks, []);
  assert.deepEqual(s.notes, []);
});

test('migrate never throws and repairs junk input', () => {
  assert.deepEqual(migrate(null).tasks, []);
  assert.deepEqual(migrate('nonsense').tasks, []);
  assert.deepEqual(migrate(42).notes, []);

  const repaired = migrate({
    tasks: [
      null,
      'nope',
      { title: '', status: 'invalid', priority: 'nope', due: '2026-02-30', tags: 'A,a' },
    ],
    notes: [{ body: 5, color: 'chartreuse' }],
  });
  assert.equal(repaired.tasks.length, 1, 'non-objects are dropped');
  const t = repaired.tasks[0];
  assert.equal(t.title, 'Untitled task');
  assert.equal(t.status, 'todo');
  assert.equal(t.priority, 'medium');
  assert.equal(t.due, null, 'impossible dates become null');
  assert.deepEqual(t.tags, ['a']);
  assert.equal(repaired.notes[0].color, 'amber');
});

test('migrate is idempotent', () => {
  const once = migrate(fixture());
  const twice = migrate(once);
  assert.deepEqual(twice.tasks, once.tasks);
  assert.deepEqual(twice.notes, once.notes);
});

/* ---------------------------------------------------------------- */
/* Task CRUD                                                         */
/* ---------------------------------------------------------------- */

test('addTask appends a normalised task with defaults', () => {
  const s = addTask(emptyState(), { title: '  Buy milk  ' });
  assert.equal(s.tasks.length, 1);
  const t = s.tasks[0];
  assert.equal(t.title, 'Buy milk');
  assert.equal(t.status, 'todo');
  assert.equal(t.priority, 'medium');
  assert.equal(t.due, null);
  assert.equal(t.order, 0);
  assert.ok(t.id && t.createdAt && t.updatedAt);
});

test('addTask assigns increasing manual order', () => {
  const s = fixture();
  assert.deepEqual(s.tasks.map((t) => t.order), [0, 1, 2]);
});

test('addTask rejects an invalid due date by nulling it', () => {
  const s = addTask(emptyState(), { title: 'x', due: '2026-02-31' });
  assert.equal(s.tasks[0].due, null);
});

test('getTask finds by id and returns null otherwise', () => {
  const s = fixture();
  assert.equal(getTask(s, s.tasks[0].id).title, 'Alpha');
  assert.equal(getTask(s, 'missing'), null);
});

test('updateTask patches fields and keeps identity/timestamps', () => {
  const s = fixture();
  const id = s.tasks[0].id;
  const before = getTask(s, id);
  const next = updateTask(s, id, { title: 'Alpha 2', priority: 'low', tags: 'x' });
  const after = getTask(next, id);
  assert.equal(after.title, 'Alpha 2');
  assert.equal(after.priority, 'low');
  assert.deepEqual(after.tags, ['x']);
  assert.equal(after.id, before.id, 'id is immutable');
  assert.equal(after.createdAt, before.createdAt, 'createdAt is immutable');
});

test('updateTask with an unknown id returns the same reference (no-op)', () => {
  const s = fixture();
  assert.equal(updateTask(s, 'ghost', { title: 'x' }), s);
});

test('updateTask cannot smuggle in an invalid status', () => {
  const s = fixture();
  const next = updateTask(s, s.tasks[0].id, { status: 'archived' });
  assert.equal(getTask(next, s.tasks[0].id).status, 'todo');
});

test('deleteTask removes one task and is a no-op for unknown ids', () => {
  const s = fixture();
  const next = deleteTask(s, s.tasks[1].id);
  assert.equal(next.tasks.length, 2);
  assert.equal(getTask(next, s.tasks[1].id), null);
  assert.equal(deleteTask(s, 'ghost'), s);
});

test('cycleStatus walks todo -> doing -> done -> todo', () => {
  let s = fixture();
  const id = s.tasks[0].id;
  s = cycleStatus(s, id);
  assert.equal(getTask(s, id).status, 'doing');
  s = cycleStatus(s, id);
  assert.equal(getTask(s, id).status, 'done');
  s = cycleStatus(s, id);
  assert.equal(getTask(s, id).status, 'todo');
});

test('cycleStatus on an unknown id is a no-op', () => {
  const s = fixture();
  assert.equal(cycleStatus(s, 'ghost'), s);
});

test('setStatus sets explicitly and rejects unknown statuses', () => {
  const s = fixture();
  const id = s.tasks[0].id;
  assert.equal(getTask(setStatus(s, id, 'done'), id).status, 'done');
  assert.equal(setStatus(s, id, 'nope'), s);
});

test('clearCompleted removes only done tasks', () => {
  const s = clearCompleted(fixture());
  assert.equal(s.tasks.length, 2);
  assert.equal(s.tasks.some((t) => t.status === 'done'), false);
});

/* ---------------------------------------------------------------- */
/* Reordering                                                        */
/* ---------------------------------------------------------------- */

test('reorderTask moves a task within its column', () => {
  let s = fixture();
  const [alpha, beta] = s.tasks;
  s = reorderTask(s, alpha.id, 1, 'todo');
  const todo = s.tasks.filter((t) => t.status === 'todo').sort((a, b) => a.order - b.order);
  assert.deepEqual(todo.map((t) => t.title), ['Alpha']);
  assert.equal(getTask(s, alpha.id).order, 0);
  assert.equal(getTask(s, beta.id).status, 'doing');
});

test('reorderTask moves a task across columns and normalises order', () => {
  let s = fixture();
  const gamma = s.tasks[2];
  s = reorderTask(s, gamma.id, 0, 'todo');
  const todo = s.tasks.filter((t) => t.status === 'todo').sort((a, b) => a.order - b.order);
  assert.equal(todo[0].title, 'Gamma');
  assert.deepEqual(todo.map((t) => t.order), [0, 1]);
  assert.equal(getTask(s, gamma.id).status, 'todo', 'status is persisted when moving columns');
  assert.equal(todo[0].id, gamma.id);
});

test('reorderTask compacts the column the task left behind', () => {
  let s = emptyState();
  s = addTask(s, { title: 'A' });
  s = addTask(s, { title: 'B' });
  s = addTask(s, { title: 'C' });
  const [a, b, c] = s.tasks;
  // Move C from todo to doing, leaving A and B behind.
  s = reorderTask(s, c.id, 0, 'doing');

  const todo = s.tasks.filter((t) => t.status === 'todo').sort((x, y) => x.order - y.order);
  assert.deepEqual(todo.map((t) => t.title), ['A', 'B']);
  assert.deepEqual(todo.map((t) => t.order), [0, 1], 'no order gaps left behind');
  assert.equal(getTask(s, a.id).status, 'todo');
  assert.equal(getTask(s, b.id).status, 'todo');
  assert.equal(getTask(s, c.id).status, 'doing');
});

test('reorderTask keeps tasks in other columns untouched', () => {
  let s = fixture();
  const betaBefore = { ...getTask(s, s.tasks[1].id) };
  s = reorderTask(s, s.tasks[2].id, 0, 'todo');
  const betaAfter = getTask(s, s.tasks[1].id);
  assert.equal(betaAfter.status, betaBefore.status);
  assert.equal(betaAfter.order, betaBefore.order);
  assert.equal(betaAfter.title, betaBefore.title);
});

test('reorderTask clamps out-of-range indexes and ignores unknown ids', () => {
  let s = fixture();
  const alpha = s.tasks[0];
  s = reorderTask(s, alpha.id, 999, 'todo');
  assert.equal(getTask(s, alpha.id).order, 0);
  assert.equal(reorderTask(s, 'ghost', 0, 'todo'), s);
});

/* ---------------------------------------------------------------- */
/* Note CRUD                                                         */
/* ---------------------------------------------------------------- */

test('addNote prepends, defaults colour and pin state', () => {
  const s = addNote(emptyState(), { title: 'Idea', body: 'text' });
  assert.equal(s.notes.length, 1);
  assert.equal(s.notes[0].color, 'amber');
  assert.equal(s.notes[0].pinned, false);
  const s2 = addNote(s, { title: 'Second' });
  assert.equal(s2.notes[0].title, 'Second', 'newest note first');
});

test('addNote rejects an unsupported colour', () => {
  const s = addNote(emptyState(), { title: 'x', color: 'neon' });
  assert.equal(s.notes[0].color, 'amber');
});

test('updateNote patches and preserves id/createdAt', () => {
  let s = addNote(emptyState(), { title: 'A', body: 'b' });
  const id = s.notes[0].id;
  s = updateNote(s, id, { title: 'B', body: 'c', color: 'sky' });
  assert.equal(s.notes[0].title, 'B');
  assert.equal(s.notes[0].body, 'c');
  assert.equal(s.notes[0].color, 'sky');
  assert.equal(s.notes[0].id, id);
});

test('updateNote with an unknown id is a no-op', () => {
  const s = addNote(emptyState(), { title: 'A' });
  assert.equal(updateNote(s, 'ghost', { title: 'B' }), s);
});

test('deleteNote removes and is a no-op for unknown ids', () => {
  let s = addNote(emptyState(), { title: 'A' });
  s = addNote(s, { title: 'B' });
  const id = s.notes[0].id;
  const next = deleteNote(s, id);
  assert.equal(next.notes.length, 1);
  assert.equal(getNote(next, id), null);
  assert.equal(deleteNote(s, 'ghost'), s);
});

test('toggleNotePin flips the pin flag both ways', () => {
  let s = addNote(emptyState(), { title: 'A' });
  const id = s.notes[0].id;
  s = toggleNotePin(s, id);
  assert.equal(s.notes[0].pinned, true);
  s = toggleNotePin(s, id);
  assert.equal(s.notes[0].pinned, false);
  assert.equal(toggleNotePin(s, 'ghost'), s);
});

/* ---------------------------------------------------------------- */
/* Filtering, sorting, search                                        */
/* ---------------------------------------------------------------- */

test('filterTasks returns everything by default', () => {
  assert.equal(filterTasks(fixture(), { today: TODAY }).length, 3);
});

test('filterTasks filters by status, priority and tag', () => {
  const s = fixture();
  assert.equal(filterTasks(s, { status: 'done', today: TODAY }).length, 1);
  assert.equal(filterTasks(s, { priority: 'high', today: TODAY }).length, 1);
  assert.equal(filterTasks(s, { tag: 'work', today: TODAY }).length, 2);
  assert.equal(filterTasks(s, { tag: 'nope', today: TODAY }).length, 0);
});

test('filterTasks search covers title, notes and tags, and requires all terms', () => {
  const s = fixture();
  assert.equal(filterTasks(s, { query: 'alpha', today: TODAY }).length, 1);
  assert.equal(filterTasks(s, { query: 'shipped', today: TODAY }).length, 1, 'matches notes');
  assert.equal(filterTasks(s, { query: 'home', today: TODAY }).length, 1, 'matches tags');
  assert.equal(filterTasks(s, { query: 'alpha beta', today: TODAY }).length, 0);
  assert.equal(filterTasks(s, { query: 'ALPHA', today: TODAY }).length, 1, 'case-insensitive');
});

test('filterTasks overdueOnly respects due date and completion', () => {
  const s = fixture();
  // Alpha is due 2026-01-10 (past, todo) -> overdue. Gamma is done -> not overdue.
  const overdue = filterTasks(s, { overdueOnly: true, today: TODAY });
  assert.deepEqual(overdue.map((t) => t.title), ['Alpha']);
});

test('filterTasks combines filters as AND', () => {
  const s = fixture();
  const res = filterTasks(s, { status: 'todo', tag: 'work', query: 'alpha', today: TODAY });
  assert.deepEqual(res.map((t) => t.title), ['Alpha']);
  assert.equal(filterTasks(s, { status: 'done', tag: 'work', today: TODAY }).length, 0);
});

test('sortTasks orders by due date with undated last', () => {
  let s = emptyState();
  s = addTask(s, { title: 'No date' });
  s = addTask(s, { title: 'Later', due: '2026-05-01' });
  s = addTask(s, { title: 'Sooner', due: '2026-02-01' });
  const sorted = sortTasks(s.tasks, 'due').map((t) => t.title);
  assert.deepEqual(sorted, ['Sooner', 'Later', 'No date']);
});

test('sortTasks orders by priority, newest and alphabetically', () => {
  const s = fixture();
  assert.equal(sortTasks(s.tasks, 'priority')[0].priority, 'high');
  assert.equal(sortTasks(s.tasks, 'alpha')[0].title, 'Alpha');
  assert.equal(sortTasks(s.tasks, 'created').length, 3);
  assert.deepEqual(sortTasks(s.tasks, 'manual').map((t) => t.order), [0, 1, 2]);
  assert.deepEqual(sortTasks(s.tasks, 'unknown-mode').map((t) => t.order), [0, 1, 2], 'falls back to manual');
});

test('sortTasks does not mutate its input', () => {
  const s = fixture();
  const before = s.tasks.map((t) => t.title);
  sortTasks(s.tasks, 'alpha');
  assert.deepEqual(s.tasks.map((t) => t.title), before);
});

test('allTags returns a sorted unique list', () => {
  assert.deepEqual(allTags(fixture()), ['home', 'work']);
  assert.deepEqual(allTags(emptyState()), []);
});

test('isOverdue and isDueToday behave at the boundary', () => {
  const t = { due: TODAY, status: 'todo' };
  assert.equal(isOverdue(t, TODAY), false, 'due today is not overdue');
  assert.equal(isDueToday(t, TODAY), true);
  assert.equal(isOverdue({ due: '2026-01-14', status: 'todo' }, TODAY), true);
  assert.equal(isOverdue({ due: '2026-01-14', status: 'done' }, TODAY), false);
  assert.equal(isOverdue({ due: null, status: 'todo' }, TODAY), false);
});

test('stats reports counts and completion percentage', () => {
  const s = stats(fixture(), TODAY);
  assert.equal(s.total, 3);
  assert.equal(s.done, 1);
  assert.equal(s.open, 2);
  assert.equal(s.overdue, 1);
  assert.equal(s.notes, 0);
  assert.equal(s.completion, 33);
});

test('stats handles an empty state without dividing by zero', () => {
  const s = stats(emptyState(), TODAY);
  assert.equal(s.completion, 0);
  assert.equal(s.total, 0);
});

/* ---------------------------------------------------------------- */
/* Undo / redo                                                       */
/* ---------------------------------------------------------------- */

test('pushHistory records snapshots and clears the redo stack', () => {
  const s = fixture();
  let h = createHistory(s);
  h = pushHistory(h, s);
  assert.equal(canUndo(h), true);
  h = { ...h, future: ['[]'] };
  h = pushHistory(h, s);
  assert.equal(canRedo(h), false, 'a new action invalidates redo');
});

test('undo restores the previous state and enables redo', () => {
  const s0 = fixture();
  let h = createHistory(s0);
  h = pushHistory(h, s0);
  const s1 = addTask(s0, { title: 'Delta' });
  assert.equal(s1.tasks.length, 4);

  const result = undo(h, s1);
  assert.equal(result.state.tasks.length, 3);
  assert.equal(canRedo(result.history), true);
  assert.equal(result.state.tasks[0].title, 'Alpha');
});

test('redo re-applies the undone change', () => {
  const s0 = fixture();
  let h = createHistory(s0);
  h = pushHistory(h, s0);
  const s1 = addTask(s0, { title: 'Delta' });

  const undone = undo(h, s1);
  const redone = redo(undone.history, undone.state);
  assert.equal(redone.state.tasks.length, 4);
  assert.equal(canRedo(redone.history), false);
});

test('undo and redo return null when the stacks are empty', () => {
  const s = fixture();
  const h = createHistory(s);
  assert.equal(undo(h, s), null);
  assert.equal(redo(h, s), null);
});

test('history is bounded by its limit', () => {
  let s = emptyState();
  let h = createHistory(s, 3);
  for (let i = 0; i < 10; i += 1) {
    s = addTask(s, { title: `t${i}` });
    h = pushHistory(h, s);
  }
  assert.equal(h.past.length, 3);
  assert.equal(createHistory(s).past.length, 0);
});

test('undo snapshots are deep copies, not live references', () => {
  const s0 = fixture();
  let h = pushHistory(createHistory(s0), s0);
  const s1 = updateTask(s0, s0.tasks[0].id, { title: 'Changed' });
  const result = undo(h, s1);
  assert.equal(result.state.tasks[0].title, 'Alpha', 'snapshot was not mutated');
});

/* ---------------------------------------------------------------- */
/* Import / export                                                   */
/* ---------------------------------------------------------------- */

test('exportJSON produces a re-importable payload', () => {
  const s = fixture();
  s.notes = addNote(s, { title: 'Note' }).notes;
  const text = exportJSON(s);
  const parsed = JSON.parse(text);
  assert.equal(parsed.app, 'hng-stage1-todo');
  assert.ok(parsed.exportedAt);
  assert.equal(parsed.tasks.length, 3);

  const back = importJSON(text);
  assert.equal(back.ok, true);
  assert.equal(back.state.tasks.length, 3);
  assert.equal(back.state.notes.length, 1);
});

test('exportJSON refuses to emit an invalid payload', () => {
  const parsed = JSON.parse(exportJSON({ tasks: [{ title: 'ok', status: 'bogus' }] }));
  assert.equal(parsed.tasks[0].status, 'todo');
});

test('importJSON rejects malformed input with a readable error', () => {
  const bad = importJSON('{not json');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /valid JSON/);

  assert.equal(importJSON('null').ok, false);
  assert.equal(importJSON('[1,2,3]').ok, false);
  const wrongShape = importJSON('{"hello":"world"}');
  assert.equal(wrongShape.ok, false);
  assert.match(wrongShape.error, /neither tasks nor notes/);
});

test('importJSON accepts a tasks-only backup', () => {
  const res = importJSON(JSON.stringify({ tasks: [{ title: 'Only task' }] }));
  assert.equal(res.ok, true);
  assert.equal(res.stats.tasks, 1);
  assert.equal(res.stats.notes, 0);
});

test('mergeStates adds new items and keeps existing ones', () => {
  const base = fixture();
  let incoming = emptyState();
  incoming = addTask(incoming, { title: 'Imported' });
  // A task sharing an id must not duplicate or overwrite.
  incoming.tasks.push({ ...base.tasks[0], title: 'Should be ignored' });

  const merged = mergeStates(base, incoming);
  assert.equal(merged.tasks.length, 4);
  assert.equal(merged.tasks.find((t) => t.id === base.tasks[0].id).title, 'Alpha');
  assert.ok(merged.tasks.some((t) => t.title === 'Imported'));
});

test('mergeStates merges notes too', () => {
  const base = addNote(emptyState(), { title: 'Base' });
  const incoming = addNote(emptyState(), { title: 'Incoming' });
  const merged = mergeStates(base, incoming);
  assert.equal(merged.notes.length, 2);
});

/* ---------------------------------------------------------------- */
/* Storage adapter (uses an in-memory fake, never real localStorage)  */
/* ---------------------------------------------------------------- */

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

test('saveState then loadState round-trips', () => {
  const storage = fakeStorage();
  const s = fixture();
  assert.equal(saveState(storage, s, 'k'), true);
  const loaded = loadState(storage, 'k');
  assert.equal(loaded.tasks.length, 3);
  assert.equal(loaded.tasks[0].title, 'Alpha');
});

test('loadState returns an empty state for missing or corrupt data', () => {
  const storage = fakeStorage();
  assert.deepEqual(loadState(storage, 'missing').tasks, []);
  storage.setItem('bad', '{oops');
  assert.deepEqual(loadState(storage, 'bad').tasks, []);
});

test('loadState and saveState tolerate a null storage (private mode)', () => {
  assert.deepEqual(loadState(null).tasks, []);
  assert.equal(saveState(null, fixture()), false);
});

test('saveState reports failure instead of throwing when storage is full', () => {
  const hostile = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(saveState(hostile, fixture()), false);
});
