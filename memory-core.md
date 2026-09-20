# memory-core.md — 虚拟乌托邦（核心记忆）

> 轻量化初始化文件。本文件保存：项目架构、开发约束、已完成里程碑、核心权限规则。
> 模块详情 → memory-modules.md（按需读对应章节）；归档日志 → memory-log.md（默认不读）。

## 一、项目概览
- 项目：虚拟乌托邦（virtual-utopia），多人在线 3D 乡墅世界（WebGL 低多边形庄园）。
- 版本：**1.0**（家园装扮模块已移除精简）。
- 技术栈：Node.js 后端（ESM）+ Vue3 + Vite + Three.js 前端，pnpm workspace（frontend / backend）。
- 仓库根：`H:/BP2`。

## 二、架构
- 后端：`backend/src/`
  - `phase5/` 主服务（HTTP API + SQLite，端口 3300，账号/鉴权/会话/文档）
  - `phase6/` 网关服务（端口 3400，聚合 phase5 + 各业务模块）
  - `memory/`、`rag/`、`agents/`、`services/`、`config/`、`runtime/`
- 前端：`frontend/src/virtual-utopia/`
  - `webgl/ThreeWorld.js`（3D 场景渲染、漫游、Avatar）
  - `stores/worldStore.js`（全局状态）
  - `components/`（AppHeader / WorldChatPanel / HomePanel / ResidentChatPanel / ResidentCardsPanel / HomepageS2Panel / ResidentDirectoryPanel 等）
  - `views/`（WorldView / ProfileView / LoginView / RegisterView / PortalView / SceneDetailView）、`router/`、`services/`、`tests/`
- 数据库（SQLite，`H:/BP2/data/`）：
  - `virtual_utopia_phase5.sqlite` 主库（users/chat_sessions/知识文档/rag_logs）
  - `phase6_plot_assignment.sqlite` 宅院分配
  - `phase6_visitor_quota.sqlite` 访客名额
  - `phase6_audit.sqlite` 审计
  - `phase6_resident_cards.sqlite` 居民主页卡片（S1）
  - `phase6_guestbook.sqlite` 邻里留言簿（S2）
  - `phase6_resident_social.sqlite` 名录私聊群组（S3）
  - `virtual_utopia_memory.sqlite` 记忆

## 三、运行环境
- phase5（3300）：`PHASE5_AUTH_SECRET=changeme`、`PHASE5_SERVICE_TOKEN=changeme`、`PHASE5_BOOTSTRAP_ADMIN_PASSWORD=utopia2026`、`PHASE5_DB_PATH=H:\BP2\data\virtual_utopia_phase5.sqlite`
- phase6（3400）：`PHASE5_SERVICE_TOKEN=changeme`（网关直连 phase5）
- 管理员账号：`admin` / `utopia2026`（即 KIN，role=admin）
- 前端构建：`VITE_PHASE6_GATEWAY_URL=http://localhost:3400 node node_modules/vite/bin/vite.js build --config frontend/src/virtual-utopia/vite.config.js`

## 四、开发铁则（永久约束）
1. 不改动已验收通过的模块。
2. 任务完成后：追加记录到 memory-log.md + 更新 memory-modules.md 对应章节 + 附自检清单。
3. 新功能优先复用既有端点/store，不重复造轮子。
4. 改动范围最小化，只动目标模块文件。
5. 完成后跑回归测试确认无影响。

## 五、核心权限规则（1.0 基线）
- 角色：`admin`（KIN，城主）、`editor`（原住民）、`viewer`（游客）。
- 游客（viewer）默认不可访问：居民后台、原住民名录、私聊、群组、S1 卡片、S2 展示板/留言簿（均 403）。
- 游客仅可漫游公共广场/读取世界快照；默认不能进院子/屋内，主人开放参观（visitEnabled）后方可进入。
- 原住民：家园参观权限、S1 五类卡片（单条 self/residents 权限，收藏角恒 self）、S2 展示板+邻里留言簿、S3 名录+私聊+临时小群（≤8 人，无全员大群）。
- KIN 管理台：审批入驻申请、自动分配宅院、重置居民密码、迁出回收名额（原住民上限 50）。
- 无点赞/热度/排行；聊天仅参与者可见。

## 六、已完成里程碑 ✅（v1.0）
1. KIN Avatar（复用角色框架）
2. 50 宅院地块 + 自动分配 + 迁出回收
3. 宅院参观权限 + 参观开关持久化（visitEnabled）
4. 全局多人文字聊天（`/api/phase6/chat/world`，3s 轮询）
5. 访客名额权限模块（visitorQuotaStore，原住民上限 50、访客 200）
6. 居民账号体系：自助注册 + KIN 审核入驻 + 自助/后台改密
7. Avatar 居民智能体（复用 KIN 框架）+ 居民 AI 一对一对话
8. 好友系统
9. 居民主页 S1：五类记录卡片（工作计划/出游/随记/心愿/收藏，单条权限）
10. 居民主页 S2：个人展示板 + 邻里留言簿
11. 居民主页 S3：原住民名录 + 一对一私聊 + 临时小群
12. ~~家园装扮（HomeDecorator / 素材库）~~ —— 已移除精简（见 memory-log 2026-09-20「移除家园装扮模块」）

## 七、待办 / 注意
- 运行中 phase5/phase6 若改端点需重启加载。
- phase5 users 表 status 已扩展为 `('active','disabled','pending','moved_out')`，并有 FK 修复逻辑（见 database.js）。
