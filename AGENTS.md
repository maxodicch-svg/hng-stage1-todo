# AGENTS.md

Persistent context for any AI coding agent working in this repository.
Read this file before making changes. These rules are not suggestions.

---

## 1. Project

**TaskFlow** — a To-Do List web app with a notes feature, built for the
**HNG Internship 15, Stage 1** assignment ("AI Product Builder / Engineer").

| Item | Value |
| --- | --- |
| Live URL | _to be filled in after deployment_ |
| Repository | _to be filled in after pushing to GitHub_ |
| Stack | Vanilla HTML + CSS + ES modules. Zero runtime dependencies. |
| Runtime | Node.js >= 20 (for the dev server and tests only) |
| Persistence | Browser `localStorage`, plus JSON export/import |
| Deployment | Vercel / Netlify / GitHub Pages (static) |

### Assignment requirements mapped to code

| Requirement | Where |
| --- | --- |
| Create tasks | `addTask` in `src/store.js`, form `#task-form` in `index.html` |
| View tasks | `renderBoard` in `app.js` (three-column Kanban board) |
| Edit / update tasks | `updateTask`, `cycleStatus`, `setStatus`, drag-and-drop |
| Delete tasks | `deleteTask`, `clearCompleted` |
| **Notes feature** | `addNote` / `updateNote` / `deleteNote`, `#note-form`, `renderNotes` |
| **Extra feature 1** | Search + filter + sort — `filterTasks`, `sortTasks` |
| **Extra feature 2** | Undo / redo history — `createHistory` / `undo` / `redo` |
| **Extra feature 3** | JSON export / import backup — `exportJSON` / `importJSON` |
| **Extra feature 4** | Overdue + due-today tracking, progress dashboard |
| Testing rules | this file, `tests/` |

---

## 2. Architecture rules

The single most important rule in this repo:

> **`src/store.js` is pure. `app.js` is dumb. The DOM is never the source of truth.**

```
index.html      markup + accessibility contract (ids are an API)
styles.css      design tokens + layout (no per-component class soup)
src/store.js    PURE state logic. No DOM, no browser APIs, no side effects.
app.js          UI controller: reads DOM -> calls store -> commits -> re-renders
server.mjs      zero-dependency static server + /api endpoints (local only)
tests/          node:test suites, one per concern
```

### Rules for `src/store.js`

1. **MUST NOT** reference `document`, `window`, `localStorage`, `innerHTML`, or any
   browser API. Storage is injected as a parameter (`loadState(storage, key)`).
   `tests/integration.test.js` enforces this and will fail the build otherwise.
2. Every function is **pure**: it takes a state and returns a **new** state.
   Never mutate the argument — always spread (`{ ...state, tasks: [...] }`).
3. A function that changes nothing **MUST return the same object reference**,
   so callers can cheaply detect a no-op (`if (next === state) return;`).
4. `id` and `createdAt` are **immutable** after creation. `updatedAt` changes on
   every mutation.
5. **Never throw on bad input.** Coerce it: `migrate()` repairs any junk payload,
   `isValidDate()` rejects impossible dates like `2026-02-31`. A corrupt
   `localStorage` value must never white-screen the app.
6. New persisted fields require a `SCHEMA_VERSION` bump in `src/store.js` **and**
   a migration path in `migrate()`.
7. Add a named export for anything the UI needs; no default exports.

### Rules for `app.js`

1. State transitions go through a store function only. **Never** mutate `state`
   directly in the UI layer.
2. All mutations funnel through `commit(nextState)`, which pushes an undo
   snapshot, persists, and re-renders. Do not call `saveState` or `render`
   from a click handler directly.
3. **Escape every dynamic value** inserted into an HTML string with
   `escapeHTML()`. Never interpolate raw user content into `innerHTML`.
   `tests/integration.test.js` scans for violations.
4. Any new `$('#id')` lookup **MUST** have a matching `id` in `index.html`.
   A test enforces this — adding a lookup without the markup fails the suite.
5. Keep rendering idempotent: `render()` may be called any number of times.

### Rules for `server.mjs`

1. Zero dependencies — Node built-ins only. No `express`, no bundler.
2. Any new `/api/*` endpoint **MUST** be added to `tests/api.test.js` in the same
   commit (happy path **and** failure path).
3. Never widen the static file allow-list (`SERVEABLE_EXTENSIONS`) without
   updating the traversal/leak tests. The server must never expose `.mjs`,
   `.md`, `.env`, dotfiles, or `package.json`.

---

## 3. Testing and validation rules

> "Write tests for all the endpoints that you create and always validate that
> these endpoints are working."

This is a hard requirement of the assignment, not an aspiration.

### Commands

```bash
npm test           # run all suites
npm run test:store # pure logic only
npm run test:api   # HTTP endpoints only
npm run check      # syntax-check every JS file
npm start          # run locally on http://127.0.0.1:4173
```

### What must be tested

| Change | Required test |
| --- | --- |
| New store function | Happy path + no-op/unknown-id path + invalid input path |
| New/changed `filterTasks` option | Included in a filtering test |
| New persisted field | Round-trip through `migrate()` and `saveState`/`loadState` |
| **New API endpoint** | **Status code, content type, JSON body shape, and an error path** |
| New DOM id or control | Covered by the wiring test in `tests/integration.test.js` |
| Bug fix | A regression test that fails before the fix and passes after |

### Non-negotiable quality gates

Before any commit, all of these must hold:

1. `npm test` — **0 failing tests**. A green run is required; do not commit red.
2. `npm run check` — no syntax errors.
3. No `console.log` left in `app.js` or `src/store.js`.
4. No `TODO`/`FIXME` without a linked issue number.
5. The app boots from an empty `localStorage` **and** from a corrupt one.
6. Every user-facing string is escaped before it reaches the DOM.

### Definition of done (feature)

- [ ] Logic lives in `src/store.js` as a pure function
- [ ] UI wired in `app.js` through `commit()`
- [ ] Unit tests added, `npm test` green
- [ ] Accessibility preserved (label, `aria-*`, keyboard path)
- [ ] Works on mobile width (<= 820px single-column board)
- [ ] `README.md` updated if user-visible behaviour changed

---

## 4. Code style

- **Language**: modern ES modules (`import`/`export`), `const` by default.
- **Semicolons**: yes. **Quotes**: single, in JS; double in HTML attributes.
- **Indentation**: 2 spaces. Max line length ~100 characters.
- **Naming**: `camelCase` functions/variables, `UPPER_SNAKE_CASE` constants,
  `kebab-case` CSS classes and file names.
- **Functions**: small and single-purpose. If it needs a paragraph to explain,
  split it.
- **Comments**: explain *why*, not *what*. Keep the JSDoc block on every exported
  store function (parameters, return shape, edge cases).
- **CSS**: use the custom properties in `:root` (`--brand`, `--surface`,
  `--danger`, ...). Never hard-code a hex value that already exists as a token.
  Dark mode is driven by `html[data-theme='dark']`.
- **Dependencies**: adding a runtime dependency requires justification in the PR
  description. The default answer is no — the zero-dependency property is what
  makes this project deployable anywhere with no build step.

---

## 5. Accessibility requirements

Non-negotiable, checked in review:

- Every input has a real `<label for="...">`.
- Icon-only buttons carry `aria-label` or a `.sr-only` text span.
- Status changes announce through an `aria-live` region (`#toast`, `#result-count`).
- Full keyboard path: `Tab` to move, arrows move a focused task between columns,
  `Enter` cycles status, `Ctrl+Z` / `Ctrl+Y` for undo/redo, `Ctrl+S` exports.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Never communicate state by colour alone — pair it with text or an icon.

---

## 6. Git and commit conventions

- **Conventional Commits**: `feat:`, `fix:`, `test:`, `docs:`, `style:`,
  `refactor:`, `chore:`.
- One logical change per commit; tests ship with the code they cover.
- Never commit: `node_modules/`, `.env`, editor folders, OS junk, or generated
  backups (`taskflow-backup-*.json`).
- Never commit directly to `main` on a team repo — branch, then open a PR.

---

## 7. Deployment checklist

- [ ] `npm test` green locally
- [ ] `AGENTS.md` present at the repository root (assignment requirement)
- [ ] `README.md` documents the live URL and how to run
- [ ] Pushed to GitHub
- [ ] Connected to Vercel / Netlify / GitHub Pages — publish directory: repository root
- [ ] Live URL opened and **manually tested**: add, edit, complete, delete, notes,
      search, undo, export/import, and a page refresh for persistence
- [ ] Live URL submitted through the official Zedu Stage 1 form before the deadline

---

## 8. Prompting conventions for AI agents

The lesson emphasises **short, iterative instructions** over one giant prompt.
When working with an agent on this repo:

1. Ask for one change at a time, then run the app and look at the result.
2. Report the concrete symptom ("clicking Delete throws `deleteTask is not a
   function`") rather than a vague goal.
3. Ask the agent to run `npm test` after every change and show the output.
4. Prefer "fix X in `src/store.js` and add a regression test" over "rewrite the
   state layer".

Useful prompts that this file is designed to answer:

- _"Write tests for all the endpoints that you create and always validate that
  these endpoints are working."_
- _"Is there any other thing of note we should have in this file?"_
- _"How do I get this into GitHub? Make it simple for beginners."_
