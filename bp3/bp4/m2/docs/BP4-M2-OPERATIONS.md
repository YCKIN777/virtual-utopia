# 虚拟乌托邦 BP4-M2 运维手册

## 端口

| 服务              | 默认端口      |
| ----------------- | ------------- |
| M2 HTTP/WebSocket | `3541`        |
| media RTC         | `44000-44200` |
| TURN              | `3478`        |
| TURN relay        | `49152-65535` |

## 健康检查

```text
GET /health
GET /api/bp4/m2/health
GET /api/bp4/m2/cluster
```

## 监控

```text
GET /api/bp4/m2/metrics
GET /api/bp4/m2/alerts
```

建议接入Prometheus或采集Agent，并对以下指标告警：

- HTTP错误率。
- WebSocket连接数。
- SFU Worker不健康数量。
- 房间和Transport增长。
- TURN停止。
- 备份失败。

## 备份

每日执行：

```powershell
cd H:\BP2\bp3\bp4\m2
npm run backup
```

备份后执行：

```powershell
node backend/scripts/restore-postgres.js <backup-file> --verify-only
```

当前恢复脚本默认执行完整恢复；生产环境应先恢复至独立验证库，再切换主库。

## 故障处理

### SFU Worker异常

1. 检查`/api/bp4/m2/cluster`。
2. 确认异常Worker的PID和端口区间。
3. 检查RTC端口、防火墙和CPU。
4. 重启M2服务，使新房间分配到健康Worker。

### TURN不可用

1. 检查UDP/TCP监听端口。
2. 检查relay端口范围。
3. 检查公网IP和NAT映射。
4. 临时通过文字聊天和WebSocket业务事件提供降级体验。

### 备份失败

1. 检查`pg_dump`是否可执行。
2. 检查`BP4_DATABASE_URL`权限。
3. 检查备份目录容量。
4. 使用`--dry-run`验证接口和目录写入。
