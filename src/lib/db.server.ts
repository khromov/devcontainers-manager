import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { DATA_DIR, DB_PATH } from './config.server.ts';

/** Possible lifecycle states for an instance row. */
export type InstanceStatus = 'creating' | 'running' | 'stopped' | 'error';

/** Durable record of one devcontainer instance. */
export interface InstanceRow {
  id: string;
  name: string;
  source_path: string;
  workspace_path: string;
  host_port: number;
  container_id: string | null;
  remote_workspace_folder: string | null;
  status: InstanceStatus;
  error: string | null;
  created_at: number;
}

// Pin the connection to globalThis so dev-mode hot reload doesn't reopen it.
const globalForDb = globalThis as unknown as { __dcmDb?: Database };

function open(): Database {
  mkdirSync(DATA_DIR, { recursive: true });
  const database = new Database(DB_PATH, { create: true });
  database.run('PRAGMA journal_mode = WAL;');
  database.run(`
    CREATE TABLE IF NOT EXISTS instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_path TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      host_port INTEGER NOT NULL,
      container_id TEXT,
      remote_workspace_folder TEXT,
      status TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  // Migrate databases created before remote_workspace_folder existed.
  const cols = database.query('PRAGMA table_info(instances)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'remote_workspace_folder')) {
    database.run('ALTER TABLE instances ADD COLUMN remote_workspace_folder TEXT;');
  }
  return database;
}

export const db: Database = (globalForDb.__dcmDb ??= open());

export function insertInstance(row: InstanceRow): void {
  db.query(
    `INSERT INTO instances
       (id, name, source_path, workspace_path, host_port, container_id, remote_workspace_folder, status, error, created_at)
     VALUES ($id, $name, $source_path, $workspace_path, $host_port, $container_id, $remote_workspace_folder, $status, $error, $created_at)`,
  ).run({
    $id: row.id,
    $name: row.name,
    $source_path: row.source_path,
    $workspace_path: row.workspace_path,
    $host_port: row.host_port,
    $container_id: row.container_id,
    $remote_workspace_folder: row.remote_workspace_folder,
    $status: row.status,
    $error: row.error,
    $created_at: row.created_at,
  });
}

export function getInstance(id: string): InstanceRow | null {
  return db.query('SELECT * FROM instances WHERE id = $id').get({ $id: id }) as InstanceRow | null;
}

export function allInstances(): InstanceRow[] {
  return db.query('SELECT * FROM instances ORDER BY created_at DESC').all() as InstanceRow[];
}

export function usedPorts(): number[] {
  const rows = db.query('SELECT host_port FROM instances').all() as { host_port: number }[];
  return rows.map((r) => r.host_port);
}

export function updateInstance(
  id: string,
  patch: Partial<Pick<InstanceRow, 'container_id' | 'remote_workspace_folder' | 'status' | 'error'>>,
): void {
  const sets: string[] = [];
  const params: Record<string, string | number | null> = { $id: id };
  if ('container_id' in patch) {
    sets.push('container_id = $container_id');
    params.$container_id = patch.container_id ?? null;
  }
  if ('remote_workspace_folder' in patch) {
    sets.push('remote_workspace_folder = $remote_workspace_folder');
    params.$remote_workspace_folder = patch.remote_workspace_folder ?? null;
  }
  if ('status' in patch) {
    sets.push('status = $status');
    params.$status = patch.status ?? null;
  }
  if ('error' in patch) {
    sets.push('error = $error');
    params.$error = patch.error ?? null;
  }
  if (sets.length === 0) return;
  db.query(`UPDATE instances SET ${sets.join(', ')} WHERE id = $id`).run(params);
}

export function deleteInstanceRow(id: string): void {
  db.query('DELETE FROM instances WHERE id = $id').run({ $id: id });
}
