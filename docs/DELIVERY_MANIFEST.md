# 虚拟乌托邦 BP2｜交付包清单

## 1. 交付内容

交付包包含：

- 前端业务源码。
- Three.js 3D世界源码。
- 家园编辑器与聊天前端源码。
- 后端Phase1至Phase6源码。
- 数据库结构文件。
- 自动化测试脚本。
- 全部项目Markdown文档。
- `stage2_memory.md`至`stage5_memory.md`知识库。
- 验收、部署、环境、运维和API文档。

## 2. 不包含内容

交付包默认排除：

- `node_modules`。
- 本地构建产物。
- 真实`.env`和密钥。
- SQLite运行时数据库。
- 临时日志、缓存和测试截图。

## 3. 建议交付目录

```text
virtual-utopia-bp2-delivery/
├─ backend/
│  ├─ src/
│  └─ package.json
├─ frontend/
│  ├─ src/
│  ├─ index.html
│  ├─ vite.config.js
│  └─ package.json
├─ scripts/
├─ database/
├─ docs/
├─ stage2_memory.md
├─ stage3_memory.md
├─ stage4_memory.md
├─ stage5_memory.md
├─ phase5_design.md
├─ README.md
├─ package.json
└─ package-lock.json
```

## 4. 文档清单

| 文档                               | 说明                       |
| ---------------------------------- | -------------------------- |
| `docs/ACCEPTANCE_REPORT_V2.md`     | 完整项目验收报告           |
| `docs/LOCAL_DEPLOYMENT_GUIDE.md`   | 本地部署指南               |
| `docs/ENVIRONMENT_DEPENDENCIES.md` | 环境依赖清单               |
| `docs/OPERATIONS_MANUAL.md`        | 启动、停止、备份和排障手册 |
| `docs/API_REFERENCE.md`            | API接口总览                |
| `docs/DELIVERY_MANIFEST.md`        | 交付包清单                 |

## 5. 交付校验

解压后执行：

```powershell
npm install
npm run check
```

核心E2E：

```powershell
node frontend/src/virtual-utopia/webgl/tests/world.e2e.mjs
node frontend/src/virtual-utopia/webgl/tests/home-decorator.e2e.mjs
node frontend/src/virtual-utopia/webgl/tests/multiplayer-avatar.e2e.mjs
node frontend/src/virtual-utopia/webgl/tests/world-chat.e2e.mjs
node backend/src/phase6/tests/phase6.gateway.e2e.mjs
node backend/src/phase6/tests/worldState.persistence.e2e.mjs
```

所有文档必须保持UTF-8、LF、无BOM。
