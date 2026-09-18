PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bp3_schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

INSERT OR IGNORE INTO bp3_schema_migrations (
  version,
  applied_at
) VALUES (1, datetime('now'));

CREATE TABLE IF NOT EXISTS bp3_plot_owners (
  plot_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'phase5-world-state',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp3_plot_owners_user
  ON bp3_plot_owners(user_id);

CREATE TABLE IF NOT EXISTS bp3_voice_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sfu_room_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bp3_voice_participants (
  channel_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL
    CHECK (role IN ('admin', 'editor', 'viewer')),
  muted INTEGER NOT NULL DEFAULT 0,
  speaking INTEGER NOT NULL DEFAULT 0,
  connection_id TEXT,
  joined_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id)
    REFERENCES bp3_voice_channels(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bp3_voice_participants_channel
  ON bp3_voice_participants(channel_id, joined_at);

CREATE TABLE IF NOT EXISTS bp3_voice_blacklist (
  channel_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  reason TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id)
    REFERENCES bp3_voice_channels(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bp3_home_access_rules (
  plot_id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL,
  access_mode TEXT NOT NULL DEFAULT 'public'
    CHECK (
      access_mode IN (
        'public',
        'private',
        'request',
        'whitelist'
      )
    ),
  lock_enabled INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp3_home_access_owner
  ON bp3_home_access_rules(owner_user_id);

CREATE TABLE IF NOT EXISTS bp3_home_visitors (
  plot_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  list_type TEXT NOT NULL
    CHECK (list_type IN ('whitelist', 'blacklist')),
  granted_by INTEGER NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plot_id, user_id),
  FOREIGN KEY (plot_id)
    REFERENCES bp3_home_access_rules(plot_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bp3_home_visitors_type
  ON bp3_home_visitors(plot_id, list_type);

CREATE TABLE IF NOT EXISTS bp3_home_access_requests (
  id TEXT PRIMARY KEY,
  plot_id TEXT NOT NULL,
  requester_user_id INTEGER NOT NULL,
  requester_username TEXT NOT NULL,
  requester_display_name TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'approved',
        'rejected',
        'cancelled',
        'expired'
      )
    ),
  resolver_user_id INTEGER,
  requested_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (plot_id)
    REFERENCES bp3_home_access_rules(plot_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bp3_home_requests_plot_status
  ON bp3_home_access_requests(plot_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_bp3_home_requests_requester
  ON bp3_home_access_requests(
    requester_user_id,
    requested_at DESC
  );

CREATE TABLE IF NOT EXISTS bp3_home_access_grants (
  id TEXT PRIMARY KEY,
  plot_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  grant_type TEXT NOT NULL
    CHECK (
      grant_type IN (
        'request_approval',
        'temporary_invite',
        'owner_unlock'
      )
    ),
  token_hash TEXT UNIQUE,
  expires_at TEXT,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (plot_id)
    REFERENCES bp3_home_access_rules(plot_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bp3_home_grants_plot_user
  ON bp3_home_access_grants(plot_id, user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_bp3_home_grants_expiry
  ON bp3_home_access_grants(expires_at);

CREATE TABLE IF NOT EXISTS bp3_home_visit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plot_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL
    CHECK (result IN ('allowed', 'denied', 'recorded')),
  reason TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp3_home_visit_logs_plot
  ON bp3_home_visit_logs(plot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bp3_home_visit_logs_user
  ON bp3_home_visit_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bp3_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  result TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp3_audit_logs_created
  ON bp3_audit_logs(created_at DESC);

INSERT OR IGNORE INTO bp3_voice_channels (
  id,
  name,
  sfu_room_id,
  status,
  created_by,
  created_at,
  updated_at
) VALUES (
  'world-main',
  '世界语音',
  'world-main',
  'active',
  NULL,
  datetime('now'),
  datetime('now')
);
