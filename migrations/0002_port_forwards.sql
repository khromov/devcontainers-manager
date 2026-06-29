CREATE TABLE IF NOT EXISTS port_forwards (
  instance_id    TEXT NOT NULL,
  container_port INTEGER NOT NULL,
  host_port      INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (instance_id, container_port)
);

CREATE INDEX IF NOT EXISTS idx_port_forwards_instance ON port_forwards(instance_id);
