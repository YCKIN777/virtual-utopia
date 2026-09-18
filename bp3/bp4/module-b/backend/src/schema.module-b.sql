PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bp4_module_b_users (
  user_id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT,
  phase5_role TEXT NOT NULL
    CHECK (phase5_role IN ('admin', 'editor', 'viewer')),
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bp4_module_b_messages (
  id TEXT PRIMARY KEY,
  client_message_id TEXT,
  channel_type TEXT NOT NULL
    CHECK (channel_type IN ('world', 'home', 'direct')),
  channel_id TEXT NOT NULL,
  sender_user_id INTEGER NOT NULL,
  sender_username TEXT NOT NULL,
  content TEXT NOT NULL,
  filtered INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'recalled')),
  created_at TEXT NOT NULL,
  recalled_at TEXT,
  recalled_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_module_b_messages_channel
  ON bp4_module_b_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_module_b_messages_sender
  ON bp4_module_b_messages(sender_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bp4_module_b_audit_logs (
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

CREATE INDEX IF NOT EXISTS idx_module_b_audit_created
  ON bp4_module_b_audit_logs(created_at DESC);
