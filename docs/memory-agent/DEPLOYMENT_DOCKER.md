# Docker 生产部署手册

## 1. 镜像与编排

| 服务 | 镜像 | 端口 |
| --- | --- | --- |
| phase5 | `Dockerfile`（Node 24） | 3300 |
| phase6 | `Dockerfile`（compose 覆盖 command） | 3400 |
| frontend | `frontend/Dockerfile`（vite build+preview） | 5175 |
| chromadb | `chromadb/chroma` | 8000 |
| postgres | `postgres:16-alpine` | 5432 |

> 说明：记忆服务（3600）在 compose 中与 phase5 同镜像、可加一个 `memory` 服务；当前 memory 服务默认随 phase5 镜像运行，见下方「补充 memory 服务」。

## 2. 部署步骤

```powershell
# 1) 配置密钥（生产必改）
$env:PHASE5_AUTH_SECRET='<强随机值>'
$env:PHASE5_SERVICE_TOKEN='<强随机值>'
$env:PHASE5_BOOTSTRAP_ADMIN_PASSWORD='<强密码>'
$env:POSTGRES_PASSWORD='<强密码>'
$env:DEEPSEEK_API_KEY='<可选，记忆提炼用>'

# 2) 构建并启动
docker compose up -d --build

# 3) 查看状态与日志
docker compose ps
docker compose logs -f phase5 phase6
```

## 3. 补充记忆服务到 compose

在 `docker-compose.yml` 的 `services` 下追加：

```yaml
  memory:
    build: .
    command: node backend/src/memory/server.mjs
    ports:
      - "3600:3600"
    environment:
      MEMORY_DB_PATH: /data/virtual_utopia_memory.sqlite
      MEMORY_RETRIEVAL_MODE: ${MEMORY_RETRIEVAL_MODE:-vector}
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:-}
      GUARD_RATE_MAX: ${GUARD_RATE_MAX:-120}
    volumes:
      - ./data:/data
    depends_on:
      - phase5
```

## 4. 停止与数据

```powershell
docker compose down            # 停止（保留数据卷）
docker compose down -v         # 停止并清空数据卷（慎用）
```

## 5. 生产安全清单

- [ ] 替换所有 `changeme` 占位密钥为强随机值
- [ ] 限制 `PHASE6_ALLOWED_ORIGINS` 为生产域名
- [ ] 挂载持久卷备份 SQLite 数据
- [ ] 配置反向代理 HTTPS
- [ ] 定时运行 `alert.mjs` 健康告警
