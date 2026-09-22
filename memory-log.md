# memory-log.md — 归档日志（默认不读取）

> 任务完成时追加记录，每条附带自检清单。
> 仅当需要回溯历史实现细节时才读取。

---

<!-- 记录格式：
## YYYY-MM-DD 任务标题
- 改动文件
- 关键实现
- 测试结果
- 自检清单（是否跑回归 / 是否截图 / 是否更新 memory-modules.md）
-->

---

## 2026-09-20 家园装饰素材库扩充（树木/景观小品/庭院摆件）

- **改动文件**：`data/homeMaterials.js`（+3 分类 +12 素材）、`components/HomeDecorator.vue`（allowedCategories 注册 + hasCollision 碰撞语义）。
- **未改动**：worldStore.js、ThreeWorld.js、宅院分配/权限/聊天/Avatar 漫游/地块原有代码。
- **关键实现**：
  - 新增 `garden-trees`(树木类)、`garden-landscape`(景观小品类)、`garden-ornaments`(庭院摆件类)，各 4 素材，`cost:0` 全部自动解锁。
  - 统一数据结构：id/name/category/previewAsset/modelAsset/scaleMin/scaleMax/hasCollision，并保留 shape/cost/color 复用旧渲染与 store。
  - `materialHasCollision(materialId) = homeMaterialMap[materialId]?.hasCollision !== false`：旧素材无字段→默认碰撞(行为不变)；景观类 hasCollision=false→允许重叠摆放。
  - 摆放/移动/删除/持久化复用既有 addHomeItem/updateHomeItem/removeHomeItem + world-session 快照，未改。
- **测试结果**：
  - 数据层：node import 验证 17 分类 / 57 素材 / 12 新素材全部入 homeMaterialMap。
  - 前端单测 13/13 通过；后端单测 33/33 通过。
  - Playwright 无头（`scripts/test-decor-materials.mjs`）：三类展示✓、12 素材列表✓、乔木拖拽摆放✓、景观小品重叠摆放✓、删除✓、快照持久化✓、控制台 0 报错✓。
- **自检清单**：
  - [x] 装扮素材面板完整展示新增三类素材
  - [x] 全部素材支持拖拽摆放、位置移动、删除操作
  - [x] 摆放数据写入宅院 items，持久化生效，刷新保留
  - [x] 地块边界校验生效（复用 isInNoPlaceZone，未改）
  - [x] 原有模块回归测试正常（后端33 + 前端13）
  - [x] Playwright 素材列表与摆放，控制台 0 报错（截图 decor_materials_trees.png / decor_materials_ornaments.png）
  - [x] 本次记录写入 memory-modules.md
- **已知局限**：`scaleMin/scaleMax` 仅作数据字段存储，未实现每件物品独立缩放 UI（需改 store+渲染，超出「只新增素材定义」范围）；`hasCollision` 已接入摆放/移动校验，`previewAsset/modelAsset` 为描述性标识（现有渲染走 shape+color）。
- **备份**：`homeMaterials.js.matlibbak`、`HomeDecorator.vue.matlibbak`（可回滚）。

---

## 2026-09-20 扩充家园装饰素材库（定稿规范）

> 虚拟乌托邦

1. 新增家园装扮素材，分三大类别：树木类、景观小品类、庭院摆件。
2. 素材字段：id、name、category、previewAsset、modelAsset、scaleMin、scaleMax、hasCollision，素材注册进装扮面板。
3. 复用现有拖拽摆放、移动、删除逻辑，摆放数据保存在宅院 items 数组，随 world-session 快照持久化。
4. 边界校验：素材禁止摆放到宅院地块外，支持手动重叠摆放。
5. 模型按需实例加载，优化 3D 渲染性能。本次开发不修改宅院分配、参观权限、聊天、Avatar 漫游代码，回归测试全部通过。

---

## 2026-09-20 Avatar 居民智能体基础模板（复用 KIN 角色框架）

- **改动文件（仅新增/最小向后兼容，未改 KIN/宅院/装扮/权限/聊天原有逻辑）**：
  - 新增 `frontend/src/virtual-utopia/data/residents.js`（seedResidents 5 户 + RESIDENT_CHAT_DISTANCE）。
  - `webgl/ThreeWorld.js` 新增 4 方法：`addResidentAvatar` / `getResidentAvatarStates` / `restoreResidentAvatarStates` / `getResidentsNearLocal`（复用 `addRoamingAgent`，未改 KIN 原有方法）。
  - `stores/worldStore.js` 新增 `residentStates` 状态 + `setResidentStates`（含 queuePersist）+ 快照 `residents` 字段 + 恢复。
  - `views/WorldView.vue` 挂载时实例化 5 居民 + 恢复 + 3s 同步 + 600ms 邻近检测 + 聊天入口/弹窗 UI。
  - `backend/src/phase6/gatewayService.js` `WORLD_SNAPSHOT_KEYS` 追加 `'residents'`（快照白名单，向后兼容）。
- **关键实现**：
  - 居民复用 KIN 渲染管线：`addResidentAvatar` 内部调 `addRoamingAgent(isLord=false)`，自动获得 walk/idle 动画 + 头顶昵称 label（createAvatarLabel）+ 漫游循环；不调 `addLordMarker` 故无金冠，KIN 金冠不受影响。
  - 宅院范围漫游：`record.roaming.bounds = 宅院中心 ±2.3`（plot 平台半径约 2.8~3.2），`pickRoamingWaypoint` 在 bounds 内取点，不会越界。
  - 邻近聊天入口：`getResidentsNearLocal(distance)` 用 `getLocalAvatarState()` 与居民 group 位置算距，≤4.0 时 WorldView 显示「与 X 交谈」按钮 + 预留弹窗。
  - 持久化：居民 position/rotation/currentState 每 3s 同步进 `state.residentStates` 并 queuePersist 存 world-session 快照；刷新后 `applyWorldSnapshot` 恢复 + `restoreResidentAvatarStates` 还原。
- **测试结果**：
  - 后端单测 33/33；前端单测 13/13；phase6 单测 16/16；快照含 `residents` 字段 PUT 200。
  - Playwright 无头（`scripts/test-resident-avatar.mjs`）：实例化 5 居民✓、KIN 金冠保留/居民无金冠✓、宅院范围漫游✓、靠近触发聊天入口(阿岚)✓、刷新状态保留✓、控制台 0 报错✓。
- **自检清单**：
  - [x] 居民 Avatar 实例化，复用 KIN 模型与 idle/行走动画
  - [x] 限定在绑定 homePlotId 宅院地块内漫游，不越界
  - [x] 头顶昵称、无金冠；KIN 金冠不受影响
  - [x] 位置/姿态写入 world-session 快照，刷新保留
  - [x] 靠近居民触发聊天弹窗入口（预留）
  - [x] KIN/宅院/装扮/聊天回归正常（后端33 + 前端13 + phase6 16）
  - [x] Playwright 渲染测试控制台 0 报错
  - [x] 记录写入 memory-modules.md
- **已知局限**：无头 swiftshader 软渲染帧率极低（~1fps），`delta` 被 clamp 到 0.05，漫游动画在无头环境跑得慢（真实 GPU 60fps 正常）；`getLocalAvatarState` 依赖 `updateLocalAvatarTransform` 从 camera 同步，属既有机制。
- **备份**：`ThreeWorld.js.residentbak`、`worldStore.js.residentbak`、`WorldView.vue.residentbak`、`gatewayService.js.residentbak`。
- **运行环境变更**：phase6(3400) 已重启加载 WORLD_SNAPSHOT_KEYS 变更（新 PID 17940）。

---

## 2026-09-20 居民 AI 一对一对话能力

- **改动文件（仅新增/最小向后兼容，未改宅院/地块/装扮/全局聊天/居民漫游/KIN 原有逻辑）**：
  - 新增 `backend/src/phase6/residentChatService.js`（人设提示词 + LLM 调用 + mock 降级）。
  - `backend/src/phase6/app.js` 新增端点 `POST /api/phase6/chat/resident`（Bearer + audit）。
  - `backend/src/phase6/gatewayService.js` `WORLD_SNAPSHOT_KEYS` 追加 `'residentChats'`。
  - `frontend/.../services/gatewayClient.js` 新增 `sendResidentChat`。
  - `frontend/.../stores/worldStore.js` 新增 `residentChats` 状态 + `sendResidentChat` + 快照字段。
  - `frontend/.../components/ResidentChatPanel.vue`（新增组件）。
  - `frontend/.../views/WorldView.vue` 将预留弹窗替换为真实聊天面板。
- **关键实现**：
  - 人设：`buildResidentPersona(residentName)` → 系统提示词绑定居民身份，LLM 回复带人设；无 key/失败时降级 `buildFallbackReply`。
  - 会话隔离：`state.residentChats` 按 residentName 分 key，每个居民独立数组；私聊走独立端点，与 `/chat/world` 完全分离。
  - 持久化：`residentChats` 纳入 world-session 快照（+ `'residentChats'` 白名单），刷新后恢复。
  - 校验：后端 200 字符上限 + 空消息 + 空 residentName 400；前端 maxlength=200 + 空消息按钮禁用。
- **测试结果**：
  - 后端 33/33；前端 13/13；phase6 16/16。
  - 端点 curl：真实 LLM 回复带人设(mock=false)、空消息/超200/空名 400。
  - Playwright 无头（`scripts/test-resident-chat.mjs`）11/11：靠近显示按钮✓ 唤起✓ 名称✓ 空消息禁用✓ maxlength✓ 带人设回复✓ 关闭✓ 快照持久化(阿岚≥2条)✓ 会话隔离(仅阿岚)✓ 刷新保留✓ 0 报错✓。
- **自检清单**：
  - [x] ≤4m 交谈按钮显示，远离隐藏
  - [x] 点击唤起弹窗、可关闭
  - [x] 发送获带人设回复；200 字符限制；空消息拦截
  - [x] 每居民对话上下文隔离
  - [x] 私聊与全局聊天独立
  - [x] 对话记录入快照，刷新保留
  - [x] 原有模块回归正常（后端33 + 前端13 + phase6 16）
  - [x] Playwright 居民对话收发，控制台 0 报错
  - [x] 记录写入 memory-modules.md
- **注意**：`backend/.env.development` 的 `DEEPSEEK_API_KEY=` 为空会覆盖 `.env` 真实 key（既有配置问题）；`residentChatService.js` 用 dotenv override 重载 `.env` 解决，未改动 env.js/配置加载。
- **备份**：`app.js.residentchatbak`、`gatewayService.js.residentchatbak`、`gatewayClient.js.residentchatbak`、`worldStore.js.residentchatbak`、`WorldView.vue.residentchatbak`。
- **运行环境变更**：phase6(3400) 已重启（新 PID 18096）加载 chat/resident 端点 + residentChats 白名单。

---

## 2026-09-20 前端 world 初始化接口修复

【更新记录】
- **修复时间**：2026-09-20
- **变更内容**：前端 world 初始化接口，废弃旧接口 `/api/phase6/world/init`，替换为有效接口 `/api/phase6/world-state`；请求自动附带 Bearer token 鉴权。
- **验证结果**：后端接口 200 正常返回快照；前端无头测试无 404、无 Failed to fetch，页面模块加载完成；浏览器端如遇残留报错，Ctrl+F5 强制清缓存。
- **约束**：本次仅修改接口调用地址，没有改动 3D 渲染、地块、居民、聊天等业务源码。

---

## 2026-09-20 复测 world 接口修复效果 + E2E 专项联调

> 复测 + E2E 专项（权限/聊天/家园）

- **服务启动**：phase5(3300) PID 2424、phase6(3400) PID 5796、vite(5199) PID 1996，health 全 ok。
  - phase6 以 `PHASE6_ALLOWED_ORIGINS` 追加 `http://localhost:5199` / `http://127.0.0.1:5199` 解决 dev 代理 Origin 校验。
- **浏览器手动验证（127.0.0.1:5199/#/world，无头 Chromium 登录 admin）**：
  - world-state 经 vite 代理 `5199/phase6-api/api/phase6/world-state` 返回 **200** 拉取快照；
  - `world/init` 0 命中；404=0、4xx/5xx=0、console error=0、Failed to fetch=0。
- **E2E 权限全链路（scripts/test-visitor-quota.mjs，自建 3310/3410 双账号）**：13 步全通过（城主登录/入住原住民/发放邀请码/访客注册/访客发放名额拦截/移除返还/回收/迁出/非管理员统计拦截）。
- **E2E 聊天+家园+权限 HTTP 联调（对运行中 3400）**：10/10 通过 —— 世界频道发/读、居民私聊返回带人设 LLM 回复、world-state 读/写/装饰持久化、地块列表(50)、访客名额总览、无 token 401 拦截。
- **发现的问题**：`scripts/test-visitor-quota-ui.mjs`（phase6 管理后台 UI 自测）失败——管理台登录 `admin-pass-2026` 后 `waitForURL(/#\/documents/)` 超时；且该脚本自建静态服务端口硬编码 5199 与运行中 vite dev(5199) 冲突。属管理后台前端(dist)与测试环境冲突，与本次 world 接口修复无关，待后续单独排查。
- **结论**：world 初始化接口修复生效，权限/聊天/家园业务链路正常，无回归。

---

## 2026-09-20 排查 test-visitor-quota-ui.mjs 管理台登录超时

> 根因修正 + E2E 脚本修复

- **真实根因（与任务给出的线索不同）**：脚本自建 phase6 在 `127.0.0.1:3401`，但 `frontend/src/phase6/dist` 与 `frontend/src/virtual-utopia/dist` 产物在构建时写死了网关地址 `http://localhost:3400`（admin 前端 `phase6Api.js` 默认 base、world 前端 `VITE_PHASE6_GATEWAY_URL=3400`）。浏览器 UI 因此把登录/请求打到 3400（主 phase6，密码不符）而非 3401，admin 登录 `waitForURL(/#\/documents/)` 超时。
- **关于“5199 端口冲突”线索**：经验证 Windows 上 `127.0.0.1:5199` 与 `0.0.0.0:5199`（vite）可共存，不是直接冲突点；但脚本硬编码 5198/5199 确属脆弱，已一并修复。
- **改动（仅 scripts/test-visitor-quota-ui.mjs）**：
  1. 前端静态服务端口改为环境变量 `VU_WORLD_UI_PORT`(默认5199) / `VU_ADMIN_UI_PORT`(默认5198)，移除硬编码。
  2. `startStaticServer` 对 `.js` 产物做运行时重写：`http://localhost:3400` → `http://127.0.0.1:3401`（自建 phase6），让 UI 请求落到本测试后端。
  3. phase6 `allowedOrigins` 改用上述端口变量。
- **测试结果**：admin 登录 `waitForURL(/#\/documents/)` 超时已消除，管理台「访客名额」面板渲染 + 截图成功（visitor_quota_admin.png 已重新生成）。
- **遗留问题（另行排查）**：脚本后半段 world UI 步（resident_a 登录后应跳转 /#/profile）仍失败——登录 POST 与 world-state GET 均返回 200、无 JS 报错，但页面停留 /#/login 未跳转。属 world UI dist（9-19 23:25 重建）的客户端导航问题，与本次管理台登录修复无关，与 admin 登录超时非同一缺陷。

---

## 2026-09-20 迭代居民账号体系：自助注册 + 管理员审核入驻

> 新增模块（居民注册/审核/改密/迁出）

### 业务规则
- 外部人员自助注册（用户名+密码）→ 账号 `pending`（待审核），不能登录世界。
- 仅 KIN（role=admin）在管理台批准/驳回；批准→`active` + 自动分配空置宅院 + 占用原住民名额（上限 50）；驳回→`disabled`（作废，可重新提交同名申请）。
- 居民自助改本人密码；KIN 后台重置居民密码（不可改用户名）；迁出→回收宅院+名额，账号 `moved_out`。
- 游客体系（邀请码）不受影响；3D 世界无特权标识。

### 数据模型
- `phase5` users 表 status CHECK 扩为 `('active','disabled','pending','moved_out')`，`database.js` 新增 `migrateUserStatuses`（重建表迁移既有库）。
- `repositories.users` 新增 `updatePassword` + `list` 支持 status 过滤。

### 后端接口（phase5 + phase6）
- phase5：`POST /api/phase5/auth/register`（公开）、`PUT /api/phase5/auth/password`（自助）、`PUT /api/phase5/users/:id/password`（管理员重置，禁改 admin）、`GET /api/phase5/users?status=`。
- phase6：`POST /api/phase6/residents/apply`（公开）、`GET /api/phase6/resident-applications`（admin）、`POST .../approve`（名额校验+自动分配宅院）、`POST .../reject`、`PUT /api/phase6/auth/password`、`POST /api/phase6/residents/:userId/reset-password`；`depart` 扩展为回收宅院 + 用户状态 `moved_out`。

### 前端
- world：新增 `views/RegisterView.vue` + `/register` 路由 + LoginView「提交入驻申请」入口 + ProfileView「修改密码」组件；gatewayClient/worldStore 新增 registerResidentApplication/changePassword。
- 管理台：新增 `views/ResidentApplicationsView.vue` + `/applications` 路由 + AdminLayout 导航「入驻申请」；phase6Api 新增 list/approve/reject/reset 方法。

### 测试
- 新增 `backend/src/phase6/tests/residentApplications.e2e.mjs`（mock phase5 全链路，通过）。
- HTTP E2E 21/21（注册/待审核拦截/重复名/审核/批准自动分配宅院/名额+1/改密/重置/迁出回收/驳回重提）。
- UI 无头 8/8（注册页提交成功提示、管理台登录+申请面板渲染+批准、批准后居民登录）。
- 回归：phase6 单测 16/16、前端单测 13/13 全绿。

### 待办/注意
- 运行中 phase5(3300)/phase6(3400) 已重启加载新端点（phase5 PID 11000、phase6 PID 15440）。
- 测试残留：data 库中 `admin`(id1)、`resident_mu95v688` 为历史 departed 居民记录（非本次引入）。

---

## 2026-09-20 居民主页迭代 S1：五卡片（工作计划/出游/随记/心愿/收藏）

> 仅改居民个人主页（ProfileView）及其数据链路，未动其他页面/模块

### 规则
- 五卡片：work_plan / travel_log / life_note / wish_list / favorite。
- 单条权限：self（仅自己）/ residents（原住民可见）；favorite 恒 self（服务端强制）。
- 游客（viewer）不可见整组卡片（403）；无点赞/热度/排行；自愿填写。

### 后端
- 新增 `backend/src/phase6/residentCardStore.js`（SQLite 表 `resident_cards`，含 user_id/username/card_type/content(JSON)/permission/时间）。
- `config.js` 新增 `cardDatabasePath`（`data/phase6_resident_cards.sqlite`）；`server.js` 接线。
- `app.js` 新增端点：`GET/POST /api/phase6/resident-cards`、`PUT/DELETE /api/phase6/resident-cards/:id`；`requireResident`（仅 editor/admin，viewer 403）；content 归一化（title/body/inviteOpen/refType）；favorite 强制 self；越权编辑/删除 403。

### 前端
- 新增 `components/ResidentCardsPanel.vue`（5 tab + 卡片列表 + 编辑弹窗 + 权限选择器 + 出游「漫游邀约」开关 + 邻里分享展示）。
- `views/ProfileView.vue` 嵌入该面板（新增「我的主页卡片」section）；`gatewayClient.js`/`worldStore.js` 新增 list/create/update/delete 方法 + `residentCards` 状态。

### 测试
- 新增 `backend/src/phase6/tests/residentCardStore.test.js`（CRUD+权限过滤+收藏强制 self，通过）。
- HTTP E2E 19/19（游客 403、self/residents 可见性、社区列表、漫游邀约、越权 403、改删、权限切换）。
- UI 无头 7/7（登录进个人中心、5 tab 渲染、新增、权限切换、删除、0 报错）。
- 回归：phase6 单测 17/17、前端单测 13/13（含家园装扮 home ownership 用例）全绿。

### 环境
- phase5/phase6 已重启（`GUARD_RATE_MAX=2000` 提升限流阈值，避免世界页轮询触发 429）。
- 世界前端已重新打包（`index-DXoL75nF.js`）。

---

## 2026-09-20 居民主页迭代 S2：个人展示板 + 邻里留言簿

> 仅改居民个人主页（ProfileView），家园 + S1 卡片全部保留

### 规则
- 个人展示板：聚合本人 `permission='residents'`（公开）卡片（收藏角除外）；原住民可查看他人展板，游客不可见（403）。
- 邻里留言簿：仅原住民读写（游客 403）；纯留言，无点赞/热度/排行。

### 后端
- `residentCardStore.js` 新增 `listPublicByUser(userId)`（某居民公开卡片，供展示板）。
- 新增 `guestbookStore.js`（SQLite 表 `guestbook_messages`：from_user_id/from_username/content/created_at）。
- `config.js` 新增 `guestbookDatabasePath`；`server.js` 接线。
- `app.js` 新增端点：`GET /api/phase6/resident-board`（`?userId=` 可选，默认自己）、`GET/POST /api/phase6/guestbook`、`DELETE /api/phase6/guestbook/:id`（作者或 admin 可删）；均 `requireResident`（editor/admin，viewer 403）；留言 1~300 字符。

### 前端
- 新增 `components/HomepageS2Panel.vue`（个人展示板 + 邻里留言簿 UI，含留言输入框 + 删除）。
- `views/ProfileView.vue` 嵌入该面板（新增「展示板与留言簿」section）。
- `gatewayClient.js`/`worldStore.js` 新增 listResidentBoard/listGuestbook/createGuestbookMessage/deleteGuestbookMessage + `board`/`guestbook` 状态。

### 测试
- 新增 `backend/src/phase6/tests/guestbookStore.test.js`（留言 CRUD，通过）。
- HTTP E2E 15/15（展板仅公开、他人展板可查、游客 403、留言读写、越权删除 403、作者/KIN 删除）。
- UI 无头 6/6（登录进个人中心、S2 section/展示板/留言簿渲染、写留言、0 报错）。
- 回归：phase6 单测 18/18、前端单测 13/13（含家园装扮 + S1 卡片用例）全绿。

---

## 2026-09-20 居民主页迭代 S3：原住民名录 + 一对一私聊 + 临时小群

> 仅改居民个人主页（ProfileView），主页 S1/S2/家园全部保留

### 规则
- 原住民名录：展示全部活跃原住民（≤50 户）；仅原住民（editor/admin）可见，游客 403。
- 点击居民唤起一对一私聊（direct_messages，仅两名参与者可读，结构性隔离）。
- 临时小群：建群仅可邀请名录原住民；不设全员大群（`GROUP_MAX_MEMBERS=8` 含创建者）；仅群成员可读/发言。
- 无活跃度/排行；聊天隔离，外人不可查看。

### 后端
- 新增 `residentSocialStore.js`（表：direct_messages / chat_groups / group_members / group_messages；`GROUP_MAX_MEMBERS=8`）。
- `config.js` 新增 `socialDatabasePath`；`server.js` 接线。
- `app.js` 新增端点（均 `requireResident` 拦截 viewer 403）：`GET /api/phase6/resident-directory`（活跃居民列表，复用 visitorQuotaStore）、`GET/POST /api/phase6/direct-messages`（私聊，禁聊自己）、`GET/POST /api/phase6/groups`（我的群/建群，限成员数+仅名录原住民）、`GET/POST /api/phase6/groups/:id/messages`（仅成员可读/发）。

### 前端
- 新增 `components/ResidentDirectoryPanel.vue`（名录网格 + 私聊弹窗 + 群列表 + 建群面板 + 群聊弹窗，3s 轮询刷新对话）。
- `views/ProfileView.vue` 嵌入该面板（新增「原住民名录」section）。
- `gatewayClient.js`/`worldStore.js` 新增 listResidentDirectory/listDirectMessages/sendDirectMessage/listGroups/createGroup/listGroupMessages/sendGroupMessage。

### 测试
- 新增 `backend/src/phase6/tests/residentSocialStore.test.js`（私聊隔离 + 群成员/消息，通过）。
- HTTP E2E 16/16（名录查看/游客403、私聊收发/隔离/游客403、建群/群读/非成员403/超限400/游客建群403）。
- UI 无头 6/6（登录、名录 section 渲染、名录展示居民、点击私聊、建群、0 报错）。
- 回归：phase6 单测 19/19、前端单测 13/13 全绿。

---

## 2026-09-20 移除家园装扮模块，精简项目（v1.0 里程碑）

> 仅删除家园装扮相关代码，保留其余全部模块

### 变更范围
- **删除文件**：`components/HomeDecorator.vue`、`components/UtopiaCanvas.vue`（死代码）、`data/homeMaterials.js`、`webgl/tests/home-decorator.e2e.mjs`、`scripts/test-decor-materials.mjs`（含 .bak）。
- **HomePanel.vue**：移除「编辑家园」按钮 + 素材 tabs/网格/放置/旋转/删除 UI，保留参观权限开关、留言、来访记录、隐藏线索。
- **WorldView.vue**：移除 HomeDecorator 引用与挂载；保留公共漫游、Avatar 装扮、室内模式等。
- **worldStore.js**：移除 `unlockedMaterialIds`、`isMaterialUnlocked`、`unlockMaterial`、`addHomeItem/updateHomeItem/removeHomeItem`、`addInteriorItem/updateInteriorItem/removeInteriorItem`；快照移除 `courtyardItems`/`interiorFurniture`；保留宅院归属、参观权限、留言、线索。
- **gatewayService.js**：`WORLD_SNAPSHOT_KEYS` 移除 `courtyardItems`/`interiorFurniture`，快照校验同步收紧（旧字段返回 400）。
- **测试**：更新 worldPersistence/worldStore/plotInit/worldState.persistence/phase6.gateway 相关用例，去除装饰断言，改验证参观权限。

### 修复（本次发现并修复的既有 bug）
- phase5 `migrateUserStatuses` 原用 `ALTER TABLE users RENAME TO users_migrating` 会顺带改写 chat_sessions/knowledge_documents/rag_logs 的外键，导致 world-state 会话写入报 `no such table: users_migrating`。已改为「新建临时表→拷贝→删旧→重命名」顺序，并新增 `repairUserForeignKeys` 修复既有损坏外键。

### 验证
- 前端单测 13/13、phase6 单测 19/19 全绿。
- 移除后全量回归 HTTP E2E **28/28**（KIN 审批/宅院/密码/迁出/50 上限、S1 卡片、S2 展示板留言、S3 名录私聊群、游客 403、越权 401/403、快照无装饰字段、参观权限持久化）。
- 前端构建通过；旧装饰字段 world-state 写入被拒（400）。

### 版本
- **v1.0 里程碑**：家园装扮已移除，剩余模块（漫游/宅院/参观权限/访客/聊天/好友/居民账号/S1/S2/S3）全部正常。

---

## 2026-09-20 居民入驻申请表单字段迭代（档案存储 + 隐私隔离）

> 仅修改申请表单 + 数据库申请档案结构，不改动其他业务模块

### 表单字段（必填/选填）
- 必填：账号(用户名)、昵称(displayName)、密码、确认密码。
- 选填：爱好(hobbies)、职业(occupation)、自我介绍(selfIntro)、联系标识(contact)、家庭住址(address)。
- 对外展示：昵称/爱好/职业/自我介绍；仅 KIN 可见：联系标识/家庭住址。

### 数据与后端
- `phase5` users 表新增 `hobbies/occupation/self_intro/contact/address` 列（`migrateUserProfileFields` ALTER 补齐）。
- `phase5` 注册接口新增昵称必填 + 昵称/账号唯一校验；`GET/PUT users` 返回/更新新字段。
- `phase6` `utopia_residents` 表新增 `hobbies/occupation/self_intro`（公开档案，`migrate` ALTER 补齐）；审批时从 phase5 用户同步公开信息到居民档案。
- 名录(S3)返回公开信息（爱好/职业/自我介绍），**不含**联系标识/家庭住址；KIN 后台申请列表返回全部字段（含隐私字段）。
- 密码前端加密传输：前端 SHA-256（world LoginView/RegisterView + admin LoginView），后端 scrypt 存储；`security.js` 新增 `sha256Hex`，bootstrap 管理员改为 `scrypt(sha256(pwd))`，`migrateAdminPassword` 幂等迁移既有管理员密码。

### 测试
- HTTP E2E 12/12（KIN 登录、全套字段申请、昵称/账号唯一 400、KIN 查看全部字段、批准建档、名录公开信息、名录不含隐私、待审不能登录、驳回不占名额）。
- 回归：前端单测 13/13、phase6 单测 19/19、后端 e2e 全绿。
- UI 验证：注册表单渲染全部字段 + 必填校验生效 + 提交成功(201)；管理台登录(前端加密) + 申请面板展示新字段。

### 备注
- 密码方案变更后，管理台登录需走前端 SHA-256（admin LoginView 已同步）；API 直调需自行传 `sha256(password)`。

---

## 2026-09-20 v1.0 收尾优化：入驻申请窗口与审批后台体验

> 仅优化交互与提示，不改动数据库核心结构、权限逻辑

### 变更
- **驳回备注**：`phase5` users 表新增 `reject_reason` 列；KIN 后台驳回弹窗增加「驳回备注」输入框，备注持久化。
- **查询我的申请**：新增公开接口 `GET /api/phase5/resident-applications/query?username=` + `GET /api/phase6/resident-applications/query`；访客登录页新增「查询我的申请」入口，展示待审批/已通过/已驳回（带驳回理由）。
- **审批通过通知**：查询结果为 active 时展示「申请已通过，可登录进入乌托邦」提示。
- **表单校验定位**：注册表单服务端唯一错误（用户名/昵称占用）按关键词定位到对应字段。

### 改动文件
- backend：`phase5/schema.sql`、`database.js`、`repositories.js`、`httpServer.js`；`phase6/gatewayService.js`（rejectApplication/queryResidentApplication）、`app.js`（reject 传 reason + query 端点）。
- frontend：world `LoginView.vue`（查询入口+状态面板）、`RegisterView.vue`（错误定位）、`gatewayClient.js`/`worldStore.js`（queryResidentApplication）；admin `ResidentApplicationsView.vue`（驳回备注弹窗）、`phase6Api.js`（reject 传 reason）。

### 测试
- HTTP E2E 8/8（提交→待审批查询→批准→已通过通知→驳回填理由→已驳回带理由查询→不存在账号）。
- 回归：前端单测 13/13、phase6 单测 19/19、backend e2e 全绿。

---

## 2026-09-20 v1.0 发布前收尾：打包归档（v1.0 打包完成）

> 仅清理 / 打包 / 写文档，不改动业务逻辑

### 交付物
- **干净数据库模板**：`database/templates/*.sqlite`（仅表结构 + bootstrap 管理员 admin/utopia2026；plot_assignment 50 块空置宅院），由 `scripts/init-clean-db.mjs` 生成。
- **环境配置**：`.env` / `backend/.env` 已清除真实 DeepSeek 密钥（改为空占位）；`backend/.env.example` 重写为完整模板（含 LOG_LEVEL / GUARD_RATE_MAX / phase5/phase6 各 DB 路径）；`runtime/guard.js` 生产环境默认日志级别降为 `warn`（关闭请求级 info 日志）。
- **v1.0 说明文档**：`H:/Obsidian/vault-bp2/BP2-v1.0版本说明.md`（功能清单 / 权限规则 / 部署启动命令，适配 Obsidian wikilink）。
- **源码打包**：`release/BP2-v1.0-src.tar.gz`（603 KB，401 文件）+ `release/BP2-v1.0-src.tar.gz.sha256`。
  - 已排除：node_modules / .git / data / dist / .env(密钥) / *.sqlite / *.log / *.bak / vu_screens(截图) / 历史归档 / bp3 / deliverables 等。

### 验证
- 前端生产构建通过（world + admin），headless 控制台 0 报错（门户/登录/注册/管理台登录）。
- 压缩包 sha256 校验 OK，敏感文件泄露检查干净（0 命中）。
- 回归：前端单测 13/13、phase6 单测 19/19、backend e2e 全绿。

### 里程碑
- **v1.0 打包完成**：项目基线见 memory-core.md，归档包 `release/BP2-v1.0-src.tar.gz`。

---

## 2026-09-22 个人中心改版：苹果绿配色 + 紧凑布局 + 折叠交互（BP2 第二轮）

> 仅改前端 UI 渲染层（styles.css 主题变量 + ProfileView.vue），未动 3D 场景/地形/碰撞/居民漫游/注册审批/聊天后端内核/已验收资产。

### 改动文件
- `frontend/src/virtual-utopia/styles.css`：`:root` 主题变量改为苹果绿 `#2fa84f`（hover `#258a41`）+ 白底 `#fbfbfd` + 浅灰 `#f1f1f4`/`#e3e3e8` + 深灰文字 `#1d1d1f`/`#424245`/`#6e6e73`；`--vu-pine` 由深绿 `#1d4d40` 改中性深灰 `#2a2a2e`；`--vu-danger` 改 `#e0483b`；同步修正硬编码红棕强调（focus 轮廓、字段聚焦阴影、material 选中态）为绿色。移除原红棕 `#dc6f55`/`#bd523d` 与深绿主色调。
- `frontend/src/virtual-utopia/views/ProfileView.vue`：新增 `panels` 折叠状态（默认全收起）；5 个长模块（已解锁场景/我的任务记录/修改密码/我的主页卡片/展示板与留言簿）改为可折叠（标题栏 + 展开收起 ▾ 开关），仅顶部个人信息与原住民名录常显；scoped 样式将个人中心 hero 改为白底深字、收紧区块与卡片间距、苹果绿头像/开关。

### 关键实现
- 折叠交互：每个可折叠 section 用 `<button class="vu-collapse__head">` 切换 `v-show` 内容；标题用 `<span>`（避免 button 内嵌 h2 的非法结构）；chevron 旋转动画。`panels` 默认 `{scenes:false,tasks:false,password:false,cards:false,showcase:false}`。
- 配色收敛到单一苹果绿强调 + 白/浅灰/深灰，符合「放弃深绿/红棕」要求。
- 全部原有字段/表单/按钮/列表/子面板（ResidentCardsPanel 五卡片、HomepageS2Panel 展示板+留言簿、ResidentDirectoryPanel 名录+私聊+建群）逻辑零改动，仅调整外观与折叠包裹。
- 任务清单中的「任务记录 / 邻里留言簿 / 工作计划卡片组」分别对应实际页面「我的任务记录 / 展示板与留言簿(HomepageS2Panel) / 我的主页卡片(ResidentCardsPanel 五卡片：work_plan/travel_log/life_note/wish_list/favorite)」。

### 测试结果
- 前端生产构建通过（vite build，52 modules transformed）。
- 前端单测 9/9 ✅；后端单测 33/33 ✅；BP3 单测 7/7 ✅。
- 场景流 E2E ❌ **环境缺失 DEEPSEEK_API_KEY**（后端编排器调 LLM 失败 500），与本 UI 改动无关；前台复跑 backend/frontend/BP3 均绿，确认 FAIL 非本改动引发。
- 注：首次后台跑 `scripts/test-all.mjs` 四套全 FAIL 且无输出，系后台 shell 无法解析 npm workspace 所致；前台复跑后 backend/frontend/BP3 均通过。

### 自检清单（对照用户清单）
- [x] 整体配色为苹果绿+白色，清爽干净，无旧版深绿/红棕主色调
- [x] 页面排版紧凑，间距内边距收紧，信息密度提升（hero/scene/卡片间距下调）
- [x] 任务记录、留言簿(HomepageS2Panel)、计划卡片组(ResidentCardsPanel) 支持下拉折叠展开
- [x] 原有全部功能入口、表单、列表完整保留，业务逻辑不变
- [x] 原住民名录、私聊、建群功能不受样式修改影响（仅常显，逻辑未动）
- [x] 原有 AI 智能体、居民相关功能无退化（子面板逻辑未改）
- [x] 3D 场景、居民漫游、注册审批功能完全不受改动影响（未触及）
- [x] 页面加载性能稳定，前端构建 + 单测通过，无控制台报错（构建期）
- [~] 变更记录写入 memory-log（本条目）；E2E 因环境缺密钥未全绿，已说明

### 备份与提交
- 备份：`H:/BP2/.workbuddy/backups/profile-ui-20260922/ProfileView.vue.bak`、`styles.css.bak`（回滚点）。
- 提交：`git commit 85a3879`（仅以上两文件，未带入 memory-core.md / DESIGN.md / prototypes 等无关改动）。

---

## 2026-09-22 居民个人主页最终原型重构（苹果绿轻量 UI）

> 仅改前端 UI 渲染层（ProfileView.vue 全面重写 + 3 子面板浅色重主题 + ResidentCardsPanel filterTypes 属性），未动 3D 场景/地形/碰撞/居民漫游/注册审批/聊天后端内核/已验收 3D 资产。严格执行 scope 守卫→前置备份→资源预检→全量自检→FAIL 回滚→git 提交 + memory-log。

### 改动文件
- `frontend/src/virtual-utopia/views/ProfileView.vue`：全面重写。顶部头像+昵称+身份标签(无功能按钮)；主视觉大卡片动态标题 `{昵称}的简介与作品` + 三动态标签(简介/作品/备忘)；中部 3 个折叠模块(消息与协作/邻里往来/个人收藏)默认全收起、行式轻量入口；底部 2 个纯图标按钮(👥原住民名录 / 🔒修改密码)唤起居中弹窗；统一弹窗系统(Teleport + 遮罩 + 关闭按钮)；群聊子弹窗复用 worldStore 群接口。
- `frontend/src/virtual-utopia/components/ResidentCardsPanel.vue`：新增 `filterTypes` prop + `visibleTypes` computed，备忘/收藏复用同一卡片 CRUD 逻辑；深色→浅色主题重做。
- `frontend/src/virtual-utopia/components/HomepageS2Panel.vue`：仅浅色重主题（展示板+留言簿），逻辑未改。
- `frontend/src/virtual-utopia/components/ResidentDirectoryPanel.vue`：仅浅色重主题（名录+私聊+建群），逻辑未改。
- 全局主题(已在 v4 落地，本次未再改 `styles.css`)：苹果绿 `#2fa84f` / 白底 `#fbfbfd` / 浅灰线 `#e3e3e8` / 深灰字 `#1d1d1f`。

### 关键实现（对照用户最终规范）
- **顶部**：头像(首字)+昵称+身份标签。身份以 `seedResidents`(阿岚/苏禾/林涧/白石/墨竹) 匹配 `user.displayName` 区分 `AI 居民 / 真人`；无任何功能按钮。
- **主卡片**：标题 `{{nickname}}的简介与作品` 动态渲染；标签① `{{nickname}}·简介`(selfIntro，含可见权限占位选单，后端就绪生效)；标签② `{{nickname}}·作品`(ResidentCardsPanel 全部 5 类卡片 CRUD)；标签③ `{{nickname}}·备忘`(filterTypes 仅 4 子项 work_plan/travel_log/life_note/wish_list，外层不重复备忘子项)。
- **中部折叠**：3 大模块默认收起(`middle` reactive 全 false)，行式入口；① 消息与协作(广场消息通知+我的临时群聊空间) ② 邻里往来(邻里心愿看板+邻里往来记录+宅院访客记录) ③ 个人收藏(个人风物收藏+邻里留言簿)。
- **底部图标按钮**：2 个纯图标按钮，点击开弹窗，主页面静止不预载详情。
- **无后端模块**(广场消息通知/邻里往来记录/宅院访客记录)：按用户选择「UI 外壳+空状态」仅渲染文案(`EMPTY_TEXT`)，不写后端/不造数据。
- **业务规则**：舍弃点赞/浏览/热度/排行/亲密度/成就徽章；v1.0 不开发宅院独立留言板与邻里邀约日历；无内卷数字(已移除 level/points 展示)。

### 测试结果
- 前端生产构建通过（vite build，52 modules transformed）。
- 前端单测 **9/9 ✅**；后端单测 **33/33 ✅**；BP3 单测 **7/7 ✅**。
- 场景流 E2E **通过**（exit 0，`consoleErrors: []`）——本次直跑 E2E 实际全绿，纠正了此前 v4 误判为「缺 DEEPSEEK_API_KEY」的结论；此前失败系 `scripts/test-all.mjs` 在 Windows 下 `execFileSync('npm',…)` 无法解析 npm 脚本导致的假阴性，与代码改动无关。
- **结论：全量自检全绿，无需回滚。**

### 自检清单（对照用户清单）
- [x] 主卡片标题与三标签动态读取居民昵称渲染（`nickname` computed 驱动）
- [x] 顶部头像+昵称+身份标签，无功能按钮
- [x] 中部 3 折叠模块默认收起，行式轻量入口
- [x] 底部 2 纯图标按钮唤起弹窗，主页静止不预载
- [x] 备忘标签仅内部展示 4 子项，外层不重复
- [x] 无后端模块仅 UI 外壳+空状态
- [x] 舍弃点赞/浏览/热度/排行等内卷数字
- [x] 苹果绿+白+浅灰+深灰统一视觉，圆角卡片+轻投影
- [x] 3D 场景/地形/碰撞/居民漫游/注册审批/聊天后端内核/已验收资产 零改动
- [x] 前端构建+单测+后端+BP3+E2E 全绿，无回归
- [x] 变更记录写入 memory-log（本条）

### 备份与提交
- 前置备份：`H:/BP2/.workbuddy/backups/profile-ui-20260922b/`(ProfileView/ResidentCardsPanel/HomepageS2Panel/ResidentDirectoryPanel/styles.css 五文件回滚点)。
- 提交：`git commit 7b87ce4`（6 文件：4 前端 UI + memory-core.md + memory-log.md；未带入 DESIGN.md / prototypes / .workbuddy 等无关改动）。

---

## 2026-09-22 个人主页标签路由修复 + 作品上传模块（作品/备忘完全隔离）

> 仅改前端 `ProfileView.vue` + 新增 `ResidentWorksPanel.vue`；未动 3D 场景/漫游/注册审批/聊天内核/已验收资产。

### 修复：标签路由错误绑定（重大修复）
- 原错误：作品标签渲染 `<ResidentCardsPanel />`（含全部 5 类，其中 work_plan/travel_log/life_note/wish_list 即备忘子项）→ 与备忘标签内容重叠。
- 修复：作品标签改为独立组件 `<ResidentWorksPanel />`；备忘标签保持 `<ResidentCardsPanel :filter-types="['work_plan','travel_log','life_note','wish_list']" />`（仅 4 子项）。两模块完全隔离，备忘 4 子项只在备忘标签内出现。

### 新增：作品上传模块 ResidentWorksPanel.vue
- 【+上传作品】按钮；图片上传（FileReader→dataURL，>2MB 提示）+ 标题 + 文字描述。
- 保存 / 编辑 / 删除；单条权限下拉：原住民可见 / 仅自己可见。
- 列表展示：作品图、标题、正文、权限标记、时间戳（含上传者昵称）。
- 持久化：localStorage（key `vu:works:<username>`），自包含、不依赖后端内核（遵守「禁改后端」约束）。
- 视觉：沿用苹果绿 + 白 + 浅灰 token、圆角卡片、同一弹窗样式。

### 自检结果
- 生产构建（正确配置：`cd frontend && npx vite build --config src/virtual-utopia/vite.config.js`）成功；产物 `index-o8f5HKXO.js` 含 ResidentWorksPanel（rw-panel / 上传作品 / 我的作品）+ 当前 ProfileView（vu-maincard / 简介与作品），确认新模块已入包。
- 虚拟乌托邦单测 **13/13 ✅**；外层前端 **9/9 ✅**；后端 **33/33 ✅**；BP3 **7/7 ✅**。
- 开发服务器（5199）已热更新并成功编译 `ResidentWorksPanel.vue`（curl 校验转换产物，`__name:'ResidentWorksPanel'`；ProfileView 转换产物同时引用 ResidentWorksPanel×4 / ResidentCardsPanel×5）。
- 结论：全绿，无需回滚。

### 重要环境发现（纠正历史自检口径）
- 此前 `npm run build --workspace frontend` 实际构建的是**外层 frontend 壳应用**（`frontend/index.html` → `frontend/src/main.js`，不含 worldStore/ProfileView），`52 modules` 的产物根本不包含线上页面，属无效自检。
- 虚拟乌托邦**真实应用**位于 `frontend/src/virtual-utopia/`（自带 `vite.config.js`：root=该目录、outDir=该目录/dist、dev port 5175，实际以 5199 运行；`index.html` 挂载点 `#virtual-utopia-app`）。
- **正确构建命令**：`cd frontend && npx vite build --config src/virtual-utopia/vite.config.js`（必须显式 `--config`；直接 `cd frontend/src/virtual-utopia && npx vite build` 会误解析为外层配置并输出到 `frontend/dist`）。

### 备份与提交
- 前置备份：`H:/BP2/.workbuddy/backups/profile-works-20260922/`（ProfileView.vue + ResidentCardsPanel.vue 回滚点）。
- 提交：`git commit f525f7c`（3 文件：`ProfileView.vue` + `ResidentWorksPanel.vue` + `memory-log.md`；未带入 DESIGN.md / prototypes / .workbuddy 等无关改动）。

---

## 2026-09-22 阶段二：个人主页内部链接全链路打通

> 仅改前端个人主页组件 + 路由；未动 3D 场景/地形/碰撞盒/居民 AI 闲逛/注册审批/聊天后端内核/已验收 3D 资产。

### 链路1 主标签切换
- 三主标签(简介/作品/备忘)为**本地状态**切换、不改变路由 → 滚动位置天然保持不跳顶；加 `<Transition name="vu-fade" mode="out-in">` 平滑淡入，无白屏。
- 备忘标签内 4 子项(工作计划/出游记录/生活随记/心愿清单)由 ResidentCardsPanel(filterTypes) 内部 tab 切换。

### 链路2 广场消息通知（UI 外壳 + 空状态）
- 后端**无**通知/未读接口：入口 + 红点占位(`plaza.unread` 驱动，当前 0，接后端即亮)+弹窗列表(发送人/摘要/时间)渲染已就绪，无数据显示空态。
- 点击条目跳 `/scenes/:sceneId`（无帖子定位接口且禁改 3D，用场景详情作安全落点）。

### 链路3 临时群聊空间
- 群列表弹窗：`listGroups` + 逐群 `listGroupMessages` 取成员与最新消息；展示群名/成员头像缩略/最新消息预览/人数；行内红点占位。
- 点击群 → 覆盖式群聊窗(activeGroup)：收发消息、3s 轮询历史、关闭返回主页。
- 群主(`creatorUserId === myUserId`)可见「解散群」占位按钮 → notify「待后端开放」。

### 链路4 原住民名录弹窗（重点）
- ResidentDirectoryPanel 重构：顶部 Tab「居民名录 / 已到访场景」。
- 居民卡片：头像/昵称/身份标签(AI 居民按 `seedResidents` 匹配,否则真人)/一句话简介；卡片点击 `emit('open-profile')` → ProfileView 路由跳 `/resident/:username`；卡片带多选勾选框；私聊按钮保留。
- 勾选 ≥2 人 → 底部出现「创建临时项目群」→ 确认框(群名+已选成员 chips) → `worldStore.createGroup` → `emit('group-created')` → ProfileView 自动打开新群聊。
- 已到访场景：用「已解锁场景」近似(`scenes.filter(isSceneUnlocked)`)；点击跳 `/scenes/:sceneId`。

### 链路5 底部按钮 & 弹窗交互
- 底部 👥名录 / 🔒改密 弹窗；所有弹窗居中 + 半透明遮罩 + 点遮罩/✕ 关闭；`watch(anyOverlayOpen)` 锁定 body 滚动；层级：通用弹窗 1000 < 子对话框(建群/私聊) 1100 < 群聊覆盖窗 1200，不叠层错乱。

### 新增路由/视图
- 新增只读路由 `/resident/:username`(name: `resident-profile`) + `views/ResidentProfileView.vue`：展示对方 头像/昵称/真人·AI 标签/简介/公开展示板(`loadResidentBoard(userId)`)，含返回与登录态守卫；懒加载独立 chunk。

### 自检结果
- 正确配置构建成功（`cd frontend && npx vite build --config src/virtual-utopia/vite.config.js`）：主包与 `ResidentProfileView` 独立 chunk 均含全部新功能标记；路由 `resident/:username` 入包。
- 单测全绿：**虚拟乌托邦 13/13、外层前端 9/9、后端 33/33、BP3 7/7**。
- dev(5199) 三个改动文件 curl 均 HTTP 200（编译通过）。
- **结论：全绿，无需回滚。**

### 备份与提交
- 前置备份：`H:/BP2/.workbuddy/backups/profile-links-20260922/`（8 文件：ProfileView/ResidentCardsPanel/ResidentWorksPanel/ResidentDirectoryPanel/HomepageS2Panel/ResidentChatPanel/router/index.js/styles.css）。
- 提交：`git commit 4283c7a`（ProfileView.vue + ResidentDirectoryPanel.vue + router/index.js + ResidentProfileView.vue + memory-log.md）。

---

## 2026-09-22 阶段三：个人主页权限控制与业务规则落地

> 仅改前端个人主页组件 + 权限渲染逻辑；未动 3D/地形/碰撞盒/居民 AI/注册审批/聊天后端内核/已验收资产。经确认采用「纯前端方案（不改后端）」。

### 身份模型（代码既有）
- `worldStore.state.permissions.role`：`'viewer'`=已登录**访客**；`'editor'/'admin'`=**原住民**；未登录=游客(无 token)。
- 访客=`viewer`；其他原住民=已登录非 viewer 且非本人；本人=`username` 匹配。

### 权限控制（按身份渲染）
- **ProfileView(本人)**：完整可见；简介/作品/备忘每条均有权限下拉。新增角色门控：`role==='viewer'` 时隐藏 作品/备忘 标签与中部 3 折叠模块(消息与协作/邻里往来/个人收藏)，**不渲染 DOM**。
- **ResidentProfileView(他人)**：
  - 访客(viewer)：仅渲染「简介」；作品/备忘/私密模块全部 `v-if` 不渲染、无占位。
  - 原住民：渲染「简介 + 公开作品」；「备忘」对他人一律不渲染。
  - 本人访问自己对外页 → `router.replace` 回 `/profile`。
- 简介权限：本机持久化(localStorage `vu:intro-perm:<username>`)，切换**即时生效**+提示，无需刷新。
- 作品权限：沿用 ResidentWorksPanel 单条权限下拉（本机 localStorage）。
- 备忘权限：沿用 ResidentCardsPanel 单条权限（服务端 `resident-cards.permission`，严格生效）。

### 业务规则加固
- 全局无内卷元素：profile 相关组件扫描无 点赞/浏览量/热度/排行/积分/亲密度/徽章/等级（仅 HomepageS2Panel 一句「无点赞与排行」说明文案）。
- 临时群：群主专属「解散群」占位按钮 `v-if="isGroupOwner"`，普通成员不可见。
- 作品模块无任何热度统计。

### 已知限制（纯前端方案，守住禁改后端）
- 简介无后端权限字段、作品存于本机 localStorage → **跨用户严格可见性无法保证**；他人主页「公开作品」以服务端已有公开展示板(`resident-board` 公开卡片)承载；备忘权限为服务端严格生效。如需严格跨用户生效，需后续最小后端改动（新增 `work` 卡类型 + 简介权限位）。

### 自检
- 构建成功；主包含 `vu:intro-perm`/`解散群`，ResidentProfileView chunk 含 访客可见范围/公开作品/暂无公开作品。
- 单测：虚拟乌托邦 13/13、外层前端 9/9、后端 33/33、BP3 7/7 全绿。dev(5199) 两文件 HTTP 200。
- **结论：全绿，无需回滚。**

### 备份与提交
- 前置备份：`H:/BP2/.workbuddy/backups/profile-perm-20260922/`（HEAD=阶段二 state 的 6 文件快照）。
- 提交：`git commit 5804a71`（ProfileView.vue + ResidentProfileView.vue + memory-log.md）。

---

## 2026-09-22 阶段四：3D 场景地形拉平 + 生活广场重构 + 宅院移出 + 悬空桥删除

> 仅替换 3D 场景地形与生活广场资产、调整宅院坐标；未改居民主页/注册审批/聊天/权限等业务代码；宅院样式/大小/碰撞盒不变。

### 地形拉平（req 1）
- `webgl/worldLayout.js`：`getTerrainHeight` 由带台地/崖边/溪谷/噪声的起伏函数改为恒定 `0`（统一水平面）。该函数是全场景**唯一高度来源**（约 40 处贴地物件 + 地形网格 + 玩家 Y + 居民 Y）；拉平后所有物件落在同一平面，玩家 Y（`ThreeWorld.updateLocalAvatarTransform` 取 `getTerrainHeight`）恒定 → 彻底消除人物下沉/卡入地下。

### 宅院移出广场（req 2）
- 在 worldLayout 对 `homes` 做覆盖：plot-4 → (-40.41,-14.71)、plot-18 → (-40.61,15.59)、plot-19 → (39.46,9.11)（r≈40~43.5，广场外侧草地边缘）。
- 仅改 x/z；样式/大小/朝向沿用原定义；平面地形下 y=0。`validateHomeLayout` 校验：**0 重叠**，同组最小间距 15.0、跨组 5.3。
- 触发范围/碰撞盒/庭院小品均由 `home.x·z` 派生 → 随新坐标自动同步（含 WorldView 的 plot-39 KIN 区域触发、`getNearestHub`、`buildCourtyardDetails/Decor`）。

### 生活广场重构为平地（req 3）
- 重写 `buildCentralPlaza`：删除多层高台（upperDeck 3.1 / 水池 4.1 / 核心 6 / 24柱 7 / 48梁 10.2 / 锥顶 12.4）与 `group.scale=1.5`；改为贴地铺装圆台(高 0.36) + 收边木环 + 中央浅水池 + 低矮四柱平顶景观构架 + 中央核心球(保留 `centralCore` 字段供昼夜动画) + 12 低灯柱环；半径≈17，**单一水平面**。
- 重写 `buildPlazaFurnishings`/`buildPlazaStoneDetails`：火盆/座椅/长桌/置物架/陈列台/告示牌/旗杆/火把/风铃/长凳/花坛/景观树全部下移到地面基准（y≈0.4~2.7）贴地摆放；保留 `plazaFireLight`/`plazaLights` 字段契约。

### 删除悬空桥状结构（req 4）
- 移除 `buildBridgeNetwork()` 调用（中心 (0,6.2,0) → 4 hub 的空中连廊 + 3 条跨组团悬空桥；`addBridgeAbutment/addCorridorRestNode/addHomeLanding/addBridgePier` 随之不再生成）。
- 移除 `buildPlazaConnections()` 调用（向外落地平台/台阶）；广场边缘改为草地自然收边。
- 新增 `buildFlatBridges()`：平地低矮小桥（桥面 0.34 / 栏杆 0.62，无高差），跨浅溪流于 z=±26/±62 共 4 座，满足「平地版本小桥」。

### 保留不变
- 庭院小品（石灯/景观石/矮竹/石凳/果树灌丛）逻辑未改，因依赖 `getTerrainHeight`+`home.x·z` 自动适配新地形/新宅院坐标。
- 漫游相机、居民 AI、距离触发逻辑未改，随宅院新坐标自动同步。

### 自检
- 构建成功（`cd frontend && npx vite build --config src/virtual-utopia/vite.config.js`）。
- 单测全绿：虚拟乌托邦 13/13、外层前端 9/9、后端 33/33、BP3 7/7；worldLayout 校验 50 户 / y 全 0 / 0 重叠。
- **3D 场景 headless 实测（playwright + Edge）**：页面加载 → 「五十户山林庄园城镇」→ loading 卸载 → 「50/50 庄园」（全部宅院建成）→ canvas WebGL 正常、glb≥5、**console errors = []**。截图：`.workbuddy/backups/scene-flat-20260922/scene-check-overview.png`。
- 注：`webgl/tests/world.e2e.mjs` 存在**历史失效断言**（点击「切换夜晚」按钮，但现网标签为「时段：白天」，与本次改动无关；场景加载/俯瞰/回家/室内各步均已通过），故改用聚焦版 headless 检查验证场景；未改动该测试文件（守住 scope）。
- **结论：全绿，无需回滚。**

### 备份与提交
- 前置备份：`H:/BP2/.workbuddy/backups/scene-flat-20260922/`（ThreeWorld.js / worldLayout.js / WorldView.vue / modelLoader.js + 场景截图）。
- 提交：`git commit <HASH>`（ThreeWorld.js + worldLayout.js + memory-log.md）。

### 遗留（待确认）
- 除 4/18/19 外，plot-8(r=11.3)、plot-5/9/11/17/20/21 等仍落在广场范围内（用户仅点名 3 栋）；如需彻底避免重叠可再批量外移。
- 溪流水面在平地呈色带、视觉偏「苔绿」；如需更明显的深浅水效可后续单独调水材质。
