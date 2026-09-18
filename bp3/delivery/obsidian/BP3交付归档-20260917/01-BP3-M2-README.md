# 虚拟乌托邦 BP3-M2 P1 模块

BP3-M2 独立增量工作区，仅实现 P1：

- 世界事件定义、排期、激活和结束。
- 世界任务定义、领取、进度、完成和奖励领取。
- 地面资源节点、资源采集、冷却和拾取反馈。
- 背包、库存容量、物品事务、奖励发放和并发扣减校验。

P0 语音、家园权限、门锁和原 Three.js 场景文件未修改。

## 目录

```text
bp3/p1/
  backend/src/      P1 API、事件、任务、资源、背包服务
  frontend/src/     P1 Three.js 世界宿主和探索 UI
  tests/            BP3-M2 E2E
  artifacts/        验收截图
```

数据库继续使用：

```text
H:\BP2\bp3\data\virtual_utopia_bp3.sqlite
```

P1 只新增 `bp3_p1_` 前缀数据表，不修改 M1 的权限、门锁和语音数据表。

## 启动

先启动 Phase5：

```powershell
Invoke-RestMethod http://localhost:3300/api/phase5/health
```

启动 P1 后端：

```powershell
cd H:\BP2\bp3\p1
node backend/src/server.js
```

启动 P1 前端：

```powershell
cd H:\BP2\bp3\p1
node ..\node_modules\vite\bin\vite.js --config frontend/vite.config.js
```

地址：

- P1 后端：`http://127.0.0.1:3511`
- P1 前端：`http://127.0.0.1:5177/p1.html`

## 测试

```powershell
cd H:\BP2\bp3\p1
npm run check
npm run build
npm run test:e2e
```

E2E 覆盖：

- 世界事件激活与前端提示弹窗。
- 任务领取、资源采集推进、任务完成和奖励领取。
- 地面资源标记与拾取交互。
- 背包物品增加、消耗和事务记录。
- 重复奖励幂等保护。
- 并发库存扣减，只有一个请求成功。

截图输出到 `artifacts/`。

## API

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

所有事件、任务和资源定义接口要求在服务端校验 `admin` 角色。

---

[[虚拟乌托邦-BP3交付归档|返回BP3交付索引]]

BP3归档层级：M2
