# 虚拟乌托邦 BP4-M2 验收文档

## 1. 验收范围

本阶段只实现BP4-M2：

- mediasoup多Worker集群。
- TURN中继服务。
- M1实时Hub和ticket协议适配。
- 媒体Transport信令。
- 结构化日志。
- 运行指标和告警评估。
- PostgreSQL备份、恢复和验证脚本。
- 单元测试和E2E连通性测试。

BP1、BP2、BP3和BP4-M1代码保持不变。

## 2. 交付文件

```text
bp4/m2/package.json
bp4/m2/.env.example
bp4/m2/backend/src/config.js
bp4/m2/backend/src/mediaCluster.js
bp4/m2/backend/src/turnService.js
bp4/m2/backend/src/mediaSignaling.js
bp4/m2/backend/src/realtimeClusterServer.js
bp4/m2/backend/src/monitoring.js
bp4/m2/backend/src/backupService.js
bp4/m2/backend/src/server.js
bp4/m2/backend/scripts/backup-postgres.js
bp4/m2/backend/scripts/restore-postgres.js
bp4/m2/backend/tests/mediaCluster.test.js
bp4/m2/backend/tests/turnService.test.js
bp4/m2/backend/tests/monitoring.test.js
bp4/m2/backend/tests/backupService.test.js
bp4/m2/tests/bp4-m2.e2e.mjs
```

## 3. mediasoup集群

- 支持配置多个mediasoup Worker。
- Worker端口区间自动拆分，避免RTC端口冲突。
- 新房间自动选择房间数最少的健康Worker。
- 每个房间独立Router。
- 支持WebRtcTransport创建、连接、音频Producer和Consumer。
- 暴露Worker、房间、Transport、Producer和Consumer统计。
- Worker异常时标记节点不健康，新房间不再分配。

E2E结果：

- Worker数量：2。
- 创建媒体房间：1。
- 创建媒体Transport：1。
- 集群健康状态：通过。

## 4. TURN中继

- 使用`node-turn`提供本地STUN/TURN服务。
- 支持long-term凭据、UDP/TCP TURN和继电器端口范围。
- 提供`/api/bp4/m2/turn/credentials`。
- 支持NAT环境外部IP配置。

E2E结果：

- TURN实际启动。
- ICE服务器凭据返回通过。
- 服务停止和资源释放通过。

## 5. 实时WebSocket适配

M2复用M1：

- `createRealtimeHub`
- `createTicketService`
- subscribe、unsubscribe、ack、resume、ping/pong

新增：

- `media.transport.create`
- `media.transport.connect`
- `media.produce`
- `media.consume`
- `media.producer.pause`
- `media.producer.resume`
- `media.leave`

E2E结果：

- ticket签发通过。
- WebSocket鉴权通过。
- 实时订阅通过。
- mediasoup Transport创建通过。
- ICE服务器下发通过。

## 6. 日志、监控和告警

结构化日志字段：

- 时间戳
- 等级
- 服务名称
- 事件名称
- 事件详情

监控指标：

- HTTP请求数和错误数。
- WebSocket活动连接数。
- 媒体Transport、Producer和Consumer数量。
- SFU Worker和房间数量。
- TURN运行状态。
- 服务运行时间。

Prometheus文本：

```text
GET /api/bp4/m2/metrics
```

告警评估：

```text
GET /api/bp4/m2/alerts
```

## 7. PostgreSQL备份与恢复

脚本：

```powershell
npm run backup
npm run backup -- --dry-run
npm run restore -- <backup-file>
```

实现：

- `pg_dump --format=custom`
- `pg_restore --list`
- `pg_restore --clean --if-exists`
- 备份文件非空校验
- 备份目录自动创建

本机未安装PostgreSQL客户端，因此E2E验证备份接口的dry-run路径和命令编排；真实`pg_dump`、`pg_restore`在部署PostgreSQL后执行。

## 8. 测试结果

单元测试：

- `npm run check`通过。
- 单元测试4/4通过。
- 覆盖媒体集群、Transport、TURN、监控告警和备份命令。

E2E测试：

- `npm run test:e2e`通过。
- 2个mediasoup Worker启动。
- TURN实际启动和停止。
- ticket、WebSocket、订阅和媒体Transport连通。
- metrics和backup dry-run接口通过。

## 9. 自检清单

- BP1、BP2、BP3、BP4-M1代码未修改。
- M2只新增独立目录、测试和文档。
- 未提前开发P1/P2运营、AI或翻译能力。
- 新增Markdown为UTF-8、无BOM、LF。
