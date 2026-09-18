PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bp3_p1_item_catalog (
  item_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'common',
  max_stack INTEGER NOT NULL DEFAULT 99,
  icon_color TEXT NOT NULL DEFAULT '#8fb28b',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO bp3_p1_item_catalog (
  item_id,
  name,
  category,
  rarity,
  max_stack,
  icon_color,
  created_at,
  updated_at
) VALUES
  ('wood', '木材', 'material', 'common', 999, '#9b7547', datetime('now'), datetime('now')),
  ('stone', '石块', 'material', 'common', 999, '#85908c', datetime('now'), datetime('now')),
  ('herb', '草药', 'plant', 'common', 999, '#5f9f69', datetime('now'), datetime('now')),
  ('fiber', '草纤维', 'plant', 'common', 999, '#a8b36a', datetime('now'), datetime('now')),
  ('crystal', '山晶', 'rare', 'rare', 99, '#71b8c7', datetime('now'), datetime('now')),
  ('lantern', '灯笼', 'decor', 'common', 99, '#d48b56', datetime('now'), datetime('now')),
  ('wooden-cup', '木杯', 'home', 'common', 99, '#b68b5d', datetime('now'), datetime('now'));

CREATE TABLE IF NOT EXISTS bp3_p1_world_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status IN ('draft', 'scheduled', 'active', 'ended')
    ),
  starts_at TEXT,
  ends_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp3_p1_events_status_time
  ON bp3_p1_world_events(status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS bp3_p1_tasks (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'collect_item'
    CHECK (task_type IN ('collect_item')),
  target_item_id TEXT NOT NULL,
  target_quantity INTEGER NOT NULL CHECK (target_quantity > 0),
  reward_items_json TEXT NOT NULL DEFAULT '[]',
  reward_shards INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  repeatable INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (event_id)
    REFERENCES bp3_p1_world_events(id)
    ON DELETE SET NULL,
  FOREIGN KEY (target_item_id)
    REFERENCES bp3_p1_item_catalog(item_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_bp3_p1_tasks_event
  ON bp3_p1_tasks(event_id, status);

CREATE TABLE IF NOT EXISTS bp3_p1_task_instances (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (
      status IN ('accepted', 'completed', 'claimed', 'expired')
    ),
  progress INTEGER NOT NULL DEFAULT 0,
  accepted_at TEXT NOT NULL,
  completed_at TEXT,
  claimed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (task_id, user_id),
  FOREIGN KEY (task_id)
    REFERENCES bp3_p1_tasks(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bp3_p1_task_instances_user
  ON bp3_p1_task_instances(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bp3_p1_resource_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  interaction_radius REAL NOT NULL DEFAULT 5,
  respawn_seconds INTEGER NOT NULL DEFAULT 90,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  next_available_at TEXT,
  last_collected_by INTEGER,
  last_collected_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (item_id)
    REFERENCES bp3_p1_item_catalog(item_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_bp3_p1_resource_nodes_status
  ON bp3_p1_resource_nodes(status, next_available_at);

CREATE TABLE IF NOT EXISTS bp3_p1_resource_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (node_id)
    REFERENCES bp3_p1_resource_nodes(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bp3_p1_collections_user
  ON bp3_p1_resource_collections(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bp3_p1_inventories (
  user_id INTEGER PRIMARY KEY,
  capacity INTEGER NOT NULL DEFAULT 40,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bp3_p1_inventory_items (
  user_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id),
  FOREIGN KEY (user_id)
    REFERENCES bp3_p1_inventories(user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (item_id)
    REFERENCES bp3_p1_item_catalog(item_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_bp3_p1_inventory_items_user
  ON bp3_p1_inventory_items(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bp3_p1_inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp3_p1_inventory_transactions_user
  ON bp3_p1_inventory_transactions(
    user_id,
    created_at DESC
  );
CREATE UNIQUE INDEX IF NOT EXISTS idx_bp3_p1_inventory_transaction_ref
  ON bp3_p1_inventory_transactions(
    user_id,
    item_id,
    reason,
    reference_id
  )
  WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bp3_p1_reward_grants (
  id TEXT PRIMARY KEY,
  task_instance_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  reward_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_instance_id)
    REFERENCES bp3_p1_task_instances(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bp3_p1_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  result TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp3_p1_audit_created
  ON bp3_p1_audit_logs(created_at DESC);
