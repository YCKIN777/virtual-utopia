PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bp4_m3_role_grants (
  user_id INTEGER PRIMARY KEY,
  ops_role TEXT NOT NULL
    CHECK (ops_role IN ('viewer', 'operator', 'admin')),
  granted_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bp4_m3_world_instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (
      status IN ('draft', 'online', 'maintenance', 'offline')
    ),
  capacity INTEGER NOT NULL DEFAULT 100,
  current_players INTEGER NOT NULL DEFAULT 0,
  version TEXT NOT NULL DEFAULT 'BP4',
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bp4_m3_home_instances (
  plot_id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL,
  owner_username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (
      status IN ('active', 'maintenance', 'frozen')
    ),
  visit_mode TEXT NOT NULL DEFAULT 'public'
    CHECK (
      visit_mode IN ('public', 'private', 'request', 'whitelist')
    ),
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (world_id)
    REFERENCES bp4_m3_world_instances(id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS bp4_m3_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_username TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  result TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp4_m3_world_status
  ON bp4_m3_world_instances(status);
CREATE INDEX IF NOT EXISTS idx_bp4_m3_home_world
  ON bp4_m3_home_instances(world_id, status);
CREATE INDEX IF NOT EXISTS idx_bp4_m3_audit_created
  ON bp4_m3_audit_logs(created_at DESC);
