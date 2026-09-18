# 虚拟乌托邦 BP4 接口设计文档

> 版本：BP4-API-DRAFT-1.0  
> 原则：新接口并行发布，旧BP3接口在迁移期继续可用

## 1. 设计原则

- `/api/bp3/*`保持冻结兼容。
- BP4新增接口统一使用`/api/bp4/*`。
- WebSocket统一入口为`/ws/bp4/realtime`。
- 所有请求使用Phase5身份或BP4兼容身份桥。
- 客户端提交的userId、role、ownerId、authorUserId不作为信任来源。
- 创建、库存、奖励、授权类接口必须支持`Idempotency-Key`。

## 2. 身份与令牌

### POST `/api/bp4/auth/ticket`

用途：为WebSocket或实时资源申请短时访问ticket。

请求：

```json
{
  "scopes": ["realtime", "voice"],
  "channelIds": ["world-main"]
}
```

响应：

```json
{
  "ticket": "short-lived-ticket",
  "expiresAt": "2026-09-17T12:00:00.000Z",
  "scopes": ["realtime", "voice"]
}
```

## 3. 统一WebSocket协议

连接：

```text
wss://<host>/ws/bp4/realtime?ticket=<ticket>
```

信封：

```json
{
  "id": "evt-uuid",
  "type": "avatar.state.updated",
  "version": 1,
  "channel": "world-main",
  "sequence": 120,
  "sentAt": "2026-09-17T12:00:00.000Z",
  "data": {}
}
```

客户端消息：

```text
subscribe
unsubscribe
ack
resume
ping
```

服务端消息：

```text
ready
event
ack
error
pong
```

事件类型：

- `presence.updated`
- `chat.message.created`
- `avatar.state.updated`
- `home.message.created`
- `event.updated`
- `task.updated`
- `inventory.updated`
- `voice.participant.updated`

续传：

```json
{
  "type": "resume",
  "channels": [
    {
      "channel": "world-main",
      "afterSequence": 118
    }
  ]
}
```

## 4. 持久化与迁移接口

### GET `/api/bp4/ops/migrations`

返回迁移版本、状态、开始时间、结束时间和校验结果。

### POST `/api/bp4/ops/migrations/:version/validate`

执行迁移前或迁移后校验。

校验内容：

- 用户和角色数量。
- world快照数量。
- 家园物品和家具数量。
- 语音成员和权限规则数量。
- 任务、背包和留言数量。
- 关键表外键和唯一索引。

### POST `/api/bp4/ops/migrations/:version/rollback`

仅管理员可调用，必须要求当前处于安全窗口。

## 5. 语音节点接口

### GET `/api/bp4/voice/nodes`

返回：

```json
{
  "nodes": [
    {
      "id": "sfu-1",
      "status": "ready",
      "load": 0.32,
      "currentRooms": 4,
      "currentParticipants": 37
    }
  ]
}
```

### POST `/api/bp4/voice/rooms/:roomId/token`

响应包含：

- 选中的SFU节点。
- 短时房间token。
- 允许的媒体类型。
- TURN配置。
- 过期时间。

### POST `/api/bp4/voice/rooms/:roomId/rebalance`

管理员接口，用于维护窗口内的房间迁移。

## 6. 运营后台接口

### 事件

```text
GET    /api/bp4/admin/events
POST   /api/bp4/admin/events
PUT    /api/bp4/admin/events/:eventId
POST   /api/bp4/admin/events/:eventId/publish
POST   /api/bp4/admin/events/:eventId/end
```

### 任务与奖励

```text
GET    /api/bp4/admin/tasks
POST   /api/bp4/admin/tasks
PUT    /api/bp4/admin/tasks/:taskId
POST   /api/bp4/admin/rewards/grants
POST   /api/bp4/admin/rewards/grants/:grantId/revoke
```

### 资源节点

```text
GET    /api/bp4/admin/resources
POST   /api/bp4/admin/resources
PUT    /api/bp4/admin/resources/:nodeId
POST   /api/bp4/admin/resources/:nodeId/disable
```

## 7. 运维接口

```text
GET /api/bp4/ops/health
GET /api/bp4/ops/ready
GET /api/bp4/ops/metrics
GET /api/bp4/ops/audit-events
GET /api/bp4/ops/backups
POST /api/bp4/ops/backups
POST /api/bp4/ops/restore-verify
```

`/ops/metrics`只允许内网或管理员访问。

## 8. PostgreSQL建议表

BP4使用`bp4_`前缀，不直接改写BP3表。

### 核心表

- `bp4_users`
- `bp4_world_snapshots`
- `bp4_home_items`
- `bp4_home_interiors`
- `bp4_access_rules`
- `bp4_access_grants`
- `bp4_voice_rooms`
- `bp4_voice_participants`
- `bp4_world_events`
- `bp4_tasks`
- `bp4_task_instances`
- `bp4_inventory_items`
- `bp4_inventory_transactions`
- `bp4_avatar_states`
- `bp4_home_messages`
- `bp4_realtime_events`
- `bp4_audit_logs`

### 辅助表和外部状态

- PostgreSQL：`bp4_outbox_events`、`bp4_migration_checks`。
- Redis：presence、限流、短期锁、WebSocket连接路由。
- 对象存储：备份、导出文件和静态资源。

## 9. 事务与幂等

- 库存扣减使用条件更新或`SELECT FOR UPDATE`。
- 奖励使用唯一`reference_id`和唯一索引。
- access grant、invite和留言删除使用事务。
- WebSocket重放不能重复执行写操作。
- 所有写请求可记录`request_id`和`idempotency_key`。

## 10. 错误码

| 错误码                      | HTTP | 说明               |
| --------------------------- | ---- | ------------------ |
| `BP4_UNAUTHORIZED`          | 401  | 身份或ticket失效   |
| `BP4_FORBIDDEN`             | 403  | 角色或资源越权     |
| `BP4_VALIDATION_ERROR`      | 400  | 请求参数错误       |
| `BP4_CONFLICT`              | 409  | 状态冲突或重复操作 |
| `BP4_RATE_LIMITED`          | 429  | 超过限流           |
| `BP4_MIGRATION_FAILED`      | 500  | 迁移校验或执行失败 |
| `BP4_REALTIME_DISCONNECTED` | 503  | 实时通道不可用     |

## 11. 数据迁移策略

1. 停止写入，创建SQLite冻结快照。
2. 运行BP4迁移工具导入PostgreSQL staging。
3. 执行数量、哈希、外键和业务抽样校验。
4. 启动BP4双读验证，旧接口读取冻结SQLite，新接口读取PostgreSQL。
5. 切换主写入到PostgreSQL。
6. 保留SQLite回滚包，观察窗口结束后再归档。

迁移期间禁止修改BP3源码和BP3冻结表结构。
