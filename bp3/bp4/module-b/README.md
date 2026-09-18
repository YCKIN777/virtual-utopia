# 虚拟乌托邦 BP4 附加模块 B

本模块实现玩家社交聊天系统，不开发3D渲染。

## 能力

- M1 WebSocket实时通道。
- 世界全局频道。
- 家园私有频道。
- 玩家一对一私聊。
- 消息持久化和历史查询。
- 消息撤回。
- 基础敏感词过滤。
- 家园权限联动。
- 简易前端调试聊天面板。
- 单元测试和Playwright E2E聊天场景测试。

## 频道

```text
世界：world-main
家园：home-<plotId>，例如 home-plot-1
私聊：dm-<userA>-<userB>，例如 dm-2-3
```

家园频道通过HTTP调用已冻结的家园权限模块A接口，不会修改模块A代码或数据库。

## 冻结兼容

BP1、BP2、BP3、BP4-M1/M2/M3/M4、附加模块A和BP4-M5代码均未修改。

模块B复用M1的`createTicketService`和`createRealtimeHub`，在自身服务提供相同协议入口：

```text
ws://127.0.0.1:3591/ws/bp4/realtime
```

消息事件使用M1已支持的：

```text
chat.message.created
event.updated
  data.kind = chat.message.recalled
```

## 启动

先启动模块A：

```powershell
cd H:\BP2\bp3\bp4\module-a
node backend/src/server.js
```

再启动模块B：

```powershell
cd H:\BP2\bp3\bp4\module-b
npm install

$env:BP4_MODULE_B_PORT='3591'
$env:BP4_MODULE_B_DB_PATH='H:\BP2\bp3\bp4\module-b\data\bp4_module_b.sqlite'
$env:BP4_MODULE_B_MODULE_A_BASE_URL='http://127.0.0.1:3581'
$env:BP4_MODULE_B_TICKET_SECRET='bp4-m1-local-ticket-secret'
$env:PHASE5_BASE_URL='http://localhost:3300'
node backend/src/server.js
```

聊天调试面板：

```powershell
cd H:\BP2\bp3\bp4\module-b
node node_modules\vite\bin\vite.js --config frontend\vite.config.js
```

默认地址：

```text
聊天面板：http://127.0.0.1:5237
API：http://127.0.0.1:3591
WebSocket：ws://127.0.0.1:3591/ws/bp4/realtime
```

## 测试

```powershell
npm run check
npm run build
npm run test:e2e
```

验收详情见`docs/BP4-MODULE-B-ACCEPTANCE.md`。
