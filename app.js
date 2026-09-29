/**
 * app.js — UI controller for TaskFlow.
 *
 * All state transitions go through src/store.js. This file only:
 *   1. reads the DOM,
 *   2. calls a pure store function,
 *   3. commits the result and re-renders.
 *
 * See AGENTS.md for the rules this file follows.
 */

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
  importJSON,
  loadState,
  mergeStates,
  pushHistory,
  redo,
  reorderTask,
  saveState,
  stats,
  toggleNotePin,
  todayISO,
  undo,
  updateNote,
  updateTask,
  isOverdue,
  SORTS,
} from './src/store.js';
import { buildSeedState, isEmpty } from './src/seed-data.js';

const STORAGE_KEY = 'hng-stage1-todo:v2';
const THEME_KEY = 'hng-stage1-todo:theme';
const PREFS_KEY = 'hng-stage1-todo:prefs';

/* ------------------------------------------------------------------ */
/* App state                                                          */
/* ------------------------------------------------------------------ */

let state = loadState(safeStorage(), STORAGE_KEY);
let history = createHistory(state);
let prefs = loadPrefs();

const COLUMNS = [
  { status: 'todo', label: 'To do' },
  { status: 'doing', label: 'In progress' },
  { status: 'done', label: 'Done' },
];

const $ = (sel) => document.querySelector(sel);

const el = {
  stats: $('#stats'),
  progressBar: $('#progress-bar'),
  taskForm: $('#task-form'),
  title: $('#title'),
  due: $('#due'),
  priority: $('#priority'),
  tags: $('#tags'),
  taskNotes: $('#task-notes'),
  search: $('#search'),
  filterStatus: $('#filter-status'),
  filterPriority: $('#filter-priority'),
  filterTag: $('#filter-tag'),
  sort: $('#sort'),
  overdueOnly: $('#overdue-only'),
  clearFilters: $('#clear-filters'),
  clearCompleted: $('#clear-completed'),
  resultCount: $('#result-count'),
  board: $('#board'),
  noteForm: $('#note-form'),
  noteTitle: $('#note-title'),
  noteColor: $('#note-color'),
  noteBody: $('#note-body'),
  notesGrid: $('#notes-grid'),
  undoBtn: $('#undo-btn'),
  redoBtn: $('#redo-btn'),
  exportBtn: $('#export-btn'),
  importInput: $('#import-input'),
  themeBtn: $('#theme-btn'),
  themeIcon: $('#theme-icon'),
  toast: $('#toast'),
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function safeStorage() {
  try {
    window.localStorage.setItem('__t', '1');
    window.localStorage.removeItem('__t');
    return window.localStorage;
  } catch {
    return null; // Private mode / storage disabled: app still works in memory.
  }
}

function loadPrefs() {
  const fallback = {
    query: '',
    status: 'all',
    priority: 'all',
    tag: 'all',
    sort: 'manual',
    overdueOnly: false,
  };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      sort: SORTS.includes(parsed.sort) ? parsed.sort : 'manual',
    };
  } catch {
    return fallback;
  }
}

function savePrefs() {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* non-fatal */
  }
}

export function escapeHTML(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/** 'YYYY-MM-DD' -> 'Mon 5 Jan' (no timezone surprises). */
function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

let toastTimer = null;
function toast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle('error', Boolean(isError));
  el.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.toast.classList.remove('show'), 2600);
}

/* ------------------------------------------------------------------ */
/* Commit + render                                                    */
/* ------------------------------------------------------------------ */

/**
 * Apply a mutation produced by a store function.
 * @param {object} next      the new state
 * @param {object} [opts]
 * @param {boolean} [opts.history] push an undo snapshot (default true)
 */
function commit(next, opts = {}) {
  const { history: record = true } = opts;
  if (next === state) return; // store functions return the same ref when nothing changed
  if (record) history = pushHistory(history, state);
  state = next;
  saveState(safeStorage(), state, STORAGE_KEY);
  render();
}

function render() {
  renderStats();
  renderBoard();
  renderNotes();
  renderTagOptions();
  renderHistoryButtons();
}

function renderStats() {
  const s = stats(state, todayISO());
  const cells = [
    { label: 'Open', value: s.open },
    { label: 'Done', value: s.done, cls: 'ok' },
    { label: 'Due today', value: s.dueToday, cls: s.dueToday ? 'warn' : '' },
    { label: 'Overdue', value: s.overdue, cls: s.overdue ? 'danger' : '' },
    { label: 'Notes', value: s.notes },
    { label: 'Complete', value: `${s.completion}%` },
  ];
  el.stats.innerHTML = cells
    .map(
      (c) => `<div class="stat ${c.cls || ''}">
        <div class="stat-value">${escapeHTML(c.value)}</div>
        <div class="stat-label">${escapeHTML(c.label)}</div>
      </div>`,
    )
    .join('');
  el.progressBar.style.width = `${s.completion}%`;
}

function visibleTasks() {
  return filterTasks(state, { ...prefs, today: todayISO() });
}

function renderBoard() {
  const today = todayISO();
  const visible = visibleTasks();
  const canReorder = prefs.sort === 'manual' && !prefs.query.trim();

  el.board.innerHTML = COLUMNS.map((col) => {
    const items = visible.filter((t) => t.status === col.status);
    const cards = items.length
      ? items.map((t) => taskCard(t, today)).join('')
      : `<p class="empty">Nothing here yet.</p>`;
    return `<section class="column" data-status="${col.status}" aria-label="${escapeHTML(col.label)}">
      <div class="column-head">
        <span class="column-title">${escapeHTML(col.label)}</span>
        <span class="column-count">${items.length}</span>
      </div>
      <div class="task-list" data-status="${col.status}">${cards}</div>
    </section>`;
  }).join('');

  const total = state.tasks.length;
  const shown = visible.length;
  el.resultCount.textContent =
    shown === total
      ? `${total} task${total === 1 ? '' : 's'}`
      : `Showing ${shown} of ${total} tasks`;
  if (!canReorder && shown) {
    el.resultCount.textContent += ' · drag-to-reorder is available in manual order';
  }
}

function taskCard(task, today) {
  const overdue = isOverdue(task, today);
  const dueToday = task.due === today && task.status !== 'done';
  const dueClass = overdue ? 'overdue' : dueToday ? 'today' : '';
  const chips = [
    task.due
      ? `<span class="chip due ${dueClass}">${overdue ? '⚠ ' : ''}${escapeHTML(formatDate(task.due))}${dueToday ? ' · today' : ''}</span>`
      : '',
    `<span class="chip">${escapeHTML(task.priority)}</span>`,
    ...task.tags.map((tag) => `<span class="chip tag">#${escapeHTML(tag)}</span>`),
  ]
    .filter(Boolean)
    .join('');

  return `<article class="task-card ${task.status === 'done' ? 'done' : ''}"
      data-id="${escapeHTML(task.id)}" data-priority="${escapeHTML(task.priority)}"
      draggable="true" tabindex="0" aria-label="${escapeHTML(task.title)}">
    <div class="task-top">
      <h3 class="task-title">${escapeHTML(task.title)}</h3>
    </div>
    ${task.notes ? `<p class="task-body">${escapeHTML(task.notes)}</p>` : ''}
    <div class="task-meta">${chips}</div>
    <div class="task-actions">
      <button class="btn btn-tiny" type="button" data-action="cycle" data-id="${escapeHTML(task.id)}" title="Cycle status">⇄ Status</button>
      <button class="btn btn-tiny" type="button" data-action="edit" data-id="${escapeHTML(task.id)}">✎ Edit</button>
      <button class="btn btn-tiny" type="button" data-action="delete" data-id="${escapeHTML(task.id)}">🗑 Delete</button>
    </div>
  </article>`;
}

function renderNotes() {
  const notes = [...state.notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  el.notesGrid.innerHTML = notes.length
    ? notes
        .map(
          (n) => `<article class="note-card ${n.pinned ? 'pinned' : ''}" data-color="${escapeHTML(n.color)}" data-id="${escapeHTML(n.id)}">
        <div class="note-head">
          <h3 class="note-title">${n.pinned ? '📌 ' : ''}${escapeHTML(n.title)}</h3>
        </div>
        ${n.body ? `<p class="note-body">${escapeHTML(n.body)}</p>` : ''}
        <div class="note-foot">
          <span>${escapeHTML(relativeTime(n.updatedAt))}</span>
          <span class="task-actions">
            <button class="btn btn-tiny" type="button" data-action="pin-note" data-id="${escapeHTML(n.id)}" title="Pin or unpin">${n.pinned ? 'Unpin' : 'Pin'}</button>
            <button class="btn btn-tiny" type="button" data-action="edit-note" data-id="${escapeHTML(n.id)}">✎</button>
            <button class="btn btn-tiny" type="button" data-action="delete-note" data-id="${escapeHTML(n.id)}">🗑</button>
          </span>
        </div>
      </article>`,
        )
        .join('')
    : '<p class="empty">No notes yet. Add one above.</p>';
}

function renderTagOptions() {
  const tags = allTags(state);
  const current = prefs.tag;
  const options = ['<option value="all">All</option>']
    .concat(tags.map((t) => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`))
    .join('');
  if (el.filterTag.innerHTML !== options) el.filterTag.innerHTML = options;
  el.filterTag.value = tags.includes(current) ? current : 'all';
  if (!tags.includes(current)) prefs.tag = 'all';
}

function renderHistoryButtons() {
  el.undoBtn.disabled = !canUndo(history);
  el.redoBtn.disabled = !canRedo(history);
}

/* ------------------------------------------------------------------ */
/* Task events                                                        */
/* ------------------------------------------------------------------ */

el.taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = el.title.value.trim();
  if (!title) return;
  commit(
    addTask(state, {
      title,
      due: el.due.value || null,
      priority: el.priority.value,
      tags: el.tags.value,
      notes: el.taskNotes.value,
    }),
  );
  el.taskForm.reset();
  el.priority.value = 'medium';
  el.title.focus();
  toast('Task added');
});

el.board.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === 'cycle') {
    commit(cycleStatus(state, id));
  } else if (action === 'delete') {
    const task = state.tasks.find((t) => t.id === id);
    if (task && window.confirm(`Delete "${task.title}"?`)) {
      commit(deleteTask(state, id));
      toast('Task deleted');
    }
  } else if (action === 'edit') {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    const title = window.prompt('Task title:', task.title);
    if (title === null) return;
    const notes = window.prompt('Notes:', task.notes);
    if (notes === null) return;
    const due = window.prompt('Due date (YYYY-MM-DD, blank to clear):', task.due || '');
    if (due === null) return;
    const tags = window.prompt('Tags (comma separated):', task.tags.join(', '));
    if (tags === null) return;
    commit(
      updateTask(state, id, {
        title,
        notes,
        due: due.trim() || null,
        tags,
      }),
    );
    toast('Task updated');
  }
});

/* ---------------- Drag and drop ---------------- */

let draggedId = null;

el.board.addEventListener('dragstart', (event) => {
  const card = event.target.closest('.task-card');
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  try {
    event.dataTransfer.setData('text/plain', draggedId);
  } catch {
    /* older browsers */
  }
});

el.board.addEventListener('dragend', () => {
  document.querySelectorAll('.task-card.dragging').forEach((c) => c.classList.remove('dragging'));
  document.querySelectorAll('.column.drag-over').forEach((c) => c.classList.remove('drag-over'));
  draggedId = null;
});

el.board.addEventListener('dragover', (event) => {
  const column = event.target.closest('.column');
  if (!column) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.column.drag-over').forEach((c) => {
    if (c !== column) c.classList.remove('drag-over');
  });
  column.classList.add('drag-over');
});

el.board.addEventListener('dragleave', (event) => {
  const column = event.target.closest('.column');
  if (column && !column.contains(event.relatedTarget)) column.classList.remove('drag-over');
});

el.board.addEventListener('drop', (event) => {
  const column = event.target.closest('.column');
  if (!column || !draggedId) return;
  event.preventDefault();
  column.classList.remove('drag-over');

  const status = column.dataset.status;
  const list = column.querySelector('.task-list');
  const cards = [...list.querySelectorAll('.task-card')];
  const overCard = event.target.closest('.task-card');
  let index = cards.length;
  if (overCard && overCard.dataset.id !== draggedId) {
    const rect = overCard.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    index = cards.indexOf(overCard) + (after ? 1 : 0);
  }

  commit(reorderTask(state, draggedId, index, status));
});

/* Keyboard nudging for accessibility: arrow keys move a focused card. */
el.board.addEventListener('keydown', (event) => {
  const card = event.target.closest('.task-card');
  if (!card) return;
  const id = card.dataset.id;
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;

  const index = COLUMNS.findIndex((c) => c.status === task.status);
  if (event.key === 'ArrowRight' && index < COLUMNS.length - 1) {
    event.preventDefault();
    commit(updateTask(state, id, { status: COLUMNS[index + 1].status }));
  } else if (event.key === 'ArrowLeft' && index > 0) {
    event.preventDefault();
    commit(updateTask(state, id, { status: COLUMNS[index - 1].status }));
  } else if (event.key === 'Enter' && event.target === card) {
    commit(cycleStatus(state, id));
  }
});

/* ------------------------------------------------------------------ */
/* Notes events                                                       */
/* ------------------------------------------------------------------ */

el.noteForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = el.noteTitle.value.trim();
  if (!title) return;
  commit(addNote(state, { title, body: el.noteBody.value, color: el.noteColor.value }));
  el.noteForm.reset();
  el.noteColor.value = 'amber';
  el.noteTitle.focus();
  toast('Note added');
});

el.notesGrid.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'pin-note') {
    commit(toggleNotePin(state, id));
  } else if (action === 'delete-note') {
    const note = state.notes.find((n) => n.id === id);
    if (note && window.confirm(`Delete note "${note.title}"?`)) {
      commit(deleteNote(state, id));
      toast('Note deleted');
    }
  } else if (action === 'edit-note') {
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    const title = window.prompt('Note title:', note.title);
    if (title === null) return;
    const body = window.prompt('Note body:', note.body);
    if (body === null) return;
    commit(updateNote(state, id, { title, body }));
    toast('Note updated');
  }
});

/* ------------------------------------------------------------------ */
/* Filters                                                            */
/* ------------------------------------------------------------------ */

function syncFilterInputs() {
  el.search.value = prefs.query;
  el.filterStatus.value = prefs.status;
  el.filterPriority.value = prefs.priority;
  el.sort.value = prefs.sort;
  el.overdueOnly.checked = prefs.overdueOnly;
  el.filterTag.value = prefs.tag;
}

let searchTimer = null;
el.search.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    prefs.query = el.search.value;
    savePrefs();
    renderBoard();
  }, 130);
});

el.filterStatus.addEventListener('change', () => {
  prefs.status = el.filterStatus.value;
  savePrefs();
  renderBoard();
});

el.filterPriority.addEventListener('change', () => {
  prefs.priority = el.filterPriority.value;
  savePrefs();
  renderBoard();
});

el.filterTag.addEventListener('change', () => {
  prefs.tag = el.filterTag.value;
  savePrefs();
  renderBoard();
});

el.sort.addEventListener('change', () => {
  prefs.sort = SORTS.includes(el.sort.value) ? el.sort.value : 'manual';
  savePrefs();
  renderBoard();
});

el.overdueOnly.addEventListener('change', () => {
  prefs.overdueOnly = el.overdueOnly.checked;
  savePrefs();
  renderBoard();
});

el.clearFilters.addEventListener('click', () => {
  prefs = { ...prefs, query: '', status: 'all', priority: 'all', tag: 'all', overdueOnly: false };
  savePrefs();
  syncFilterInputs();
  renderBoard();
  toast('Filters reset');
});

el.clearCompleted.addEventListener('click', () => {
  const done = state.tasks.filter((t) => t.status === 'done').length;
  if (!done) return toast('No completed tasks to clear');
  if (!window.confirm(`Remove ${done} completed task${done === 1 ? '' : 's'}?`)) return;
  commit(clearCompleted(state));
  toast(`Cleared ${done} completed task${done === 1 ? '' : 's'}`);
});

/* ------------------------------------------------------------------ */
/* Undo / redo                                                        */
/* ------------------------------------------------------------------ */

function doUndo() {
  const result = undo(history, state);
  if (!result) return toast('Nothing to undo');
  state = result.state;
  history = result.history;
  saveState(safeStorage(), state, STORAGE_KEY);
  syncFilterInputs();
  render();
  toast('Undone');
}

function doRedo() {
  const result = redo(history, state);
  if (!result) return toast('Nothing to redo');
  state = result.state;
  history = result.history;
  saveState(safeStorage(), state, STORAGE_KEY);
  syncFilterInputs();
  render();
  toast('Redone');
}

el.undoBtn.addEventListener('click', doUndo);
el.redoBtn.addEventListener('click', doRedo);

document.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    doUndo();
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault();
    doRedo();
  } else if (key === 's') {
    event.preventDefault();
    doExport();
  }
});

/* ------------------------------------------------------------------ */
/* Import / export                                                    */
/* ------------------------------------------------------------------ */

function doExport() {
  const blob = new Blob([exportJSON(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `taskflow-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Backup downloaded');
}

el.exportBtn.addEventListener('click', doExport);

el.importInput.addEventListener('change', async () => {
  const file = el.importInput.files && el.importInput.files[0];
  if (!file) return;
  const text = await file.text();
  const result = importJSON(text);
  el.importInput.value = '';
  if (!result.ok) return toast(result.error, true);

  const mode = window.confirm(
    `Import ${result.stats.tasks} tasks and ${result.stats.notes} notes.\n\n` +
      'OK = merge with what you already have\nCancel = replace everything',
  );
  const next = mode ? mergeStates(state, result.state) : result.state;
  commit(next);
  toast(`Imported ${result.stats.tasks} tasks and ${result.stats.notes} notes`);
});

/* ------------------------------------------------------------------ */
/* Theme                                                              */
/* ------------------------------------------------------------------ */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  el.themeIcon.textContent = theme === 'dark' ? '☀' : '☾';
  el.themeBtn.setAttribute('aria-pressed', String(theme === 'dark'));
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* non-fatal */
  }
}

el.themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

function initTheme() {
  let stored = null;
  try {
    stored = window.localStorage.getItem(THEME_KEY);
  } catch {
    /* non-fatal */
  }
  if (stored === 'dark' || stored === 'light') return applyTheme(stored);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

/* ------------------------------------------------------------------ */
/* Seed + boot                                                        */
/* ------------------------------------------------------------------ */

function boot() {
  initTheme();
  syncFilterInputs();
  if (isEmpty(state)) {
    const seeded = buildSeedState({ addTask, addNote, emptyState });
    if (seeded !== state) {
      state = seeded;
      saveState(safeStorage(), state, STORAGE_KEY);
    }
  }
  render();
}

boot();

// Exposed for manual debugging in the browser console.
window.taskflow = {
  getState: () => state,
  getHistory: () => history,
  setState: (next) => commit(next),
  render,
};
