PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bp4_m5_home_layouts (
  plot_id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL,
  layout_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp4_m5_layout_owner
  ON bp4_m5_home_layouts(owner_user_id);

CREATE TABLE IF NOT EXISTS bp4_m5_home_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plot_id TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp4_m5_events_plot
  ON bp4_m5_home_events(plot_id, sequence DESC);

CREATE TABLE IF NOT EXISTS bp4_m5_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  result TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp4_m5_audit_created
  ON bp4_m5_audit_logs(created_at DESC);
