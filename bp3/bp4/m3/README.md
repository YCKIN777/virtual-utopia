# 虚拟乌托邦 BP4-M3 世界运营后台

BP4-M3包含：

- 运营账号权限。
- 世界实例管理。
- 家园实例管理。
- 玩家实时状态面板。
- M1 WebSocket实时状态接入。
- M2集群、TURN和metrics监控接入。
- 单元测试与E2E测试。

本模块仅在`bp3/bp4/m3`新增代码，不修改历史版本。

## 启动

```powershell
cd H:\BP2\bp3\bp4\m3
npm install
node backend/src/server.js
node ..\..\node_modules\vite\bin\vite.js --config frontend\vite.config.js
```

默认地址：

```text
后台：http://127.0.0.1:5197
API：http://127.0.0.1:3551
```

## 测试

```powershell
npm run check
npm run build
npm run test:e2e
```

验收详情见`docs/BP4-M3-ACCEPTANCE.md`。
