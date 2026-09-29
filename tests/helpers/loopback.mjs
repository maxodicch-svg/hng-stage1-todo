/**
 * tests/helpers/loopback.mjs
 *
 * Some locked-down Windows machines (Sophos / endpoint-protection firewall
 * rules) block a Node process from connecting to a listener it just opened
 * itself, even on 127.0.0.1. That is an environment restriction, not a bug in
 * this project, so the HTTP tests are skipped with a visible notice instead of
 * reporting a misleading failure.
 *
 * The pure-logic tests (resolvePath, contentTypeFor, the serverless handler)
 * always run regardless.
 */

import { createServer } from 'node:http';

/** @returns {Promise<boolean>} true when Node can fetch its own loopback listener. */
export async function loopbackFetchWorks() {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

export const LOOPBACK_SKIP_REASON =
  'Loopback HTTP is blocked by this machine\'s firewall/security software ' +
  '(not a project failure). Start the app with START-HERE.cmd and test in a ' +
  'browser instead, or run these tests on a machine without that restriction.';
