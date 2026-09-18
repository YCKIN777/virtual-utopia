# 虚拟乌托邦 BP4-M3 验收文档

## 1. 验收范围

本阶段只实现BP4-M3世界运营后台：

- 运营账号权限。
- 世界实例管理。
- 家园实例管理。
- 玩家状态面板。
- M1实时WebSocket状态接入。
- M2集群和metrics监控接入。
- 单元测试、E2E测试。

BP1、BP2、BP3、BP4-M1和BP4-M2代码未修改。

## 2. 交付目录

```text
bp4/m3/
  backend/src/
  backend/tests/
  frontend/src/
  tests/bp4-m3.e2e.mjs
  artifacts/
```

## 3. 权限模型

Phase5角色默认映射：

| Phase5角色 | 运营角色 |
| ---------- | -------- |
| admin      | admin    |
| editor     | operator |
| viewer     | viewer   |

M3可单独写入`bp4_m3_role_grants`覆盖运营角色：

- `viewer`：只读。
- `operator`：世界和家园读写。
- `admin`：额外拥有账号权限管理。

所有权限判断在服务端执行。

## 4. 世界实例管理

接口：

```text
GET  /api/bp4/m3/worlds
POST /api/bp4/m3/worlds
PUT  /api/bp4/m3/worlds/:worldId
```

支持：

- 创建世界。
- 修改名称、区域、容量和版本。
- 上线、维护、下线状态切换。
- 审计记录。

## 5. 家园实例管理

接口：

```text
GET  /api/bp4/m3/homes
POST /api/bp4/m3/homes
PUT  /api/bp4/m3/homes/:plotId
```

支持：

- 地块、世界、主人和访问模式设置。
- active/maintenance/frozen状态切换。
- 按世界筛选。
- 审计记录。

## 6. 玩家状态面板

M3以服务身份连接M1：

```text
ws://M1/ws/bp4/realtime
```

监听：

- `presence.updated`
- `avatar.state.updated`
- `voice.participant.updated`

面板展示：

- 在线人数。
- 说话人数。
- 玩家世界。
- Avatar动作和表情。
- 静音和发言状态。
- 最后事件时间。

## 7. M2监控集成

M3轮询：

```text
GET /health
GET /api/bp4/m2/metrics
```

展示：

- M1实时通道连接状态。
- M2可用状态。
- M2 metrics原始数据。
- Worker、房间、连接和媒体统计。

## 8. 测试结果

单元测试：

- `npm run check`通过。
- 单元测试3/3通过。
- 覆盖RBAC、世界和家园管理、审计、玩家状态聚合。

E2E测试：

- `npm run test:e2e`通过。
- 运营后台登录和权限壳通过。
- 世界实例创建通过。
- 家园实例创建通过。
- M1实时通道连接和玩家状态同步通过。
- M2 metrics接入通过。
- viewer越权写世界返回403。
- 桌面和移动端截图通过。

## 9. 自检清单

- BP1、BP2、BP3、BP4-M1和BP4-M2代码未修改。
- M3只新增独立后台、测试和文档。
- 未提前开发P2 AI、翻译或跨区域能力。
- 新增Markdown为UTF-8、无BOM、LF。
