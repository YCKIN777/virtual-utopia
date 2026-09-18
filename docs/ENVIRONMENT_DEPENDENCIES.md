# 虚拟乌托邦 BP2｜环境依赖清单

## 1. 运行时

| 依赖       | 建议版本 | 用途                               |
| ---------- | -------- | ---------------------------------- |
| Node.js    | >=22.5   | Phase5 `node:sqlite`、全部后端服务 |
| npm        | >=10     | Workspace依赖管理和脚本            |
| 现代浏览器 | 最新版   | WebGL、Canvas、DOM编辑器           |

当前验证环境：

- Node.js v24.18.0。
- npm Workspace。
- Windows 11。

## 2. 根工程依赖

| 包         | 版本范围 | 用途      |
| ---------- | -------- | --------- |
| dotenv     | ^17.4.2  | 环境变量  |
| playwright | ^1.63.0  | 浏览器E2E |

## 3. 前端依赖

| 包                 | 版本范围 | 用途             |
| ------------------ | -------- | ---------------- |
| three              | ^0.181.2 | 3D世界渲染       |
| vue                | ^3.5.13  | UI框架           |
| vue-router         | ^4.5.0   | 路由             |
| vite               | ^6.0.5   | 构建和开发服务器 |
| @vitejs/plugin-vue | ^5.2.1   | Vue编译          |
| tailwindcss        | ^3.4.17  | 样式工具         |
| postcss            | ^8.4.49  | CSS处理          |
| autoprefixer       | ^10.4.20 | CSS兼容          |

## 4. 后端依赖

| 包       | 版本范围 | 用途                  |
| -------- | -------- | --------------------- |
| express  | ^4.21.2  | HTTP服务              |
| cors     | ^2.8.5   | 跨域控制              |
| dotenv   | ^16.4.7  | 环境变量              |
| chromadb | ^3.5.0   | Phase3/Phase4向量检索 |
| nodemon  | ^3.1.9   | 开发热重载            |

Phase5 SQLite使用Node.js内置模块，不新增npm依赖。

## 5. 环境变量

### Phase5

| 变量                            | 必填 | 默认值                                   |
| ------------------------------- | ---- | ---------------------------------------- |
| PHASE5_ENABLED                  | 否   | false                                    |
| PHASE5_PORT                     | 否   | 3300                                     |
| PHASE5_DB_PATH                  | 否   | H:\BP2\data\virtual_utopia_phase5.sqlite |
| PHASE5_AUTH_SECRET              | 是   | 无                                       |
| PHASE5_SERVICE_TOKEN            | 是   | 无                                       |
| PHASE5_BOOTSTRAP_ADMIN_USERNAME | 否   | admin                                    |
| PHASE5_BOOTSTRAP_ADMIN_PASSWORD | 是   | 无                                       |
| PHASE5_TOKEN_TTL_SECONDS        | 否   | 28800                                    |
| SESSION_STORAGE_MODE            | 否   | memory，持久化时设为sqlite               |

### Phase6

| 变量                      | 必填 | 默认值                |
| ------------------------- | ---- | --------------------- |
| PHASE6_ENABLED            | 否   | true                  |
| PHASE6_HOST               | 否   | localhost             |
| PHASE6_PORT               | 否   | 3400                  |
| PHASE5_BASE_URL           | 否   | http://localhost:3300 |
| PHASE5_SERVICE_TOKEN      | 是   | 无                    |
| PHASE6_ALLOWED_ORIGINS    | 否   | 本地开发域名列表      |
| PHASE6_REQUEST_TIMEOUT_MS | 否   | 10000                 |

### Phase4/RAG

| 变量                     | 用途        |
| ------------------------ | ----------- |
| ENABLE_RAG_ENHANCE       | RAG增强开关 |
| RAG_BASE_URL             | RAG服务地址 |
| RAG_COLLECTION           | 向量集合    |
| RAG_TOP_K                | 召回数量    |
| RAG_SIMILARITY_THRESHOLD | 相似度阈值  |

## 6. 网络和端口

| 端口 | 服务   | 必需 |
| ---: | ------ | ---- |
| 5175 | 前端   | 是   |
| 3300 | Phase5 | 是   |
| 3400 | Phase6 | 是   |
| 3200 | Phase4 | 可选 |
| 3100 | RAG    | 可选 |
| 8000 | Chroma | 可选 |

## 7. 存储依赖

- SQLite单文件数据库。
- WAL模式。
- 外键约束启用。
- 建议定期备份`data`目录中的SQLite文件。
