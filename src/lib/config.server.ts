import { homedir } from 'node:os';
import { join } from 'node:path';

/** Root directory where all manager state lives, outside the project tree. */
export const DATA_DIR = join(homedir(), '.devcontainers-manager');

/** Per-instance working copies live here: <INSTANCES_DIR>/<id>/workspace. */
export const INSTANCES_DIR = join(DATA_DIR, 'instances');

/** SQLite database holding the durable record of every instance. */
export const DB_PATH = join(DATA_DIR, 'app.sqlite');

/** First host port handed out to a code-server instance; subsequent ones count up. */
export const PORT_BASE = 8001;
export const PORT_MAX = 8999;

/** Port code-server listens on *inside* every container. */
export const CODE_SERVER_PORT = 8080;

/** Image used when a selected folder has no .devcontainer/devcontainer.json. */
export const DEFAULT_IMAGE = 'mcr.microsoft.com/devcontainers/universal:2';

/** Directories skipped when copying a source folder into an instance workspace. */
export const COPY_IGNORE = new Set(['node_modules', '.git']);

/** Resolve the bundled @devcontainers/cli binary, preferring the local install. */
export function devcontainerBin(): string {
  return join(process.cwd(), 'node_modules', '.bin', 'devcontainer');
}
