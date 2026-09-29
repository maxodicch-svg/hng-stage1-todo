/**
 * api/health.js — serverless health endpoint.
 *
 * Vercel maps this file to GET /api/health in production. It mirrors the
 * response from server.mjs so the local and deployed contracts match exactly.
 * Node built-ins only; no dependencies.
 */

export default function handler(req, res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(
    JSON.stringify({
      ok: true,
      service: 'taskflow',
      stage: 'HNG-15-Stage-1',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    }),
  );
}
