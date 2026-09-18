# 虚拟乌托邦 BP3 API 总览

## M1 P0

前缀：`/api/bp3`

```text
GET    /api/bp3/health
GET    /api/bp3/auth/me
GET    /api/bp3/me/home
GET    /api/bp3/voice/channels
POST   /api/bp3/voice/channels/:channelId/join
POST   /api/bp3/voice/channels/:channelId/leave
GET    /api/bp3/voice/channels/:channelId/participants
POST   /api/bp3/voice/channels/:channelId/mute
POST   /api/bp3/voice/channels/:channelId/moderate
WS     /ws/bp3/voice/signaling
GET    /api/bp3/homes/:plotId/access
PUT    /api/bp3/homes/:plotId/access
GET    /api/bp3/homes/:plotId/visitors
POST   /api/bp3/homes/:plotId/visitors
DELETE /api/bp3/homes/:plotId/visitors/:userId
GET    /api/bp3/homes/:plotId/access-requests
POST   /api/bp3/homes/:plotId/access-requests
POST   /api/bp3/homes/:plotId/access-requests/:requestId/approve
POST   /api/bp3/homes/:plotId/access-requests/:requestId/reject
POST   /api/bp3/homes/:plotId/unlock
POST   /api/bp3/homes/:plotId/access-check
GET    /api/bp3/homes/:plotId/invites
POST   /api/bp3/homes/:plotId/invites
DELETE /api/bp3/homes/:plotId/grants/:grantId
POST   /api/bp3/invites/:token/redeem
GET    /api/bp3/homes/:plotId/logs
```

## M2 P1

前缀：`/api/bp3/p1`

```text
GET    /api/bp3/p1/health
GET    /api/bp3/p1/auth/me
GET    /api/bp3/p1/catalog/items
GET    /api/bp3/p1/events
POST   /api/bp3/p1/events
PUT    /api/bp3/p1/events/:eventId
POST   /api/bp3/p1/events/:eventId/activate
POST   /api/bp3/p1/events/:eventId/end
GET    /api/bp3/p1/tasks
POST   /api/bp3/p1/tasks
PUT    /api/bp3/p1/tasks/:taskId
POST   /api/bp3/p1/tasks/:taskId/accept
POST   /api/bp3/p1/tasks/:taskId/progress
POST   /api/bp3/p1/tasks/:taskId/claim
GET    /api/bp3/p1/resources
POST   /api/bp3/p1/resources
PUT    /api/bp3/p1/resources/:nodeId
POST   /api/bp3/p1/resources/:nodeId/collect
GET    /api/bp3/p1/inventory
GET    /api/bp3/p1/inventory/transactions
POST   /api/bp3/p1/inventory/grant
POST   /api/bp3/p1/inventory/consume
```

## M3 P2

前缀：`/api/bp3/p2`

```text
GET    /api/bp3/p2/health
GET    /api/bp3/p2/auth/me
GET    /api/bp3/p2/avatar/catalog
GET    /api/bp3/p2/avatar/state
GET    /api/bp3/p2/avatar/states?userIds=1,2
PUT    /api/bp3/p2/avatar/state
GET    /api/bp3/p2/homes/:plotId/messages
POST   /api/bp3/p2/homes/:plotId/messages
DELETE /api/bp3/p2/homes/:plotId/messages/:messageId
```

## 鉴权

所有业务接口使用Phase5 Bearer Token。

- 服务端从Phase5身份服务解析用户和角色。
- 客户端提交的`userId`、`authorUserId`和`ownerId`不作为可信身份。
- admin配置事件、任务、资源和奖励。
- editor编辑自己的家园，参与语音、任务、背包和P2互动。
- viewer可漫游、参与语音、申请访问、参与公开家园留言，
  不可修改家园、删除他人留言或管理语音。

---

[[虚拟乌托邦-BP3交付归档|返回BP3交付索引]]

BP3归档层级：BP3
