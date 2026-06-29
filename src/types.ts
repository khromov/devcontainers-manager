/** Client-safe shape of an instance, mirrors the server's InstanceRow. */
export interface Instance {
  id: string;
  name: string;
  source_path: string;
  workspace_path: string;
  host_port: number;
  container_id: string | null;
  remote_workspace_folder: string | null;
  status: 'creating' | 'running' | 'stopped' | 'error';
  error: string | null;
  created_at: number;
  /** Branch checked out in the container, polled per reconcile; null if unknown. */
  git_branch: string | null;
  /** Live signal raised by the in-container Claude hook: task done, waiting on input, or none. */
  attention: 'done' | 'waiting' | null;
}

/** Live + recorded health signals for one instance, surfaced on its status page. */
export interface InstanceHealth {
  /** Live: container is up per `docker inspect`. */
  containerRunning: boolean;
  /** Live: code-server answered an HTTP probe on its host port. */
  codeServerAccessible: boolean;
  /** Recorded at boot: Claude attention-hook injection outcome. */
  hooksInjected: 'ok' | 'failed' | 'unknown';
  /** Recorded at boot: Claude credential injection outcome ('skipped' = no host creds). */
  credsInjected: 'ok' | 'failed' | 'skipped';
}

/** One authorization the manager can inject into instances (e.g. Claude Code). */
export interface AuthProvider {
  id: string;
  label: string;
  available: boolean;
  /** Where the credential was found (keystore entry or file path), null if absent. */
  source: string | null;
  /** Short instruction shown when absent, e.g. "run `gh auth login`". */
  hint?: string;
}

export interface Preflight {
  docker: boolean;
  cli: boolean;
  auth: AuthProvider[];
}

/**
 * Same-origin path to an instance's code-server, proxied through the manager
 * and gated by the app's Basic Auth. Opens the project folder when known.
 */
export function ideUrl(instance: Instance): string {
  const base = `/p/${instance.id}/`;
  return instance.remote_workspace_folder
    ? `${base}?folder=${encodeURIComponent(instance.remote_workspace_folder)}`
    : base;
}

export interface DirEntry {
  name: string;
  path: string;
  hasDevcontainer: boolean;
}

export interface BrowseResult {
  path: string;
  hasDevcontainer: boolean;
  parent: string | null;
  entries: DirEntry[];
}

/** A previously-used source folder, shown for quick re-creation. */
export interface FolderHistoryEntry {
  source_path: string;
  name: string;
  last_used_at: number;
}
