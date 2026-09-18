# 运维排障清单

## 1. 服务启动类

| 症状 | 可能原因 | 排查/修复 |
| --- | --- | --- |
| 记忆服务启动即退出 | `MEMORY_DB_PATH` 目录无写权限 | 检查 `data/` 目录权限，或用绝对路径 |
| `ERR_MODULE_NOT_FOUND` | 缺依赖 / 路径错误 | `npm install`；确认从项目根目录启动 |
| 端口占用 `EADDRINUSE 3600` | 已有进程占用 | `netstat -ano | findstr 3600` 定位并释放，或改 `MEMORY_PORT` |
| phase5 启动报 `PHASE5_AUTH_SECRET is required` | 缺环境变量 | `node scripts/check-env.mjs phase5` 补配置 |

## 2. 数据库类

| 症状 | 可能原因 | 排查/修复 |
| --- | --- | --- |
| 记忆数据读不到 | 连到不同 DB 文件 | 确认 `MEMORY_DB_PATH` 一致，勿混用 smoke/e2e 临时库 |
| `database is locked` | 并发写 SQLite | 已启用 WAL；降低并发写，或加 `busy_timeout` |
| 旧库无 embedding 列报错 | 旧版本未迁移 | 重启服务自动 `ALTER TABLE ADD COLUMN embedding` |
| 备份恢复后数据不完整 | 未同时备份 `-wal/-shm` | 用 `scripts/backup-data.mjs` 打包三文件 |

## 3. 记忆召回类

| 症状 | 可能原因 | 排查/修复 |
| --- | --- | --- |
| 召回结果不相关 | 本地 embedding 精度有限 | 默认 `vector` 模式；可切 `MEMORY_RETRIEVAL_MODE=weight` 或换真实模型 |
| 记忆不召回 | `importance` 低于阈值 | 检查 `minImportance`；或提升提炼时 importance |
| 旧记忆 similarity=0 | 旧数据无向量（正常） | 属预期行为，退化为 importance 排序 |

## 4. 接口/权限类

| 症状 | 可能原因 | 排查/修复 |
| --- | --- | --- |
| `429 Too Many Requests` | 触发 guard 限流 | 调高 `GUARD_RATE_MAX`，或检查是否被异常高频调用 |
| `userId required` | 请求缺 userId 参数 | 前端复用 `sessionStore.ensureUserId()` |
| 陈旧 conversation_id 报错 | 会话不存在 | 已修复：自动回退新建，无需处理 |
| 跨用户读记忆 | 记忆接口未做归属校验 | 见「已知安全加固项」，建议路由层加校验 |

## 5. 日志/告警

| 症状 | 排查 |
| --- | --- |
| 无请求日志 | 确认经 `createGuardedApp` 挂载（默认已挂），日志为结构化 JSON |
| 服务挂掉无感知 | 挂 `scripts/alert.mjs` 到计划任务 + webhook |

## 6. 常见命令速查

```powershell
node scripts/check-env.mjs phase5          # 环境变量预检
node scripts/check-structure.mjs           # 目录结构校验
node scripts/check-frozen.mjs              # 冻结边界检查
node scripts/audit-secrets.mjs             # 密钥扫描
node scripts/backup-data.mjs               # 数据备份
node scripts/alert.mjs [--webhook=URL]     # 健康告警
npm run lint                               # 代码规范校验
```
