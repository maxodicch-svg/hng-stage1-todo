# TaskFlow — HNG Internship 15, Stage 1

A To-Do List web app with a **notes feature**, built entirely with AI for the
HNG Stage 1 assignment.

**Live URL:** _add your deployed URL here after deploying_
**Repository:** https://github.com/maxodicch-svg/hng-stage1-todo

![stack](https://img.shields.io/badge/stack-vanilla%20JS-4f46e5)
![tests](https://img.shields.io/badge/tests-92%20passing-0f9d58)
![deps](https://img.shields.io/badge/runtime%20dependencies-0-0f9d58)

---

## What it does

### Required

- **Create, view, edit and delete tasks** — quick-add form, inline edit, one-click status cycling
- **Notes feature** — separate notes with titles, bodies, colour coding and pinning
- **At least one additional feature** — see below

### Additional features (there are four)

| # | Feature | Detail |
| --- | --- | --- |
| 1 | **Kanban board** | Drag and drop tasks between *To do → In progress → Done*, or press ← → on a focused card |
| 2 | **Search, filter & sort** | Free-text search across titles/notes/tags, filter by status, priority, tag and overdue, sort five ways |
| 3 | **Undo / redo** | 60-step history with `Ctrl+Z` / `Ctrl+Y` |
| 4 | **JSON backup** | Export and re-import all data, either merged or as a replacement |

Extras along the way: due-date tracking with overdue and due-today highlighting,
a progress dashboard, dark mode, and full keyboard support.

---

## Tech stack

Plain **HTML + CSS + ES modules**. No framework, no bundler, no build step, and
**zero runtime dependencies** — which is why it deploys anywhere as static files.
Node.js is used only for the local dev server and the test suite.

Data is stored in the browser's `localStorage`, so the app works offline and
needs no backend or database.

---

## Run it locally

```bash
git clone <your-repo-url>
cd hng-stage1-todo
npm start           # http://127.0.0.1:4173
```

No `npm install` is required — there are no dependencies.

> Opening `index.html` directly with `file://` will not work, because ES modules
> require an HTTP origin. Use `npm start` (or any static server).

---

## Test it

```bash
npm test              # all 92 tests
npm run test:store    # pure state logic
npm run test:api      # HTTP endpoint validation
npm run test:integration  # UI wiring, escaping, seed data
npm run check         # syntax check every JS file
```

The suite covers:

- **56 store tests** — task and note CRUD, filtering, sorting, undo/redo,
  import/export, storage failure handling, and every invalid-input path
- **14 API tests** — `/api/health`, `/api/version`, static routes, `405`/`404`
  handling, and path-traversal / source-leak guards
- **22 integration tests** — every DOM id the UI queries exists, no unescaped
  user content reaches `innerHTML`, labels and keyboard access are wired

> The HTTP tests self-skip with a clear notice on machines where firewall or
> endpoint-protection software blocks Node from connecting to its own loopback
> listener. `fail 0` is the signal to look for.

See [`AGENTS.md`](./AGENTS.md) for the rules that keep this true.

---

## Endpoints

The local server (`server.mjs`) exposes a minimal JSON API used by the tests to
prove the app is actually serving:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check — status, uptime, timestamp |
| `GET` | `/api/version` | Schema version and feature list |
| `GET` | `/` and assets | Static app files |

```bash
curl http://127.0.0.1:4173/api/health
# {"ok":true,"service":"taskflow","status":"healthy",...}
```

> The app itself is client-side, so these endpoints are for validation and
> monitoring. Deployed static hosts serve the app itself; see below for a
> serverless function if you want `/api/health` live too.

---

## Deploy

Everything is static, so any host works. Pick one:

### Vercel (recommended)

1. Push this folder to GitHub (see below).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Framework preset: **Other**. Build command: *none*. Output directory: `.`
4. Deploy, then open the live URL and test it.

`vercel.json` in this repo already sets this up, including `/api/health` as a
serverless function.

### Netlify

1. [app.netlify.com](https://app.netlify.com) → *Add new site* → *Import from Git*
2. Build command: *none*. Publish directory: `.`
3. Deploy. `netlify.toml` is already configured.

### GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → `main` / `root`.

---

## Push to GitHub (beginner-friendly)

```bash
cd hng-stage1-todo
git init
git add .
git commit -m "feat: TaskFlow to-do app with notes for HNG Stage 1"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Then copy the repository URL into the two placeholders at the top of this file.

---

## Project structure

```
index.html                 markup + accessibility contract
styles.css                 design tokens, layout, dark mode
app.js                     UI controller (DOM -> store -> render)
src/store.js               pure state logic, no browser APIs
src/seed-data.js           first-run demo content
api/health.js              serverless health endpoint (Vercel)
server.mjs                 local static server + API
tests/                     92 tests across three suites
AGENTS.md                  rules for AI coding agents
```

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Tab` / `Shift+Tab` | Move focus |
| `←` / `→` | Move a focused task between columns |
| `Enter` | Cycle a focused task's status |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+S` | Download a JSON backup |

## Data & privacy

All data stays in your browser's `localStorage`. Nothing is uploaded anywhere.
Use **Export** to download a backup before clearing your browser data.

## Licence

MIT
