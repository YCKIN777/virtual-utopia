# 虚拟乌托邦 BP2｜Phase5 持久化存储模块完整设计

> 项目状态：阶段一至阶段四全部冻结。
> 本文档状态：方案设计完成，待开发。
> 开发范围：Phase5独立持久化模块，仅做方案设计，不包含业务代码。

## 1. 建设目标

Phase5用于补齐项目在服务重启后的数据保持能力，新增独立SQLite持久化服务：

1. 会话持久化：保存公共会话和私聊会话的会话信息、消息历史、过期时间和归属用户。
2. 知识库文档元数据存储：保存RAG文档来源、哈希、分块数量、集合名称和入库状态。
3. 基础用户角色权限：提供用户登录、角色识别和接口级权限控制。
4. 操作日志：记录用户操作、会话事件、文档操作和RAG检索日志。

Phase5模块目录：

```text
backend/src/phase5/
```

约束：

- 不修改阶段一至阶段四任何源码。
- 不修改`stage2_memory.md`、`stage3_memory.md`、`stage4_memory.md`。
- 不修改项目原有`.env`文件。
- 默认保持现有内存会话模式。
- SQLite模式通过独立开关启用。

## 2. 技术选型

### 2.1 数据库

数据库：SQLite单文件数据库。

建议使用Node.js内置`node:sqlite`模块或项目确认的SQLite驱动。若使用`node:sqlite`，Phase5最低运行版本建议为Node.js `>=22.5`，当前验证环境Node.js `v24.18.0`满足要求。

SQLite特性：

- 无需额外数据库服务。
- 单文件本地持久化。
- 支持事务、索引、外键和WAL模式。
- 适合当前单机、本地部署和轻量用户规模。

建议数据库文件：

```text
H:\BP2\data\virtual_utopia_phase5.sqlite
```

建议同时启用：

- `PRAGMA journal_mode = WAL`
- `PRAGMA foreign_keys = ON`
- `PRAGMA busy_timeout`

### 2.2 服务形态

Phase5以独立HTTP服务运行，不挂载到阶段二主后端，不直接修改phase4服务。

建议端口：

```text
PHASE5_PORT=3300
```

服务地址：

```text
http://localhost:3300
```

### 2.3 认证方式

建议使用无状态Bearer Token：

- 用户密码使用`scrypt`或等效强哈希保存。
- 登录成功后签发HMAC签名令牌。
- 令牌中包含`userId`、`username`、`role`和过期时间。
- 不增加第五张Token表，避免超出四张表约束。
- 服务端通过环境变量读取签名密钥。

### 2.4 角色权限

| 角色     | 权限                                       |
| -------- | ------------------------------------------ |
| `admin`  | 用户管理、全部会话、全部文档、全部日志     |
| `editor` | 文档元数据CRUD、自己会话读写、自己相关日志 |
| `viewer` | 只读文档元数据和自己的会话历史             |

## 3. 数据库表结构

数据库固定包含4张业务表：

1. `users`
2. `chat_sessions`
3. `knowledge_documents`
4. `rag_logs`

时间统一建议使用UTC ISO-8601文本，格式示例：

```text
2026-09-16T12:00:00.000Z
```

### 3.1 users

用途：保存用户、认证信息和角色。

| 字段            | 类型    | 约束                      | 说明                        |
| --------------- | ------- | ------------------------- | --------------------------- |
| `id`            | INTEGER | PRIMARY KEY AUTOINCREMENT | 用户主键                    |
| `username`      | TEXT    | NOT NULL UNIQUE           | 登录名                      |
| `password_hash` | TEXT    | NOT NULL                  | 密码哈希                    |
| `role`          | TEXT    | NOT NULL                  | `admin`、`editor`、`viewer` |
| `status`        | TEXT    | NOT NULL DEFAULT `active` | `active`、`disabled`        |
| `display_name`  | TEXT    | NULL                      | 用户显示名称                |
| `last_login_at` | TEXT    | NULL                      | 最后登录时间                |
| `created_at`    | TEXT    | NOT NULL                  | 创建时间                    |
| `updated_at`    | TEXT    | NOT NULL                  | 更新时间                    |

建议索引：

```sql
CREATE UNIQUE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role_status ON users(role, status);
```

建议字段约束：

```sql
role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer'))
status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'disabled'))
```

### 3.2 chat_sessions

用途：持久化会话元数据、消息历史和过期时间。

| 字段             | 类型    | 约束                      | 说明                               |
| ---------------- | ------- | ------------------------- | ---------------------------------- |
| `id`             | TEXT    | PRIMARY KEY               | 原会话ID，例如`pub_...`或`prv_...` |
| `user_id`        | INTEGER | NULL                      | 所属用户                           |
| `scene_id`       | TEXT    | NOT NULL                  | 场景ID                             |
| `session_type`   | TEXT    | NOT NULL                  | `public`或`private`                |
| `owner_agent_id` | TEXT    | NOT NULL                  | 会话归属Agent，例如`ahe`、`fenghe` |
| `title`          | TEXT    | NULL                      | 可读会话标题                       |
| `messages_json`  | TEXT    | NOT NULL DEFAULT `[]`     | 消息历史JSON                       |
| `status`         | TEXT    | NOT NULL DEFAULT `active` | `active`、`expired`、`deleted`     |
| `created_at`     | TEXT    | NOT NULL                  | 创建时间                           |
| `updated_at`     | TEXT    | NOT NULL                  | 最后更新时间                       |
| `expires_at`     | TEXT    | NOT NULL                  | 过期时间                           |

建议索引：

```sql
CREATE INDEX idx_chat_sessions_user_updated
  ON chat_sessions(user_id, updated_at DESC);
CREATE INDEX idx_chat_sessions_scene
  ON chat_sessions(scene_id);
CREATE INDEX idx_chat_sessions_type_status
  ON chat_sessions(session_type, status);
CREATE INDEX idx_chat_sessions_expires
  ON chat_sessions(expires_at);
```

外键：

```sql
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
```

消息结构示例：

```json
[
  {
    "role": "user",
    "content": "如何整理社区资源",
    "createdAt": "2026-09-16T12:00:00.000Z"
  },
  {
    "role": "assistant",
    "content": "可以先分类，再补充来源标签。",
    "createdAt": "2026-09-16T12:00:01.000Z"
  }
]
```

### 3.3 knowledge_documents

用途：保存RAG知识库文档元数据，不重复保存Chroma向量。

| 字段              | 类型    | 约束                       | 说明                                      |
| ----------------- | ------- | -------------------------- | ----------------------------------------- |
| `id`              | INTEGER | PRIMARY KEY AUTOINCREMENT  | 文档元数据主键                            |
| `document_key`    | TEXT    | NOT NULL UNIQUE            | 稳定文档键                                |
| `title`           | TEXT    | NOT NULL                   | 文档标题                                  |
| `source_path`     | TEXT    | NOT NULL                   | 原始相对路径                              |
| `file_name`       | TEXT    | NOT NULL                   | 文件名                                    |
| `mime_type`       | TEXT    | NULL                       | 文件类型                                  |
| `content_hash`    | TEXT    | NOT NULL                   | 文档内容哈希                              |
| `chunk_count`     | INTEGER | NOT NULL DEFAULT 0         | 分块数量                                  |
| `collection_name` | TEXT    | NOT NULL                   | Chroma集合名称                            |
| `status`          | TEXT    | NOT NULL DEFAULT `pending` | `pending`、`indexed`、`failed`、`deleted` |
| `metadata_json`   | TEXT    | NOT NULL DEFAULT `{}`      | 扩展元数据                                |
| `created_by`      | INTEGER | NULL                       | 创建用户                                  |
| `created_at`      | TEXT    | NOT NULL                   | 创建时间                                  |
| `updated_at`      | TEXT    | NOT NULL                   | 更新时间                                  |

建议索引：

```sql
CREATE UNIQUE INDEX idx_knowledge_documents_key
  ON knowledge_documents(document_key);
CREATE INDEX idx_knowledge_documents_hash
  ON knowledge_documents(content_hash);
CREATE INDEX idx_knowledge_documents_collection
  ON knowledge_documents(collection_name);
CREATE INDEX idx_knowledge_documents_status
  ON knowledge_documents(status);
```

外键：

```sql
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
```

### 3.4 rag_logs

用途：记录RAG检索和持久化操作日志。

| 字段                   | 类型    | 约束                      | 说明                                   |
| ---------------------- | ------- | ------------------------- | -------------------------------------- |
| `id`                   | INTEGER | PRIMARY KEY AUTOINCREMENT | 日志主键                               |
| `user_id`              | INTEGER | NULL                      | 操作用户                               |
| `session_id`           | TEXT    | NULL                      | 关联会话                               |
| `operation_type`       | TEXT    | NOT NULL                  | `query`、`ingest`、`document_create`等 |
| `query_text`           | TEXT    | NULL                      | RAG查询文本                            |
| `collection_name`      | TEXT    | NULL                      | Chroma集合名称                         |
| `top_k`                | INTEGER | NULL                      | TopK参数                               |
| `similarity_threshold` | REAL    | NULL                      | 相似度阈值                             |
| `matched_count`        | INTEGER | NOT NULL DEFAULT 0        | 命中数量                               |
| `matched_chunks_json`  | TEXT    | NOT NULL DEFAULT `[]`     | 命中片段摘要                           |
| `latency_ms`           | INTEGER | NULL                      | 耗时                                   |
| `status`               | TEXT    | NOT NULL                  | `success`或`error`                     |
| `error_code`           | TEXT    | NULL                      | 错误码                                 |
| `created_at`           | TEXT    | NOT NULL                  | 创建时间                               |

建议索引：

```sql
CREATE INDEX idx_rag_logs_created_at
  ON rag_logs(created_at DESC);
CREATE INDEX idx_rag_logs_user_created
  ON rag_logs(user_id, created_at DESC);
CREATE INDEX idx_rag_logs_session
  ON rag_logs(session_id);
CREATE INDEX idx_rag_logs_status
  ON rag_logs(status);
```

外键：

```sql
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL
```

## 4. API接口清单

接口前缀：

```text
/api/phase5
```

认证方式：

```text
Authorization: Bearer <token>
```

### 4.1 健康检查

| 方法 | 路径                 | 权限 | 说明                           |
| ---- | -------------------- | ---- | ------------------------------ |
| GET  | `/health`            | 公开 | 检查Phase5服务和SQLite连接     |
| GET  | `/api/phase5/health` | 公开 | 返回数据库状态、版本和存储模式 |

### 4.2 用户登录与身份

| 方法 | 路径                      | 权限   | 说明                             |
| ---- | ------------------------- | ------ | -------------------------------- |
| POST | `/api/phase5/auth/login`  | 公开   | 用户名密码登录                   |
| GET  | `/api/phase5/auth/me`     | 已登录 | 返回当前用户和角色               |
| POST | `/api/phase5/auth/logout` | 已登录 | 前端丢弃令牌或服务端记录登出日志 |

登录请求：

```json
{
  "username": "admin",
  "password": "password"
}
```

登录响应：

```json
{
  "token": "signed-token",
  "expiresAt": "2026-09-17T12:00:00.000Z",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

### 4.3 会话读写

| 方法   | 路径                                 | 权限             | 说明                 |
| ------ | ------------------------------------ | ---------------- | -------------------- |
| POST   | `/api/phase5/sessions`               | editor/admin     | 创建持久会话         |
| GET    | `/api/phase5/sessions`               | 已登录           | 查询自己的会话       |
| GET    | `/api/phase5/sessions/:id`           | 会话所有者/admin | 获取会话和消息       |
| PUT    | `/api/phase5/sessions/:id`           | 会话所有者/admin | 更新标题、消息或状态 |
| DELETE | `/api/phase5/sessions/:id`           | 会话所有者/admin | 软删除会话           |
| GET    | `/api/phase5/users/:userId/sessions` | admin            | 查询指定用户会话     |

创建会话请求：

```json
{
  "id": "pub_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "sceneId": "yard",
  "sessionType": "public",
  "ownerAgentId": "ahe",
  "title": "大院会话",
  "messages": [],
  "expiresAt": "2026-09-16T12:30:00.000Z"
}
```

更新消息请求：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "你好"
    },
    {
      "role": "assistant",
      "content": "你好，我是阿禾。"
    }
  ]
}
```

### 4.4 文档元数据CRUD

| 方法   | 路径                        | 权限         | 说明                     |
| ------ | --------------------------- | ------------ | ------------------------ |
| POST   | `/api/phase5/documents`     | editor/admin | 新建文档元数据           |
| GET    | `/api/phase5/documents`     | 已登录       | 分页查询文档             |
| GET    | `/api/phase5/documents/:id` | 已登录       | 获取文档详情             |
| PUT    | `/api/phase5/documents/:id` | editor/admin | 更新文档元数据           |
| DELETE | `/api/phase5/documents/:id` | admin        | 删除或标记删除文档元数据 |

文档创建请求：

```json
{
  "documentKey": "resource-wall-guide",
  "title": "资源墙规则",
  "sourcePath": "resource-wall-guide.md",
  "fileName": "resource-wall-guide.md",
  "mimeType": "text/markdown",
  "contentHash": "sha256-value",
  "chunkCount": 4,
  "collectionName": "virtual_utopia_rag",
  "status": "indexed",
  "metadata": {}
}
```

### 4.5 日志查询

| 方法 | 路径                   | 权限           | 说明                             |
| ---- | ---------------------- | -------------- | -------------------------------- |
| GET  | `/api/phase5/logs`     | 已登录         | 按用户、会话、状态和时间查询日志 |
| GET  | `/api/phase5/logs/:id` | admin          | 获取单条日志详情                 |
| POST | `/api/phase5/logs`     | 内部服务/admin | 写入操作或RAG检索日志            |

查询参数：

```text
?userId=1&sessionId=pub_xxx&status=success&from=2026-09-01&to=2026-09-30&limit=50
```

## 5. 与Phase4服务集成方式

### 5.1 解耦原则

Phase5作为独立HTTP服务运行，phase4不直接读取SQLite文件，也不直接依赖SQLite驱动。

集成关系：

```text
phase4主服务3200
      │
      │ HTTP
      ▼
Phase5持久化服务3300
      │
      ▼
SQLite单文件
```

### 5.2 会话模式开关

新增环境变量：

```text
SESSION_STORAGE_MODE=memory
```

可选值：

- `memory`：保持阶段二原有内存会话逻辑。
- `sqlite`：使用Phase5持久会话适配器。

默认值保持：

```text
memory
```

### 5.3 适配器设计

Phase5提供会话存储适配器，接口保持与原有`sessionStore`兼容：

- `createSession`
- `getSession`
- `appendMessages`
- `startCleanup`
- `size`

未来通过Phase5新增的集成入口把适配器注入原有`createApp`，不修改阶段二至阶段四源码。

会话创建链路：

```text
phase4请求
  → sessionStore.createSession
  → memory模式：原内存实现
  → sqlite模式：调用Phase5 POST /sessions
```

会话读取链路：

```text
phase4请求
  → sessionStore.getSession
  → memory模式：原内存实现
  → sqlite模式：调用Phase5 GET /sessions/:id
```

消息追加链路：

```text
phase4请求
  → sessionStore.appendMessages
  → memory模式：原内存实现
  → sqlite模式：调用Phase5 PUT /sessions/:id
```

失败策略：

- `memory`模式：Phase5不参与，链路完全不变。
- `sqlite`模式：Phase5不可用时请求失败并返回明确错误，不回退到内存模式，避免数据静默丢失。

### 5.4 RAG日志集成

RAG服务完成入库或查询后，可按需调用：

```text
POST /api/phase5/logs
```

写入`rag_logs`。

日志写入失败不应阻断主回答链路，但必须记录本地错误日志。该策略可在实现阶段通过开关控制。

## 6. 前端配套最小功能

Phase5前端只增加最小可用界面，不扩展其他业务：

### 6.1 登录页面

功能：

- 用户名和密码输入。
- 登录提交和错误提示。
- 登录成功后保存Bearer Token到前端内存或安全存储。
- 根据角色显示基础导航。

### 6.2 知识库文档列表面板

功能：

- 分页展示文档标题、来源路径、集合名称、状态、分块数和更新时间。
- 查看文档元数据详情。
- 对`editor/admin`显示新增、编辑和删除操作入口。

### 6.3 对话历史查看面板

功能：

- 按用户和时间展示持久会话列表。
- 点击会话查看消息历史。
- 显示场景、会话类型、归属Agent和最后更新时间。
- 默认只读，`admin`可删除。

## 7. 环境变量配置清单

### 7.1 Phase5服务配置

| 变量                        | 建议默认值                                 | 说明                   |
| --------------------------- | ------------------------------------------ | ---------------------- |
| `PHASE5_ENABLED`            | `false`                                    | Phase5总开关           |
| `PHASE5_PORT`               | `3300`                                     | Phase5 HTTP端口        |
| `PHASE5_DB_PATH`            | `H:\BP2\data\virtual_utopia_phase5.sqlite` | SQLite文件路径         |
| `PHASE5_DB_BUSY_TIMEOUT_MS` | `5000`                                     | SQLite忙等待时间       |
| `PHASE5_AUTH_SECRET`        | 必填                                       | Token签名密钥          |
| `PHASE5_TOKEN_TTL_SECONDS`  | `28800`                                    | Token有效期，默认8小时 |
| `PHASE5_LOG_RETENTION_DAYS` | `90`                                       | 日志保留天数           |
| `PHASE5_REQUEST_TIMEOUT_MS` | `5000`                                     | 客户端请求超时         |

### 7.2 phase4集成配置

| 变量                   | 建议默认值              | 说明                 |
| ---------------------- | ----------------------- | -------------------- |
| `SESSION_STORAGE_MODE` | `memory`                | `memory`或`sqlite`   |
| `PHASE5_BASE_URL`      | `http://localhost:3300` | Phase5服务地址       |
| `PHASE5_TIMEOUT_MS`    | `3000`                  | phase4调用Phase5超时 |
| `PHASE5_LOG_ENABLED`   | `false`                 | 是否写入RAG日志      |

### 7.3 前端配置

| 变量                        | 建议默认值              | 说明             |
| --------------------------- | ----------------------- | ---------------- |
| `VITE_PHASE5_API_BASE_URL`  | `http://localhost:3300` | Phase5 API地址   |
| `VITE_PHASE5_LOGIN_ENABLED` | `false`                 | 是否显示登录入口 |

## 8. 测试方案

### 8.1 数据库与迁移测试

验证：

- 首次启动自动创建4张表。
- 重复启动不重复创建表。
- 外键和索引存在。
- WAL模式生效。

### 8.2 认证与权限测试

验证：

- 正确密码登录成功。
- 错误密码登录失败。
- 禁用用户无法登录。
- `admin`、`editor`、`viewer`权限区分。
- 无Token或过期Token请求被拒绝。

### 8.3 会话持久化E2E

测试文件建议：

```text
backend/tests/phase5.persistence.e2e.mjs
```

步骤：

1. 使用临时SQLite文件启动Phase5服务。
2. 创建用户并登录。
3. 创建公共会话。
4. 写入用户消息和Agent回答。
5. 停止并重新启动Phase5服务。
6. 通过会话ID读取会话。
7. 验证消息、场景、会话类型、归属Agent和更新时间未丢失。

### 8.4 文档元数据持久化E2E

步骤：

1. 创建文档元数据。
2. 编辑标题、分块数量或状态。
3. 停止并重新启动Phase5服务。
4. 查询文档列表和详情。
5. 验证字段值与重启前一致。
6. 执行软删除并验证状态。

### 8.5 RAG日志测试

验证：

- 写入查询日志。
- 写入入库日志。
- 按用户、会话、状态和时间查询。
- 记录`matched_count`、阈值、TopK和延迟。

### 8.6 模式切换回归

验证：

- `SESSION_STORAGE_MODE=memory`时完全不调用Phase5。
- `SESSION_STORAGE_MODE=sqlite`时调用Phase5。
- 两种模式不会互相污染。
- 阶段二至阶段四原测试全部保持通过。

## 9. 数据生命周期与运行边界

1. 默认`memory`模式，保持阶段二原会话行为。
2. `sqlite`模式仅保存新创建或显式迁移的会话。
3. 过期会话保留记录，状态可更新为`expired`，是否物理删除由保留策略决定。
4. 文档元数据只描述知识库文档，不替代Chroma向量数据。
5. Phase5服务不可用时，`sqlite`模式请求失败，不回退内存。
6. SQLite文件需要定期备份，建议在服务停止或WAL检查点后备份。
7. 第一阶段不实现复杂用户注册流程，仅提供初始化管理员和基础用户管理。
8. 第一阶段不实现角色自定义和细粒度资源授权。

## 10. 实施边界

Phase5设计范围仅包含：

- SQLite持久化服务。
- 四张表及迁移。
- 基础认证与角色。
- 会话和文档元数据持久化。
- RAG操作日志。
- Phase5 HTTP接口。
- Phase4按需调用适配器。
- 前端最小登录、文档列表和对话历史页面。

不包含：

- 修改阶段一至阶段四已验收源码。
- 修改原有内存会话实现。
- 将DeepSeek、RAG或Agent核心逻辑迁移到Phase5。
- 复杂权限系统、第三方登录、多租户或云数据库。

## 11. 状态

Phase5状态：【方案设计完成，待开发】。

本文档只作为后续开发依据，不代表已创建Phase5业务代码，也不代表已修改阶段四或启动Phase5服务。
