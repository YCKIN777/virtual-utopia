PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  display_name TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role_status
  ON users(role, status);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER,
  scene_id TEXT NOT NULL,
  session_type TEXT NOT NULL
    CHECK (session_type IN ('public', 'private')),
  owner_agent_id TEXT NOT NULL,
  title TEXT,
  messages_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated
  ON chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_scene
  ON chat_sessions(scene_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_type_status
  ON chat_sessions(session_type, status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_expires
  ON chat_sessions(expires_at);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  content_hash TEXT NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  collection_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'indexed', 'failed', 'deleted')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_documents_key
  ON knowledge_documents(document_key);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_hash
  ON knowledge_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_collection
  ON knowledge_documents(collection_name);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status
  ON knowledge_documents(status);

CREATE TABLE IF NOT EXISTS rag_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  session_id TEXT,
  operation_type TEXT NOT NULL,
  query_text TEXT,
  collection_name TEXT,
  top_k INTEGER,
  similarity_threshold REAL,
  matched_count INTEGER NOT NULL DEFAULT 0,
  matched_chunks_json TEXT NOT NULL DEFAULT '[]',
  latency_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rag_logs_created_at
  ON rag_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_logs_user_created
  ON rag_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_logs_session
  ON rag_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_rag_logs_status
  ON rag_logs(status);
