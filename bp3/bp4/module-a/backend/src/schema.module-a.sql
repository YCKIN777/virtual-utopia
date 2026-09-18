PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bp4_module_a_users (
  user_id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT,
  phase5_role TEXT NOT NULL
    CHECK (phase5_role IN ('admin', 'editor', 'viewer')),
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bp4_module_a_homes (
  plot_id TEXT PRIMARY KEY,
  owner_user_id INTEGER,
  owner_username TEXT,
  access_mode TEXT NOT NULL DEFAULT 'private'
    CHECK (access_mode IN ('private', 'friends', 'public')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bp4_module_a_friends (
  plot_id TEXT NOT NULL,
  friend_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (plot_id, friend_user_id),
  FOREIGN KEY (plot_id)
    REFERENCES bp4_module_a_homes(plot_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_module_a_home_owner
  ON bp4_module_a_homes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_module_a_friends_user
  ON bp4_module_a_friends(friend_user_id);

CREATE TABLE IF NOT EXISTS bp4_module_a_permission_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plot_id TEXT NOT NULL,
  actor_user_id INTEGER,
  event_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  owner_user_id INTEGER,
  payload_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_module_a_events_plot
  ON bp4_module_a_permission_events(plot_id, id DESC);

CREATE TABLE IF NOT EXISTS bp4_module_a_audit_logs (
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

CREATE INDEX IF NOT EXISTS idx_module_a_audit_created
  ON bp4_module_a_audit_logs(created_at DESC);
