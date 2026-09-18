# 虚拟乌托邦 BP2｜本地部署指南

> 适用版本：BP2-V1.1
> 操作系统：Windows 10/11
> 默认前端地址：http://localhost:5175

## 1. 服务与端口

| 服务      | 默认端口 | 说明                           |
| --------- | -------: | ------------------------------ |
| 前端 Vite |     5175 | 3D世界、编辑器、聊天和页面路由 |
| Phase5    |     3300 | SQLite持久化服务               |
| Phase6    |     3400 | 前端业务网关                   |
| Phase4    |     3200 | RAG增强Agent服务，可选         |
| RAG       |     3100 | Chroma检索服务，可选           |
| Chroma    |     8000 | 向量库，可选                   |

核心3D功能和Phase5持久化只依赖 Phase5 3300、Phase6 3400和前端5175。

## 2. 环境要求

- Node.js 22.5或更高版本。
- npm 10或更高版本。
- Windows PowerShell。
- 推荐使用Chromium、Edge或Chrome最新版。
- SQLite无需单独安装，使用Node.js内置`node:sqlite`。

## 3. 安装依赖

在项目根目录执行：

```powershell
cd H:\BP2
npm install
```

## 4. Phase5启动配置

以下变量通过启动终端注入，不需要修改项目原有`.env`文件：

```powershell
$env:PHASE5_ENABLED='true'
$env:PHASE5_PORT='3300'
$env:PHASE5_DB_PATH='H:\BP2\data\virtual_utopia_phase5.sqlite'
$env:PHASE5_AUTH_SECRET='请替换为随机强密钥'
$env:PHASE5_SERVICE_TOKEN='请替换为服务间令牌'
$env:PHASE5_BOOTSTRAP_ADMIN_USERNAME='admin'
$env:PHASE5_BOOTSTRAP_ADMIN_PASSWORD='请替换为管理员密码'
$env:SESSION_STORAGE_MODE='sqlite'
node backend/src/phase5/server.js
```

健康检查：

```powershell
Invoke-RestMethod http://localhost:3300/health
Invoke-RestMethod http://localhost:3300/api/phase5/health
```

## 5. Phase6启动配置

```powershell
$env:PHASE6_HOST='localhost'
$env:PHASE6_PORT='3400'
$env:PHASE5_BASE_URL='http://localhost:3300'
$env:PHASE5_SERVICE_TOKEN='与Phase5保持一致的SERVICE_TOKEN'
$env:PHASE6_ALLOWED_ORIGINS='http://localhost:5175,http://127.0.0.1:5175'
node backend/src/phase6/server.js
```

健康检查：

```powershell
Invoke-RestMethod http://localhost:3400/health
Invoke-RestMethod http://localhost:3400/api/phase6/health
```

## 6. 前端启动

开发模式：

```powershell
npx vite --config frontend/src/virtual-utopia/vite.config.js
```

访问：

```text
http://localhost:5175/#/world
```

生产构建：

```powershell
npm run build --workspace frontend
```

## 7. 账号初始化

Phase5首次启动时会创建管理员账号：

```text
admin / PHASE5_BOOTSTRAP_ADMIN_PASSWORD
```

使用管理员登录后，通过Phase6接口创建editor和viewer：

```powershell
$admin = Invoke-RestMethod `
  -Uri 'http://localhost:3400/api/phase6/auth/login' `
  -Method Post `
  -ContentType 'application/json' `
  -Body (@{username='admin';password='管理员密码'} | ConvertTo-Json)

Invoke-RestMethod `
  -Uri 'http://localhost:3400/api/phase6/users' `
  -Method Post `
  -Headers @{Authorization="Bearer $($admin.token)"} `
  -ContentType 'application/json' `
  -Body (@{
    username='traveler'
    password='编辑者密码'
    role='editor'
    displayName='漫游者'
  } | ConvertTo-Json)
```

viewer账号使用相同方式创建，`role`设置为`viewer`。

## 8. 启动顺序

核心模式：

```text
Phase5 3300 → Phase6 3400 → 前端 5175
```

RAG完整模式：

```text
Chroma 8000 → RAG 3100 → Phase5 3300 → Phase6 3400 → Phase4 3200 → 前端 5175
```

## 9. 数据目录

| 文件                                    | 说明             |
| --------------------------------------- | ---------------- |
| `data/virtual_utopia_phase5.sqlite`     | Phase5持久化数据 |
| `data/virtual_utopia_phase5.sqlite-wal` | SQLite WAL       |
| `data/virtual_utopia_phase5.sqlite-shm` | SQLite共享内存   |
| `data/phase6_audit.sqlite`              | Phase6审计事件   |

备份时建议暂停写入后复制以上文件。

## 10. 部署注意事项

1. 不要把真实密钥写入Git仓库。
2. 生产环境必须使用HTTPS。
3. 通过环境变量配置CORS允许域名。
4. SQLite适合单机部署；多实例部署需迁移到集中数据库。
5. Phase6和Phase5必须使用一致的`PHASE5_SERVICE_TOKEN`。
6. 前端生产构建后，网关地址通过`VITE_PHASE6_GATEWAY_URL`配置。
