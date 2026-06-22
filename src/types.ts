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
}

export interface Preflight {
  docker: boolean;
  cli: boolean;
}

/** Local URL for an instance's code-server, opening the project folder when known. */
export function ideUrl(instance: Instance): string {
  const base = `http://localhost:${instance.host_port}/`;
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
  parent: string | null;
  entries: DirEntry[];
}
