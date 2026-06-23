import { Mochi, silenceInternalRoutes } from 'mochi-framework';
import { routes } from './routes.ts';
import { basicAuth } from './lib/auth.server.ts';
import { handleProxyRequest, PROXY_PREFIX } from './lib/proxy.server.ts';
import { BASIC_AUTH_PASSWORD } from './lib/config.server.ts';

const PORT = Number(process.env.PORT) || 3333;

if (!BASIC_AUTH_PASSWORD) {
  console.warn('⚠ BASIC_AUTH_PASSWORD is not set — the UI and all instances are unprotected.');
}

await Mochi.serve({
  port: PORT,
  development: process.env.MODE === 'development',
  htmlShell: './src/shell.html',
  trailingSlash: 'never',
  // Gate the whole app (UI, APIs, proxy) behind one Basic Auth password.
  handle: basicAuth,
  // Catch-all reverse proxy: anything under /p/<id>/ goes to that instance's
  // code-server; other unmatched paths 404.
  fetch: async (req, server) =>
    (await handleProxyRequest(req, server)) ?? new Response('Not found', { status: 404 }),
  filters: {
    'consoleLogger:line': silenceInternalRoutes,
    // The proxy owns trailing slashes under /p/ (code-server needs "/p/<id>/"),
    // so exempt those paths from the global trailingSlash:'never' policy.
    'trailingSlash:redirect': (computed, { url }) =>
      url.pathname.startsWith(PROXY_PREFIX + '/') ? null : computed,
  },
  routes,
});

const url = 'http://localhost:' + PORT;
console.log('Server running at ' + url);

// Open the web UI in the user's default browser on startup.
// Set DISABLE_OPEN_BROWSER=1 to skip (e.g. headless or Claude Code runs).
if (process.env.DISABLE_OPEN_BROWSER !== '1') {
  const openCmd =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];
  try {
    Bun.spawn(openCmd, { stdout: 'ignore', stderr: 'ignore' });
  } catch {
    // Browser launch is best-effort; ignore failures (e.g. headless environments).
  }
}
