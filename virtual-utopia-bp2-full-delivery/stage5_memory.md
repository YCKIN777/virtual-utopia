# 虚拟乌托邦项目｜阶段五完整记忆文档

> 用途：归档Phase5 SQLite持久化服务的模块结构、数据表、API、模式开关、测试结果、启动顺序和冻结状态。
> 适用：总控Agent / CodeX读取，掌握阶段五完整上下文，保护阶段一至阶段四冻结成果不被改动。

## 1. 项目全局状态

项目名称：virtual-utopia BP2

当前整体状态：

- 阶段一【已冻结】：工程、HIG组件、矢量地图和六场景容器已交付。
- 阶段二【已冻结】：分支Agent、场景绑定、内存会话隔离和真实DeepSeek E2E已验收。
- 阶段三【已冻结】：独立RAG知识库服务已开发并完成自测。
- 阶段四【已冻结】：RAG与主Agent集成模块已开发并完成自测。
- 阶段五【开发+自测完成，冻结，等待整体项目验收】：独立SQLite持久化元数据服务已完成。

Phase5核心目标：在不修改阶段一至阶段四任何源码的前提下，新增独立SQLite持久化服务，提供用户认证、会话持久化、知识库文档元数据管理和RAG日志存储。

## 2. 模块位置与交付范围

模块目录：

```text
backend/src/phase5/
```

新增文件：

- `backend/src/phase5/config.js`
- `backend/src/phase5/database.js`
- `backend/src/phase5/errors.js`
- `backend/src/phase5/security.js`
- `backend/src/phase5/repositories.js`
- `backend/src/phase5/httpServer.js`
- `backend/src/phase5/sessionStoreAdapter.js`
- `backend/src/phase5/server.js`
- `backend/src/phase5/integratedServer.js`
- `backend/src/phase5/index.js`
- `backend/src/phase5/schema.sql`
- `backend/src/phase5/tests/phase5.persistence.e2e.mjs`

未修改：

- 阶段一至阶段四业务源码。
- `stage2_memory.md`
- `stage3_memory.md`
- `stage4_memory.md`
- `phase5_design.md`
- 项目原有`.env`文件。
- `backend/package.json`或`package-lock.json`。

## 3. 数据库技术选型

数据库：SQLite单文件本地数据库。

驱动：Node.js内置`node:sqlite`。

运行要求：

- 建议Node.js`>=22.5`。
- 当前验证环境Node.js`v24.18.0`。
- 不依赖PostgreSQL，不依赖外部数据库服务。

默认数据库文件：

```text
H:\BP2\data\virtual_utopia_phase5.sqlite
```

初始化配置：

- `PRAGMA journal_mode = WAL`
- `PRAGMA foreign_keys = ON`
- `PRAGMA busy_timeout`

四张核心数据表：

1. `users`
2. `chat_sessions`
3. `knowledge_documents`
4. `rag_logs`

## 4. 核心能力

### 4.1 用户账号与角色鉴权

当前实际实现角色：

| 角色     | 权限                                       |
| -------- | ------------------------------------------ |
| `admin`  | 用户管理、全部会话、全部文档、全部日志     |
| `editor` | 文档元数据CRUD、自己的会话读写、自己的日志 |
| `viewer` | 只读文档元数据和自己的会话历史             |

补充说明：任务摘要中曾提及`admin/guest`，但当前已验收代码实现的是`admin/editor/viewer`，不存在`guest`角色。

认证能力：

- 用户名密码登录。
- 密码使用`scrypt`哈希保存。
- HMAC签名Bearer Token。
- 支持管理员初始化用户。
- 支持服务间`X-Phase5-Service-Token`调用。

### 4.2 会话持久化

- 保存公共会话和私聊会话。
- 保存`id`、用户、场景、会话类型和归属Agent。
- 保存消息历史、创建时间、更新时间和过期时间。
- 支持创建、读取、更新和软删除。
- 服务重启后会话和消息不丢失。
- 适配器兼容原`sessionStore`的`type`、`messages`、`expiresAt`等字段。

### 4.3 知识库文档元数据

- 新增文档元数据。
- 查询文档列表和详情。
- 更新标题、来源路径、哈希、分块数、集合名称和状态。
- 软删除文档元数据。
- 仅保存元数据，不保存Chroma向量内容。

### 4.4 RAG日志

- 保存RAG查询和入库操作日志。
- 保存用户、会话、集合、TopK、阈值、命中数和耗时。
- 支持按用户、会话、状态和时间查询。
- 支持单条日志读取。

## 5. SESSION_STORAGE_MODE模式开关

环境变量：

```text
SESSION_STORAGE_MODE=memory
```

可选模式：

| 模式     | 行为                                 |
| -------- | ------------------------------------ |
| `memory` | 使用原内存会话实现，完全不调用Phase5 |
| `sqlite` | 使用Phase5 HTTP服务持久化会话        |

默认值：

```text
memory
```

`memory`模式保证阶段二至阶段四原始行为不变。

`sqlite`模式通过Phase5适配器持久化，不修改原`sessionStore`接口。

## 6. HTTP API清单

Phase5独立服务默认地址：

```text
http://localhost:3300
```

### 6.1 健康检查

| 方法 | 路径                 |
| ---- | -------------------- |
| GET  | `/health`            |
| GET  | `/api/phase5/health` |

### 6.2 登录与身份

| 方法 | 路径                      |
| ---- | ------------------------- |
| POST | `/api/phase5/auth/login`  |
| GET  | `/api/phase5/auth/me`     |
| POST | `/api/phase5/auth/logout` |

### 6.3 用户管理

| 方法 | 路径                    |
| ---- | ----------------------- |
| POST | `/api/phase5/users`     |
| GET  | `/api/phase5/users`     |
| PUT  | `/api/phase5/users/:id` |

### 6.4 会话CRUD

| 方法   | 路径                       |
| ------ | -------------------------- |
| POST   | `/api/phase5/sessions`     |
| GET    | `/api/phase5/sessions`     |
| GET    | `/api/phase5/sessions/:id` |
| PUT    | `/api/phase5/sessions/:id` |
| DELETE | `/api/phase5/sessions/:id` |

### 6.5 文档元数据CRUD

| 方法   | 路径                        |
| ------ | --------------------------- |
| POST   | `/api/phase5/documents`     |
| GET    | `/api/phase5/documents`     |
| GET    | `/api/phase5/documents/:id` |
| PUT    | `/api/phase5/documents/:id` |
| DELETE | `/api/phase5/documents/:id` |

### 6.6 RAG日志

| 方法 | 路径                   |
| ---- | ---------------------- |
| POST | `/api/phase5/logs`     |
| GET  | `/api/phase5/logs`     |
| GET  | `/api/phase5/logs/:id` |

## 7. 环境变量

| 变量                              | 默认值                                     | 说明               |
| --------------------------------- | ------------------------------------------ | ------------------ |
| `PHASE5_ENABLED`                  | `false`                                    | Phase5能力开关     |
| `PHASE5_PORT`                     | `3300`                                     | Phase5 HTTP端口    |
| `PHASE5_DB_PATH`                  | `H:\BP2\data\virtual_utopia_phase5.sqlite` | SQLite文件         |
| `PHASE5_DB_BUSY_TIMEOUT_MS`       | `5000`                                     | SQLite忙等待       |
| `PHASE5_AUTH_SECRET`              | 必填                                       | Token签名密钥      |
| `PHASE5_SERVICE_TOKEN`            | 必填                                       | 服务间调用令牌     |
| `PHASE5_BOOTSTRAP_ADMIN_USERNAME` | `admin`                                    | 初始化管理员       |
| `PHASE5_BOOTSTRAP_ADMIN_PASSWORD` | 必填                                       | 初始化管理员密码   |
| `PHASE5_TOKEN_TTL_SECONDS`        | `28800`                                    | Token有效期        |
| `PHASE5_LOG_RETENTION_DAYS`       | `90`                                       | 日志保留周期       |
| `SESSION_STORAGE_MODE`            | `memory`                                   | `memory`或`sqlite` |
| `PHASE5_BASE_URL`                 | `http://localhost:3300`                    | Phase5服务地址     |
| `PHASE5_TIMEOUT_MS`               | `3000`                                     | 客户端超时         |

## 8. 测试结果

独立E2E脚本：

```text
backend/src/phase5/tests/phase5.persistence.e2e.mjs
```

验证结果：

```json
{
  "sessionPersistenceAfterRestart": {
    "messages": 2
  },
  "documentPersistenceAfterRestart": {
    "chunkCount": 7,
    "status": "indexed"
  },
  "logPersistenceAfterRestart": {
    "count": 1
  },
  "memoryMode": {
    "phase5Calls": 0
  },
  "sqliteMode": {
    "restoredMessages": 2
  }
}
```

验证内容：

- 用户和管理员登录。
- 创建`editor`用户。
- 会话创建和消息写入。
- 文档元数据新增和更新。
- RAG日志写入和查询。
- Phase5服务关闭并重新启动。
- 重启后会话消息、文档元数据和日志均保持。
- `memory`模式调用Phase5次数为`0`。
- `sqlite`模式适配器重启后成功恢复会话。

全量回归：

- 新增JavaScript文件语法检查通过。
- 新增文件UTF-8、无BOM、LF换行。
- `npm run check`通过。
- 前端测试：9/9通过。
- 原阶段二后端测试：33/33通过。
- 原阶段一至阶段四测试全部保留，无回归失败。
- Phase5独立服务入口已验证可启动。
- 无额外npm依赖变更。

## 9. 架构边界

1. Phase5只负责元数据持久化，不接管Chroma向量存储。
2. `knowledge_documents`只保存文档元数据，向量仍保存在ChromaDB。
3. 不修改DeepSeek、RAG和Agent业务逻辑。
4. 不修改阶段二原有内存会话实现。
5. `sqlite`模式通过Phase5 HTTP服务访问SQLite，phase4不直接读取数据库文件。
6. `memory`模式保持原行为，完全不调用Phase5。
7. Phase5服务不可用时，`sqlite`模式请求失败，不回退内存，避免静默丢数据。

## 10. 启停与运行顺序

完整启动顺序：

`Chroma 8000 → Phase3 RAG服务 3100 → Phase5持久服务 3300 → Phase4主服务 3200 → 前端 5173`

Phase5服务：

```powershell
$env:PHASE5_PORT='3300'
$env:PHASE5_DB_PATH='H:\BP2\data\virtual_utopia_phase5.sqlite'
$env:PHASE5_AUTH_SECRET='replace-with-local-secret'
$env:PHASE5_SERVICE_TOKEN='replace-with-service-token'
$env:PHASE5_BOOTSTRAP_ADMIN_PASSWORD='replace-with-admin-password'
node backend/src/phase5/server.js
```

Phase5集成模式启动：

```powershell
$env:SESSION_STORAGE_MODE='sqlite'
$env:PHASE5_BASE_URL='http://localhost:3300'
$env:PHASE5_SERVICE_TOKEN='replace-with-service-token'
$env:PHASE4_PORT='3200'
node backend/src/phase5/integratedServer.js
```

内存模式启动：

```powershell
$env:SESSION_STORAGE_MODE='memory'
$env:PHASE4_PORT='3200'
node backend/src/phase5/integratedServer.js
```

## 11. 阶段五状态

阶段五状态：【开发+自测完成，冻结，等待整体项目验收】。

未收到新的明确指令前，不启动后续阶段开发，不扩展Phase5范围之外的业务功能。
