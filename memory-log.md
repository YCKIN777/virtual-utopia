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
