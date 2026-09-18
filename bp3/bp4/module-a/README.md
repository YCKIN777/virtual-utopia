# 虚拟乌托邦 BP4 附加模块 A

本模块实现玩家家园归属与访问权限系统，不开发3D渲染。

## 能力

- 50户家园绑定玩家账号。
- 三档访问权限：`private`私有、`friends`好友可见、`public`公开。
- 家园好友名单。
- 仅房主可编辑，访客只读。
- viewer账号只能查看，不能修改权限。
- 权限变更持久化并实时推送。
- M3风格家园权限管理面板。
- 单元测试和Playwright E2E权限场景测试。

## 冻结兼容

BP1、BP2、BP3、BP4-M1/M2/M3/M4和BP4-M5代码均未修改。

M3源码已冻结，因此本模块以独立M3扩展面板运行，不修改M3的Vue页面。M1源码已冻结，因此模块A复用M1的ticket和realtime hub实现，在自身服务上提供相同协议入口：

```text
ws://127.0.0.1:3581/ws/bp4/realtime
```

权限事件使用M1已支持的`event.updated`事件，并在`data.kind`中标记：

```text
home.access.updated
home.ownership.updated
```

## 启动

```powershell
cd H:\BP2\bp3\bp4\module-a
npm install

$env:BP4_MODULE_A_PORT='3581'
$env:BP4_MODULE_A_DB_PATH='H:\BP2\bp3\bp4\module-a\data\bp4_module_a.sqlite'
$env:BP4_MODULE_A_BP3_DB_PATH='H:\BP2\bp3\data\virtual_utopia_bp3.sqlite'
$env:BP4_MODULE_A_TICKET_SECRET='bp4-m1-local-ticket-secret'
$env:PHASE5_BASE_URL='http://localhost:3300'
node backend/src/server.js
```

管理面板：

```powershell
cd H:\BP2\bp3\bp4\module-a
node node_modules\vite\bin\vite.js --config frontend\vite.config.js
```

默认地址：

```text
M3扩展面板：http://127.0.0.1:5227
API：http://127.0.0.1:3581
WebSocket：ws://127.0.0.1:3581/ws/bp4/realtime
```

## 测试

```powershell
npm run check
npm run build
npm run test:e2e
```

验收详情见`docs/BP4-MODULE-A-ACCEPTANCE.md`。
