# 虚拟乌托邦 BP4-M2

BP4-M2包含：

- mediasoup多Worker集群。
- TURN中继服务。
- 统一实时WebSocket适配。
- 结构化日志、运行指标和告警评估。
- PostgreSQL自动备份、恢复和验证脚本。
- 单元测试与E2E连通性测试。

本模块只新增`bp3/bp4/m2`，不修改BP1、BP2、BP3和BP4-M1代码。

## 启动

```powershell
cd H:\BP2\bp3\bp4\m2
npm install
node backend/src/server.js
```

默认：

```text
HTTP: http://127.0.0.1:3541
WS:   ws://127.0.0.1:3541/ws/bp4/realtime
```

## 测试

```powershell
npm run check
npm run test:e2e
```

## 备份与恢复

```powershell
npm run backup
npm run backup -- --dry-run
npm run restore -- H:\path\to\backup.dump
```

验收详情见`docs/BP4-M2-ACCEPTANCE.md`。
