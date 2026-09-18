# 本地开发部署手册

## 1. 环境要求

| 依赖 | 版本 |
| --- | --- |
| Node.js | ≥22.5（`node:sqlite`），验证 v24.18.0 |
| npm | ≥10 |

## 2. 安装

```powershell
cd H:\BP2
npm install
```

## 3. 配置环境变量

必填（phase5 依赖）与记忆服务依赖：

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `MEMORY_DB_PATH` | 否 | `data/virtual_utopia_memory.sqlite` | 记忆数据库路径 |
| `MEMORY_PORT` | 否 | `3600` | 记忆服务端口 |
| `MEMORY_RETRIEVAL_MODE` | 否 | `vector` | 召回模式 `vector`/`weight` |
| `GUARD_RATE_MAX` | 否 | `120` | 全局限流（次/分钟） |
| `DEEPSEEK_API_KEY` | 否 | 空 | LLM key，空则走启发式/mock |
| `PHASE5_AUTH_SECRET` | 是 | - | phase5 令牌签名密钥 |
| `PHASE5_SERVICE_TOKEN` | 是 | - | phase5/phase6 服务间令牌 |
| `PHASE5_BOOTSTRAP_ADMIN_PASSWORD` | 是 | - | phase5 初始化管理员密码 |

完整模板见 `.env.example`。

```powershell
# 校验
node scripts/check-env.mjs phase5
```

## 4. 启动服务

```powershell
# 1) 启动记忆服务（3600）
node backend/src/memory/server.mjs

# 2) 启动后端（可选，phase5 3300 → phase6 3400）
node scripts/start-all.mjs

# 3) 启动前端（世界入口 5175，另开终端）
cd frontend
node node_modules/vite/bin/vite.js --config src/virtual-utopia/vite.config.js --host 0.0.0.0
```

**进程守护（可选）**：

```powershell
node scripts/supervise.mjs backend/src/memory/server.mjs
```

## 5. 冒烟验证

```powershell
node scripts/test-memory.mjs          # 后端记忆冒烟
node scripts/test-memory-e2e.mjs      # 全链路 E2E（自动起临时服务）
node --test frontend/src/session/tests/*.test.js   # 前端会话/记忆冒烟
```

## 6. 健康检查

```powershell
Invoke-WebRequest http://localhost:3600/api/conversation/list?userId=u_test
# 或记忆服务健康检查（经 guard 后带安全头）
node scripts/alert.mjs
```
