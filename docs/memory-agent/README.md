# 虚拟乌托邦 分层记忆 Agent 交付包

> 版本：`memory-agent-v1.0.1`（2026-09-18）
> 对标豆包记忆分层模型：**短期会话记忆 + 用户全局长期记忆 + 虚拟世界状态记忆**

## 交付内容

| 类别 | 位置 |
| --- | --- |
| 后端记忆模块 | `backend/src/memory/`（11 模块 + 单元测试） |
| 前端会话模块 | `frontend/src/session/`（3 页面 + 3 逻辑 + 2 测试） |
| SQL 迁移脚本 | `backend/src/memory/migrate-memory.sql`（5 张表 + embedding 列） |
| 防护中间件依赖 | `backend/src/runtime/`（guard/限流/安全头/日志/embedding） |
| 测试脚本 | `scripts/test-memory.mjs` / `test-memory-e2e.mjs` / `test-all.mjs` |
| 容器配置 | `Dockerfile` / `frontend/Dockerfile` / `docker-compose.yml` |
| 架构文档 | `docs/memory-architecture.md` |

## 快速开始

```powershell
# 本地开发
cd H:\BP2
npm install
node scripts/check-env.mjs phase5          # 校验环境变量
node backend/src/memory/server.mjs          # 启动记忆服务（3600）

# 验证
node scripts/test-memory.mjs                # 后端冒烟
node scripts/test-memory-e2e.mjs            # 全链路 E2E
```

详见：
- [模块清单](MODULE_INVENTORY.md)
- [数据库迁移步骤](MIGRATION_GUIDE.md)
- [本地部署手册](DEPLOYMENT_LOCAL.md)
- [Docker 生产部署手册](DEPLOYMENT_DOCKER.md)
- [运维排障清单](TROUBLESHOOTING.md)
- [测试报告](TEST_REPORT.md)
