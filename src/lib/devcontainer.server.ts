import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  CODE_SERVER_PORT,
  COPY_IGNORE,
  DEFAULT_IMAGE,
  devcontainerBin,
} from './config.server.ts';

const CODE_SERVER_FEATURE = 'ghcr.io/coder/devcontainer-features/code-server:1';

/** Where the override config file is staged inside the copied workspace. */
const CODE_SERVER_SETTINGS_FILE = 'code-server-settings.json';

/** Default code-server (VS Code) user settings: dark theme, no agent chat panel. */
const CODE_SERVER_SETTINGS = {
  'workbench.colorTheme': 'Default Dark Modern',
  'workbench.secondarySideBar.defaultVisibility': 'hidden',
  'chat.commandCenter.enabled': false,
};

/** Copy the staged settings into code-server's user-data dir before first launch. */
const CODE_SERVER_APPLY_SETTINGS =
  `mkdir -p ~/.local/share/code-server/User && ` +
  `cp -f \\"$PWD/.devcontainer/${CODE_SERVER_SETTINGS_FILE}\\" ` +
  `~/.local/share/code-server/User/settings.json 2>/dev/null;`;

/** Launch code-server on every container start, idempotently, bound for host access. */
const CODE_SERVER_LAUNCH =
  `bash -c "${CODE_SERVER_APPLY_SETTINGS} ` +
  `pgrep -f 'code-server.*${CODE_SERVER_PORT}' >/dev/null 2>&1 || ` +
  `nohup code-server --bind-addr 0.0.0.0:${CODE_SERVER_PORT} --auth none ` +
  `--disable-workspace-trust \\"$PWD\\" >/tmp/code-server.log 2>&1 &"`;

/** Whether the bundled @devcontainers/cli binary is runnable. */
export async function devcontainerCliAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn([devcontainerBin(), '--version'], { stdout: 'pipe', stderr: 'pipe' });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

/** Recursively copy a source folder into the instance workspace, skipping COPY_IGNORE dirs. */
export async function copyWorkspace(source: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  await cp(source, dest, {
    recursive: true,
    dereference: false,
    filter: (src) => !COPY_IGNORE.has(basename(src)),
  });
}

/** Strip // and /* *\/ comments and trailing commas from JSONC, respecting string literals. */
function stripJsonc(input: string): string {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    out += ch;
  }
  // Remove trailing commas before } or ].
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/** Find the devcontainer.json the CLI would use for a workspace folder. */
function configPath(workspaceDir: string): string {
  const nested = join(workspaceDir, '.devcontainer', 'devcontainer.json');
  if (existsSync(nested)) return nested;
  const flat = join(workspaceDir, '.devcontainer.json');
  if (existsSync(flat)) return flat;
  return nested; // default location to create
}

type DevcontainerConfig = {
  image?: string;
  features?: Record<string, unknown>;
  appPort?: number | string | (number | string)[];
  postStartCommand?: unknown;
  runArgs?: string[];
  [key: string]: unknown;
};

/** Maps `host.docker.internal` to the host so the in-container attention bridge resolves. */
const HOST_GATEWAY_ARG = '--add-host=host.docker.internal:host-gateway';

/**
 * Inject code-server + a host port publish into the copied workspace's devcontainer.json,
 * creating a default-image config if the folder has none. Operates on the copy, so
 * rewriting/normalizing the file is safe.
 */
export async function writeOverrideConfig(workspaceDir: string, hostPort: number): Promise<void> {
  const target = configPath(workspaceDir);
  let config: DevcontainerConfig = {};

  if (existsSync(target)) {
    const raw = await readFile(target, 'utf8');
    try {
      config = JSON.parse(stripJsonc(raw)) as DevcontainerConfig;
    } catch (err) {
      throw new Error(
        `Could not parse existing devcontainer.json at ${target}: ${(err as Error).message}`,
      );
    }
  } else {
    config.image = DEFAULT_IMAGE;
  }

  // Install code-server.
  config.features = {
    ...(config.features ?? {}),
    [CODE_SERVER_FEATURE]: { host: '0.0.0.0', port: CODE_SERVER_PORT, auth: 'none' },
  };

  // Publish the in-container code-server port on a unique host port, bound to
  // loopback only — instances are reachable solely via the authed Mochi proxy.
  const portMapping = `127.0.0.1:${hostPort}:${CODE_SERVER_PORT}`;
  const existingPorts = config.appPort;
  const ports = new Set<number | string>();
  if (Array.isArray(existingPorts)) existingPorts.forEach((p) => ports.add(p));
  else if (existingPorts !== undefined) ports.add(existingPorts);
  ports.add(portMapping);
  config.appPort = [...ports];

  // Ensure host.docker.internal resolves inside the container (it isn't automatic on
  // Colima/Linux Docker) so the Claude attention hook can reach the manager.
  const runArgs = new Set(Array.isArray(config.runArgs) ? config.runArgs : []);
  runArgs.add(HOST_GATEWAY_ARG);
  config.runArgs = [...runArgs];

  // Launch code-server on container start, chaining any existing postStartCommand.
  const existing = config.postStartCommand;
  config.postStartCommand =
    typeof existing === 'string' && existing.trim()
      ? `${existing} && ${CODE_SERVER_LAUNCH}`
      : CODE_SERVER_LAUNCH;

  await mkdir(join(workspaceDir, '.devcontainer'), { recursive: true }).catch(() => {});
  await writeFile(target, JSON.stringify(config, null, 2) + '\n', 'utf8');

  // Stage the code-server user settings next to the config; the launcher copies
  // them into the container's user-data dir on first start.
  await writeFile(
    join(workspaceDir, '.devcontainer', CODE_SERVER_SETTINGS_FILE),
    JSON.stringify(CODE_SERVER_SETTINGS, null, 2) + '\n',
    'utf8',
  );
}

export interface UpResult {
  outcome: string;
  containerId?: string;
  remoteUser?: string;
  remoteWorkspaceFolder?: string;
  message?: string;
  description?: string;
}

/**
 * Run `devcontainer up` for a workspace, streaming all output to `onLog`,
 * and return the parsed final result line.
 */
export async function devcontainerUp(
  workspaceDir: string,
  onLog: (chunk: string) => void,
): Promise<UpResult> {
  const proc = Bun.spawn(
    [devcontainerBin(), 'up', '--workspace-folder', workspaceDir, '--remove-existing-container'],
    { cwd: workspaceDir, stdout: 'pipe', stderr: 'pipe' },
  );

  let stdoutText = '';
  const pump = async (stream: ReadableStream<Uint8Array>, capture: boolean) => {
    const decoder = new TextDecoder();
    for await (const bytes of stream) {
      const text = decoder.decode(bytes, { stream: true });
      if (capture) stdoutText += text;
      onLog(text);
    }
  };

  await Promise.all([pump(proc.stdout, true), pump(proc.stderr, false)]);
  await proc.exited;

  // The CLI prints log lines plus a final JSON result; find the last JSON object.
  const lines = stdoutText.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line && line.startsWith('{')) {
      try {
        return JSON.parse(line) as UpResult;
      } catch {
        // keep scanning earlier lines
      }
    }
  }
  throw new Error('devcontainer up did not return a result. See logs for details.');
}
