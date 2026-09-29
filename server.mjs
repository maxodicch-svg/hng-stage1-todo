/**
 * server.mjs — zero-dependency static server + health API.
 *
 * Used for local development and for the endpoint tests in tests/api.test.js.
 * Production deploys to Vercel/Netlify/GitHub Pages as static files; this file
 * only exists so the app can be run and validated locally with plain Node.
 *
 * Run: npm start          (or: node server.mjs --port 4173)
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

/**
 * Extensions the server is willing to serve. Anything else is refused, so
 * backend source, docs and config are never exposed by a static route.
 */
export const SERVEABLE_EXTENSIONS = new Set([
  '.html', '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp',
  '.ico', '.txt', '.map', '.woff2', '.xml', '.webmanifest',
]);

/** Deployment metadata and backend source: never user content. */
const DENIED_EXTENSIONS = new Set(['.mjs', '.cjs', '.md', '.env', '.yml', '.yaml', '.lock']);

/** Exact filenames that are never served even though their extension is allowed. */
const DENIED_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'vercel.json',
  'netlify.toml',
  'agents.md',
]);

/** Resolve a URL path to a file inside ROOT, or null when it escapes/traverses. */
export function resolvePath(urlPath, root = ROOT) {
  // Inspect the RAW path: `new URL()` would silently collapse `..` for us and
  // hide the traversal attempt, so the check has to happen on the raw string.
  const rawPath = String(urlPath || '').split(/[?#]/)[0];

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (rawPath.includes('\0') || pathname.includes('\0')) return null;

  // Reject explicit traversal outright rather than silently collapsing it.
  if (rawPath.split(/[\\/]/).includes('..')) return null;
  if (pathname.split(/[\\/]/).includes('..')) return null;

  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const target = normalize(join(root, pathname));
  if (target !== root && !target.startsWith(root + sep)) return null; // escape guard

  const relative = target.slice(root.length + 1).split(sep);

  // Never serve dotfiles such as .env or .git/config.
  if (relative.some((part) => part.startsWith('.'))) return null;

  const base = relative[relative.length - 1].toLowerCase();
  if (DENIED_FILES.has(base)) return null;
  if (/\.(test|spec)\.[cm]?js$/.test(base)) return null; // test files are not assets

  const ext = extname(base);
  if (!ext || DENIED_EXTENSIONS.has(ext) || !SERVEABLE_EXTENSIONS.has(ext)) return null;

  return target;
}

export function contentTypeFor(filePath) {
  return MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

async function sendJSON(res, status, payload) {
  await send(res, status, JSON.stringify(payload), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

export function createApp(root = ROOT) {
  return createServer(async (req, res) => {
    const method = (req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', 'http://localhost');

    if (method !== 'GET' && method !== 'HEAD') {
      return sendJSON(res, 405, { ok: false, error: 'Method not allowed' });
    }

    // --- API ---------------------------------------------------------
    if (url.pathname === '/api/health') {
      return sendJSON(res, 200, {
        ok: true,
        service: 'taskflow',
        stage: 'HNG-15-Stage-1',
        status: 'healthy',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === '/api/version') {
      return sendJSON(res, 200, {
        ok: true,
        name: 'taskflow',
        schemaVersion: 2,
        features: ['tasks', 'notes', 'kanban', 'search', 'filters', 'undo-redo', 'import-export'],
      });
    }

    if (url.pathname.startsWith('/api/')) {
      return sendJSON(res, 404, { ok: false, error: 'Unknown endpoint' });
    }

    // --- Static files ------------------------------------------------
    const filePath = resolvePath(url.pathname, root);
    if (!filePath) return sendJSON(res, 400, { ok: false, error: 'Bad request' });

    try {
      const info = await stat(filePath);
      if (info.isDirectory()) return sendJSON(res, 404, { ok: false, error: 'Not found' });

      const body = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      const cache = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': contentTypeFor(filePath),
        'Content-Length': body.length,
        'Cache-Control': cache,
      });
      return res.end(method === 'HEAD' ? undefined : body);
    } catch {
      return sendJSON(res, 404, { ok: false, error: 'Not found' });
    }
  });
}

export function startServer({ port = Number(process.env.PORT) || 4173, host = '127.0.0.1' } = {}) {
  const server = createApp();
  return new Promise((ok) => {
    server.listen(port, host, () => ok(server));
  });
}

// Only auto-start when executed directly, never when imported by tests.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const portArgIndex = process.argv.indexOf('--port');
  const port =
    portArgIndex > -1 ? Number(process.argv[portArgIndex + 1]) : Number(process.env.PORT) || 4173;

  startServer({ port }).then((server) => {
    const { port: actual } = server.address();
    console.log(`\n  TaskFlow running at http://127.0.0.1:${actual}\n`);
    console.log(`  Health check:  http://127.0.0.1:${actual}/api/health`);
    console.log('  Press Ctrl+C to stop.\n');
  });
}
