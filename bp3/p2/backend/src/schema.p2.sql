PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bp3_p2_avatar_catalog (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('action', 'emote')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO bp3_p2_avatar_catalog (
  id,
  kind,
  name,
  description,
  icon,
  display_order,
  created_at,
  updated_at
) VALUES
  ('idle', 'action', '待机', '保持静止', 'idle', 1, datetime('now'), datetime('now')),
  ('wave', 'action', '挥手', '向其他居民挥手', 'wave', 2, datetime('now'), datetime('now')),
  ('clap', 'action', '鼓掌', '表达赞赏', 'clap', 3, datetime('now'), datetime('now')),
  ('cheer', 'action', '欢呼', '庆祝活动时刻', 'cheer', 4, datetime('now'), datetime('now')),
  ('sit', 'action', '坐下', '在广场或家园休息', 'sit', 5, datetime('now'), datetime('now')),
  ('happy', 'emote', '开心', '显示开心状态', 'happy', 6, datetime('now'), datetime('now')),
  ('surprised', 'emote', '惊讶', '显示惊讶状态', 'surprised', 7, datetime('now'), datetime('now')),
  ('confused', 'emote', '疑惑', '显示疑惑状态', 'confused', 8, datetime('now'), datetime('now')),
  ('angry', 'emote', '生气', '显示生气状态', 'angry', 9, datetime('now'), datetime('now'));

CREATE TABLE IF NOT EXISTS bp3_p2_avatar_states (
  user_id INTEGER PRIMARY KEY,
  action_id TEXT NOT NULL DEFAULT 'idle',
  emote_id TEXT,
  sequence INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (action_id)
    REFERENCES bp3_p2_avatar_catalog(id)
    ON DELETE RESTRICT,
  FOREIGN KEY (emote_id)
    REFERENCES bp3_p2_avatar_catalog(id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_bp3_p2_avatar_states_updated
  ON bp3_p2_avatar_states(updated_at DESC);

CREATE TABLE IF NOT EXISTS bp3_p2_home_messages (
  id TEXT PRIMARY KEY,
  plot_id TEXT NOT NULL,
  author_user_id INTEGER NOT NULL,
  author_username TEXT NOT NULL,
  author_display_name TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp3_p2_home_messages_plot
  ON bp3_p2_home_messages(plot_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bp3_p2_home_messages_author
  ON bp3_p2_home_messages(author_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bp3_p2_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  result TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp3_p2_audit_created
  ON bp3_p2_audit_logs(created_at DESC);
