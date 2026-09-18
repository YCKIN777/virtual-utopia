# 前端入口隔离说明（R-14 整改文档）

> 目的：明确 `frontend/` 下三套并行入口的定位，避免后续改动混淆。本文档仅做说明，不修改业务源码。

## 三套入口清单

| 入口 | 目录 | vite 配置 | 定位 | 状态 |
| --- | --- | --- | --- | --- |
| 主入口（BP2 六场景） | `frontend/src/` | `frontend/vite.config.js` | 阶段一~五的六场景 H5 应用 | **主入口（生产）** |
| Phase6 管理端 | `frontend/src/phase6/` | `frontend/src/phase6/vite.config.js` | 登录/文档/历史管理面板 | 独立子应用，保留 |
| 3D 世界 | `frontend/src/virtual-utopia/` | `frontend/src/virtual-utopia/vite.config.js` | 50 户 3D 世界 + WebGL + 小程序目录 | 独立子应用，保留 |

## 隔离约定

1. **禁止跨入口 import**：三套入口的 `src` 互不引用对方模块，各自维护 `main.js` / `router` / `stores` / `services`。
2. **构建产物不提交**：各入口的 `dist/` 均由 ESLint 的 `ignores: ["**/dist/**"]` 排除，且 `.gitignore` 已排除 `dist/`。
3. **小程序目录已剔除**：`frontend/src/virtual-utopia/miniprogram/` 为微信小程序原型，非 H5 范围，已从 ESLint 扫描排除（`**/miniprogram/**`），后续若复用需单独建仓。
4. **端口约定**：主入口 `5173`，世界前端 `5175`，Phase6 管理端可复用 `5175` 下独立路由或独立端口。

## 后续收敛建议（需人工决策）

- 若三套入口最终只保留一套，建议将保留项提升为 `frontend/` 主入口，其余迁移到独立 workspace 或独立仓库。
- 现阶段不强制合并，仅以本文档 + 独立 vite 配置保持物理隔离。
