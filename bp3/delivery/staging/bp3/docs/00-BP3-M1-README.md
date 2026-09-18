# 虚拟乌托邦 BP3-M1

BP3-M1 独立工作区，仅实现 P0：

- WebRTC 世界语音频道，媒体转发由 mediasoup SFU 完成。
- Phase5 身份复用与 `/api/bp3` 独立路由。
- 家园访问规则：`public`、`private`、`request`、`whitelist`。
- 门锁、白名单、黑名单、访客申请审批、临时邀请、撤销与访问记录。
- 只读复用 BP2 Three.js 世界，在独立覆盖层提供语音和家园权限 UI。

BP2 源码、冻结交付包和归档文档不在本工作区修改范围内。

## 目录

```text
bp3/
  backend/src/       BP3 HTTP、SQLite、权限和 mediasoup 服务
  frontend/src/      BP3 独立 Vue + Three.js 世界宿主与覆盖层
  data/              BP3 独立 SQLite 数据文件
  tests/             BP3-M1 E2E
```

## 数据库

默认数据库：

```text
H:\BP2\bp3\data\virtual_utopia_bp3.sqlite
```

所有表使用 `bp3_` 前缀，不修改 Phase5 的 `users`、`chat_sessions`、
`knowledge_documents`、`rag_logs`。

## 服务启动

先确认 Phase5 可访问：

```powershell
Invoke-RestMethod http://localhost:3300/api/phase5/health
```

启动 BP3 后端：

```powershell
cd H:\BP2\bp3
$env:PHASE5_BASE_URL='http://localhost:3300'
node backend/src/server.js
```

启动 BP3 前端：

```powershell
cd H:\BP2\bp3
node node_modules/vite/bin/vite.js --config frontend/vite.config.js
```

默认地址：

- BP3 后端：`http://127.0.0.1:3500`
- BP3 前端：`http://127.0.0.1:5176`
- 语音信令：`ws://127.0.0.1:3500/ws/bp3/voice/signaling`

## 测试

```powershell
cd H:\BP2\bp3
npm run check
npm run build
npm run test:e2e
```

`test:e2e` 会启动临时 Phase5 模拟身份服务、BP3 服务、mediasoup 和
Vite，使用两个浏览器账号验证：

- 两用户加入同一语音频道并建立远端音频轨道。
- viewer 无法执行频道管理。
- 家园访问申请、审批、一次性授权、门锁开放和临时邀请兑换。

验收截图输出到 `artifacts/`。

## 主要 API

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

## 角色

| 角色   | BP3-M1 权限                                      |
| ------ | ------------------------------------------------ |
| admin  | 世界语音治理、管理家园权限、审批和撤销访问       |
| editor | 参与语音、管理自己家园权限和访客                 |
| viewer | 参与语音、申请或兑换访问，不可管理家园和语音频道 |

所有用户、地块和角色判断均由服务端执行，客户端提交的 `ownerId`
不参与授权判断。

---

[返回BP3项目索引](../README.md)
