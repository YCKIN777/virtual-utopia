# 虚拟乌托邦 BP4-M1 验收文档

## 1. 验收范围

本阶段只开发BP4-M1平台底座：

- PostgreSQL迁移脚本。
- PostgreSQL目标适配器。
- 统一WebSocket封装。
- ticket鉴权和频道权限。
- subscribe、unsubscribe、ack、resume、ping。
- 单元测试和E2E测试。

不修改BP1、BP2、BP3源码、测试、交付包和Obsidian历史归档。

## 2. 交付文件

```text
bp4/m1/package.json
bp4/m1/.env.example
bp4/m1/backend/src/config.js
bp4/m1/backend/src/errors.js
bp4/m1/backend/src/ticketService.js
bp4/m1/backend/src/authAdapter.js
bp4/m1/backend/src/realtimeHub.js
bp4/m1/backend/src/realtimeServer.js
bp4/m1/backend/src/server.js
bp4/m1/backend/src/migration/tableSpecs.js
bp4/m1/backend/src/migration/sqliteSource.js
bp4/m1/backend/src/migration/postgresTarget.js
bp4/m1/backend/src/migration/migrate.js
bp4/m1/backend/scripts/migrate-sqlite-to-postgres.js
bp4/m1/backend/tests/realtimeHub.test.js
bp4/m1/backend/tests/migration.test.js
bp4/m1/tests/bp4-m1.e2e.mjs
```

## 3. PostgreSQL迁移

迁移规格覆盖：

- M1地块、语音、家园访问规则、访客和授权表。
- M2商品、世界事件、任务实例、资源节点、背包和事务表。
- M2奖励记录和审计日志。
- M3 Avatar状态和家园留言表。

迁移流程：

1. 读取SQLite表结构。
2. 创建PostgreSQL目标表和主键索引。
3. 按批次写入。
4. 对比源表和目标表行数。
5. 记录`bp4_migration_runs`。
6. 异常回滚。

真实连接命令：

```powershell
$env:BP4_DATABASE_URL='postgresql://...'
npm run migrate
```

本次环境未安装PostgreSQL服务，因此E2E使用真实BP3 SQLite源数据和内存PostgreSQL目标适配器完成迁移演练；真实目标适配器使用`pg`驱动和事务，已通过语法和单元测试。

## 4. 统一WebSocket

入口：

```text
ws://127.0.0.1:3531/ws/bp4/realtime?ticket=<ticket>
```

支持：

- `ready`
- `subscribe`
- `unsubscribe`
- `ack`
- `resume`
- `ping/pong`
- `event`
- `error`

事件类型：

- `presence.updated`
- `chat.message.created`
- `avatar.state.updated`
- `home.message.created`
- `event.updated`
- `task.updated`
- `inventory.updated`
- `voice.participant.updated`

## 5. 测试结果

单元测试：

- `npm run check`通过。
- 单元测试4/4通过。
- 覆盖迁移、迁移校验、频道隔离、事件顺序、resume、ACK和ticket防篡改。

E2E测试：

- `npm run test:e2e`通过。
- HTTP ticket签发通过。
- WebSocket连接和鉴权通过。
- `world-main`订阅通过。
- Avatar事件发送和接收通过。
- `resume.completed`断线续传通过。
- 真实BP3 SQLite迁移演练通过。
- E2E迁移表：19张。
- E2E迁移数据：8行。

## 6. 自检清单

- BP1、BP2、BP3源码未修改。
- P0/P1/P2历史交付包未修改。
- 只新增`bp3/bp4/m1`代码、测试和文档。
- M1不包含P1/P2运营、AI、翻译或世界扩展功能。
- 新增Markdown为UTF-8、无BOM、LF。

## 7. 后续M2

后续BP4-M2应在M1基础上实现：

- Redis presence。
- presence、聊天、Avatar和任务事件适配器。
- 前端实时客户端接入。
- 100并发连接和断网恢复压测。
