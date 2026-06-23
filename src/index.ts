import { Mochi, silenceInternalRoutes } from 'mochi-framework';
import { setupTailwind } from 'mochi-framework/tailwind';
import { routes } from './routes.ts';

const PORT = Number(process.env.PORT) || 3333;

// Compile Tailwind before serving. The top-level await guarantees the generated
// CSS exists for both `mochi-framework build` (which imports this module) and
// the dev/start servers. In dev it also watches sources and rebuilds.
await setupTailwind({
  input: './src/styles/app.css',
  output: './src/styles/app.generated.css',
  minify: process.env.MODE !== 'development',
});

await Mochi.serve({
  port: PORT,
  development: process.env.MODE === 'development',
  htmlShell: './src/shell.html',
  trailingSlash: 'never',
  filters: {
    'consoleLogger:line': silenceInternalRoutes,
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
