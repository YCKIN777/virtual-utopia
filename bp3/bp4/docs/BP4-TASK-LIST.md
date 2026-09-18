# 虚拟乌托邦 BP4 开发任务清单

> 版本：BP4-TASK-DRAFT-1.0  
> 任务粒度：最小可执行、可独立验收  
> 顺序：P0 -> P1 -> P2

## 1. 任务分类

| 类型     | 说明                            |
| -------- | ------------------------------- |
| BACKEND  | 服务、迁移、适配和业务API       |
| DATABASE | PostgreSQL、Redis、Schema和迁移 |
| REALTIME | WebSocket、SFU、TURN和弱网      |
| FRONTEND | 实时接入、后台和移动端          |
| SECURITY | 鉴权、限流、幂等和审计          |
| OPS      | 监控、日志、备份和发布          |
| E2E      | 集成、回归、压测和故障演练      |
| DOCS     | 接口、部署、运维和验收          |

## 2. P0任务

### 2.1 数据库与迁移

| 编号    | 类型     | 责任人  | 依赖        | 验收标准                                 |
| ------- | -------- | ------- | ----------- | ---------------------------------------- |
| BP4-001 | DATABASE | Backend | 无          | 建立PostgreSQL Schema和迁移版本表        |
| BP4-002 | DATABASE | Backend | 001         | 实现BP3 SQLite到PostgreSQL迁移脚本       |
| BP4-003 | DATABASE | QA      | 002         | 用户、角色、world快照数量一致            |
| BP4-004 | DATABASE | QA      | 002         | 家园物品、家具、权限、任务和背包校验一致 |
| BP4-005 | DATABASE | Backend | 002         | 迁移支持幂等重试和中断恢复               |
| BP4-006 | DATABASE | DevOps  | 002         | 提供数据库快照、回滚和恢复脚本           |
| BP4-007 | E2E      | QA      | 003,004,005 | 完成迁移前、中、后全流程演练             |

### 2.2 实时通道

| 编号    | 类型     | 责任人   | 依赖            | 验收标准                              |
| ------- | -------- | -------- | --------------- | ------------------------------------- |
| BP4-010 | REALTIME | Realtime | 001             | 建立统一WebSocket服务和连接鉴权       |
| BP4-011 | REALTIME | Realtime | 010             | 实现subscribe、unsubscribe、ack和ping |
| BP4-012 | REALTIME | Backend  | 010             | 实现presence事件和快照                |
| BP4-013 | REALTIME | Backend  | 010             | 实现聊天事件和历史补发                |
| BP4-014 | REALTIME | Backend  | 010             | 实现Avatar状态事件                    |
| BP4-015 | REALTIME | Backend  | 010             | 实现任务、背包和世界事件通知          |
| BP4-016 | REALTIME | Backend  | 010             | 实现sequence、cursor和resume          |
| BP4-017 | REALTIME | Frontend | 010             | 前端接入统一实时客户端                |
| BP4-018 | REALTIME | Frontend | 016             | 断线重连和降级轮询                    |
| BP4-019 | E2E      | QA       | 012,013,014,015 | 100并发连接和事件顺序通过             |
| BP4-020 | E2E      | QA       | 016,018         | 断网恢复和重复事件测试通过            |

### 2.3 语音生产化

| 编号    | 类型     | 责任人   | 依赖    | 验收标准                        |
| ------- | -------- | -------- | ------- | ------------------------------- |
| BP4-030 | REALTIME | Realtime | 010     | mediasoup多Worker启动和健康检查 |
| BP4-031 | REALTIME | Realtime | 030     | 按房间路由到健康Worker          |
| BP4-032 | REALTIME | Realtime | 030     | SFU节点注册和故障标记           |
| BP4-033 | REALTIME | DevOps   | 030     | TURN服务部署和配置              |
| BP4-034 | REALTIME | Frontend | 033     | 浏览器接入TURN和网络切换        |
| BP4-035 | REALTIME | QA       | 030,033 | 公网、NAT和移动网络语音通过     |
| BP4-036 | REALTIME | QA       | 032     | 单Worker故障不影响其他房间      |
| BP4-037 | REALTIME | Backend  | 032     | 提供节点和房间运维接口          |

### 2.4 安全、运维和验收

| 编号    | 类型     | 责任人   | 依赖        | 验收标准                     |
| ------- | -------- | -------- | ----------- | ---------------------------- |
| BP4-040 | SECURITY | Backend  | 无          | 建立请求级限流               |
| BP4-041 | SECURITY | Backend  | 无          | 为奖励、库存和授权建立幂等键 |
| BP4-042 | SECURITY | Backend  | 010         | WebSocket连接和消息限流      |
| BP4-043 | SECURITY | Security | 无          | 审计日志覆盖权限、奖励和迁移 |
| BP4-044 | OPS      | DevOps   | 001         | 结构化日志和请求ID           |
| BP4-045 | OPS      | DevOps   | 030         | 语音节点和实时连接指标       |
| BP4-046 | OPS      | DevOps   | 040         | API延迟、错误率和限流指标    |
| BP4-047 | OPS      | DevOps   | 030         | 健康、就绪和告警规则         |
| BP4-048 | OPS      | DevOps   | 006         | 自动备份和恢复验证           |
| BP4-049 | E2E      | QA       | 040,041,043 | 安全回归和重复请求测试       |
| BP4-050 | E2E      | QA       | 全部P0      | BP3冻结回归和BP4 P0验收      |

## 3. P1任务

| 编号    | 类型     | 责任人    | 依赖        | 验收标准                |
| ------- | -------- | --------- | ----------- | ----------------------- |
| BP4-100 | FRONTEND | Frontend  | BP4-M1      | 运营后台登录和权限壳    |
| BP4-101 | FRONTEND | Frontend  | 100         | 事件创建、编辑和发布    |
| BP4-102 | FRONTEND | Frontend  | 100         | 任务和奖励模板配置      |
| BP4-103 | FRONTEND | Frontend  | 100         | 资源节点配置            |
| BP4-104 | BACKEND  | Backend   | 101         | 事件发布和结束 API      |
| BP4-105 | BACKEND  | Backend   | 102         | 奖励包和补发审计 API    |
| BP4-106 | FRONTEND | Frontend  | 010         | 数据看板                |
| BP4-107 | FRONTEND | Frontend  | 010         | PWA静态缓存和低功耗模式 |
| BP4-108 | E2E      | QA        | 101,102,103 | 运营后台全流程通过      |
| BP4-109 | DOCS     | Tech Lead | 108         | 运营手册和培训材料      |

## 4. P2任务

| 编号    | 类型     | 责任人   | 依赖        | 验收标准                 |
| ------- | -------- | -------- | ----------- | ------------------------ |
| BP4-200 | BACKEND  | Backend  | BP4-M6      | AI NPC服务接口和权限边界 |
| BP4-201 | REALTIME | Realtime | 200         | AI NPC状态和事件同步     |
| BP4-202 | BACKEND  | Backend  | BP4-M6      | STT、TTS和翻译适配层     |
| BP4-203 | REALTIME | Realtime | 202         | 语音链路与翻译服务集成   |
| BP4-204 | BACKEND  | Backend  | BP4-M6      | 多世界和服务区域路由     |
| BP4-205 | FRONTEND | Frontend | 200         | UGC模板和素材包界面      |
| BP4-206 | E2E      | QA       | 200,202,204 | P2能力隔离和降级测试     |

## 5. 通用完成标准

每个任务必须满足：

1. 有唯一任务编号。
2. 有明确输入、输出和依赖。
3. 有自动化或人工验收标准。
4. 权限校验在服务端执行。
5. 不修改BP1~BP3冻结文件。
6. 文档和接口变更有版本记录。
