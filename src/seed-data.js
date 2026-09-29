/**
 * src/seed-data.js — first-run content for TaskFlow.
 *
 * Kept separate from app.js (and free of any DOM reference) so the seed can be
 * validated in Node by tests/integration.test.js. If a seed record were ever
 * invalid, migrate() would silently repair it and the bug would go unnoticed —
 * this module makes the seed testable instead.
 */

/** Local-date helper (duplicated here deliberately: this module stays dependency-free). */
function isoDay(offsetDays = 0, base = new Date()) {
  const d = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a starter state for a brand-new user.
 * @param {(state: object, input: object) => object} addTask injected store function
 * @param {(state: object, input: object) => object} addNote injected store function
 * @param {(state: object) => object} emptyState injected store function
 * @returns {object} a populated state
 */
export function buildSeedState({ addTask, addNote, emptyState, now = new Date() }) {
  let state = emptyState();

  state = addTask(state, {
    title: 'Review the Stage 1 requirements',
    priority: 'high',
    status: 'done',
    tags: 'hng, admin',
    notes: 'To-Do app, notes feature, one extra feature, deploy publicly.',
  });

  state = addTask(state, {
    title: 'Deploy TaskFlow and test the live URL',
    priority: 'high',
    due: isoDay(0, now),
    tags: 'hng, deploy',
  });

  state = addTask(state, {
    title: 'Add drag-and-drop between board columns',
    priority: 'medium',
    status: 'doing',
    tags: 'hng, feature',
  });

  state = addTask(state, {
    title: 'Write tests for every logic function',
    priority: 'low',
    due: isoDay(0, now),
    tags: 'hng, testing',
  });

  state = addNote(state, {
    title: 'Submission checklist',
    body: 'Live URL • GitHub repo • AGENTS.md • tested endpoints',
    color: 'violet',
    pinned: true,
  });

  return state;
}

/** True when the given state has nothing in it yet. */
export function isEmpty(state) {
  return Boolean(state) && state.tasks.length === 0 && state.notes.length === 0;
}
