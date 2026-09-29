/**
 * store.js — Pure state logic for the HNG Stage 1 To-Do app.
 *
 * DELIBERATELY DEPENDENCY-FREE AND DOM-FREE.
 * Every exported function is a pure function over plain JSON data, which is
 * what makes the whole app testable with the Node built-in test runner
 * (see tests/store.test.js). See AGENTS.md for the rules this file follows.
 *
 * Data shape:
 *   {
 *     version: 2,
 *     tasks: [ Task ],
 *     notes: [ Note ],
 *     updatedAt: ISO string
 *   }
 *
 *   Task = {
 *     id: string, title: string, notes: string,
 *     status: 'todo' | 'doing' | 'done',
 *     priority: 'low' | 'medium' | 'high',
 *     due: string | null,          // 'YYYY-MM-DD'
 *     tags: string[],
 *     order: number,
 *     createdAt: ISO, updatedAt: ISO
 *   }
 *
 *   Note = { id, title, body, color, pinned: boolean, createdAt, updatedAt }
 */

export const SCHEMA_VERSION = 2;

export const STATUSES = ['todo', 'doing', 'done'];
export const PRIORITIES = ['low', 'medium', 'high'];
export const NOTE_COLORS = ['amber', 'rose', 'violet', 'sky', 'emerald', 'slate'];

const MAX_UNDO = 60;

/* ------------------------------------------------------------------ */
/* Utilities                                                          */
/* ------------------------------------------------------------------ */

let idCounter = 0;

/** Collision-resistant id without any dependency. */
export function uid(prefix = 'id') {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

function now() {
  return new Date().toISOString();
}

function clampString(value, max = 500) {
  const str = value == null ? '' : String(value);
  return str.trim().slice(0, max);
}

/** Normalise a tag list: strings only, trimmed, deduped, case-insensitive. */
export function normaliseTags(tags) {
  const input = Array.isArray(tags)
    ? tags
    : String(tags || '').split(',');
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const tag = clampString(raw, 32).toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Empty state + validation                                           */
/* ------------------------------------------------------------------ */

export function emptyState() {
  return { version: SCHEMA_VERSION, tasks: [], notes: [], updatedAt: now() };
}

/**
 * Coerce anything into a valid state object. Never throws.
 * Used for localStorage reads, file imports and tests.
 */
export function migrate(input) {
  const state = emptyState();
  if (!input || typeof input !== 'object') return state;

  const rawTasks = Array.isArray(input.tasks) ? input.tasks : [];
  const rawNotes = Array.isArray(input.notes) ? input.notes : [];

  state.tasks = rawTasks
    .filter((t) => t && typeof t === 'object')
    .map((t, i) => normaliseTask(t, i));
  state.notes = rawNotes
    .filter((n) => n && typeof n === 'object')
    .map((n) => normaliseNote(n));

  state.version = SCHEMA_VERSION;
  state.updatedAt = typeof input.updatedAt === 'string' ? input.updatedAt : now();
  return state;
}

function normaliseTask(t, index) {
  const created = typeof t.createdAt === 'string' ? t.createdAt : now();
  return {
    id: typeof t.id === 'string' && t.id ? t.id : uid('task'),
    title: clampString(t.title, 200) || 'Untitled task',
    notes: clampString(t.notes, 4000),
    status: STATUSES.includes(t.status) ? t.status : 'todo',
    priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
    due: isValidDate(t.due) ? t.due : null,
    tags: normaliseTags(t.tags),
    order: Number.isFinite(t.order) ? t.order : index,
    createdAt: created,
    updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : created,
  };
}

function normaliseNote(n) {
  const created = typeof n.createdAt === 'string' ? n.createdAt : now();
  return {
    id: typeof n.id === 'string' && n.id ? n.id : uid('note'),
    title: clampString(n.title, 200) || 'Untitled note',
    body: clampString(n.body, 20000),
    color: NOTE_COLORS.includes(n.color) ? n.color : 'amber',
    pinned: Boolean(n.pinned),
    createdAt: created,
    updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt : created,
  };
}

/** True only for a real 'YYYY-MM-DD' calendar date. */
export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Reject rollovers such as 2026-02-31.
  return d.toISOString().slice(0, 10) === value;
}

/* ------------------------------------------------------------------ */
/* Tasks — create / read / update / delete                            */
/* ------------------------------------------------------------------ */

export function addTask(state, input = {}) {
  const task = normaliseTask(
    {
      ...input,
      id: input.id || uid('task'),
      createdAt: now(),
      updatedAt: now(),
      order: nextOrder(state),
    },
    state.tasks.length,
  );
  return {
    ...state,
    tasks: [...state.tasks, task],
    updatedAt: now(),
  };
}

function nextOrder(state) {
  return state.tasks.reduce((max, t) => Math.max(max, Number(t.order) || 0), -1) + 1;
}

export function updateTask(state, id, patch = {}) {
  let found = false;
  const tasks = state.tasks.map((t) => {
    if (t.id !== id) return t;
    found = true;
    const merged = normaliseTask({ ...t, ...patch, id: t.id, createdAt: t.createdAt }, t.order);
    merged.updatedAt = now();
    return merged;
  });
  if (!found) return state;
  return { ...state, tasks, updatedAt: now() };
}

export function deleteTask(state, id) {
  const tasks = state.tasks.filter((t) => t.id !== id);
  if (tasks.length === state.tasks.length) return state;
  return { ...state, tasks, updatedAt: now() };
}

export function getTask(state, id) {
  return state.tasks.find((t) => t.id === id) || null;
}

/** Cycle todo -> doing -> done -> todo. */
export function cycleStatus(state, id) {
  const task = getTask(state, id);
  if (!task) return state;
  const next = STATUSES[(STATUSES.indexOf(task.status) + 1) % STATUSES.length];
  return updateTask(state, id, { status: next });
}

/** Set an explicit status, e.g. from a drag-and-drop move. */
export function setStatus(state, id, status) {
  if (!STATUSES.includes(status)) return state;
  return updateTask(state, id, { status });
}

/** Move a task within a status column (by drag position). */
export function reorderTask(state, id, toIndex, status) {
  const task = getTask(state, id);
  if (!task) return state;
  const target = STATUSES.includes(status) ? status : task.status;

  // The destination column without the moved task, in current display order.
  const column = state.tasks
    .filter((t) => t.status === target && t.id !== id)
    .sort((a, b) => a.order - b.order);

  const index = Math.max(0, Math.min(Number(toIndex) || 0, column.length));
  column.splice(index, 0, { ...task, status: target, updatedAt: now() });

  // Renumber the destination column, and also compact the column the task
  // left behind so it has no gaps.
  const orderById = new Map(column.map((t, i) => [t.id, i]));
  const statusById = new Map(column.map((t) => [t.id, target]));

  if (task.status !== target) {
    const remaining = state.tasks
      .filter((t) => t.status === task.status && t.id !== id)
      .sort((a, b) => a.order - b.order);
    remaining.forEach((t, i) => orderById.set(t.id, i));
  }

  const tasks = state.tasks.map((t) => {
    if (!orderById.has(t.id)) return t;
    const next = { ...t, order: orderById.get(t.id) };
    if (statusById.has(t.id)) {
      next.status = statusById.get(t.id);
      next.updatedAt = now();
    }
    return next;
  });

  return { ...state, tasks, updatedAt: now() };
}

export function clearCompleted(state) {
  return { ...state, tasks: state.tasks.filter((t) => t.status !== 'done'), updatedAt: now() };
}

/* ------------------------------------------------------------------ */
/* Notes — create / read / update / delete                            */
/* ------------------------------------------------------------------ */

export function addNote(state, input = {}) {
  const note = normaliseNote({
    ...input,
    id: input.id || uid('note'),
    createdAt: now(),
    updatedAt: now(),
  });
  return { ...state, notes: [note, ...state.notes], updatedAt: now() };
}

export function updateNote(state, id, patch = {}) {
  let found = false;
  const notes = state.notes.map((n) => {
    if (n.id !== id) return n;
    found = true;
    const merged = normaliseNote({ ...n, ...patch, id: n.id, createdAt: n.createdAt });
    merged.updatedAt = now();
    return merged;
  });
  if (!found) return state;
  return { ...state, notes, updatedAt: now() };
}

export function deleteNote(state, id) {
  const notes = state.notes.filter((n) => n.id !== id);
  if (notes.length === state.notes.length) return state;
  return { ...state, notes, updatedAt: now() };
}

export function getNote(state, id) {
  return state.notes.find((n) => n.id === id) || null;
}

export function toggleNotePin(state, id) {
  const note = getNote(state, id);
  if (!note) return state;
  return updateNote(state, id, { pinned: !note.pinned });
}

/* ------------------------------------------------------------------ */
/* Search + filter + sort (additional feature)                        */
/* ------------------------------------------------------------------ */

export const SORTS = ['manual', 'due', 'priority', 'created', 'alpha'];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Filter, search and sort tasks for display.
 * @param {object} state
 * @param {object} opts
 * @param {string} [opts.query]    free text over title, notes and tags
 * @param {string} [opts.status]   'all' | 'todo' | 'doing' | 'done'
 * @param {string} [opts.priority] 'all' | 'low' | 'medium' | 'high'
 * @param {string} [opts.tag]      'all' | tag name
 * @param {boolean} [opts.overdueOnly]
 * @param {string} [opts.sort]     one of SORTS
 * @param {string} [opts.today]    'YYYY-MM-DD' reference day (injectable for tests)
 */
export function filterTasks(state, opts = {}) {
  const {
    query = '',
    status = 'all',
    priority = 'all',
    tag = 'all',
    overdueOnly = false,
    sort = 'manual',
    today = todayISO(),
  } = opts;

  const q = String(query).trim().toLowerCase();
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];

  let tasks = state.tasks.filter((t) => {
    if (status !== 'all' && t.status !== status) return false;
    if (priority !== 'all' && t.priority !== priority) return false;
    if (tag !== 'all' && !t.tags.includes(String(tag).toLowerCase())) return false;
    if (overdueOnly && !isOverdue(t, today)) return false;
    if (terms.length) {
      const haystack = `${t.title} ${t.notes} ${t.tags.join(' ')}`.toLowerCase();
      // Every search term must appear somewhere in the task.
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });

  tasks = sortTasks(tasks, sort);
  return tasks;
}

export function sortTasks(tasks, sort = 'manual') {
  const list = [...tasks];
  switch (sort) {
    case 'due':
      // Undated tasks sink to the bottom.
      return list.sort((a, b) => {
        if (!a.due && !b.due) return a.order - b.order;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due) || a.order - b.order;
      });
    case 'priority':
      return list.sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order,
      );
    case 'created':
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'alpha':
      return list.sort((a, b) => a.title.localeCompare(b.title));
    case 'manual':
    default:
      return list.sort((a, b) => a.order - b.order);
  }
}

/** All distinct tags in the state, sorted. */
export function allTags(state) {
  const set = new Set();
  for (const t of state.tasks) for (const tag of t.tags) set.add(tag);
  return [...set].sort();
}

export function todayISO(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

/** Overdue = has a due date in the past and is not done. */
export function isOverdue(task, today = todayISO()) {
  return Boolean(task.due) && task.due < today && task.status !== 'done';
}

export function isDueToday(task, today = todayISO()) {
  return task.due === today;
}

/** Counts for the dashboard header. */
export function stats(state, today = todayISO()) {
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.status === 'done').length;
  const overdue = state.tasks.filter((t) => isOverdue(t, today)).length;
  const dueToday = state.tasks.filter((t) => isDueToday(t, today) && t.status !== 'done').length;
  return {
    total,
    done,
    open: total - done,
    overdue,
    dueToday,
    notes: state.notes.length,
    completion: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/* ------------------------------------------------------------------ */
/* Undo / redo (additional feature)                                   */
/* ------------------------------------------------------------------ */

export function createHistory(state, limit = MAX_UNDO) {
  return { past: [], future: [], limit };
}

/** Snapshot `state` into history before a mutation. Returns a new history. */
export function pushHistory(history, state) {
  const past = [...history.past, JSON.stringify(state)];
  while (past.length > history.limit) past.shift();
  return { ...history, past, future: [] };
}

export function canUndo(history) {
  return history.past.length > 0;
}

export function canRedo(history) {
  return history.future.length > 0;
}

/** @returns {{state: object, history: object}|null} null when nothing to undo. */
export function undo(history, currentState) {
  if (!history.past.length) return null;
  const past = [...history.past];
  const previous = JSON.parse(past.pop());
  const future = [JSON.stringify(currentState), ...history.future].slice(0, history.limit);
  return { state: previous, history: { ...history, past, future } };
}

export function redo(history, currentState) {
  if (!history.future.length) return null;
  const future = [...history.future];
  const next = JSON.parse(future.shift());
  const past = [...history.past, JSON.stringify(currentState)];
  while (past.length > history.limit) past.shift();
  return { state: next, history: { ...history, past, future } };
}

/* ------------------------------------------------------------------ */
/* Import / export (additional feature)                               */
/* ------------------------------------------------------------------ */

export function exportJSON(state) {
  const clean = migrate(state);
  clean.exportedAt = now();
  clean.app = 'hng-stage1-todo';
  return JSON.stringify(clean, null, 2);
}

/**
 * Parse an exported JSON payload.
 * @returns {{ok: true, state: object, stats: object} | {ok: false, error: string}}
 */
export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text));
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Expected a To-Do backup object.' };
  }
  if (!Array.isArray(parsed.tasks) && !Array.isArray(parsed.notes)) {
    return { ok: false, error: 'Backup contains neither tasks nor notes.' };
  }
  const state = migrate(parsed);
  return {
    ok: true,
    state,
    stats: { tasks: state.tasks.length, notes: state.notes.length },
  };
}

/** Merge an imported state into the current one without losing data. */
export function mergeStates(base, incoming) {
  const tasks = new Map(base.tasks.map((t) => [t.id, t]));
  for (const t of incoming.tasks) if (!tasks.has(t.id)) tasks.set(t.id, t);
  const notes = new Map(base.notes.map((n) => [n.id, n]));
  for (const n of incoming.notes) if (!notes.has(n.id)) notes.set(n.id, n);

  return {
    ...base,
    tasks: [...tasks.values()],
    notes: [...notes.values()],
    updatedAt: now(),
  };
}

/* ------------------------------------------------------------------ */
/* Storage adapter (kept injectable so tests never touch localStorage) */
/* ------------------------------------------------------------------ */

export function loadState(storage, key = 'hng-stage1-todo:v2') {
  if (!storage) return emptyState();
  try {
    const raw = storage.getItem(key);
    if (!raw) return emptyState();
    return migrate(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

export function saveState(storage, state, key = 'hng-stage1-todo:v2') {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(migrate(state)));
    return true;
  } catch {
    return false;
  }
}
