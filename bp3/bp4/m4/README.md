# 虚拟乌托邦 BP4-M4

BP4-M4包含：

- 家园与场景内容模板管理。
- 模板创建、更新、发布、归档和审计。
- PWA移动端安装支持。
- 静态资源离线缓存。
- M1实时服务和M2集群指标看板。
- 单元测试和E2E测试。

本模块只新增`bp3/bp4/m4`，不修改历史版本。

## 启动

```powershell
cd H:\BP2\bp3\bp4\m4
npm install
node backend/src/server.js
node node_modules\vite\bin\vite.js --config frontend\vite.config.js
```

默认地址：

```text
看板：http://127.0.0.1:5207
API：http://127.0.0.1:3561
```

## 测试

```powershell
npm run check
npm run build
npm run test:e2e
```

详细验收见`docs/BP4-M4-ACCEPTANCE.md`。
