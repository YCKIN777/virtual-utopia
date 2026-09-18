# 虚拟乌托邦 BP4-M4 验收文档

## 1. 验收范围

本阶段只实现BP4-M4：

- 家园模板和场景模板管理。
- 模板发布、归档和审计。
- PWA manifest、Service Worker和离线缓存。
- 模板统计看板。
- M1实时服务与M2集群指标接入。
- 单元测试、构建和E2E测试。

BP1、BP2、BP3、BP4-M1、BP4-M2和BP4-M3代码未修改。

## 2. 内容模板

接口：

```text
GET  /api/bp4/m4/templates
GET  /api/bp4/m4/templates/:templateId
POST /api/bp4/m4/templates
PUT  /api/bp4/m4/templates/:templateId
POST /api/bp4/m4/templates/:templateId/publish
```

模板类型：

- `home`
- `scene`

状态：

- `draft`
- `published`
- `archived`

权限：

- admin/editor可创建、编辑和发布。
- viewer只读，创建模板返回403。

## 3. PWA与离线缓存

新增：

```text
frontend/public/manifest.webmanifest
frontend/public/sw.js
frontend/public/icons/icon.svg
```

能力：

- PWA standalone安装。
- 页面和静态资源离线缓存。
- `/api`、`/bp4-m4-api`和`/phase5-api`不缓存，避免业务数据过期。
- 离线状态提示。

Service Worker缓存名称：

```text
bp4-m4-shell-v2
```

## 4. 数据看板

接口：

```text
GET /api/bp4/m4/dashboard
```

展示：

- 家园模板数量。
- 场景模板数量。
- 已发布模板数量。
- M1实时服务状态。
- M2集群状态。
- M2 metrics缓存。

## 5. 测试结果

单元测试：

- `npm run check`通过。
- 单元测试3/3通过。
- 覆盖模板服务、权限、metrics聚合和PWA静态资源。

E2E测试：

- `npm run test:e2e`通过。
- 创建家园模板和场景模板。
- 发布模板。
- 模板总数3、家园模板2、场景模板1、已发布1。
- M1/M2指标均可用。
- Service Worker缓存`bp4-m4-shell-v2`创建成功。
- 离线状态提示通过。
- viewer创建模板返回403。
- 桌面和移动端看板截图通过。

## 6. 自检清单

- 历史版本代码未修改。
- M4只新增独立代码、测试和文档。
- 未提前开发AI NPC、语音翻译或跨区域能力。
- 新增Markdown为UTF-8、无BOM、LF。
