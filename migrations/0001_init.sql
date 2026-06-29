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
  created_at INTEGER NOT NULL,
  bridge_token TEXT NOT NULL DEFAULT '',
  remote_user TEXT
);

CREATE TABLE IF NOT EXISTS folder_history (
  source_path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_used_at INTEGER NOT NULL
);
