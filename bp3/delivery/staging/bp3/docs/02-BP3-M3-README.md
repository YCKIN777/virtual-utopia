# 虚拟乌托邦 BP3-M3 P2 模块

BP3-M3 独立增量工作区，实现 P2 功能并完成 BP3 全链路验收文档。

P2 范围：

- Avatar动作与表情状态存储、更新和同步查询。
- Avatar动作面板与场景内动作状态展示。
- 家园留言板新增、查看、删除和地块权限控制。
- M1语音、M2事件任务背包和P2互动联调。
- 性能、安全、部署和最终验收文档。

M1、M2源码未修改。

## 本地地址

- P2后端：`http://127.0.0.1:3521`
- P2前端：`http://127.0.0.1:5187/p2.html`
- M1前端：`http://127.0.0.1:5176/`
- M2前端：`http://127.0.0.1:5177/p1.html`

## 启动

```powershell
cd H:\BP2\bp3\p2
node backend/src/server.js
node ..\node_modules\vite\bin\vite.js --config frontend\vite.config.js
```

## 测试

```powershell
cd H:\BP2\bp3\p2
npm run check
npm run build
npm run test:perf
npm run test:e2e
```

## 文档

- `docs/BP3-FINAL-OVERVIEW.md`
- `docs/BP3-API-REFERENCE.md`
- `docs/BP3-DEPLOYMENT.md`
- `docs/BP3-PERFORMANCE-SECURITY.md`
- `docs/BP3-ACCEPTANCE-REPORT.md`

验收截图输出到 `artifacts/`。

---

[返回BP3项目索引](../README.md)
