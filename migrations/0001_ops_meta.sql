-- 0001：运维元数据表（独立于 phase5/phase6 业务表，不触碰冻结 schema）
-- 用于记录部署版本、迁移元信息等运维数据。
CREATE TABLE IF NOT EXISTS ops_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
