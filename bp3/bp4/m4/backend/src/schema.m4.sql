PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bp4_m4_content_templates (
  id TEXT PRIMARY KEY,
  template_type TEXT NOT NULL
    CHECK (template_type IN ('home', 'scene')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_bp4_m4_templates_type_status
  ON bp4_m4_content_templates(
    template_type,
    status,
    updated_at DESC
  );

CREATE TABLE IF NOT EXISTS bp4_m4_template_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  template_id TEXT,
  result TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp4_m4_audit_created
  ON bp4_m4_template_audit(created_at DESC);
