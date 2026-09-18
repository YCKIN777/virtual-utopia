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

## 12. 后续阶段更新记录

### 12.1 Phase5持久化 ↔ 3D前端集成

阶段名称：3D前端Phase5持久化接入

状态：开发完成，自测通过。

变更内容：

- 通过3400 Phase6网关读写Phase5持久化服务。
- 世界快照使用保留会话`world-<userId>`，不修改Phase5原有表结构。
- 世界快照仅保存用户地块ID、院落物品、室内家具和用户权限。
- 登录令牌使用浏览器`sessionStorage`保存，刷新后可恢复。
- Phase5不可用时保留内存模式回退。

### 12.2 家园装扮编辑器

阶段名称：拖拽式家园装扮编辑器

状态：开发完成，自测通过。

变更内容：

- 新增独立覆盖层组件`HomeDecorator.vue`，不修改Three.js场景美术结构。
- 支持院落与室内双模式。
- 支持家具素材拖拽放置、移动、旋转、删除和保存。
- editor/admin可管理自己的家园，viewer仅能漫游。
- 家园数据写入world快照，刷新页面后自动恢复。

### 12.3 多人在线Avatar

阶段名称：多人在线Avatar实时漫游

状态：开发完成，自测通过。

变更内容：

- 新增Phase6内存在线状态管理`presenceStore.js`。
- 前端每250ms同步位置、朝向和动画状态。
- 多个登录用户可互相看到Avatar。
- 新增在线用户列表，显示名称和角色。
- 离线或超时用户自动从在线列表移除。

### 12.4 Avatar行走与待机动画

阶段名称：Avatar动画增强

状态：开发完成，自测通过。

变更内容：

- Avatar增加独立四肢程序化动画。
- 静止时播放idle待机动作。
- WASD移动时自动切换walk步态，停止后恢复idle。
- 动画状态随presence同步，其他客户端可见。
- 不引入外部骨骼或动画资源。

### 12.5 世界多人文字聊天

阶段名称：虚拟世界多人文字聊天模块

状态：开发完成，自测通过。

变更内容：

- 新增全局世界频道，所有登录用户均可查看和发送消息。
- 消息附带发送账号名称、显示名称和发送时间。
- Phase6网关提供世界频道历史读取与消息发送接口。
- 聊天记录持久化到保留会话`world-chat-global`，不修改Phase5表结构。
- 后端使用顺序队列避免并发消息覆盖，最多保留最近200条。
- 前端使用短轮询获取新消息，新登录用户自动加载最近历史。
- 聊天面板位于右下角，支持打开、关闭、输入和发送。

### 12.6 当前完整能力清单

1. Three.js 3D山谷世界漫游。
2. 昼夜切换、雾气、风动和样板室内模式。
3. 50户木屋、生活广场、溪流、连廊和院落场景基线。
4. Phase5持久化登录、world快照和刷新恢复。
5. admin/editor/viewer角色权限与地块隔离。
6. 拖拽式家园装扮编辑器。
7. 多人在线Avatar互见与位置同步。
8. Avatar idle/walk程序化动画及状态同步。
9. 在线用户列表。
10. 全局世界文字聊天与历史消息持久化。

### 12.7 待办任务列表

1. 扩充家具、绿植和装饰素材库。
2. 增加Avatar更多动作、表情和外观选择。
3. 增加私聊、附近频道或频道切换。
4. 项目整体打包、全套验收文档和部署上线准备。
5. 根据部署环境补充正式身份密钥、服务令牌和CORS域名配置。

## 13. 家园装饰素材库扩充

### 13.1 阶段信息

阶段名称：家园装饰素材库扩充

状态：开发完成，自测通过。

### 13.2 变更内容

- 新增`户外绿植`分类：竹林组景、蕨类灌木、藤蔓屏风、橄榄树。
- 新增`盆栽`分类：陶盆绿植、松柏盆景、陶盆花束、悬挂花篮。
- 新增`景观石`分类：立景石、叠石组、卵石小景、石灯笼。
- 新增`灯笼`分类：纸灯笼、木框灯笼、节庆灯笼、落地灯笼。
- 新增`装饰摆件`分类：木雕摆件、陶罐摆件、风铃挂饰、庭院木牌。
- 新增`室内软装`分类：草编地毯、布艺坐垫、亚麻矮榻、木格屏风、针织毛毯。
- 所有新增素材复用现有拖拽、移动、旋转、删除和保存逻辑。
- 新增素材通过`materialId`写入world快照，不需要修改Phase5表结构。
- 新增零成本素材会自动加入默认解锁列表。
- 编辑器分类白名单已扩展，新分类可直接显示。

### 13.3 持久化验证

- 新增`pot-ceramic`素材已在真实Phase5临时数据库中完成写入。
- 新建前端Store后成功读取并恢复室内盆栽配置。
- 编辑器E2E验证院落与室内新增素材的放置、移动、旋转、删除和刷新恢复。

### 13.4 当前完整能力清单

1. Three.js 3D山谷世界漫游。
2. 昼夜切换、雾气、风动和样板室内模式。
3. 50户木屋、生活广场、溪流、连廊和院落场景基线。
4. Phase5持久化登录、world快照和刷新恢复。
5. admin/editor/viewer角色权限与地块隔离。
6. 拖拽式家园装扮编辑器。
7. 院落与室内双模式家具摆放。
8. 家具、绿植、盆栽、景观石、灯笼、摆件和室内软装素材库。
9. 多人在线Avatar互见与位置同步。
10. Avatar idle/walk程序化动画及状态同步。
11. 在线用户列表。
12. 全局世界文字聊天与历史消息持久化。

### 13.5 待办任务列表

1. 增加素材分类搜索、收藏和最近使用。
2. 增加更多家具变体、季节限定素材和主题套装。
3. 增加Avatar更多动作、表情和外观选择。
4. 增加私聊、附近频道或频道切换。
5. 项目整体打包、全套验收文档和部署上线准备。
6. 根据部署环境补充正式身份密钥、服务令牌和CORS域名配置。

## 14. 项目打包验收与部署文档

### 14.1 阶段信息

阶段名称：虚拟乌托邦项目打包验收与部署文档全套生成

状态：开发完成，自测通过。

### 14.2 变更内容

- 新增完整项目验收报告`docs/ACCEPTANCE_REPORT_V2.md`。
- 新增本地部署指南`docs/LOCAL_DEPLOYMENT_GUIDE.md`。
- 新增环境依赖清单`docs/ENVIRONMENT_DEPENDENCIES.md`。
- 新增启动、停止、备份和排障手册`docs/OPERATIONS_MANUAL.md`。
- 新增Phase2、Phase5、Phase6和RAG完整API接口文档`docs/API_REFERENCE.md`。
- 新增交付包内容清单`docs/DELIVERY_MANIFEST.md`。
- 生成结构化完整交付ZIP包。
- 交付包排除`node_modules`、真实`.env`、运行时SQLite和临时产物。
- 交付包保留后端、前端、测试、脚本、数据库结构、全部Markdown文档和memory知识库。

### 14.3 交付包

文件：

```text
H:\BP2\deliverables\virtual-utopia-bp2-delivery-20260917-v1.1-structured.zip
```

SHA256：

```text
2A61A005DC3E2050C29D322107B7B634454EFC3353363D4B7FE0F3A176D77DFD
```

校验文件：

```text
H:\BP2\deliverables\virtual-utopia-bp2-delivery-20260917-v1.1-structured.zip.sha256
```

### 14.4 回归验证

- `npm run check`通过。
- 前端基础测试9/9通过。
- 后端基础测试33/33通过。
- WebGL世界E2E通过。
- 家园编辑器E2E通过。
- Avatar在线与动画E2E通过。
- 世界聊天E2E通过。
- Phase6网关E2E通过。
- 真实Phase5持久化E2E通过。

### 14.5 当前完整能力清单

1. Three.js 3D山谷世界漫游。
2. 昼夜切换、雾气、风动和样板室内模式。
3. 50户木屋、生活广场、溪流、连廊和院落场景基线。
4. Phase5持久化登录、world快照和刷新恢复。
5. admin/editor/viewer角色权限与地块隔离。
6. 拖拽式家园装扮编辑器。
7. 院落与室内双模式家具摆放。
8. 家具、绿植、盆栽、景观石、灯笼、摆件和室内软装素材库。
9. 多人在线Avatar互见与位置同步。
10. Avatar idle/walk程序化动画及状态同步。
11. 在线用户列表。
12. 全局世界文字聊天与历史消息持久化。
13. 完整验收、部署、环境、运维和API文档。
14. 结构化源码与文档交付包。

### 14.6 待办任务列表

1. 增加素材分类搜索、收藏和最近使用。
2. 增加更多家具变体、季节限定素材和主题套装。
3. 增加Avatar更多动作、表情和外观选择。
4. 增加私聊、附近频道或频道切换。
5. 补充正式域名、HTTPS、反向代理和生产密钥管理。
6. 根据部署规模评估WebSocket替代短轮询和集中式数据库迁移。

## 15. BP2交付包Obsidian归档

### 15.1 阶段信息

阶段名称：BP2交付包归档同步至Obsidian知识库

状态：开发完成，自测通过。

### 15.2 归档位置

Obsidian Vault：

```text
H:\Obsidian\vault-bp2
```

项目总索引：

```text
虚拟乌托邦-BP2交付归档.md
```

文档归档目录：

```text
BP2交付归档-20260917-v1.1/
```

归档说明：

```text
BP2交付归档-20260917-v1.1/归档说明.md
```

### 15.3 归档内容

- 验收报告。
- 本地部署指南。
- 环境依赖清单。
- 运维操作手册。
- API接口总览。
- 交付包清单。
- Phase5设计文档。
- stage2、stage3、stage4、stage5 memory知识库。
- 数据库README。
- 小程序README。
- 旧版验收和部署文档。

共导入17份交付Markdown，并额外生成1份归档说明。

### 15.4 双向链接

- 总索引链接全部17份归档文档。
- 每份归档副本追加返回总索引链接。
- 归档说明链接总索引。
- 索引和归档说明均添加永久冻结声明。

### 15.5 交付包校验

交付包：

```text
H:\BP2\deliverables\virtual-utopia-bp2-delivery-20260917-v1.1-structured.zip
```

SHA256：

```text
F3AB87CA4BB5017D845A118AFC47425C8FE323B314C04B5B398FAC3206E64695
```

校验结果：

- 交付包哈希与归档记录一致。
- 17份Markdown导入完整。
- 所有归档副本包含双向返回链接。
- 总索引17条文档链接全部有效。
- 所有归档Markdown为UTF-8、LF、无BOM。
- 未修改BP2源码或原有Vault笔记。

### 15.6 版本冻结声明

BP2-V1.1源码、测试、文档、交付包和memory知识库正式冻结。

后续任何变更必须建立新的版本目录、新的交付包和新的SHA256记录，不得覆盖本次Obsidian归档。

### 15.7 当前完整能力清单

1. Three.js 3D山谷世界漫游。
2. 昼夜切换、雾气、风动和样板室内模式。
3. 50户木屋、生活广场、溪流、连廊和院落场景基线。
4. Phase5持久化登录、world快照和刷新恢复。
5. admin/editor/viewer角色权限与地块隔离。
6. 拖拽式家园装扮编辑器。
7. 院落与室内双模式家具摆放。
8. 家具、绿植、盆栽、景观石、灯笼、摆件和室内软装素材库。
9. 多人在线Avatar互见与位置同步。
10. Avatar idle/walk程序化动画及状态同步。
11. 在线用户列表。
12. 全局世界文字聊天与历史消息持久化。
13. 完整验收、部署、环境、运维和API文档。
14. 结构化源码与文档交付包。
15. Obsidian交付归档、总索引和双向知识链接。

### 15.8 待办任务列表

1. 后续版本需在新目录中开发，不修改BP2-V1.1冻结归档。
2. 增加素材搜索、收藏、主题套装和季节限定内容。
3. 增加Avatar更多动作、表情和外观选择。
4. 增加私聊、附近频道和实时长连接通信。
5. 完成生产域名、HTTPS、反向代理和正式密钥管理。
6. 根据规模评估集中式数据库和多实例在线状态方案。

## 16. BP3需求规划启动

### 16.1 阶段信息

阶段名称：虚拟乌托邦 BP3 需求规划

状态：规划中，BP2-V1.1继续永久冻结。

### 16.2 规划文档

新增：

```text
docs/BP3-Requirement-Spec.md
```

### 16.3 BP3候选功能

P0：

1. 世界语音频道，多人实时语音对话。
2. 家园访客访问权限和门锁机制。

P1：

1. 世界事件与任务系统。
2. 素材资源收集和背包系统。

P2：

1. Avatar表情与动作扩展。
2. 家园访客留言板。

### 16.4 BP3实施原则

- BP2源码、交付包和Obsidian归档完全只读。
- BP3使用独立服务目录、独立路由前缀和独立数据表。
- 不在BP2模块中直接加入BP3业务逻辑。
- 语音优先评估WebRTC和SFU方案。
- 家园权限必须在服务端校验。
- BP3发布前必须完整回归BP2-V1.1。

### 16.5 当前状态

BP3处于需求规划阶段，尚未开始业务代码开发。

项目状态：BP2正式冻结，BP3规划启动。

## 17. BP3开发任务清单拆解

### 17.1 阶段信息

阶段名称：虚拟乌托邦 BP3 开发任务清单拆解

状态：规划文档完成。

### 17.2 新增文档

```text
docs/BP3-Task-List.md
```

### 17.3 里程碑

- BP3-M1：P0功能开发，包括世界语音、家园访客权限和门锁。
- BP3-M2：P1功能开发，包括世界事件、任务、资源采集和背包。
- BP3-M3：P2功能、整体联调和最终验收。

### 17.4 重点风险

- WebRTC语音连接、弱网、回声和设备兼容。
- 实时信令鉴权、频道管理权限和令牌过期。
- 家园门锁越权、临时授权撤销和并发状态一致。
- 任务奖励重复、背包并发消耗和事务回滚。
- BP2冻结基线回归。

### 17.5 当前状态

BP3任务已按编号、优先级、责任人、依赖、验收标准拆分。

BP2-V1.1继续永久冻结；BP3尚未开始业务代码开发。

项目状态：BP3任务规划完成，等待进入BP3-M1实施。

## 18. BP3-M1 P0模块开发

### 18.1 阶段信息

阶段名称：虚拟乌托邦 BP3-M1 P0核心模块开发

状态：开发完成，自检通过。

### 18.2 独立工作区

新增独立目录：

```text
H:\BP2\bp3\
```

目录内包含：

```text
bp3/backend/src/
bp3/frontend/src/
bp3/data/virtual_utopia_bp3.sqlite
bp3/tests/bp3-m1.e2e.mjs
bp3/artifacts/
```

BP3使用独立服务、独立数据库、独立前端入口和`/api/bp3`路由前缀。
BP2源码、Three.js美术结构、50户木屋坐标、地形、广场、溪流、
山体、树木数量、导航和原有UI均未修改。

### 18.3 已实现P0能力

- 世界语音频道，媒体流通过mediasoup SFU转发，不使用Mesh。
- WebSocket语音信令、发送/接收Transport、生产与消费订阅、
  心跳响应、断线重连和资源释放。
- 语音加入、离开、静音、成员状态、管理员静音和移出。
- 短时语音访问令牌，包含用户、角色、频道、权限范围与过期时间。
- 家园访问规则：`public`、`private`、`request`、`whitelist`。
- 家园白名单、黑名单、访客申请、审批、拒绝和撤销。
- 门锁开关、一次性授权、临时邀请、邀请兑换和访问记录。
- 所有用户、地块、角色和归属判断均由BP3服务端校验。
- 前端独立复用Three.js世界，并提供语音面板、家园权限面板、
  门锁UI和访客申请弹窗。

### 18.4 数据库

默认数据库：

```text
H:\BP2\bp3\data\virtual_utopia_bp3.sqlite
```

新增BP3独立表：

- `bp3_schema_migrations`
- `bp3_plot_owners`
- `bp3_voice_channels`
- `bp3_voice_participants`
- `bp3_voice_blacklist`
- `bp3_home_access_rules`
- `bp3_home_visitors`
- `bp3_home_access_requests`
- `bp3_home_access_grants`
- `bp3_home_visit_logs`
- `bp3_audit_logs`

Phase5原有`users`、`chat_sessions`、`knowledge_documents`、
`rag_logs`表结构未变更。

### 18.5 验证结果

BP3检查：

- `npm run check`通过。
- 后端单元与接口测试7/7通过。
- `npm run build`通过。
- `npm run test:e2e`通过。
- 两用户加入同一语音频道，双方各自建立远端音频轨道。
- viewer语音管理返回403。
- 家园访问申请、审批、一次性授权、门锁开放和邀请兑换通过。
- 桌面和移动端验收截图生成于`bp3/artifacts/`。

BP2回归：

- 后端测试33/33通过。
- 前端基础测试9/9通过。
- Three.js世界E2E通过。
- 家园装扮编辑器E2E通过。
- 多人在线Avatar与动画E2E通过。
- 世界文字聊天E2E通过。
- Phase5持久化E2E通过。
- Phase6世界快照、聊天和网关E2E通过。

### 18.6 当前完整能力清单

1. Three.js 3D山谷世界漫游和原有场景美术基线。
2. 原有昼夜、雾气、风动、室内模式和家园编辑器。
3. 原有Phase5持久化、Avatar同步和世界文字聊天。
4. mediasoup SFU世界多人语音频道。
5. 语音成员、静音、管理员治理和短时令牌。
6. 家园访问规则、白名单、黑名单和访客审批。
7. 门锁、临时邀请、一次性授权、撤销与访问审计。
8. 独立BP3前端覆盖层及移动端布局。

### 18.7 后续待办

1. BP3-M2：世界事件与任务系统。
2. BP3-M2：素材资源收集与背包系统。
3. BP3-M3：Avatar动作表情扩展和访客留言板。
4. 生产环境HTTPS、TURN中继、mediasoup announced IP与域名配置。
5. 根据并发规模扩展mediasoup Worker和集中式在线状态存储。

项目状态：BP3-M1 P0功能开发完成，BP2-V1.1冻结基线保持不变。

## 19. BP3-M2 P1模块开发

### 19.1 阶段信息

阶段名称：虚拟乌托邦 BP3-M2 P1模块开发

状态：开发完成，自检通过。

### 19.2 独立增量范围

新增独立目录：

```text
H:\BP2\bp3\p1\
```

目录内包含：

```text
bp3/p1/backend/src/
bp3/p1/frontend/
bp3/p1/tests/bp3-m2.e2e.mjs
bp3/p1/artifacts/
```

M1 P0目录及其源码未修改，未新增任何P2代码。

### 19.3 已实现P1能力

- 世界事件创建、排期、激活、结束和前端提示弹窗。
- 世界任务定义、领取、进度、完成、奖励领取和幂等保护。
- 地面资源节点、资源采集、交互半径和冷却恢复。
- Three.js世界资源标记、脉冲动画、邻近拾取提示和拾取动画。
- 背包容量、物品堆叠、物品事务、奖励发放和手动消耗。
- 服务端库存事务和并发扣减校验。
- admin事件、任务和资源管理接口；editor/viewer按权限参与探索。

### 19.4 新增数据表

继续使用BP3独立数据库：

```text
H:\BP2\bp3\data\virtual_utopia_bp3.sqlite
```

新增表：

- `bp3_p1_item_catalog`
- `bp3_p1_world_events`
- `bp3_p1_tasks`
- `bp3_p1_task_instances`
- `bp3_p1_resource_nodes`
- `bp3_p1_resource_collections`
- `bp3_p1_inventories`
- `bp3_p1_inventory_items`
- `bp3_p1_inventory_transactions`
- `bp3_p1_reward_grants`
- `bp3_p1_audit_logs`

M1的语音、家园权限、门锁、访客和地块归属数据表未变更。

### 19.5 接口与运行

P1独立路由前缀：

```text
/api/bp3/p1
```

本地地址：

- P1后端：`http://127.0.0.1:3511`
- P1前端：`http://127.0.0.1:5177/p1.html`

主要接口覆盖事件、任务、资源、背包、物品事务和奖励发放。
详细启动与接口清单见`bp3/p1/README.md`。

### 19.6 验证结果

P1检查：

- `npm run check`通过。
- P1后端事务测试3/3通过。
- `npm run build`通过。
- `npm run test:e2e`通过。
- 世界事件激活后前端弹出提示。
- 任务领取、资源拾取、任务完成和奖励领取通过。
- 背包物品增加、消耗和事务记录通过。
- 重复领取奖励被幂等保护。
- 并发扣减同一库存物品结果为`200 + 409`，只成功一次。
- 桌面和移动端截图生成于`bp3/p1/artifacts/`。

回归验证：

- M1后端测试7/7通过。
- BP2后端测试33/33通过。
- BP2前端基础测试9/9通过。
- BP2 Three.js、家园编辑器、Avatar、聊天、Phase5和Phase6回归保持通过。

### 19.7 当前完整能力清单

1. M1语音、家园权限、门锁和访客管理。
2. 世界事件与前端事件提示。
3. 世界任务领取、进度和奖励闭环。
4. 地面资源节点、拾取提示和拾取动画。
5. 背包、库存容量、物品事务和并发扣减保护。
6. admin事件/任务/资源配置和奖励审计。

### 19.8 后续待办

1. BP3-M3：Avatar动作表情扩展。
2. BP3-M3：家园访客留言板。
3. 增加赛季事件、任务链和主题奖励配置。
4. 增加资源节点运营后台和生产环境调度配置。

项目状态：BP3-M2 P1功能开发完成，BP2-V1.1冻结基线保持不变。

## 20. BP3-M3 P2模块与整体验收

### 20.1 阶段信息

阶段名称：虚拟乌托邦 BP3-M3 P2模块开发与全链路验收

状态：开发完成，整体验收通过，BP3版本整体开发完毕。

### 20.2 独立增量范围

新增独立目录：

```text
H:\BP2\bp3\p2\
```

目录内包含：

```text
bp3/p2/backend/src/
bp3/p2/frontend/
bp3/p2/tests/bp3-m3.e2e.mjs
bp3/p2/tests/bp3-m3.perf.mjs
bp3/p2/docs/
bp3/p2/artifacts/
```

M1 P0和M2 P1源码未修改，未新增P2之外的业务模块。

### 20.3 已实现P2能力

- Avatar动作目录：待机、挥手、鼓掌、欢呼、坐下。
- Avatar表情目录：开心、惊讶、疑惑、生气。
- Avatar动作状态更新、按用户查询和批量同步。
- Avatar动作面板和场景内动作状态展示。
- 家园留言板新增、查看、作者删除和家园主人删除。
- 留言板继承M1家园访问规则，私密家园拒绝越权读取。
- 服务端忽略客户端伪造作者身份。

### 20.4 新增数据表

继续使用：

```text
H:\BP2\bp3\data\virtual_utopia_bp3.sqlite
```

新增表：

- `bp3_p2_avatar_catalog`
- `bp3_p2_avatar_states`
- `bp3_p2_home_messages`
- `bp3_p2_audit_logs`

M1、M2全部原有数据表保持兼容。

### 20.5 本地服务

完整BP3服务：

- M1后端：`http://127.0.0.1:3500`
- M1前端：`http://127.0.0.1:5176/`
- M2后端：`http://127.0.0.1:3511`
- M2前端：`http://127.0.0.1:5177/p1.html`
- M3后端：`http://127.0.0.1:3521`
- M3前端：`http://127.0.0.1:5187/p2.html`

### 20.6 联调与性能安全

M3 E2E验证：

- M1语音频道加入。
- M2事件激活、任务领取、资源采集、背包增加和奖励领取。
- M3 Avatar动作状态更新和同步。
- M3留言新增、读取、删除和权限拦截。
- M1、M2、M3数据表同库兼容。
- 伪造作者身份无效。
- viewer删除他人留言返回403。
- 私密家园留言读取返回403。
- 40路并发Avatar状态更新全部成功。

性能基准：

- Avatar状态更新500次耗时约143ms。
- 留言创建300条并读取100条耗时约63ms。
- M3并发Avatar更新40次耗时约252ms。

### 20.7 文档补齐

新增：

- `bp3/p2/docs/BP3-FINAL-OVERVIEW.md`
- `bp3/p2/docs/BP3-API-REFERENCE.md`
- `bp3/p2/docs/BP3-DEPLOYMENT.md`
- `bp3/p2/docs/BP3-PERFORMANCE-SECURITY.md`
- `bp3/p2/docs/BP3-ACCEPTANCE-REPORT.md`

文档均为UTF-8、无BOM、LF。

### 20.8 当前完整能力清单

1. M1：mediasoup语音、家园权限、门锁和访客管理。
2. M2：世界事件、任务、资源采集、背包和奖励。
3. M3：Avatar动作表情和家园访客留言板。
4. Phase5身份复用和BP2冻结基线保持。
5. 性能、安全、联调和最终验收文档完整。

### 20.9 版本冻结声明

BP3 M1、M2、M3开发阶段全部完成。

BP2-V1.1继续永久冻结；后续变更必须建立新的版本目录、版本标签和
验收记录，不得覆盖本次BP3实现。

项目状态：BP3整体版本开发完毕。

---

[返回BP3项目索引](../README.md)
