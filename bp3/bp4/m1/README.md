# 虚拟乌托邦 BP4-M1

BP4-M1平台底座模块，包含：

- SQLite到PostgreSQL迁移器。
- PostgreSQL目标适配器。
- 统一WebSocket实时通道。
- 短时ticket、频道订阅、ACK和断线续传。
- 单元测试和M1 E2E。

本模块只新增BP4-M1代码，不修改BP1、BP2、BP3源码和归档。

## 目录

```text
bp4/m1/
  backend/src/              实时Hub、ticket、迁移器
  backend/scripts/          真实PostgreSQL迁移入口
  backend/tests/            单元测试
  tests/                    M1 E2E
```

## 运行

```powershell
cd H:\BP2\bp3\bp4\m1
npm install
$env:PHASE5_BASE_URL='http://localhost:3300'
node backend/src/server.js
```

默认服务：

```text
HTTP: http://127.0.0.1:3531
WS:   ws://127.0.0.1:3531/ws/bp4/realtime
```

## 迁移

真实PostgreSQL迁移：

```powershell
$env:BP4_DATABASE_URL='postgresql://utopia:utopia@localhost:5432/virtual_utopia'
$env:BP4_SQLITE_PATH='H:\BP2\bp3\data\virtual_utopia_bp3.sqlite'
npm run migrate
```

迁移会：

1. 校验BP3 SQLite表结构。
2. 创建`bp4_*`目标表。
3. 批量导入数据。
4. 校验源表和目标表行数。
5. 写入`bp4_migration_runs`。
6. 失败时回滚目标事务。

## 测试

```powershell
npm run check
npm run test:e2e
```

详细验收结果见`docs/BP4-M1-ACCEPTANCE.md`。
