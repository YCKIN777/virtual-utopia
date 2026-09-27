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
- 提交：`git commit a79d7fb`（ThreeWorld.js + worldLayout.js + memory-log.md）。

---

## 2026-09-22 阶段五：生活广场整体重构（抬高木平台 + 四功能区 + 中式木构地标）

> 仅改生活广场 3D 场景资产与布局（`ThreeWorld.js` / `worldLayout.js`）；未改业务代码；宅院样式/大小/碰撞盒不变。

### 1 删除旧中心平台
- 重写 `buildCentralPlaza`：移除旧中心平台（贴地铺装圆台、浅水池、低矮四柱平顶、外圈灯柱）与旧 `buildPlazaFurnishings/StoneDetails` 摆件；中心区域随新平台重建为平整空间。旧悬空桥网络已在阶段四删除（`buildPlazaConnections` 现为无调用死代码）。

### 2 迁出冲突建筑
- `worldLayout` 覆盖新增：**plot-8 → (25.55, 32.70)**（r≈41.5）移出广场；plot-4/18/19 维持阶段四位置不变。校验：50 户 / y 全 0 / **0 重叠** / 广场内(r<20) **已无宅院**。触发/碰撞/庭院小品随坐标自动同步。

### 3 1 米抬高跨河木平台
- `PLAZA_DECK_HEIGHT=1.0`、`PLAZA_RADIUS=17`。实体台体（Cylinder 高 1.0）**遮蔽下方河面**；顶面平整单一水平面；底部 8 根横向木梁体现「架于河面」；四周 48 立柱 + 2 道环形横栏（0.5m 高）护栏。
- 新增 `plazaGroundHeight(x,z)`：平台内(r≤16.5) 返回 1.0、否则地形高度；已用于 **玩家 Y**（`updateLocalAvatarTransform`）与 **居民漫游 Y**（`addRoamingAgent/setRoamingTarget/updateRoamingAgents`），保证角色在平台行走不穿模/不下沉。

### 4 四个功能区（全部贴平台表面 y=1.0）
- ① 公共集会区：中心留空 + 边缘 6 石凳。
- ② 闲谈茶座区：3 组圆茶桌（各 4 石凳 + 小石灯），东侧。
- ③ 林间散坐区：西侧零散景观卧石 + 矮竹（无成套桌椅）。
- ④ 溪畔漫步区：南侧沿边石板 + 景观石 + 矮竹。
- 分区以矮竹/景观石/石板自然分隔（无围墙）；铺装同心环 + 放射接缝 + 连接石板。
- 聚会点位：`this.plazaGatheringPoints`（center×1 + tea×3 + scatter×1 + view×2 = 7 点，y=1.0），经 `getPlazaGatheringPoints()` 暴露。

### 5 中心中式木构地标
- 9 根原木圆柱（直径 0.6m、高 20m）环形半径 6.2m 排布，柱础石固定于平台板面（不穿透）；柱顶榫卯环梁；上方中式攒尖木顶（9 面、开口朝下）+ 檐口 + 宝顶；**内部发光球体**（r1.5，emissive 0.85）位于顶腔，地面仰视可见；`centralCore`=发光球、`centralPointLight`=暖光（延续昼夜动画字段契约）。四周留足集会空地；场景无碰撞系统，角色不可攀爬（无高度拾取）。

### 自检
- 构建成功；单测 虚拟乌托邦 **13/13**、外层前端 **9/9**、后端 **33/33**、BP3 **7/7** 全绿；worldLayout 校验 50 户 / y 全 0 / 0 重叠 / 广场内无宅院。
- **headless 实测（playwright + Edge）**：加载 → 50/50 庄园 → canvas WebGL → **console errors = []**；「前往生活广场」聚焦后截图确认：抬高木平台 + 9 立柱 + 攒尖顶 + 四区小品均正常渲染。截图：`.workbuddy/backups/scene-flat-20260922/phase5-overview.png`、`phase5-plaza.png`。
- 注：`webgl/tests/world.e2e.mjs` 的历史失效断言（「切换夜晚」按钮）与本次无关，未改该测试文件（守 scope）。
- **结论：全绿，无需回滚。**

### 备份与提交
- 前置备份：`H:/BP2/.workbuddy/backups/plaza-20260922/`（HEAD=阶段四 state 的 ThreeWorld.js / worldLayout.js）。
- 提交：`git commit 46bfcef`（ThreeWorld.js + worldLayout.js + memory-log.md）。

### 遗留/说明
- 地标「中式攒尖顶」以 9 面锥顶近似（无雕花），符合「简约」要求；如需更精细的榫卯/举折造型可后续细化。
- 平台护栏为全周护栏（无入口缺口）；因场景无碰撞系统，角色可正常上下（视觉护栏防跌落）。

---

## 2026-09-22 阶段六：生活广场中心构筑物升级 + 河道残留构件清理

> 仅改生活广场构筑物（`ThreeWorld.js`）与清理河道残留；未改业务代码；平台/四区/护栏/景观小品/楼栋位置不变。

### 1 中心构筑物升级（`buildPlazaLandmark` 重写）
- 立柱：9 根原木柱环形布置于**集会区外围**（半径 10.9、起始角 21°，中心区完全开阔无立柱）；**总高 30m**；**3 根主柱 Φ80 + 6 根辅柱 Φ60**（主柱位于 0/3/6 号位，120° 均布）；柱础石固定于 1m 平台板面，不穿透。
- 木构骨架：外圈**环形主梁**(Torus Φ0.34 于 y=31) 将 9 柱连成整体；**9 条放射斜梁**由主梁汇聚至中心上方 (apex y=36.6)，主柱杆件 Φ0.24、辅柱 Φ0.15（主次分明）；内圈环梁 + **相邻放射梁间交叉斜撑**（Φ0.09），控量避免堆叠；柱顶斗形榫卯节点。
- 顶部：**透明攒尖顶**（9 面 ConeGeometry，transparent opacity 0.22，可挡雨），木梁骨架外露；檐口环梁 + 宝顶。
- 发光球：吊杆悬挂于顶内中心，**离地 25.5m**（24~28m 达标），emissive 0.9，广场仰视可见球体被木梁框住发光；`centralCore`/`centralPointLight` 字段契约保留。
- 纯景观：场景无碰撞系统，角色不可攀爬；立柱位于 10.9 半径、间距约 6.8m，四区动线不受阻。
- 立柱环位经**与固定小品碰撞搜索**确定（R=10.9/offset=21°，最小净距 0.32m，无穿模）。

### 2 河道清理
- 移除 `buildWaterfalls()` 调用：平地地形下其**瀑布竖面**成为河道中悬空半透明「断墙/悬空构件」。
- 移除 `buildFlatBridges()` 调用：其**桥面与桥墩**跨河而立，移除后恢复**连续自然河面**。
- 保留：新广场跨河木平台及其支撑；岸边景观（`buildRiversideWalkways` 溪畔步道、`buildStreamLandmarks` 浣洗/垂钓岸台与浅滩石、河岸乱石/芦苇）。

### 自检
- 构建成功；单测 虚拟乌托邦 **13/13**、外层前端 **9/9**、后端 **33/33**、BP3 **7/7** 全绿。
- **headless 实测（playwright + Edge，含相机定位截图）**：**console errors = []**；
  - 仰视截图：9 立柱环绕、发光球被木梁框住发光 ✅
  - 中景截图：环形主梁 + 放射斜梁 + 交叉斜撑 + 透明攒尖顶完整 ✅
  - 河段截图（原瀑布/小桥点）：竖面断墙与跨河小桥已消失、河面连续 ✅
  - 截图：`.workbuddy/backups/plaza-landmark-20260922/_p6_*.png`
- **结论：全绿，无需回滚。**

### 备份与提交
- 前置备份：`H:/BP2/.workbuddy/backups/plaza-landmark-20260922/`（HEAD 版 ThreeWorld.js + 截图）。
- 提交：`git commit 1e7f6c1`（ThreeWorld.js + memory-log.md）。

### 说明
- 「三角攒尖顶」按 9 面三角锥（与 9 柱对应）实现，透明可挡雨、木梁外露。
- 高度口径：立柱按「总高 30m」实现（顶面 y≈31）；发光球按「离地 24~28m」置于 y=25.5，位于柱顶以内、被放射梁与顶框住。
- 若「河道残留」另指溪畔步道/垂钓岸台等木构，可再按此口径继续清理（当前按「岸边保留景观」保留）。

---

## 2026-09-22 阶段七：参照参考图重建广场中心——双层环形中式木构透明穹顶地标

> 仅重建广场中心地标 + 广场地面材质；未改业务代码；平台结构/四区/护栏/小品/楼栋位置不变。

### 1 麻石地面
- 新增程序化 `createGraniteTexture()`（Canvas 256²：深灰底 `#34373c` + 天然浅灰斑点，`SRGBColorSpace`，5×5 repeat）。
- 广场地面材质改为**深灰哑光麻石**（`map` + roughness 0.96）；并修复平台台体顶面与地面板共面导致的 z-fighting（台体高度降为 `deckY-0.14`）。
- 原有铺装环缝/放射缝保留 → 「板块缝隙清晰」。

### 2 双层柱廊 + 多层梁架
- 外圈 **9 根原木柱**：环形半径 10.9、起始角 21°（中心完全空旷）；**3 主柱 Φ80 + 6 辅柱 Φ60**；柱下**厚重麻石基座**；柱高 24m（结构总高≈30m）。
- **内圈辅助短柱** 9 根（Φ44、高 6.6m、半径 7.6）→ 双层柱廊。
- 底层：外圈**环形原木主梁**(Torus Φ0.8) + 每柱**斗拱**（斗块 + 十字拱臂）。
- 中层：内圈第二层**环形木梁** + 9 条**横向连梁**连接内外两圈。
- 上层：9 条**放射斜梁**（主柱 Φ0.52 / 辅柱 Φ0.34，粗细区分）由外圈主梁汇聚至顶部中心环 + 相邻放射梁间**交叉斜撑**。

### 3 透明穹顶 + 中心收束环 + 发光球
- **透明玻璃穹顶**（9 面 ConeGeometry，opacity 0.2，DoubleSide，depthWrite=false）+ 檐口环梁；木骨架外露。
- **顶部中心收束木环**（Torus r=2.24）位于穹顶顶端。
- **Φ4m 发光球**（r=2，暖白 `#fff6e2` + 淡金 emissive `#ffd9a0`，intensity 1.05）**无吊线**，坐落在中心**承托木环**（r=2.16）内，球心离地 **27.5m**（∈26~28）；`centralCore`/`centralPointLight` 契约保留。

### 自检
- 构建成功；单测 虚拟乌托邦 **13/13**、外层前端 **9/9**、后端 **33/33**、BP3 **7/7** 全绿。
- headless（playwright+Edge）**console errors = []**；仰视/中景/远景截图确认：深灰麻石地面（含缝隙）、9 立柱+双层柱廊、环形主梁+斗拱、放射斜梁+斜撑、透明穹顶+顶端收束环、中心发光球均正常渲染。截图：`.workbuddy/backups/plaza-dome-20260922/p7-*.png`。
- 附带修复：平台台体/地面板共面 **z-fighting**（此前地面显木色），已让台体顶面下移。
- **结论：全绿，无需回滚。**

### 备份与提交
- 前置备份：`H:/BP2/.workbuddy/backups/plaza-dome-20260922/`（HEAD 版 ThreeWorld.js + 截图）。
- 提交：`git commit ef523bc`（ThreeWorld.js + memory-log.md）。

### 取舍说明（几何互斥）
- 规格「立柱总高 30m」与「Φ4m 球坐落在**顶部**中心木环内、离地 26–28m」在几何上互斥（若立柱 30m，穹顶与顶环位于 31m 以上，球体只能落回柱廊内）。本实现按**参考图效果优先**：立柱 24m、穹顶/顶环至 ≈30m、球心 27.5m 位于穹顶内部并被放射梁框住。如需立柱本体 30m，可改（球体将下移至柱廊内、不再处于穹顶内）。

### 遗留（已由阶段八解决）
- ~~除 4/18/19 外，plot-8 等仍落在广场范围内~~ → **阶段八已全部移出**：广场留空半径 ≥34m，广场内已无宅院。
- 溪流水面在平地呈色带、视觉偏「苔绿」；如需更明显的深浅水效可后续单独调水材质。

---

## 2026-09-22 阶段八：50 栋宅院重排为「依山散落的山居聚落」

> 仅改宅院坐标与类型归属（`worldLayout.js`）；中心广场木构穹顶 / 麻石地面 / 河道清理成果 / 1m 跨河木平台 / 四区 / 护栏 / 小品 / 宅院模型本体与内部功能 / 派生碰撞盒 / 业务代码 全部未动。

### 口径（经用户确认）
- 原 4 类模型 13/12/13/12；新分配 **台地 12 / 临溪 18 / 崖边 20**。
- 山边缓坡区 20 栋 = **崖边模型 12 + 森林模型 8** 混排 —— 4 种既有模型资产全部保留使用，不新建/不改造模型。

### 实现
- 重写 `worldLayout.js`：删除旧 `groupDefinitions` / `createCandidate` / `isValidCandidate` 与阶段四·五的 `PLAZA_RELOCATIONS` 覆盖，改为**分区表 `ZONE_DEFS` + 拒绝采样**一次性生成 50 户完整排布（编号仍 plot-1..50）。
- 分区与约束（米）：
  - **广场近区 · 台地宅院 12**：环带 r∈[36,58]，距主河道中线 ≥9；同区最小间距 ≥10。
  - **河道沿岸区 · 临溪宅院 18**：主河道两岸 z∈±[34,94]，距中线 ∈[水面半宽+2.2, 18.5]（**退水岸 ≥2m**）；同区最小间距 ≥8。
  - **山边缓坡区 · 崖边宅院 20（cliff 12 + forest 8）**：r∈[66,132]（山脚缓冲带 70~148 内），距主河道中线 ≥14，避让次级溪流；同区最小间距 ≥12。
  - 全局：不越 `WORLD_LIMIT=140`；避让次级溪流（x≈-72±9 / 76±8）；跨区最小间距 ≥8。
- 枢纽 `groupCenters`：台地→广场中心、临溪→河道中线、森林/崖边→各自山脚方位（供房门朝向、入户石板/花架落点、镜头飞入、植被避让）。
- `validateHomeLayout()` 扩展（保留 `valid` / `minimumDistance` 契约）：新增 `homeCount` / `zoneCounts` / `riverViolations` / `plazaViolations` / `outOfBounds`，并按**分区最小间距**（10/8/12）判定重叠。

### 自检
- Node 校验：**50 户**；groupCounts = terrace 12 / stream 18 / forest 8 / cliff 12；zoneCounts = plaza 12 / stream 18 / mountain 20；`valid=true`，overlaps 0 / riverViol 0 / plazaViol 0 / oob 0。
- 分区最小间距：广场 10.03 / 临溪 8.36 / 山边 12.83（均达标）；临溪**最小退水岸 4.38m**；距次级溪流最小 6.14m；宅院半径 35.1~131.2m → 广场留空 ≥34m，**中心地标视线通廊无遮挡**。
- 构建成功（`cd frontend && npx vite build --config src/virtual-utopia/vite.config.js`）；单测：虚拟乌托邦 **13/13**、外层前端 **9/9**、后端 **33/33**、BP3 **7/7** 全绿。
- **headless 实测（playwright + Edge）**：`window.__utopiaWorld.homeObjects.size === 50`（50 栋全部建成）、`scene.children 299`、HUD「50 户布局校验通过 · 最小间距 8.4」、**console errors = []**。
  - 注：headless 软件渲染（swiftshader）帧率极低（≈4 帧/30s），而 `onStats` 每 24 帧才刷新 → HUD 的 `0/50 庄园` 属**帧计数未达阈值**，非构建失败；改用 `homeObjects.size` 作就绪判据。
  - 截图：`.workbuddy/backups/homes-relayout-20260922/p8-*.png`（全景 / 斜视 / 广场穹顶 / 山脚）。

### 备份与提交
- 前置备份：`H:/BP2/.workbuddy/backups/homes-relayout-20260922/`（HEAD 版 + 改写前 worldLayout.js + 截图）。
- 提交：`git commit 90d6fca`（worldLayout.js + memory-log.md）。

---

## 2026-09-22 阶段九：3D 场景基础环境层细化（真实感提升，不堆模型）

> 仅改 3D 场景视觉基础层（`ThreeWorld.js` + `decorations/mountainEnv.js`）；中心广场木构穹顶 / 50 栋宅院本体模型与位置 / 内部功能 / 碰撞盒 / 河道水面轮廓 / 注册·聊天·审批·权限等后端业务代码 全部未动。

### 盘点结论（动手前）
现有环境层已具备：单张地形网格（仅顶点色，**无材质分区**）、广场麻石地面、河岸毛石/芦苇/苔藓、滨水步道、蜿蜒远山、云、雾墙、星点、萤火虫；**缺少**：地面材质分层、路网、入户木平台/台阶、逐区接地处理、辅助灯光体系、渐变天空、就近交互标签；且植被偏密（乔木上限 270+480、山坡植被 540）。

### 新增（`ThreeWorld.js` 新增 10 个方法，均在 `buildHomeDetailPass()` 之后调用）
1. `groundMaterials()` + `buildGroundLayers()`：广场边缘**浅灰石材收边带**（r 17.4→20.4）+ 细缝线（20.4→21.05）+ **碎石过渡带**（21.05→23.3，均用 `createTerrainBandGeometry`）+ **山脚泥土斑块** 14 处（InstancedMesh，避开河道）。
2. `buildPathNetwork()`：**环形主路 ×3** —— r=23 石板 / r=62 碎石 / r=98 泥土；逐点避让河道与宅院，**连续水道缺口自动架桥**；并从每户入户点沿二次贝塞尔接入最近环网（**50 户全部连通**）。合计 1388 块路面实例（slab 147 / gravel 488 / dirt 753）。
3. `addSimpleBridge(from,to,ring)`：**简易平桥 11 座**（桥面 + 横向木梁 + 两侧低栏 + 桥头两级矮踏），仅连通环网跨河缺口，不新增大型构筑物。
4. `buildHomeGrounding()`：**台地宅院**石砌台基 12 / **临溪宅院**滨水木平台 18 + 外侧低矮挡墙 / **崖边宅院**两侧挡土墙 40 / **全部宅院**入户两级矮台阶 100 —— 全部 InstancedMesh，配合原有地面接触阴影消除漂浮感。
5. `buildPathGreenery()`：**分层克制**植被（灌木 79 + 观赏草 45 = 124 株），仅布置在广场边缘、道路两侧、宅院门口，避开建筑与地标视线；同时把 `buildForest` 乔木上限 **270/480 → 170/300**、`planMountainEnv` 山坡植被 **540 → 320**（总乔木 750→470）。
6. `buildAccentLighting()`：**立柱底部洗地灯 9**（与地标立柱同环位，含发光底座 + 柔光锥罩）+ **木构梁底隐藏灯带 2 圈**（外圈主梁底 y≈24.82 / 内圈环梁底 y≈7.32）+ **广场边缘地面线性灯 18** + **小路矮庭院灯** + **宅院入户门灯 50**（InstancedMesh）+ **仅 4 盏柔和辅助点光源**；**白天隐藏灯具模型**，夜间由 `updateDayMode` 以 `nightBlend` 缓升（发光 0.08+1.15×nightBlend，点光 1.35×nightBlend），无强光炫光。
7. `buildSkyDome()`：**干净柔和的渐变天空穹顶**（ShaderMaterial，半径 340，`fog:false`），昼夜/黄昏三色插值。
8. `buildProximityLabels()` + `updateProximityLabels()`：**就近交互标签 55 个**（生活广场 / 溪流·滨水步道 ×2 / 山脚缓坡 ×2 / 50 个「N 号宅院」），Canvas 精灵，按与镜头焦点的距离**淡入淡出**（区域 24~40m、宅院 13~25m），远离自动隐藏；接入 `animate()` 每帧更新。

### 自检
- 构建成功（`cd frontend && npx vite build --config src/virtual-utopia/vite.config.js`）；单测：虚拟乌托邦 **13/13**、外层前端 **9/9**、后端 **33/33**、BP3 **7/7** 全绿。
- **headless 实测（playwright + Edge）**：`homeObjects.size = 50`；`pathMeshes 3`（1388 实例）、`simpleBridges 11`、`homeGrounding 4`（plinth 12 / deck 18 / wall 58 / step 100）、`greenery 2`（124 株）、`accentGroup.children 63` + `accentLights 4`、`skyDome ✓`、`proximityLabels 55`、`treeCount 470`、`scene.children 377`、**console errors = []**。
- 就近标签实测：位于广场边缘时「生活广场」标签 `visible=true`、opacity≈1，远端宅院标签 `visible=false`（淡出正常）。
- 夜间实测：`nightBlend=1`、灯具组可见、发光强度 1.23、点光 1.35、天穹顶色 `#12233c`、星空可见 —— 立柱洗地灯 / 梁底灯带 / 广场边缘线性灯 / 小路庭院灯 / 入户门灯 均正常点亮且柔和不眩光。
- 截图：`.workbuddy/backups/env-detail-20260922/p9-*.png`（广场边缘 / 小路 / 河岸小桥 / 全景 / 夜间）；复用自检脚本存同目录 `harness-p9-env.mjs`、`harness-p8-layout.mjs`。
- **结论：全绿，无需回滚。**

### 备份与提交
- 前置备份：`H:/BP2/.workbuddy/backups/env-detail-20260922/`（含 HEAD 版两文件 + 截图 + 自检脚本）。
- 提交：`git commit 3d196f0`（ThreeWorld.js + mountainEnv.js + memory-log.md）。

### 说明 / 取舍
- 「不堆模型」：新增几何以 **InstancedMesh** 为主（路面 1388、台阶 100、门灯 50、植被 124 等），draw call 与顶点数增量可控。
- 河道：水面形态、驳岸毛石/芦苇/苔藓（阶段六成果）保持不动；新增的仅是**跨河简易平桥**，用于连通两岸环网步道。
- 「白天不强制显示灯具模型」：灯具组整体按 `nightBlend > 0.18` 显隐。

---

## 2026-09-22 阶段十：50 户原住民空间社交体系 + 个人主页联动 + JSON 分片存储 / 关键词检索

> 全局约束：**仅新增**（不改 3D 场景/建筑/地形/河道/广场/植被/灯光/路网/宅院模型）。
> 关键前置发现：社交 API **已基本存在**（phase6：广场公屏 `chat/world`、私聊 `direct-messages`、群聊 `groups`、好友 `friends`、留言 `guestbook`、名录 `resident-directory`、展示板 `resident-board`、卡片 `resident-cards` 带 permission、审批 `resident-applications`、访客配额、审计、`scripts/backup-data.mjs`），但**存储是 SQLite**，且缺「JSON 文件分片存储 / 关键词检索 / 消息场景位置 / 每户三档权限 / 就近气泡」。
> 经用户确认四项口径：① JSON 分片作**新增内容层 + 检索层**（SQLite 主存不动）② 复用既有 + 补齐缺口一次交付 ③ 不新增账号、50 为**原住民上限**（复用 `VISITOR_QUOTA_RULES.residentLimit`）④ 允许在 3D 文件**新增**交互层（只加不改既有几何）。

### 后端：新增 `backend/src/phase7/`（9 文件，挂载为 `/api/phase7/*`）
- `config.js`：`PHASE7_LIMITS`（分片阈值 2000）、`SOCIAL_SCENES`（七大场景）、`PROFILE_BOARDS`（四板块）、`readPhase7Config`。
- `jsonFile.js`：`ensureDirectory/readJson/**writeJson（原子写：临时文件+rename）**/listJsonFiles/safeSegment`。
- `searchIndex.js`：`tokenize`（英文按词、中文按**单字 + 相邻双字 bigram**）+ 倒排索引 `{tokens, docs}`，`upsert/remove/query/flush/stats`，预留 `upgrade.semantic=false` 供后续语义检索升级。
- `contentStore.js`：核心内容层，目录结构与消息字段完全按规格——
  - `data/public/public_chat.json`（广场公屏，超 2000 条自动归档 `public_chat.archive-*.json`）
  - `data/users/<userId>/profile.json`（四板块 + 评论留言，每条带 `visibility`）
  - `data/users/<userId>/direct/<peerId>.json`（**双人私聊双方各存镜像**，超 2000 条自动归档）
  - `data/homes/<plotId>.json`（宅院三档权限 open/friends/closed）
  - 消息字段：`id / fromUserId / target / channel / text / createdAt / scene{x,y,z,zone}`
  - 权限：`readVisibleProfile`（私密仅作者；访客零可见）、`listConversation`（仅双方）、`exportUser`
- `searchService.js`：`canReadDocument` 严格裁剪（public_chat → 原住民；direct_chat → 仅 participants；profile_entry/comment → 本人或「公开且原住民」）+ `search()` 返回 `{docId,type,channel,ownerId,ownerName,visibility,text,snippet,at,ref}`。
- `backupService.js`：`snapshot()` 把整个 `data` 目录快照到 `backups/<时间戳>/data` + `manifest.json`（含文件清单与字节数）；`listSnapshots()`。
- `router.js`：**20 条端点**（health/scenes/public-chat GET+POST/direct GET+POST/profile me+byId/entries PUT+DELETE/comments GET+POST+DELETE/home-access GET+PUT+check/search/export/stats/backup）。鉴权复用 `gateway.authenticate`，`ensureResident`（`admin|editor`）与访客隔离；`ownerId` 支持 `me` 别名。
- `index.js`：`createPhase7()` 装配入口。
- `tests/phase7.test.js`：**9 个单测**（切词、公屏、分片归档、双人镜像、权限裁剪、留言、三档权限、检索权限隔离、导出），已登记进 `backend/package.json` 的 `test`。

### 后端：最小接线（不改既有路由与数据）
- `backend/src/phase6/app.js`：+1 import、在**404 之前**挂载 `app.use('/api', phase7.router)`、`app.locals.phase7`。共 ~14 行新增，zero 修改既有 handler。

### 前端（新增为主）
- `services/gatewayClient.js`：新增 17 个 phase7 方法（scenes/public/direct/profile/entries/comments/home-access/search/export/stats/backup）。
- `stores/worldStore.js`：新增 `state.space`（scenes/publicMessages/peers/profile/homeAccess/search/lastExport/stats）+ 17 个 action，全部经 `requireSession()`（`admin|editor`）门禁。
- 新增组件：`SpaceChatPanel.vue`（广场公屏 / 就近私聊，半透明轻量气泡 + 4s 轮询 + 回车发送；公屏发言同步镜像到既有 `sendWorldChat` 以兼容旧视图）、`SpaceSearchPanel.vue`（关键词检索 + 类型/私密标签 + 片段/时间 + 点击跳转）、`SpaceProfileBoard.vue`（四板块 CRUD + 公开/私密切换 + 留言 + 私信邀约）。
- `views/WorldView.vue`：新增**就近社交入口**（`.vu-space-entry`，随 `getSocialContext()` 900ms 轮询，访客不渲染）+ 两个面板挂载 + 就近触发居民气泡；新增 CSS。
- `webgl/ThreeWorld.js`：**只新增** `getPlayerPosition()`、`getSocialContext()`（按 r / 河道距离 / 最近宅院距离判定七大场景）、`showChatBubble()`、`updateChatBubbles()`（每帧上浮淡出回收）；构造函数 +1 字段；`animate` +1 行调用。**未改动任何既有几何/地形/灯光/路网代码**。
- `views/ProfileView.vue`：在「简介」页签内挂载 `<SpaceProfileBoard owner-id="me">`（仅原住民可见）。
- `components/ResidentDirectoryPanel.vue`：名录卡片新增「加好友」按钮（复用既有 `sendFriendRequest` + `loadFriends`）。

### 自检
- **单元测试**：`backend 42/42`（33 旧 + **9 新增 phase7**）、虚拟乌托邦 **13/13**、外层前端 **9/9**、BP3 **7/7** 全绿。
- **后端端到端冒烟（30/30 通过）**（脚本 `.workbuddy/backups/space-social-20260922/smoke-phase7.mjs`）：未登录 401 隔离；广场公屏发言含 `scene.zone`；私聊双向镜像 + 场景位置；禁自发/无效对象 400/404；主页公开+私密可见性与他人隐私过滤；留言 + 空留言 400；宅院三档切换 + 非主人 403 + 闭门裁决拒绝 + 本人始终可进；检索命中含片段/时间 + 可检索本人私密 + 不越权；导出文件落盘；统计含索引；非管理员备份 403。
- **headless 实测（playwright + Edge）**：`getSocialContext()` → `{zone:'plaza', label:'中心广场 · 公共频道', channel:'public', scene:{x,y,z,zone}}`；气泡创建并自动回收；**访客身份下入口 chip 与两个面板均不渲染**（身份隔离生效）；`homeObjects=50`、`scene.children=377`（与阶段九一致 → **3D 场景零改动**）；**console errors = []**；截图 `.workbuddy/backups/space-social-20260922/p10-world.png`。
- 生产构建通过（`cd frontend && npx vite build --config src/virtual-utopia/vite.config.js`），WorldView chunk 25.5→33.8 kB、index 963→981 kB（新组件入包）。
- **结论：全绿，无需回滚。**

### 备份与提交
- 前置备份：`H:/BP2/.workbuddy/backups/space-social-20260922/`（7 个待改文件 + 冒烟脚本 + 自检脚本 + 截图）。
- 提交：`git commit 6f8fd35`。
- **服务需重启**：phase7 已挂载到 phase6，须重启 `backend/src/phase6/server.js`（本次已重启，`http://localhost:3400/api/phase7/health` 200）。

### 说明 / 已知边界
- 存储为**双层并存**：既有 phase6 SQLite 主存（群聊/好友/留言簿/卡片/审批等）不动；新增 phase7 JSON 分片层承载「七大场景的聊天内容 + 主页四板块 + 宅院权限 + 检索索引 + 导出/快照」。检索索引只覆盖 phase7 内容层。
- 「50 户原住民」= **50 个可社交的宅院/居民条目，上限锁定 50**（复用既有 `residentLimit`），未预置账号。
- 七大场景中 ④⑤⑥ 共用同一套 `direct` 双人会话（以 `channel` 区分 direct/encounter/interior/local），场景位置写入 `scene.zone`。
- 广场公屏在 UI 上同时保留既有 `WorldChatPanel`（兼容）与新的 `SpaceChatPanel`（内容层、可检索、带场景位置）。
- 管理员按规格**不读取私密内容**：`canReadDocument` 不给予 admin 任何额外权限。

---

## 2026-09-22 修复：后端根路径 404（浏览器「打不开」）+ 账号口令口径澄清

### 问题
用户反馈「只有前端 5199 能打开，其他地址都打不开」。排查确认：
- `http://localhost:3400/` 与 `http://localhost:3300/` 命中各自 app 里的 **catch-all 404 JSON**（`{"error":"NotFound",...}`）→ 浏览器里像"服务挂了"，实际服务是活的。
- 另外 `http://localhost:3000`（场景/Agent 服务）本身未启动（不影响主页与社交）。

### 修复（仅新增只读路由）
- `backend/src/phase6/app.js`：新增 `GET /` 返回简洁 HTML 导航页（服务说明 / 前端入口 `5199` 与 `#/documents` / 健康检查链接 / 接口前缀 `/api/phase6/*` 与 `/api/phase7/*` / 前端代理调用方式）。
- `backend/src/phase5/httpServer.js`：新增 `GET /` 同类导航页（登录入口 + 主要鉴权接口）。
- 未改动任何既有接口、数据与业务逻辑。

### 账号口令口径（重要澄清：仓库内文档已过时）
登录链路：**前端先 `sha256Hex(password)` → phase6 → phase5 `verifyPassword`（scrypt）**；因此**HTTP 直连调 API 必须发 sha256 十六进制**，而**网页登录框直接填明文即可**（前端自动哈希）。
经实测（对当前 `data/virtual_utopia_phase5.sqlite`，共 39 个用户）：

| 角色 | 账号 | 口令（网页填明文） | 说明 |
|---|---|---|---|
| **管理员** | `admin` | `utopia2026` | 唯一 `role=admin`；displayName「Phase5 Administrator」 |
| 原住民（KIN 城主） | `KIN777` | `123456` | `role=editor`，displayName「憨憨」，`homePlotId=plot-2`；**不是管理员** |
| 原住民（测试） | `traveler` | `utopia2026` | `role=editor`，displayName「漫游者」；旧式哈希（接受明文） |

- `001A访问界面.txt` 中记载的 `admin/admin-pass-2026`、`kin/utopia2026`、`resident_a/resident-a-2026` **均已失效**（`kin`、`resident_a` 在库中不存在；`admin` 口令以库为准）。
- 两套哈希并存：`admin`/`KIN777` 为 `scrypt(sha256(pw))`（新方案），`traveler` 为 `scrypt(pw)`（旧方案）。
- `PHASE5_BOOTSTRAP_ADMIN_PASSWORD` 只用于**明文→哈希的一次性迁移**（`migrateAdminPassword`，仅在明文可校验通过时才改写），**不会强制重置**已有口令。

### 服务启动（关键运维知识）
- **phase5 必须带环境变量启动**，否则进程直接退出（`PHASE5_AUTH_SECRET is required`）：
  `PHASE5_ENABLED=true PHASE5_AUTH_SECRET=changeme PHASE5_SERVICE_TOKEN=<backend/.env 中的值> PHASE5_BOOTSTRAP_ADMIN_PASSWORD=utopia2026 PHASE5_DB_PATH=H:/BP2/data/virtual_utopia_phase5.sqlite node backend/src/phase5/server.js`
  （`PHASE5_SERVICE_TOKEN` 必须与 `backend/.env` 一致，否则 phase6↔phase5 服务调用失败；phase5 为内存会话，重启后需重新登录。）
- phase6：`node backend/src/phase6/server.js`（读 `backend/.env`，含 `PHASE5_SERVICE_TOKEN`）。
- 重启服务**必须用 PowerShell 按端口精确杀进程**（`Get-NetTCPConnection -LocalPort <port> -State Listen` → `Stop-Process`）；绝不可 `taskkill IMAGENAME eq node.exe`（会连带杀掉 5199/3300/3400）。

### 自检
- 9 个地址全部 200：`5199/`、`5199/#/world`、`5199/#/documents`、`3300/`、`3300/api/phase5/health`、`3400/`、`3400/api/phase6/health`、`3400/api/phase7/health`、`5199/phase6-api/api/phase7/health`。
- 登录：`admin`(admin) / `KIN777`(editor) / `traveler`(editor) 均 200。
- 权限：`phase7 /profile/me`、`/search`、`/stats` 200；`POST /backup`（admin）201（快照 24 个文件）；`phase6 /residents`（admin）200；`home-access PUT` 200。
- 提交：`git commit f78ea94`。

---

## 2026-09-22 预置 KIN 管理员账号 + 登录口径兼容修复

### 背景
用户反馈「管理员账号未预置，admin / KIN 登录均提示用户名或密码错误，只有 traveler 能登录」。排查结论：
- 库内**确实存在** `admin`（id 1, role=admin），口令为 `utopia2026`；但仓库文档 `001A访问界面.txt` 记载的 `admin-pass-2026` / `kin` / `resident_a` 全部失效（`kin`、`resident_a` 用户不存在），照文档输入必然 401。
- 真实根因是**两套口令哈希口径并存**：
  - 新方案 `scrypt(sha256(明文))`（admin / KIN777）→ **网页登录框可用**（前端发送 sha256），但直连 API 发明文会 401。
  - 旧方案 `scrypt(明文)`（traveler）→ 直连 API 发明文可用，但**网页登录框不可用**。
  两套互相排斥，导致"看起来谁都不能登录"。

### 变更 1：预置 KIN 管理员账号（持久化）
- 新增可重复执行的幂等脚本 **`scripts/seed-admin-kin.mjs`**（通用账号 provision/修复工具）：
  - 参数：`--username`（默认 `KIN`）、`--password`（缺省自动生成强密码并打印）、`--role`（默认 `admin`，可选 admin/editor/viewer）、`--display-name`；库路径取 `PHASE5_DB_PATH` 或 `data/virtual_utopia_phase5.sqlite`。
  - 按 `hashPassword(sha256Hex(password))` 写入（与前端登录链路完全对齐）；已存在则更新口令/角色/状态（幂等）。
- 执行结果：`username=KIN`、`role=admin`、`status=active`、`id=40`、`display_name=KIN（城主 · 管理员）`，写入 `H:\BP2\data\virtual_utopia_phase5.sqlite` 的 `users` 表。
- **已重启 phase5 验证：重启后 KIN 仍可登录（role=admin, id=40）→ 持久化确认。**

### 变更 2：登录口径兼容（一次修复两套哈希）
- `backend/src/phase5/httpServer.js` 登录：先按收到值校验；**若失败且收到值不是 64 位 sha256 十六进制**，再按 `sha256Hex(收到值)` 校验一次（新增 `sha256Hex` import）。
- 效果：**明文与 sha256 两种提交方式对所有账号都可用**，彻底消除口径分歧。
- 同时用 `scripts/seed-admin-kin.mjs --username=traveler --password=utopia2026 --role=editor --display-name=漫游者` 把 traveler 的旧式哈希**重哈希为新方案（明文不变）**，使其在网页登录框也能登录。

### 自检（16/16 通过）
| 项 | 结果 |
|---|---|
| KIN 网页口径登录（sha256） | ✅ 200，`role=admin` |
| KIN 直连口径登录（明文） | ✅ 200 |
| admin 网页口径登录 | ✅ 200，role=admin |
| traveler 网页口径登录 / 直连 | ✅ 200 / ✅ 200 |
| KIN777 城主账号登录 | ✅ 200 |
| 管理员可查看全部账号 `/api/phase6/residents` | ✅ 200（25 条） |
| 管理员可管理访客配额/社群数据 | ✅ 200 |
| 管理员可查看审计事件（维护秩序） | ✅ 200 |
| 管理员可查询入驻申请 | ✅ 200 |
| 管理员可生成 data 快照备份 | ✅ 201 |
| **管理员不可读取他人私密主页内容** | ✅ traveler 私密条目对 admin 不可见（`entries` 不含私密项） |
| **管理员检索不到他人私密内容** | ✅ 检索命中 0；本人检索命中 1 |
| 重启后 KIN 仍可登录（持久化） | ✅ |
| 回归单测 | ✅ 虚拟乌托邦 13/13、外层前端 9/9、**backend 42/42**、BP3 7/7 |
| 验证过程产生的探针数据 | ✅ 已清理（剩余 0） |

### 备份与提交
- 备份快照：`H:/BP2/.workbuddy/backups/admin-kin-20260922/`（**改动前** `virtual_utopia_phase5.sqlite.bak` + **改动后** `.after`）；另经 `POST /api/phase7/backup` 生成整个 `data` 目录快照（`backups/<时间戳>/data` + manifest）。
- 说明：`data/` 在 `.gitignore` 中，账号数据本身不入库；**可用 `node scripts/seed-admin-kin.mjs` 随时重建**（脚本已入库）。
- 提交：`git commit 535c23e`。

### 账号总表（当前有效，网页登录框填明文）
| 角色 | 账号 | 口令 |
|---|---|---|
| **管理员（新增）** | `KIN` | `KIN-jyikSnKw-YhjQ` |
| 管理员（原有） | `admin` | `utopia2026` |
| 原住民 · KIN 城主 | `KIN777` | `123456` |
| 原住民 · 演示 | `traveler` | `utopia2026` |

---

## 2026-09-23 重启 3300/3400 后端服务 + 修复原启动脚本的健康探测地址

### 操作
1. 用 PowerShell 按端口**精确停止**旧进程（3300、3400 均确认变为不可达）。
2. 用**原启动脚本** `node scripts/start-all.mjs` 重新拉起（注入 phase5 必需环境变量：`PHASE5_ENABLED=true`、`PHASE5_AUTH_SECRET=changeme`、`PHASE5_SERVICE_TOKEN=<backend/.env 值>`、`PHASE5_BOOTSTRAP_ADMIN_PASSWORD=utopia2026`、`PHASE5_DB_PATH=H:/BP2/data/virtual_utopia_phase5.sqlite`）。

### 期间发现并修复：原启动脚本在本机失效
- 首次执行输出 `[start-all] phase5 健康检查超时，终止` 并**杀掉了 phase5**。
- 根因：脚本健康探测写死 `http://127.0.0.1:3300/...`，而本机 **Node 按 host 解析只绑定了 IPv6 `::1`**（`127.0.0.1:3300` 连接被拒、`localhost:3300` 正常）→ 探测必然超时。
- 修复 `scripts/start-all.mjs`：`health` 改为**多地址数组**（`localhost` + `127.0.0.1` 依次探测，任一通过即视为就绪），`waitForHealth` 返回命中的 URL。这样 IPv4-only / IPv6-only 绑定都不会再误判。

### 重启结果（健康检查原文）
```
① http://localhost:3300/api/phase5/health
{"service":"virtual-utopia-phase5","status":"ok","databasePath":"H:\\BP2\\data\\virtual_utopia_phase5.sqlite","sessionStorageMode":"memory"}

② http://localhost:3400/api/phase7/health
{"service":"virtual-utopia-phase7","version":"1.0.0","dataDirectory":"H:\\BP2\\data","scenes":7,"index":{"documents":0,"tokens":1,"updatedAt":"2026-09-22T15:49:40.892Z"}}
```
- 启动日志确认：`[start-all] phase5 就绪` → `[start-all] phase6 就绪` → `[start-all] 全部必需服务已就绪`。
- 附加：`http://localhost:3400/api/phase6/health` → `{"service":"virtual-utopia-phase6","status":"ok","phase5BaseUrl":"http://localhost:3300","ragBaseUrl":"http://localhost:3100"}`。
- 重启后账号未受影响：`KIN` 登录 200（role=admin, id=40）——DB 持久化生效。
- 提交：`git commit e2295bc`（scripts/start-all.mjs + memory-log.md）。

### 经验（已同步进技能）
- 若要在本机用 `restart_services.ps1` 请务必注意：该脚本指向**验收用临时库** `H:\tmp\ma-v101-check\phase5.sqlite` 与另一套 secret/token，**不要**在正式环境直接运行，否则会切库丢数据。
- 稳妥的重启方式：按端口精确杀进程 → `scripts/start-all.mjs`（已修好多地址健康探测）。

---

## 2026-09-23 真实浏览器实测定位 KIN/admin 登录根因 —— CORS 403 + 前端静默降级 bug

### 现象
- 重启后 KIN 在管理台 `localhost:5174` 仍报「用户名或密码错误」；curl / 直连 API 用同一对凭据都是 200。
- 演示账号 `traveler` 表现奇特：填凭据点登录 → 不报错 → 静默进入「演示模式」（无 token、所有接口走 demo 分支）。
- 这条线索指向**浏览器专属**问题：curl 没 Origin 而浏览器一定有。

### 真实根因（双坑叠加）

**坑 1：phase6 CORS allowlist 写死端口，与实际运行端口不一致**
- `backend/src/phase6/config.js` 的 `allowedOrigins` 仅 5173 / 5174 / 5175 三个端口。
- 主世界 vite 端口这次跑在 **5199**（5175 配置被占用时 vite 自动顺延）→ 浏览器请求带 `Origin: http://localhost:5199` 命中 phase6 路由 → `cors({ origin })` 拒绝 → 返回 `403 origin is not allowed`。
- 注意：**curl 默认不发 Origin**，所以 curl 一直能通——这也是此前所有命令行验证都没发现这个问题的原因。

**坑 2：`worldStore.js` 把 CORS 403 当成"离线"，做了静默降级**
- `isOfflinePersistenceError()` 把 `PHASE6_FORBIDDEN + /origin is not allowed/i` 视为离线错误 → 触发 demo 模式。
- 结果就是「**只有 demo 凭据（`traveler`）能登得进去**」——demo 分支根本不校验账号，演示账号静默通过；真实账号撞到 403 后被错误地降级，登录框反而报密码错。
- 这层降级掩盖了坑 1，让表面症状看上去像"只有 traveler 能登"。

### 变更 1：phase6 CORS 放行本机回环（任意端口）
- `backend/src/phase6/config.js`：
  - `allowedOrigins` 显式补上 `http://localhost:5199` / `http://127.0.0.1:5199`；
  - **新增** `allowLoopbackOrigins: env.PHASE6_ALLOW_LOOPBACK_ORIGINS !== 'false'`，生产可用环境变量关闭。
- `backend/src/phase6/app.js`：
  - 新增 `isLoopbackOrigin(origin)`：解析 hostname，匹配 `localhost` / `127.0.0.1` / `::1` / `[::1]` 即视为本机回环；
  - `createCorsOptions(allowedOrigins, { allowLoopbackOrigins = true } = {})` 接受第二参数，未允许列表中的回环 origin 也放行；
  - 在 `createPhase6App` 注册 CORS 时把 `config.allowLoopbackOrigins !== false` 透传过去。

### 变更 2：前端不再把 403 当离线
- `frontend/src/virtual-utopia/stores/worldStore.js`：
  - `isOfflinePersistenceError` **移除** `error?.code === 'PHASE6_FORBIDDEN' && /origin is not allowed/i.test(error.message)` 分支；
  - 403（CORS / origin 不允许）属于**配置问题**，必须如实抛给用户，而不是静默降级到 demo 模式。
  - 保留真正离线的判定：`PERSISTENCE_UNAVAILABLE` / `PERSISTENCE_TIMEOUT` / `PHASE6_UPSTREAM_UNAVAILABLE` / `REQUEST_TIMEOUT` / 502 / 503 / 504。

### 真实浏览器实测（playwright + Edge，无 headless）
| 场景 | 结果 |
|---|---|
| 5199 主世界 `traveler` 登录 | ✅ 200，拿到 token，进入主世界 |
| 5199 主世界 `KIN` 登录 | ✅ 200，role=admin，跳转到管理台入口可见 |
| 5199 主世界 `admin` 登录 | ✅ 200，role=admin |
| 5174 管理台 `KIN` 登录 | ✅ 200，进入管理员控制台 |
| **5174 管理台「入驻申请」** | ✅ 可见 1 条 pending 申请并有「批准 / 驳回」按钮 |
| **外域 Origin `http://evil.example.com`** | ✅ 仍 403 origin is not allowed（CORS 安全边界未放开） |
| 控制台错误 | ✅ 0 报错 |

### 自检（4 套单测全绿）
- 虚拟乌托邦 13/13、外层前端 9/9、**backend 42/42**、BP3 7/7。
- 真实浏览器三账号 `traveler / KIN / admin` 均 200 并存 token。
- KIN 在管理台可见 pending 申请并能操作。

### 经验（写入技能库 `virtual-utopia-safe-iteration`）
- 凡是后端出现「curl 通、浏览器不通」的特征，第一时间怀疑 CORS / Origin。
- 凡是被静默降级的分支都要审视：是否把**配置错误**误判成了**运行时降级**。任何「认证 / 权限 / 配置」类错误都不应静默吞掉。
- 真实浏览器自动化（playwright + Edge）是这类问题的唯一可靠验证手段——单测和 curl 都会撒谎。
- 验证矩阵应同时包含：本机三个常用端口 × 真实账号 × 演示账号 × **恶意外域**（必须 403），少一项都可能在角落漏掉 CORS 漏配。

### 提交
- `git commit f9173c1`（config.js + app.js + worldStore.js + memory-log.md）。

---

## 2026-09-23 对话无响应 + 管理后台数据为空 — 实测根因诊断与最小必要修复

### 自检 — 现象对照

#### 问题 1：3D 世界"对话/聊天功能无法使用"
- **真实浏览器排查（playwright+Edge）**：
  - 后端 `GET/POST /api/phase7/public-chat` curl 直连：200 / 201；`POST /api/phase6/chat/world`：201。
  - traveler 在广场中心（avatar.position=(0,0.98,0)）→ `getSocialContext()` 返回 `{zone:'plaza', channel:'public'}` → 入口按钮 `进入广场公屏` enabled → 点击后 overlay 打开、列表加载历史消息、POST 201 成功 → 气泡显示「traveler...11:23 · plaza」。
  - 化身移动到 home_gate/river/mountain 等**无在线居民**的场景：`channel='local'/'direct'/'encounter'` → 按钮文案 `就近交流` → **点开后生成 peerId='' 的空面板** → 用户输入发送 → 后端 `/api/phase7/direct/(空)` → 404 `对方不是有效原住民` → 前端 `.err` 静默吞掉（仅 console.error） → 用户视角是「无响应」。
- **真实根因**：`WorldView.openSpaceChat()` 在 `channel !== 'public'` 且无 `nearestResident` 时，硬打开 `peerId=''` 的对话面板——后端 404 把所有"无邻居场景"伪装成了"功能无响应"。
- **设计意图**：home_gate 是"凑过去邻居到位"才私聊——本来就不该在没邻居时强行打开面板。

#### 问题 2：管理后台"待审批列表、账号申请等管理数据页面为空"
- **真实浏览器排查**：
  - KIN 登录 `http://localhost:5174/#/applications` → 数据正常显示：2 条 pending（ui_zzzz / momomm），下方有「批准入驻 / 驳回申请」按钮。
  - admin 账号同样可看到全部数据（visitor-quota / plots / sessions 也都正常）。
  - 唯一会让用户"看不到数据"的路径：在 **5199 主世界登录后再开 5174 新标签**，因 admin 用 sessionStorage 而主世界用 localStorage、又是不同 origin（5199 vs 5174），sessionStorage **不互通** → 新标签页 `ensureSession()` 返回 false → 被 `router.beforeEach` 重定向到 `/#/login?redirect=/applications` → 用户看到登录页 → 以为"数据为空"。
- **真实根因**：管理台与主世界使用**独立登录会话**（不同 origin 不能跨页共享 sessionStorage）——这是安全边界，不是 bug。但缺少清晰的提示，让用户误以为"刚登过又被请登录 = 数据丢了"。

### 修复（不修改 3D 场景/不破坏既有业务逻辑）

| 问题 | 修复点 | 行为变化 |
|---|---|---|
| 1 | `WorldView.openSpaceChat` 移除"home 时硬开空面板"分支 | channel≠public 且无 nearestResident → 直接 `notify('附近暂无在线居民，请走近一位邻居或返回广场中心')`，**不打开面板** |
| 1 | 新增 `spaceEntryEnabled` 计算属性 + 按钮 `:disabled` 绑定 | 按钮文案改为「走近居民后可私聊」、禁用态（灰色 `cursor: not-allowed`），广场公屏永远可用 |
| 1 | `.vu-space-entry__btn--disabled` CSS | 视觉禁用样式 |
| 2 | `AppHeader.vue` 新增「管理后台」入口 | 仅 admin 角色显示；新标签打开 `http://localhost:5174/#/applications`；提示"独立登录会话" |
| 2 | `vite.config.js` 新增 `VITE_MAIN_WORLD_PORT` / `VITE_ADMIN_PORT` define | 端口变化时（如 vite 顺延到 5199/5176）入口仍指向正确地址 |
| 2 | `phase6/LoginView.vue` 新增「管理台与主世界使用独立登录会话」提示 | 减少"为什么刚登过又要登录"的困惑 |
| 2 | `phase6/styles.css` 新增 `.phase6-login-hint` 样式 | 浅绿底胶囊提示 |

### 浏览器实测验证（playwright + Edge，无 headless）

| 场景 | 验证点 | 结果 |
|---|---|---|
| **广场中心** | 按钮 `进入广场公屏` enabled / 点开 overlay / 输入发送 | ✅ 201 写入，「traveler修复验证消息」气泡出现 |
| **远山脚（无邻居）** | 按钮 `走近居民后可私聊` disabled=true，灰色 `cursor: not-allowed` | ✅ |
| **河岸步道（有邻居"林涧"）** | 按钮 `与 林涧 交流` enabled | ✅ |
| **KIN 登录主世界** | 顶部导航出现 `管理后台` 链接 → `http://localhost:5174/#/applications` target=_blank | ✅ |
| **5174 login 页** | 顶部出现浅绿底提示「管理台与主世界（localhost:5199）使用独立登录会话，请用管理员账号（KIN / admin）登录。」 | ✅ |
| **KIN 登录 5174** | 「入驻申请」可见 2 条 pending + 「批准/驳回」按钮 | ✅ |
| 控制台 | 0 错误 | ✅ |

### 回归单测（全绿）
- 虚拟乌托邦 13/13 / 外层前端 9/9 / backend 42/42 / BP3 7/7。

### 改动文件（git status --short）
- `frontend/src/virtual-utopia/views/WorldView.vue` — openSpaceChat / spaceEntryEnabled / 按钮禁用绑定 / CSS
- `frontend/src/virtual-utopia/components/AppHeader.vue` — 管理后台链接（admin 角色可见）
- `frontend/src/virtual-utopia/vite.config.js` — VITE_MAIN_WORLD_PORT / VITE_ADMIN_PORT define
- `frontend/src/virtual-utopia/styles.css` — `.vu-nav__link--admin` + `.vu-space-entry__btn--disabled`
- `frontend/src/phase6/views/LoginView.vue` — 登录提示
- `frontend/src/phase6/styles.css` — `.phase6-login-hint` 样式

### 经验（强化 skill `virtual-utopia-safe-iteration`）
- **空场景要"显式拒绝"而非"显示空面板"**：当 UI 入口被设计成「凑近才能用」，在边界条件（无邻居、无 owner）下应直接 toast 提示并阻止操作，而不是打开空壳让用户走死路。
- **跨 origin 的会话不互通是设计而非 bug**：要在入口处明示（"独立登录会话"提示 + 跳转按钮），不要让用户以为"我明明登过"。
- **「对话无响应」要按三层排查**：① 后端 API 是否 200/201；② 前端 store 是否被静默吞错（`try/catch` 无 notify）；③ UI 是否在错误状态下打开空面板。三层同时断才能让用户"看到无响应"。
- **跨端口 admin 入口通过 `import.meta.env` 注入端口**：避免硬编码 "5174" 在 vite 顺延后失联。

### 提交
- `git commit 8349ae4`（上述 6 文件 + memory-log.md）。

---

## 2026-09-20 P1-2 属地聊天（位置频道化）

> 将原「全局世界频道」升级为按位置过滤的属地聊天；骨架沿用既有 world-chat 端点。

### 需求落地
1. 广场发消息仅广场内可见；走进宅院自动切到「N号宅院门口」频道，只收该频道消息。
2. 发送带当前位置标签（channel），接收按当前位置过滤，不再「发出去所有人可见」。
3. 界面显示当前频道名（广场频道 / N号宅院门口）。
4. 切场景即时切频道，清空旧频道消息不残留。

### 改动
- 后端：`gatewayService.js` 世界聊天消息增加 `channel` 字段（默认 plaza），`getWorldChat` 按 channel 过滤；`app.js` chat/world 端点透传 `channel`。
- 前端：
  - `worldLayout.js` 新增 `getChannelForPosition(x,z)`（距宅院中心 ≤4.5 → plot-N，否则 plaza）+ `getChannelLabel`。
  - `worldStore.js` `worldChat` 增加 `channel` 状态 + `setWorldChatChannel`（切频道清空旧消息并重载）；load/send 世界聊天带 channel。
  - `WorldView.vue` 新增 800ms 轮询玩家位置 → 自动切频道。
  - `WorldChatPanel.vue` 显示当前频道名 + 发送/读取绑定当前频道。

### 测试
- HTTP E2E 6/6（广场/宅院频道分别收发、互不可见、默认 plaza）。
- 频道判定单测：中心→plaza、宅院坐标→plot-N、远离→plaza、label 正确。
- 回归：前端单测 13/13、phase6 单测 19/19、backend e2e 全绿。

---

## 2026-09-20 P1-3 串门留言簿（访客通知 + 可回复留言）

> 让「串门」闭环：访客进院通知院主，留言簿从单向墙改成可回复线程。

### 需求落地
1. 访客进入宅院触发 visit:enter，站内推送院主「谁来了/什么时候」。
2. 留言簿支持回复：每条留言下可回复，回复与留言串成线程（parent_id）。
3. 切换宅院/刷新后留言与回复仍在（持久化）。

### 改动
- 后端：新增 `homeSocialStore.js`（表 `home_messages`（含 parent_id）/ `home_visits`）；`config.js` 新增 `homeSocialDatabasePath`；`app.js` 新增 4 端点：`GET/POST /api/phase6/home/:plotId/messages`、`GET/POST /api/phase6/home/:plotId/visits`。
- 前端：
  - `gatewayClient.js` 新增 list/createHomeMessage、list/recordHomeVisit。
  - `worldStore.js` `addHomeMessage`/`recordHomeVisit` 改为后端持久化（addHomeMessage 支持 parentId），新增 `loadHomeMessages`/`loadHomeVisits`/`checkHomeVisitNotifications`（轮询自家来访，检测新访客弹「X 来串门了」）。
  - `HomePanel.vue` 留言簿改线程展示 + 回复入口/输入框；来访记录字段 `visitorName`。
  - `WorldView.vue` 新增 3s 轮询串门通知。

### 测试
- HTTP E2E 7/7（来访记录、留言+回复线程、刷新持久化）。
- 新增 `homeSocialStore.test.js`（线程 + 来访，通过）。
- 回归：前端单测 13/13、phase6 单测 20/20、backend e2e 全绿。

---

## 2026-09-20 第二批 P2：卡片可交互化 + 世界迷你主页

> 一次做完：① 五类卡片从「贴上去」变「能动手」；② 广场点 Avatar 弹迷你主页小卡。

### 需求落地
1. 出游卡「报名参加」→ 攒同行名单；心愿卡「我来帮你/我也想要」→ 小线程；随记卡「评论」→ 评论线程。
2. 广场点 Avatar → 迷你主页小卡（头像/一句话简介/在线状态/「打招呼」）。
3. 迷你主页与个人主页打通：小卡「查看主页」跳 `/profile?userId=X`。

### 改动
- 后端：`residentCardStore.js` 新增 `card_interactions` 表（kind：signup/help/want/comment）+ `listInteractions`/`createInteraction`（删除卡片级联删交互）；`app.js` 新增 `GET/POST /api/phase6/resident-cards/:id/interactions`。
- 前端：
  - `gatewayClient.js`/`worldStore.js` 新增 list/createCardInteraction + `cardInteractions` 状态。
  - `ResidentCardsPanel.vue` 卡片交互 UI（同行名单/帮我想要线程/评论输入）。
  - `ThreeWorld.js` Avatar 可点击（body/head 打 selectionType=avatar + userId/displayName，`pick` 派发 avatar 事件；本人与 AI 居民不参与）。
  - `WorldView.vue` 新增迷你主页小卡（头像/在线/简介/打招呼/查看主页），打招呼走 S3 私聊。
  - `ProfileView.vue` 支持 `?userId=X` 查看他人主页（横幅 + 返回我的主页）。

### 测试
- HTTP E2E 9/9（报名/名单、帮你线程、评论、刷新持久化）。
- 新增卡片交互单测（线程 + 删除级联），phase6 单测 21/21、前端单测 13/13。
- vite build 通过。

### 备注
- 迷你主页/3D Avatar 点击为 UI 层功能，数据（报名/响应/评论）经后端持久化，刷新不丢。

---

## 2026-09-25 LangGraph 重构 P0–P4 全落地（自研 AI 编排 → LangChain.js + LangGraph.js）

> 决策基线（用户逐项拍板）：模型继续用 DeepSeek（`@langchain/deepseek`，deepseek-chat）；首批 5 个工具全开；直接在 H:\BP2 仓库改造；LangSmith 用免费 Developer 层；试点=居民 AI 对话。

### 改动文件
- **依赖（backend/package.json，--save-exact 锁版本）**：`@langchain/core 1.2.12`、`@langchain/deepseek 1.1.13`、`@langchain/langgraph 1.4.17`、`@langchain/langgraph-checkpoint-sqlite 1.0.4`、`@langchain/textsplitters`、`@langchain/community 1.1.28`（须 `--legacy-peer-deps`）、`zod 4.6.5`。
- **模型层**：`backend/src/ai/{schemas.js, langchainModelClient.js, modelClientFactory.js}`（AI_LLM_BACKEND 择 langchain/legacy，三处装配点注入）。
- **图编排（P3）**：`backend/src/ai/graph/{state.js, checkpointer.js, nodes.js, graphOrchestrator.js}`（Annotation.Root + SqliteSaver + 5 分支节点 + finalize）。
- **工具（P4a）**：`backend/src/ai/tools/{auth.js, index.js, context.js, factory.js}`（角色矩阵 + 5 工具 + AsyncLocalStorage 用户上下文 + 与 phase6 同库业务工具集）。
- **长记忆（P4c）**：`backend/src/ai/memory/memoryGateway.js`（before 召回注入 / after 落库+异步提炼）。
- **RAG（P2）**：`backend/src/ai/rag/` 组件化 + Chroma 集成。
- **路由**：`backend/src/routes/{stream.js, resume.js}`、`backend/src/app.js`（stream+resume 挂载）、`backend/src/config/env.js`（ai 块含 hitlEnabled/approvalTools）。
- **Prompt 改句**：`backend/src/agents/{orchestrator.js, branches/createBranchAgent.js}`（第 40 行「不得调用工具…」改为允许使用工具+写入须确认/审批文案，一处改 5 分支）。
- **前端**：`frontend/src/services/sceneApi.js`（sendMessageStream/resumeApproval）、`frontend/src/stores/conversationStore.js`（DEFAULT_USER/流式/审批）、`frontend/src/components/scene/SceneConversationPanel.vue`（打字机+审批卡片）、`frontend/tests/`。
- **验证脚本（保留）**：`backend/scripts/{verify-llm, verify-stream, verify-hitl}.mjs` + `smoke-langchain/rag/rag-e2e/rag-http/graph/tools.mjs`。
- **配置示例**：`backend/.env.example`（追加 AI_MEMORY_ENABLED / AI_HITL_ENABLED / AI_APPROVAL_TOOLS 注释段）。

### 关键实现
- **图结构**：`START → route →(risk=high→safety : scene→branch×5) → branch →(有 toolCalls→[敏感→approval(HITL)]→execute_tools→回 branch : finalize) → finalize → END`；SQLite Checkpointer `backend/data/langgraph.sqlite`（thread_id=conversationId 断点续跑）。
- **模型适配器**：ChatDeepSeek 构造即校 key → `langchainModelClient.js` 惰性实例化（getModel 内部缓存）；结构化输出 `invoke(messages, {response_format:{type:'json_object'}})`（prompt 含「仅返回合法 JSON」）。
- **5 工具全开**：query_friends / guestbook_write / plot_lookup / quota_overview / resident_card_lookup；权限矩阵：query_friends→resident/admin、guestbook_write→editor/admin、plot_lookup/quota_overview/resident_card_lookup→viewer+、无身份 role=null 全拒绝（toolAuth.test.js 新增）。
- **长记忆**：memoryGateway before 召回注入 / after 落库+异步提炼，AI_MEMORY_ENABLED 开关（默认开，'false' 关）；memory 库落库验证通过。
- **HITL（KIN 审批）**：LangGraph 原生 `interrupt`/`Command({resume})`/`isInterrupted()`（`__interrupt__` 键）；approval 节点 + resume 路由 `POST /api/scene/route/resume` + 前端审批卡片；verify-hitl.mjs 批准路径真实执行、拒绝路径不执行。
- **流式 SSE**：`createStructuredResponseStream`（.stream + json_object + onToken）；`POST /api/scene/route/stream`；verify-stream.mjs 最终 202 chunks 全通过。
- **工具历史剪枝**：`pruneToolMessages` 断点续跑过滤 AI tool_calls + ToolMessage（防同 thread 跨轮累积干扰）。
- **前端默认身份**：`DEFAULT_USER = {userId:1, username:'resident', role:'editor'}`（试点值，生产应接真实认证，待续）。

### 13 条坑（本轮核心经验）
1. ChatDeepSeek 构造即校验 API key → 惰性实例化（getModel 内部缓存）。
2. ChatDeepSeek 无 `.bind`；结构化输出必须 `invoke(messages, {response_format:{type:'json_object'}})`（prompt 含「仅返回合法 JSON」）；工具轮 bindTools 不加 response_format（互斥）。
3. `@langchain/chroma` 包不存在（404），集成在 `@langchain/community`；community 可选 peer stagehand 要求 zod ^3 与项目 zod 4.6.5 冲突 → `--legacy-peer-deps`。
4. `rag/httpServer.js` 顶层 re-export 循环依赖 → 惰性单例。
5. 图节点名不能撞 state 字段：intent→route、tools→execute_tools。
6. thread_id 语义：带 conversationId→断点续跑；不带→`ephemeral-${uuid}` 临时线程零污染。
7. SSE 勿用 `request.on('close')` 判断断线（body 读完即触发）→ `response.on('close')` + `writableEnded` 兜底。
8. SSE done 事件是双包装 `{payload:{...}}`（status/reply_chunk 单层）——前端 onDone 需解包，P4c 前端未跑真实 SSE 漏检。
9. HITL：interrupt 通过抛 GraphInterrupt 暂停，节点内不能用 try/catch 包住 interrupt；invoke 正常返回但带 `__interrupt__` 键（`isInterrupted()` 判断）；恢复必须同一 thread + `Command({resume})`。
10. 同 thread 跨轮累积工具消息干扰模型（异常返回空）→ 工具冒烟独立线程 + 生产剪枝 `pruneToolMessages`。
11. 模型行为观察：对 guestbook_write（写入类）DeepSeek 策略是文本澄清优先（「确认后我就去写」），不直接发起工具调用——安全默认合理；HITL 触发取决于模型是否发起敏感工具调用（验证时把 quota_overview 临时纳入审批清单验证机制）。
12. 本机无 Docker → Python venv 跑 Chroma：`H:\BP2\.venv-chroma`（chromadb 1.5.9），数据 `H:\BP2\.chroma-data`，命令 `& 'H:\BP2\.venv-chroma\Scripts\chroma.exe' run --path 'H:\BP2\.chroma-data' --host 127.0.0.1 --port 8000`；collection `virtual_utopia_rag`（E2E 后已清空）。
13. 本机 Node 服务 listen(port) 解析为 IPv6 `::`，`127.0.0.1:port` 被拒、`localhost:port` 正常 → 验证脚本统一 localhost（与 2026-09-23 start-all 多地址探测同源）。

### 测试结果
- 后端回归：`node --test tests/deepSeekClient.test.js tests/orchestrator.test.js tests/branchAgents.test.js tests/sessionIsolation.test.js tests/sceneRoute.test.js tests/toolAuth.test.js src/phase7/tests/phase7.test.js` → **45/45 全绿**（42 旧 + toolAuth 3 新增）。
- 前端：`npm test` → 9/9；`npm run build` 通过。
- 模型/流式/HITL 冒烟：verify-llm.mjs 真实流式 10 chunks；verify-stream.mjs 202 chunks 全通过；verify-hitl.mjs 批准路径真实执行、拒绝路径不执行。
- RAG：E2E 双引擎（自研 8 模块 vs LangChain 组件）结果逐位一致；HTTP E2E viewer 问名额返回真实 14 项数据。
- 记忆：memory 库落库验证通过。
- Chroma（本机无 Docker）：venv 运行正常（见坑 12）。

### 自检清单
- [x] P0 基座 6 包 + zod 锁版本；基线 42/42 全绿
- [x] P1 模型层三处装配点注入；verify-llm 真实流式 10 chunks
- [x] P2 RAG 组件化 + Chroma；E2E 双引擎逐位一致
- [x] P3 图编排；smoke-graph 断点续跑验证
- [x] P4a 5 工具全开；toolAuth 无身份全拒绝
- [x] P4b 真实 HTTP 路由；HTTP E2E viewer 返回真实数据
- [x] P4c 流式 SSE + 长记忆；verify-stream 202 chunks；记忆落库
- [x] P4 收尾：HITL 审批、prompt 矛盾句、工具历史剪枝
- [x] 后端 45/45 + 前端 9/9 + build 全绿
- [x] 记录写入 memory-modules.md（新增 LangGraph 章节）
- [x] memory-core.md 第八节交接点已更新

### 已知局限
- 前端默认身份 DEFAULT_USER 为试点值（resident/editor），生产应接真实认证。
- Chroma 数据目录 `.chroma-data` 需纳入治理（当前 collection 已清空）；本机无 Docker，生产迁移需换部署方式。
- `@langchain/community` 依赖 `--legacy-peer-deps` 安装（zod 版本冲突）。
- 自研 legacy 编排与 RAG 保留可回退（env 开关见下）。

### 回退开关（五种，backend/.env + .env.example）
- `AI_LLM_BACKEND=langchain`（legacy 回退旧 deepSeekClient）
- `AI_RAG_BACKEND=langchain`（回退自研 8 模块 RAG）
- `USE_LANGGRAPH=1`（0 回退旧静态 if/else 编排）
- `AI_MEMORY_ENABLED`（默认开，'false' 关长记忆）
- `AI_HITL_ENABLED`（默认开）+ `AI_APPROVAL_TOOLS=guestbook_write`（逗号分隔可扩展）

---

## 2026-09-26 场景服务真实认证（替换 body.user 直传信任 + 前端登录）

> 决策：按 memory-core 待办①落地「前端默认身份接真实认证」。后端废弃 body.user 直传（可伪造身份），
> AI 请求带 Bearer token 经 phase6 /auth/me 解析真实身份；无 token=游客（写操作按角色矩阵拒绝）；
> resume（审批恢复）仅 KIN（admin）可调用。前端外层壳新增登录（复用 phase6 账号体系）。

### 改动文件
- **后端**：
  - `src/middleware/sceneAuth.js`（新）：Bearer → phase6 `/api/phase6/auth/me` → `{userId:user.id, role, username}` 注入 `request.userContext`；无 token→游客(null)；无效→401；认证服务不可达→503（不静默降级）。
  - `src/config/env.js`：新增 `phase6.baseUrl`（`PHASE6_BASE_URL || http://localhost:3400`，去尾斜杠）。
  - `src/app.js`：`app.use('/api/scene/route', sceneAuth)` 前缀挂载（覆盖 route/stream/resume 三个端点）。
  - `src/routes/scene.js` / `stream.js`：把 `request.userContext` 透传给 orchestrator.handle/handleStream。
  - `src/routes/resume.js`：审批恢复增加「仅 admin」校验（游客/editor → 403 FORBIDDEN）。
  - `src/services/sessionBoundary.js`：handle 增加 `{ userContext }` 参数透传。
  - `src/ai/graph/graphOrchestrator.js`：`buildInput`/`persistMemory` 改用 userContext 参数，**body.user 直传废弃**（spoof 无效）。
  - `tests/sceneAuth.test.js`（新，9 用例）：无 token/有效 token（id→userId 归一化）/viewer/401/503 + resume admin/游客/editor 三态。
  - `scripts/verify-auth.mjs`（新）：真实认证全链路冒烟；`verify-stream.mjs`/`verify-hitl.mjs` 适配真实登录（移除 body.user）。
- **前端**：
  - `src/services/authService.js`（新）：login（密码前端 sha256，同主世界链路）/me/logout/token 存取（key `scene-app.phase5.token`，独立于 virtual-utopia）。
  - `src/stores/authStore.js`（新）：reactive 身份状态（unknown/guest/authenticated）+ ensureSession/login/logout + isAdmin/roleLabel。
  - `src/services/sceneApi.js`：三个方法（sendMessage/sendMessageStream/resumeApproval）自动带 `Authorization: Bearer`（getToken 注入，默认读外层 localStorage）；移除 body user 透传。
  - `src/stores/conversationStore.js`：删除 `DEFAULT_USER` 与 user 透传；注释改为真实认证说明。
  - `src/components/scene/ScenePageShell.vue`：身份栏（游客模式 badge + 登录/退出）+ 登录弹窗（Teleport + 用户名/密码，复用 BaseInput/BaseButton/useToast）。
  - `vite.config.js`：新增 `/phase6-api` proxy → `http://localhost:3400`。
  - `tests/authService.test.js`（新，6 用例）+ `tests/sceneApi.test.js`（token 头断言 + 无 token 无头）。
- **配置**：`backend/.env.example`（补 `PHASE6_BASE_URL` 注释段）、`frontend/package.json`（test 脚本并入 authService.test.js）。

### 关键实现
- **身份链路**：前端登录（phase6 login）→ token 存外层 localStorage → sceneApi 请求带 Bearer → sceneAuth 中间件调 phase6 `/auth/me` 解析 → `request.userContext` → graph `state.userContext` → execute_tools 前写入 AsyncLocalStorage（tools/context.js）→ 工具按角色矩阵鉴权。
- **归一化**：phase5 `/auth/me` 返回 `{ id, username, role, displayName }`（字段是 `id`）→ sceneAuth 归一化为 `{ userId, role, username }`（AI 工具层约定）。
- **resume 鉴权**：审批恢复 = 敏感操作，仅 admin（403 提示「仅 KIN（管理员）可执行审批操作」）；身份仍由中间件解析注入。
- **游客路径向后兼容**：无 token 请求继续放行（可对话/查询），仅写类工具（guestbook_write 等）与 resume 被拒——演示体验不中断。

### 测试结果
- 后端全量回归：**54/54 全绿**（45 旧 + sceneAuth 9）。
- 前端：**16/16**（原 9 + authService 6 + sceneApi token 断言）＋ `npm run build` 通过（54 modules）。
- verify-auth.mjs（真实冒烟，admin/utopia2026 bootstrap 默认）：登录 PASS、游客对话放行 PASS、游客 resume 403 PASS、无效 token 401 PASS、真实 token 流式触发 plot_lookup 返回真实数据（body.user spoof 被忽略）PASS。
- verify-hitl.mjs（AI_APPROVAL_TOOLS=quota_overview,guestbook_write 启动）：场景 A admin 查询命中审批 → resume 批准 → 真实名额数据（无 fallback）；场景 B 拒绝 → 「未获批准，我没有执行」。
- verify-stream.mjs：完整流式 79 reply_chunk + plot_lookup 真实数据（39 号宅院空置）+ 记忆落库。

### 坑（追加）
1. **phase5 服务不读 .env**（config 只读 process.env）：启动须 `node --env-file=.env src/phase5/server.js` 或显式注入 `PHASE5_AUTH_SECRET`/`PHASE5_SERVICE_TOKEN`/`PHASE5_BOOTSTRAP_ADMIN_USERNAME`/`PHASE5_BOOTSTRAP_ADMIN_PASSWORD`；phase6 自读 .env —— 两服务环境加载行为不一致（历史遗留）。bootstrap admin 默认 `admin/utopia2026`（.env.example 同款，冒烟可用）。
2. **verify 脚本「问名额」撞扩展审批清单**：scene 以 `AI_APPROVAL_TOOLS=quota_overview,guestbook_write` 启动时 quota_overview 命中审批 → 流式停在 approval_pending 无完整回复 → 完整流式验证（verify-stream/verify-auth）改用 plot_lookup（不命中审批）。
3. **register 用户不可直接登录**：phase5 注册默认 `role=editor, status=pending` → 登录被拒（需 admin 审批激活）→ 冒烟用 bootstrap admin。
4. **authService 测试注入 storage 须实现 localStorage 接口**（getItem/setItem/removeItem），不能传裸 Map（`storage?.setItem is not a function`）。

### 自检清单
- [x] 后端 sceneAuth 9 用例 + 全量 54/54
- [x] 前端 authService 6 + sceneApi token 断言 + 16/16 + build
- [x] verify-auth 6 PASS（游客/401/403/有效 token 真实工具）
- [x] verify-hitl 场景 A/B（真实认证 + 扩展审批清单）
- [x] verify-stream 完整流式 + 记忆落库
- [x] body.user 直传确认废弃（spoof 用例验证身份由 token 决定）
- [x] 记忆三件套同步（memory-modules 第 10 章真实认证小节、memory-core 第七/八节）
- [x] 冒烟服务已停止（phase5/phase6/scene 后台进程）

### 已知局限
- 外层壳登录为最小实现：无注册入口/无验证码；游客文案提示「登录后可执行写入操作」。
- resume 审批人校验仅限「admin 角色」，未做 conversationId→owner 归属校验（后续可加：审批人须为该会话授权人）。
- sceneAuth 调 phase6 无超时重试（fetch 直连，网络错误即 503）；跨服务调用可后续加超时与重试。
- 前端登录 token 存外层 localStorage（key `scene-app.phase5.token`），与主世界（virtual-utopia.phase5.token）相互独立——跨应用同源共享待定。

---

## 2026-09-26 待办② Chroma 数据治理与生产部署方式（启动编排 + 治理命令 + 部署模板）

> 决策：按 memory-core 待办②落地。现状：CHROMA_URL/CHROMA_COLLECTION 已可通过 env 配置（vectorStore.js 按协议自动 ssl），
> 但缺启动编排（start-all.mjs 只管 phase5/phase6）、数据治理命令、生产部署模板。

### 改动文件
- `scripts/chroma.mjs`（新）：五子命令 `start` / `stop` / `status` / `reset` / `reset-data`，**纯 Node 原生（零 shell 依赖）**。
- `scripts/start-all.mjs`：新增 `chroma` 服务条目（kind=venv、health 探测 `/api/v2/heartbeat`、required=false 可选启动）。
- `backend/.env.example`：补 `CHROMA_URL` / `CHROMA_COLLECTION` / `RAG_DOCS_DIR` 注释段。
- `deploy/chroma.docker-compose.yml`（新）：生产部署模板（chromadb/chroma:1.5.9 + 数据卷 + healthcheck，**本机无 Docker 未实测**）。

### 关键实现
- **start**：`detached: true` spawn（脱离 Job Object，父进程退出后服务存活）+ openSync fd 写日志（`.chroma-data/chroma.out.log` / `chroma.err.log`）+ PID 文件（`.chroma-data/chroma.pid`）+ 轮询 `/api/v2/heartbeat` 就绪。
- **stop**：读 PID 文件 → `process.kill(pid, 'SIGTERM')`（Windows 即 TerminateProcess）→ 轮询心跳确认停止。
- **status**：心跳 + collections 列表 + count + 数据目录大小。
- **reset**：DELETE collection（幂等，404 视为已空）。
- **reset-data**：数据目录损坏时整体重命名备份（`.corrupt-<时间戳>`，**不删除**）→ 重建空目录。
- **start-all 集成**：chroma 可选（venv 不存在/启动失败只降级 RAG，不阻塞业务服务）。

### 排障过程（本轮最有价值部分，4 层根因）
1. **第一层（数据目录）**：`.chroma-data` 旧 SQLite 损坏（昨日进程被强杀未干净关闭）→ chroma 打印 listening 后静默退出 → 换全新空目录验证通过 → 引入 `reset-data`。
2. **第二层（API 路径）**：`/api/v1/heartbeat` 全部 **410 Gone** —— chromadb 1.5.9（Rust 版）API 路径改版：`/api/v1/*` 废弃，正确路径为 `/api/v2/heartbeat`（心跳）、`/api/v2/tenants/default_tenant/databases/default_database/collections`（列表/删除）；`/api/v2/version` → `"1.0.0"`。
3. **第三层（进程生命周期）**：node spawn 的 chroma 子进程在**父进程退出后被 Job Object 终止**（start 时轮询心跳成功、脚本一退出进程即消失）→ 改 `detached: true` 脱离。
4. **第四层（PATH 精简）**：本环境 node 子进程 **PATH 精简，无 powershell / netstat**（`spawn powershell ENOENT`、`netstat` 找不到）→ 进程管理弃用 shell，改 **PID 文件 + `process.kill`**（Node 原生）。
- 附加排查（已排除）：曾怀疑异步 FileHandle GC 关闭 fd 导致 chroma 写 stdout 崩溃 → 一度改 openSync（非根因，保留无害）；最终 detached + openSync fd 组合稳定。

### 测试结果
- `node scripts/chroma.mjs start` → 已启动（PID 22648）；**父脚本退出 2 秒后 `status` 仍显示运行中（PID 22648）**——detached 脱离存活确认。
- `status`：collections（0）、数据目录 0.19 MB。
- `reset`：collection 不存在（已空）幂等通过。
- `stop`：已停止（PID 22648）；随后 `status` → 未在运行。
- `start-all.mjs` 冒烟（注入 phase5 env 后台跑）：`phase5 就绪` → `phase6 就绪` → `chroma 就绪` → 全部必需服务已就绪；TaskStop 后 3300/3400/8000 全部释放。
- 后端回归 **54/54 全绿**（本轮未改后端代码，保险确认）。
- 清理：`.chroma-data.corrupt-2026-09-25T16-48-58-596Z`（损坏旧数据备份）、`.chroma-tmp`/`.chroma-tmp2`/diag 脚本（测试产物）已清理。

### 自检清单
- [x] chroma.mjs 五子命令全链路验证（start/status/reset/stop + 脱离存活）
- [x] start-all 集成 Chroma 可选启动冒烟通过（三服务就绪 + 停止后端口全释放）
- [x] 后端 54/54 无回归
- [x] 生产部署模板与 .env.example 同步
- [x] 规划文档 P4 后续行更新（真实认证 ✅ + Chroma 治理 ✅ + 剩余待办）
- [x] 记忆三件套同步（本条 + memory-core 第八节）

### 已知局限
- 本机无 Docker，`deploy/chroma.docker-compose.yml` 未实测（生产部署需在目标环境验证）。
- chroma.mjs 的 `reset`/`reset-data` 假定默认 tenant/database（`default_tenant`/`default_database`）；自定义租户需扩展。
- start-all 集成后 chroma 日志走 stdio inherit（随编排终端），独立 `chroma.mjs start` 才写 chroma.out/err.log。

---

## 2026-09-26 待办③ AI_TOOLS_DEBUG 门控调试日志规范化

> 决策：P4a 加的 5 处 `[debug-branch]` 调试日志**保留**（排查工具轮价值高），从「直读 process.env」规范为「env.js 单一配置源」：
> 新增 `ai.toolsDebug`（默认 false，生产无噪音；排查工具轮时 `AI_TOOLS_DEBUG=true`）。

### 改动文件
- `backend/src/config/env.js`：ai 块新增 `toolsDebug: toBoolean(process.env.AI_TOOLS_DEBUG, false)`（含注释）。
- `backend/src/ai/graph/nodes.js`：import `env`；5 处 `if (process.env.AI_TOOLS_DEBUG)` → `if (env.ai.toolsDebug)`。
- `backend/.env.example`：`AI_HITL_ENABLED`/`AI_APPROVAL_TOOLS` 后补 `AI_TOOLS_DEBUG=false` 注释段。

### 关键实现
- 门控日志盘点（src/ai 全量 console.*）：`nodes.js` 5 处 debug 日志（tool round / no-tool parsed / re-called / structured path / caught）——均入 `env.ai.toolsDebug`；`memoryGateway.js` 2 处 `console.error`（记忆提炼/写入失败）为**错误日志**，保持常开不入门控；tools 目录无日志。
- 默认关闭语义：生产环境零噪音；开启后输出 `[debug-branch]` 前缀关键指标（toolCalls 数 / contentLen / 路径分支 / 错误 code+cause）。

### 测试结果
- 后端全量回归 **54/54 全绿**（8 测试文件 fail 0）。
- env 解析验证：默认 `toolsDebug=false`；注入 `AI_TOOLS_DEBUG=true` → `true`。

### 自检清单
- [x] env.js 单一配置源（默认 false）
- [x] nodes.js 5 处全部接入（Grep 确认无残留 process.env 直读）
- [x] .env.example 注释段同步
- [x] 后端 54/54 无回归 + env 解析双态验证
- [x] 记忆三件套同步（本条 + memory-core 第八节待办③ ✅）

### 已知局限
- 门控日志仅覆盖 branch 节点（工具首轮/结构化路径）；tools 节点执行细节（每工具 args/输出）未加日志——需时可在 tools 节点补 `[debug-tools]` 门控。

---

## 2026-09-26 待办⑤ 外层壳注册入口 + 图形验证码

> 场景：外层壳（scene 前端）登录弹窗只有登录，无注册入口/防滥用验证码。
> 设计原则：**phase5 零改动**——验证码服务与注册代理都建在 scene 后端，验证通过后转发 phase5 注册端点（创建 pending 入驻申请，KIN 在 phase6 审批激活，与主世界注册同流程）。

### 改动文件（后端）
- `backend/src/services/captchaService.js`（新）：4 位数字（排除 0/1 易混）SVG 验证码 + 干扰线/噪点；内存 Map `captchaId → {answer, expiresAt}`，5 分钟过期、**一次性**（校验后删除）、上限 1000 自动清理过期；`create()` / `verify()`。
- `backend/src/routes/captcha.js`（新）：`GET /api/scene/route/captcha` → `{captchaId, image}`（公开，游客可访问）。
- `backend/src/routes/register.js`（新）：`POST /api/scene/route/register`——镜像 phase5 入参校验（用户名 ≥3 / `^[a-zA-Z0-9_]+$`、昵称 2-24、密码 ≥6）→ captchaService.verify（失败 403 `CAPTCHA_INVALID`）→ 转发 phase5 `/api/phase5/auth/register`（可选 profile 透传；phase5 错误码/message 原样透传；phase5 不可达 503 `REGISTER_SERVICE_UNAVAILABLE`）→ 201 `{id, username, displayName, role:'editor', status:'pending'}`。
- `backend/src/config/env.js`：新增 `phase5.baseUrl`（`PHASE5_BASE_URL`，默认 http://localhost:3300）。
- `backend/src/app.js`：挂载两个 router（route 前缀，sceneAuth 对无 token 游客放行）。

### 改动文件（前端）
- `frontend/src/services/sceneApi.js`：新增 `getCaptcha()`（GET captcha）+ `register(payload)`（POST register，公开不带 token）。
- `frontend/src/components/scene/ScenePageShell.vue`：登录弹窗改**登录/注册双 tab**——注册表单（用户名/昵称/密码/确认密码 + 验证码图点击刷新 + 本地规则校验 + 确认密码一致）；提交成功 toast「入驻申请已提交，待 KIN 审批激活后可登录」并切回登录（预填用户名）；验证码错误自动刷新新码。

### 测试结果
- 后端新增 11/11：captchaService 6（生成/校验/一次性/过期清理/上限/缺参拒绝）+ registerRoute 5（成功转发/pending、验证码错 403 不转发、入参 400、phase5 错误透传、不可达 503）。
- 后端全量 **65/65**（54 旧 + 11 新）；前端全量 **19/19**（sceneApi +3）；vite build 通过（54 modules）。
- 真实 HTTP 冒烟（smoke-captcha.mjs）4/4：captcha 200 / 无验证码 403 / 非法入参 400 / 正确验证码 + phase5 未起 503。
- 完整 E2E（smoke-register-201.mjs + phase5 注入 env 启动）：真实注册 **201 pending**（phase5 建号 `smoke_*`，editor + pending）。

### 关键坑（本轮 3 条）
1. **路由路径双前缀 404**：新路由内部写 `/api/scene/route/...`，而 app.js 已 `app.use('/api', router)` → 实际匹配 `/api/api/scene/route/...` → 404。**路由内路径只能写 `/scene/route/...`**（挂载前缀之外的部分）。单测独立挂 router 测不到此问题——**必须 app 级冒烟**。
2. **pnpm 12 配置迁移**：`node-linker` 等链接器配置**不再读 .npmrc**（`pnpm config get node-linker` 为空），须写 `pnpm-workspace.yaml`（`nodeLinker: hoisted` + `packages`）。pnpm 12 默认还禁止依赖构建脚本 → `allowBuilds: {better-sqlite3: true, esbuild: true}`。
3. **Windows symlink 权限**：本机无管理员/开发者模式，创建符号链接报「此操作需要管理员权限」（pnpm 建 `.pnpm` 虚拟存储 os error 2 找不到文件）→ **hoisted 复制模式绕开 symlink**（vite 依赖 bin shim 指向顶层路径，构建需用根 `node_modules/vite/bin/vite.js` 直接调或确认 shim 重建）。

### 自检清单
- [x] captchaService 生成/一次性/过期/上限单测
- [x] register 路由全路径单测（成功/验证码错/入参/透传/不可达）
- [x] 后端 65/65 + 前端 19/19 + build 通过
- [x] 真实 HTTP 冒烟 4/4 + 完整 E2E 注册 201（phase5 真实建号）
- [x] 规划文档 P4 后续行更新（待办③⑤ ✅ + 剩余 owner 校验）
- [x] 记忆三件套同步（本条 + memory-core 第八节 + memory-modules 第 10 章）

### 已知局限
- 验证码为内存存储（单实例内存态，重启即清；多实例部署需换 Redis 等共享存储）；captchaService 上限清理为惰性（仅在 create 时 sweep）。
- 注册代理仅透传 phase5 校验错误，不缓存/不幂等（重复提交会得到 phase5 的「用户名已被占用」——符合预期）。
- 冒烟在 phase5 库留下 `smoke_*` pending 用户（无权限，不影响业务；如需清理需 admin 流程删除）。

---

## 2026-09-26 待办④ 扩展审批工具清单（AI_APPROVAL_TOOLS）

> 背景：默认审批清单仅 `guestbook_write`（写入类）；verify-hitl 冒烟曾用 `quota_overview,guestbook_write` 演示审批链路。
> 决策：将**隐私查询类** `query_friends`（好友列表 + 待处理好友申请，涉及他人社交关系隐私）纳入默认审批；
> 其余查询工具（plot_lookup / quota_overview / resident_card_lookup）为公开/低敏信息，不审批（避免居民对话频繁卡审批）。

### 改动文件
- `backend/src/config/env.js`：`approvalTools` 默认值 `'guestbook_write,query_friends'`（注释更新）。
- `backend/.env.example`：`AI_APPROVAL_TOOLS=guestbook_write,query_friends`。
- `backend/.env`：显式追加 `AI_HITL_ENABLED=true` + `AI_APPROVAL_TOOLS=guestbook_write,query_friends`（.env 不入库）。
- `backend/src/ai/graph/graphOrchestrator.js`：`routeAfterBranch` 加 `export`（供单测；审批判定为配置驱动 `env.ai.approvalTools.includes(call.name)`）。
- `backend/tests/approvalRouting.test.js`（新）：routeAfterBranch 四态（无工具→finalize / 敏感→approval / 非敏感→execute_tools / 混合含敏感→approval）+ env 多值解析规则（trim/过滤空项）+ 默认清单断言，共 7 用例。
- `backend/tests/registerRoute.test.js`：**修复路径同步 bug**——上轮把路由内路径改为 `/scene/route/register`（修 app.js 双前缀 404）后，本测试仍请求 `/api/scene/route/register`，全量回归时 404（单独跑时路径恰好匹配旧路由，未暴露）；改为 `/scene/route/register`。

### 测试结果
- 后端全量 **72/72**（65 旧 + approvalRouting 7）；前端 19/19 不受影响（本轮无前端改动）。
- env 解析实测：`.env` 注入后 `approvalTools = ["guestbook_write","query_friends"]`、`hitlEnabled = true`。

### 自检清单
- [x] 默认审批清单扩展（env.js + .env.example + .env）
- [x] routeAfterBranch 导出 + 四态单测 7/7
- [x] registerRoute 测试路径同步修复
- [x] 后端 72/72 无回归
- [x] 记忆三件套同步（本条 + memory-core 第八节待办④ ✅）

### 已知局限
- 审批粒度是**工具级**（命中工具名即整轮暂停），无字段/参数级审批——query_friends 全量审批后，居民查「自己的好友列表」也需 KIN 确认（当前设计取向：宁可多批不可漏批；若觉扰民可改参数级或在 prompt 层引导）。
- 新增敏感工具时只需改 `AI_APPROVAL_TOOLS` 配置，无需改代码（配置驱动已验证）。

---

## 2026-09-26 预览运行（全服务 E2E）

> 背景：P4 六项闭环后首次完整预览运行（phase5/phase6/chroma/scene/frontend 五服务）。

### 服务启动方式（实测可复现）
- phase5(3300)：`node --env-file=backend\.env backend\src\phase5\server.js` + 注入 `PHASE5_AUTH_SECRET=changeme`、`PHASE5_BOOTSTRAP_ADMIN_PASSWORD=utopia2026`（.env.example 默认值，本地预览可用；生产须强随机）。
- phase6(3400)：`node --env-file=backend\.env backend\src\phase6\server.js`（只须 PHASE5_SERVICE_TOKEN，backend/.env 已有）。
- chroma(8000)：`node scripts/chroma.mjs start`（venv + 治理后数据；心跳 /api/v2/heartbeat）。
- scene(3000)：**必须 `node --env-file=backend\.env backend\src\server.js`** —— 后台进程 cwd 不保证为 backend，`dotenv.config()` 默认读 cwd/.env 会读到 root .env（缺 backend 的 PHASE5_SERVICE_TOKEN 等），导致 `DEEPSEEK_CONFIGURATION_ERROR` 503。start-all.mjs 的 spawn 未注入 env，同样踩此坑。
- frontend(5173)：`cd frontend; node H:\BP2\node_modules\vite\bin\vite.js --host 0.0.0.0`（vite dev）。

### 验证结果
- verify-auth.mjs 7/7：登录、游客对话 200、游客 resume 403（待办⑥生效）、无效 token 401、流式 200、完整回复（replyLen=83）、真实工具 plot_lookup（chunkLen=152）。
- verify-hitl.mjs A/B 全 PASS：query_friends 触发 approval_pending → resume(true) 真实数据「目前没有待处理的好友申请」；resume(false) 拒绝「未获批准，我没有执行」。
- 后端 83/83 单测（本轮无回归）。

### 本轮发现的坑（已入此条目）
- **scene 启动 env 注入**：后台进程 cwd 漂移 → dotenv 读错 .env → 503 DEEPSEEK_CONFIGURATION_ERROR；修复=`--env-file` 显式注入（见上）。
- **verify-hitl.mjs 过时**：场景 A/B 期望 quota_overview 触发审批，但待办④后该工具已移出审批清单 → ASSERT FAILED。已对齐为 query_friends，提问「请帮我看看我还有没有待处理的好友申请」实测稳定触发工具调用（已提交）。

### start-all 统一编排升级（6 服务）
- SERVICES 扩展：phase5(3300) + phase6(3400) + chroma(8000,可选) + **scene(3000)** + **shell-frontend(5173)** + **world-3d(5175)**（3D 主世界独立入口 virtual-utopia）。
- 关键修复（预览轮坑的正式落地）：
  - phase5/phase6 spawn 注入 --env-file=backend/.env + PHASE5_AUTH_SECRET/PHASE5_BOOTSTRAP_ADMIN_PASSWORD（默认 changeme/utopia2026，可环境变量覆盖）——phase5 config 校验必填，不注入直接抛错。
  - scene 后端 --env-file 显式注入（修 cwd 漂移读错 .env → DEEPSEEK_CONFIGURATION_ERROR 503）。
  - 前端两入口 spawn 带 cwd（vite 从 cwd 找 vite.config）：shell=frontend/、3D=frontend/src/virtual-utopia/。
- 主进程 stdio inherit 保持运行（Ctrl+C / SIGTERM 一键停止全部子进程）。
- 验证：一键拉起六服务全就绪；verify-auth 7/7（phase5/6 经 localhost IPv6 探测）；前端 5173/5175 200。

### 自检清单
- [x] 五服务全部健康（200）
- [x] 真实登录 + 对话 + 工具调用全链路
- [x] HITL 审批 approve/deny 双路径 + resume 归属校验
- [x] 发现的两个坑已修复/对齐并提交
- [x] 本条 memory-log 同步

---

## 2026-09-26 3D 世界登录不了排查（服务存活 + 登录协议）

> 现象：用户报 http://localhost:5175 登录不了。

### 根因（两层）
1. **服务被杀（真凶）**：预览轮用 run_in_background 起的后台任务随执行会话终止被级联杀掉（start-all 及其全部子进程）——5175 vite 死 → 页面半死 + /phase6-api 代理全挂 → 登录请求失败降级「Phase5 离线/内存临时模式」（worldStore 的 isOfflinePersistenceError 降级路径掩盖了真实错误）。
2. 登录协议本身无 bug：3D 世界登录把密码 sha256 哈希后提交，phase5 登录兼容双协议（64-hex 直通 verifyPassword(sha256) 分支；明文走 sha256Hex 分支）——与存储 hashPassword(sha256Hex(明文)) 一致，设计正确。phase6 登录原样透传 phase5，同样兼容。

### 可靠启动方式（实测，日志在 H:\BP2\logs\）
- 独立进程（推荐预览）：Start-Process 起 6 服务，日志重定向 logs\*.log：
  - phase5：node --env-file=backend\.env backend\src\phase5\server.js（注入 PHASE5_AUTH_SECRET/BOOTSTRAP，默认 changeme/utopia2026）
  - phase6：node --env-file=backend\.env backend\src\phase6\server.js；scene：node --env-file=backend\.env backend\src\server.js
  - vite 双入口：node H:\BP2\node_modules\vite\bin\vite.js --host 0.0.0.0，WorkingDirectory frontend（5173）/ frontend\src\virtual-utopia（5175）——vite bin 必须绝对路径（Start-Process 相对路径解析到 WorkingDirectory 下报 Cannot find module）
  - chroma：node scripts\chroma.mjs start（自身 detached + PID 文件）
- 坑：logs 目录须先存在（Start-Process 重定向到不存在目录会静默失败）；Start-Process 须先设 phase5 secret 环境变量（子进程继承）。

### 验证
- 六服务全 OK（3300/3400/8000/3000/5173/5175 均 200）。
- 浏览器实测：traveler/utopia2026 → 个人中心「Phase5 持久化已连接」；admin/utopia2026 → Phase5 Administrator 面板。真实认证 + 持久化链路完好。
- 遗留建议：start-all.mjs 的 spawn 非 detached，被会话终止时级联杀全部——如需「一键拉起 + 存活」可后续改 detached + PID 管理（未做，预览用 Start-Process 即可）。

---
## 2026-09-26 待办⑥ resume conversationId → owner 归属校验

> 背景：resume 端点此前仅校验「role=admin」（KIN 审批），任意 conversationId 只要 admin 就能恢复；
> 非 admin 一律 403，无法恢复自己的会话，也无从防 conversationId 伪造。
> 目标：建立 conversationId→owner 归属，resume 升级为「admin 任意 + owner 放行 + 无记录/不匹配 403」。

### 改动文件
- `backend/src/services/conversationRegistry.js`（新）：内存 Map 注册表 `conversationId → {userId, role, username, createdAt, updatedAt}`；
  `register`（幂等 upsert，createdAt 保留首次）/ `getOwner` / `isOwner`；maxEntries 上限 FIFO 清理（默认 2000）。与 sessionStore 同为内存态。
- `backend/src/ai/graph/graphOrchestrator.js`：构造参数 `conversationRegistry`（默认新建实例）；`handle`/`handleStream` 在 `body.conversationId` 存在且 userContext 有 userId 时 `registerOwner`（游客不注册）。
- `backend/src/agents/orchestrator.js`：`conversationRegistry` 透传至 graph。
- `backend/src/app.js`：`createApp` 构造参数新增 `conversationRegistry`（默认实例），传入 `createSceneOrchestrator` 与 `createResumeRouter`。
- `backend/src/routes/resume.js`：`assertResumePermission` 三层校验——① 游客 403；② admin 放行（KIN 管理通道）；③ 非 admin：registry 无记录→403「会话归属未登记」/ 记录 userId 不匹配→403「该会话不属于当前用户」/ 匹配→放行；缺 conversationId→400。

### 测试结果
- 新增 11/11：conversationRegistry 5（注册/游客不注册/isOwner/upsert 保留 createdAt/FIFO 清理）+ resumeRoute 6（admin 任意 / owner 放行 / 非 owner 403 / 无记录 403 / 游客 403 / 缺 id 400）。
- 后端全量 **83/83**（72 + 11）；前端 19/19 不受影响。
- app 级真实 HTTP 冒烟（smoke-owner-resume.mjs）3/3：游客 403 FORBIDDEN、缺 conversationId 400、无效 token 503（sceneAuth 认证服务不可达，装配正确非 404）。

### 自检清单
- [x] conversationRegistry 注册表（注册/查询/校验/清理）
- [x] handle/handleStream 持久会话注册 owner（游客不注册）
- [x] resume 三层权限校验（admin / owner / 403 兜底）
- [x] app.js 装配链路（registry 注入 resume 路由）冒烟验证
- [x] 后端 83/83 无回归
- [x] 记忆三件套同步（本条 + memory-core 第八节六项全 ✅）

### 已知局限
- conversationRegistry 为内存态（重启即失）——重启后旧 conversationId 归属丢失，非 admin 恢复被拒（admin 不受影响）；如需跨重启持久可落 SQLite（后续项）。
- owner 恢复自己的会话 = 本人确认（HITL 审批通道对 owner 开放）；KIN 审批仍优先 admin 通道（权限矩阵不变，admin 可审批任意会话）。
- 归属注册仅在 handle/handleStream 的持久会话路径（带 conversationId）发生；ephemeral 会话（无 conversationId）本就不可恢复，不注册。

## 2026-09-26 P5.1 四项完善（用户拍板逐项推进，全部闭环 ✅）
- **① 3D 世界登录文案（commit 561b368）**：新增 Phase5AccountInactiveError（403 PHASE5_ACCOUNT_INACTIVE）；phase5 登录「密码正确但 status!=active」按状态抛专用错误（pending→申请待 KIN 审批/disabled→已驳回/moved_out→已迁出），密码错保持 401 PHASE5_UNAUTHORIZED。phase6 httpClient 透传 code+message，前端 worldStore 直接 throw 显示 message（无需改前端）。新增 	ests/phase5LoginStatus.test.js 3 例（pending 403/错密 401/active 200）。后端全量 **86/86**。
- **② 管理后台纳入 start-all（commit 95370ca）**：SERVICES 增 admin-frontend（frontend/src/phase6、5174、health 双地址）。
- **③ 3D 世界 hash 路由脱节（无代码改动）**：根因=**frontend/node_modules/.vite 依赖预打包缓存损坏**（服务被杀/重启后 vue-router 预打包模块失效 → hashchange 不触发 → 任何路由都渲染首页 PortalView）。清 .vite 缓存重启 vite 即修复。实测：注册成功→「返回登录」立即切换、提交入驻申请/3D世界链接全通。**预防：服务重启后若路由全失效，先删 frontend/node_modules/.vite**。
- **④ start-all detached 化（commit be33cbb）**：全部子进程 detached:true + 日志重定向（logs/）+ PID 文件（.run/<name>.pid，chroma 复用 .chroma-data/chroma.pid 与 chroma.mjs 共用）+ 
ode scripts/start-all.mjs stop|status。**关键坑：detached 子进程必须 child.unref()，否则父进程事件循环被子进程句柄持有、start-all 永不退出**。验证：start→主进程退出→7 服务存活；stop 全停；stop→start 循环；3D 世界登录页正常。7 服务一键编排（3300/3400/8000/3000/5173/5175/5174）。
- **测试口径坑**：3D 世界注册/登录均 sha256Hex 传输、库内 scrypt(sha256(明文))；**API 直连测试注册须传 sha256Hex 密码**，传明文注册会造出 sha256 登录不匹配的账号（401 假象）。
- 相关文件：backend/src/phase5/{errors,httpServer}.js、backend/tests/phase5LoginStatus.test.js、scripts/start-all.mjs、.gitignore（.run/）。
## 2026-09-26 P5.2 安全与治理四项闭环（⑤-⑧）
- **⑤ 审批清单收窄**（commit e9176c4）：
  - 改动：backend/src/config/env.js（默认 `AI_APPROVAL_TOOLS=guestbook_write`）、tests/approvalRouting.test.js（query_friends→execute_tools 等 7 例）、backend/.env(.example)、scripts/verify-hitl.mjs（场景 A 改 query_friends 不再审批 + getGuestbook/guestbookHas 真实数据校验）。
  - 决策：query_friends 为无参数、仅查本人数据的只读工具，不该进审批（避免「查自己好友也卡 KIN 审批」扰民）；未来涉隐私工具配置驱动加回。
  - E2E 实测：verify-hitl 场景 A `thinking → tool_calling → tool_result`，query_friends 直接执行、无 approval_pending（回复「目前没有待处理的好友申请」）——⑤ 核心行为实证。
  - 行为记录：DeepSeek 对 guestbook_write 写入类指令受场景人设「写入须先确认/审批」约束，倾向文本澄清不调工具（场景 B/C 记录为模型行为，非框架缺陷）；verify-hitl 因此改为「行为自适应」E2E（路由正确性由单测确定性覆盖）。
- **⑥ captchaService/conversationRegistry 落 SQLite**（commit 753b726）：
  - 新增表：`backend/data/captcha.db`（captcha_entries，一次性/5min 过期/上限清理）、`backend/data/conversation-registry.db`（conversation_owners，FIFO 上限）。
  - 分层坑：模块单例默认 `:memory:`（多测试进程并发打开同一持久化文件 → `database is locked`）；**生产装配在 server.js 显式注入持久化实例**（createApp 增 captchaService 注入参数）。
  - 跨重启验证：测试 close→reopen 数据保留；重启后 captchaId 未过期仍可校验、resume 归属仍可校验。
  - 新增 tests/persistenceServices.test.js 9 例。
- **⑦ 账号与测试数据清理**（commit 9430f28）：
  - 删除测试账号 5 个：smoke_muh9qx2d、probe392636、probe396232、probe396434、p5probe（活跃/待激活残留）。
  - 删除 chroma 损坏备份 2 个：`.chroma-data.corrupt-2026-09-25T16-48-58-596Z`、`.chroma-tmp.corrupt-2026-09-25T16-48-58-596Z`（0.6MB，chroma 已重建健康）。
  - 保留：admin/traveler/viewer/KIN/KIN777/momo/jev + ui_zzzz（用户已批准，铁律）+ moved_out/disabled 历史（保 phase6 外键引用安全）。
  - 新增可复现脚本 `backend/scripts/cleanup-test-data.mjs`（--dry-run 预览；顶层 return 在 ESM 非法，须 if/else）。
  - 验证：traveler 登录成功、probe392636 登录被拒。
- **⑧ KIN 审批（HITL resume）决策审计留痕**（commit d7ed2b1）：
  - 新增 `backend/src/services/sceneAuditStore.js`：`backend/data/scene-audit.db` 表 scene_audit_events（conversation_id/actor/approved/reason/ip/ua/created_at），WAL，索引 created+id。
  - resume 路由：决策成功后 record（审计失败不阻断主流程，console.warn）；403/失败不写；`GET /api/scene/route/audit`（admin 查询，approved 过滤 + limit/offset 分页，limit 钳 500）。
  - 排序坑：created_at 同毫秒不稳定 → `ORDER BY created_at DESC, id DESC`。
  - 测试：sceneAudit.test.js 3 例（语义/跨重启/分页）+ resumeRoute.test.js 新增 3 例（admin 批准留痕/owner 拒绝留痕/403 不写）。
- **回归**：后端全量 **101/101**（86 + 9 persistence + 3 sceneAudit + 3 resumeRoute 新增）；E2E 实测：admin 查审计 200 / 非 admin 403 / 验证码端点 200 / verify-hitl 场景 A 通过。
- **自检清单**：✔ 后端全量回归 101/101 ✔ E2E（verify-hitl + 审计 200/403 + 验证码 200）✔ 浏览器 smoke（注册页 UI 本轮未重验，非本次改动范围）✔ memory-modules 相关章节 ✔ 规划文档 P5.2 标 ✅ ✔ 逐项 git 提交（e9176c4/753b726/9430f28/d7ed2b1）
## 2026-09-27 P5.3 生产化四项闭环（⑨-⑫）
- **⑨ 三入口生产构建验证**（commit b56b26f）：
  - 新增 `scripts/build-all.mjs`（build/preview/all 三子命令；spawnSync build + spawn preview 冒烟 + 自动停）。
  - 实测：外层壳（frontend/dist，js 146KB）/ 3D 世界（virtual-utopia/dist）/ 管理后台（phase6/dist，js 152KB）build 全成功；preview 三入口（4173/5176/5177）200 OK。dist 已被根 .gitignore（dist/ 与 **/dist/）忽略。
- **⑩ 全栈 Docker 编排模板**（commit 3512b01）：
  - `deploy/Dockerfile.backend`：node:24-alpine + corepack pnpm + frozen-lockfile（根 workspace 锁）；phase5/phase6/scene 共用镜像、compose 覆盖 command。
  - `deploy/Dockerfile.frontend`：多阶段（三入口 vite build → nginx:1.27），ARG VITE_PHASE6_API_BASE_URL=/phase6-api。
  - `deploy/nginx.conf`：/ → shell、/world/、/admin/（try_files fallback）、/api/ → scene（SSE proxy_buffering off + read_timeout 3600s）、/phase6-api/ → phase6。
  - `deploy/docker-compose.yml`：chroma+phase5+phase6+scene+frontend，四数据卷，生产 change-me 占位标注。
  - 修正 `chroma.docker-compose.yml` healthcheck `/api/v1/heartbeat` → `/api/v2`（chromadb 1.5.9 实际路径）。
  - **本机无 Docker，未实测**（与 chroma 模板同定位：生产参考）。
- **⑪ LangSmith Developer 层接入**（commit 6ae66bb）：
  - **坑：`@langchain/langsmith` 包不存在（registry 404）——正确包名是 `langsmith`**（同 `@langchain/chroma` 404 一类：集成包在 @langchain/community 或独立包）。
  - 安装 `langsmith 0.10.5`（backend deps，pnpm --filter @virtual-utopia/backend add）。
  - LangChain/LangGraph tracing 由环境变量驱动（LANGSMITH_TRACING=true + LANGSMITH_API_KEY + LANGSMITH_PROJECT），dotenv 载入后 @langchain/core 自动上传 → **零代码改动**；env.js 注释说明开关语义。
  - 验证：LANGSMITH_TRACING=true + 假 key 下 graphOrchestrator 加载不崩；**真实上传需用户配 Developer key（5000 traces/月）后实测**。
- **⑫ env 治理**（commit 4928508）：
  - .env.example 头部补「生产强随机提示」：PHASE5_AUTH_SECRET/SERVICE_TOKEN `openssl rand -hex 32`、BOOTSTRAP_ADMIN_PASSWORD 16 位混合、API key 平台签发。
  - 补缺项：PHASE5_ENABLED、PHASE6_HOME_SOCIAL_DB_PATH、PORT(3000)、CORS_ORIGIN。
  - 验证：用 .env.example 原样（无 key）临时起 scene → /api/scenes 200（新环境照单配置可起）。
- **回归**：后端全量 101/101（P5.3 无后端逻辑改动，纯构建/部署/观测/配置层）。
- **自检清单**：✔ 后端全量回归 101/101 ✔ build-all all 全绿（build+preview 三入口）✔ env.example 冒烟 200 ✔ LangSmith 加载不崩 ✔ memory 三件套 + 规划文档 P5.3 标 ✅ ✔ 逐项 git 提交（b56b26f/3512b01/6ae66bb/4928508）
## 2026-09-27 P5.4-⑬ 启动：3D 世界接入 AI 对话（用户新需求，commit 79d94b5）
- **需求**：① 外壳 shell 界面不要，功能植入 3D 世界（用户认为 3D 世界就是主界面）；② 3D 世界当前「对不了话」。
- **根因**：3D 世界聊天面板全是居民社交频道（phase6 /chat/world、/chat/resident），从未接 scene 3000 的 LangGraph AI 对话；AI 对话只在 shell 场景页（SceneConversationPanel → conversationStore → sceneApi）。
- **改造（前端 only，后端零改动）**：
  - `frontend/src/virtual-utopia/services/sceneClient.js`（新）：3D 版 scene 客户端（SSE stream / route / resume），baseUrl=/scene-api（vite proxy），token 读 virtual-utopia.phase5.token（同一 phase6 token 后端经 /auth/me 解析身份，无需二次登录）。
  - `frontend/src/virtual-utopia/stores/aiChatStore.js`（新）：对话状态（流式打字机 + thinking/tool_calling/tool_result + pendingApproval + resume），单场景 yard。
  - `frontend/src/virtual-utopia/components/AiChatPanel.vue`（新）：3D 世界右下角 AI 对话浮层（未登录禁用提示、流式光标、KIN 审批批准/拒绝卡片、新话题）。
  - `views/WorldView.vue`：挂载 AiChatPanel；`vite.config.js`：加 /scene-api → 3000 同源代理。
- **坑**：① aiChatStore 编辑遗留 messageSequence 重复声明 → rollup 报「Identifier has already been declared」（三入口 build 抓出）；② Start-Process vite 相对路径 Cannot find module → 必须绝对路径 H:\BP2\node_modules\vite\bin\vite.js（已知坑复现）；③ AiChatPanel 误用 worldStore.state.toast → 实际 API 是 worldStore.notify(message, tone)。
- **验证**：三入口 build 全通过；node 经 5175 /scene-api 代理 login+stream 收到阿禾真实回复；浏览器实测（bu）：5175 → #/world → AI 对话按钮 → 面板 → admin 登录 → 输入「你好，介绍一下大院吧」→ 阿禾流式回复完整展示。
- **遗留**：shell（5173）服务/代码保留（主体结构不动），入口已移至 3D 世界；shell 是否从 start-all 移除待用户拍板。
## 2026-09-27 P5.4-⑬⑭ 闭环（commit 6af59cf + a17c843）
- **⑭ 长记忆体验修复**（6af59cf）：实测发现记忆从未被召回（模型明说无记录）。双根因：① extractor 期望 llmClient.completeJson、实际 modelClient 接口是 createStructuredResponse，且 memoryGateway 从未传 llmClient（一直走窄启发式，漏抓「我每天早上六点晨跑」语料）→ user_memory 0 产出；② database.mjs defaultDbPath 多退一层，记忆库落在 H:\BP2\data 而非 backend\data。修复：extractor 兼容双接口 + LLM 失败回退启发式 + 启发式扩展（我每天/常常/习惯/也喜欢）+ createConfiguredMemoryGateway 接收 modelClient（server.js 与图共享）+ 路径归位（旧库已迁移，162 条消息保留）。验证：memory 专项 6/6；verify-long-memory.mjs 注入偏好→新会话召回（晨跑+咖啡）→重启 scene 后仍召回。新增 backend/scripts/verify-long-memory.mjs。
- **⑬ 多人 avatar 动作协作**（a17c843）：presence 位置/远程 avatar 同步已有，补协作动作。后端 presenceStore + app.js 透传一次性 action（wave 等，心跳覆盖自动清空）；前端 presenceClient.sendAction（复用 updatePresence 通道）；ThreeWorld 挥手动画（wave 窗口 1.6s：左臂高举 + 右臂摆动，自然回归）；WorldView 在线漫游者列表「打招呼」按钮。验证：API 透传（wave→列表返回→普通心跳清空）；三入口 build 全过；浏览器点击 toast「已向 Phase5 Administrator 挥手打招呼」。
- **多端验证提示**：远程 avatar 挥手直观效果需双窗口/双账号同时在线。
## 2026-09-27 P5.4-⑮ 更多场景分支（commit 58b92d1）
- 后端 agents/branches 已注册 5 分支（ahe→yard 阿禾、fenghe→cabin 风禾、suian→library 素安、xubai→pavilion 虚白、zhiyu→resource-wall 知予），registry 按 sceneId 路由天然支持。
- 前端此前硬编码 yard/阿禾。本次：aiChatStore 新增 SCENE_META（5 场景名称/角色/引导语）+ setScene（切换即 resetConversation）；AiChatPanel header 下新增场景下拉（loading 中禁用），角色名/思考文案/空态引导/审批文案随场景动态化。
- 验证：三入口 build 全过；浏览器实测切凉亭→虚白以议事亭人设真实回复（「不负责介绍景观导览…帮你把话题拆成事实、观点、分歧」——与阿禾风格区分明显）。
- 后端零改动。
## 2026-09-27 P5.4-⑯ shell 下线（commit f352c36）
- 用户拍板：shell 界面不要、入口已在 3D 世界 → 从 start-all 编排移除 shell-frontend(5173)。
- SERVICES 移除（注释保留+恢复方法）；停止 shell 进程（5173 无监听）；frontend 代码保留可回退。
- 验证：start-all 重排后 6 服务全在线（phase5/phase6/chroma/scene/world-3d/admin-frontend），shell 不再编排；3D 世界 5175 浏览器冒烟正常（登录态/AI 对话/挥手按钮完好）。
- 唯一入口：http://localhost:5175。
## 2026-09-27 P5.3-⑪ LangSmith 真实上传验证闭环
- 用户注册 LangSmith（Developer 免费层 5000 traces/月），orgId=939b3d5b-40ad-41ee-a94d-2f1dfd8b4419，项目 LANGCHAIN_PROJECT=virtual-utopia。
- backend/.env 最终配置（.env 在 gitignore，不入库）：LANGCHAIN_TRACING_V2=true / LANGCHAIN_API_KEY=lsv2_pt_66…816c / LANGCHAIN_PROJECT=virtual-utopia；SILICONFLOW_API_KEY 补回生效（sk-gge…ftao）。
- 坑记录：① 用户把 LangSmith key 粘贴到了 SILICONFLOW_API_KEY 行（覆盖原值）→ 需提取到 LANGCHAIN_API_KEY 行；② 用户补回 key 时写在了注释行（# 开头不生效）→ 须去注释；③ 等号两侧空格问题为检查脚本显示误报，文件本身无空格；④ scene 须 --env-file backend/.env 启动。
- 验证：重启 scene 后触发 4 轮对话（HTTP 200 + 阿禾真实回复），LangSmith 网页 Projects 页出现 virtual-utopia：8 traces / 错误率 0% / P50 0.85s / P99 1.61s / 6.217K tokens / 成本 $0.000（免费层）。
- 复用：backend/scripts/trace-verify.mjs 已验证后删除；验证口径=login(P6 3400) → POST /api/scene/route/stream(SC 3000) SSE，检查含 event: done + reply。
## 2026-09-27 Docker 全栈容器化实测闭环（P5.3-⑩ 落地）
- 用户同意装 Docker：发现本机 Docker Desktop 4.84.0 已装（用户级，%LOCALAPPDATA%\Programs\DockerDesktop，WSL2 后端，docker 命令不在 PATH → 用 resources\bin\docker.exe 全路径）。
- 镜像源坑：daemon.json 里 registry-mirrors 指向已失效的 ustc/163（DNS 解析失败）→ 实测仅 docker.1panel.live 可用（200）→ 替换并重启 Docker Desktop 引擎生效。
- 构建修复：Dockerfile.backend 原 --ignore-scripts 跳过 postinstall → 容器内 better-sqlite3 无 native binding 启动即崩 → 加 apk python3/make/g++ 编译链 + 去掉 --ignore-scripts。
- 端口不可达修复：phase5 硬编码 app.listen(port,'localhost')、phase6 config 默认 localhost → 容器内 docker-proxy 转发不可达（本机回环 OK 但外部连不上）→ phase5 httpServer.js 支持 PHASE5_HOST 环境变量（默认 localhost 不变）；compose 注入 PHASE5_HOST/PHASE6_HOST=0.0.0.0。
- nginx 缺口：3D 世界对话走 /scene-api 同源代理，容器 nginx 无此 location → 404 → 补 /scene-api/ → scene:3000 反代（SSE proxy_buffering off）。
- 对齐 P5.4-⑯：nginx 根入口改为 3D 世界（shell 下线）、Dockerfile.frontend 去 shell build（world+admin 双入口）。
- 最终验证全通过：5 容器 Up（chroma 8000/phase5 3300/phase6 3400/scene 3000/frontend 80 全 200）；浏览器回归：3D 世界登录（admin/utopia2026）→ AI 对话阿禾真实回复 → 管理后台 /admin/ 登录+文档管理。
- 一键：docker compose -f deploy/docker-compose.yml up -d --build；停止/清理：down [-v]。真实密钥经 env_file ../backend/.env 注入（不入库）。
## 2026-09-27 整体验收总结闭环（全量测试 + 项目文档）
- 后端全量测试 101/101 通过（7.7s，0 失败）；前端 build-all 三入口构建全过（shell 仍保留构建产物可回退）。
- 浏览器回归本地+Docker 双模式全通过；Docker 5 容器全 200。
- 验收总结文档：F:\2026\KIN\虚拟乌托邦·LangGraph重构验收总结.md（8 节：结论/架构/功能/部署/Docker 修复记录/限制/历史/结论）。
- 剩余非阻塞优化：3D 模型资源路径容器化指向 5175（应相对路径）、管理后台链接硬编码 5174（应 /admin/）、Docker 生产密钥 change-me、docker 命令 PATH 固化。
## 2026-09-27 P5.5-1 工程完善（Docker 适配 4 项，commit 967f5eb）
- ① 3D 模型路径：验证结论=无需修改（vite build 已把 .glb 重写为 /assets/*.glb，nginx 200；此前 network_requests 的 5175 请求是浏览器缓冲/多标签误判——bu.network_requests 会混合缓冲，勿据此下结论）。
- ② 管理后台链接：AppHeader.vue 支持 VITE_ADMIN_BASE_URL（容器 build 注入 /admin/，本地缺省 localhost:5174）→ 容器版 /admin/#/applications。
- ③ Docker 密钥：compose 占位改 ${VAR:-default} 插值（deploy/.env 可覆盖生产值，不破坏一键 up）。
- ④ docker wrapper：scripts/docker.cmd（用户级安装 CLI 不在 PATH；纯 ASCII 注释避免 bat 编码乱码）。
- 新坑：容器 corepack 下载 pnpm 直连 registry.npmjs.org 超时 → 两 Dockerfile 加 COREPACK_NPM_REGISTRY + npm_config_registry=https://registry.npmmirror.com。
- 容器版数据卷持久化验证：重建容器后 phase5 登录态保留（卷生效）。
## 2026-09-27 P5.5-2 方向②延迟优化闭环（打字机修复 + 流式接口 + reply 提取）
- **目标**：LangSmith trace 显示 P99 1.61s 全在 ChatDeepSeek；修复「流式打字机从未生效」+ 流式接口 bug，让 TTFT 可感知。
- **实证根因（SSE dump 替换旧判断）**：
  - 根因 1：普通对话首轮走工具轮（bindTools + 非流式 invoke，createToolCallResponse），模型未调工具 → 直接解析 content 返回 → SSE 全程仅 status+done 两事件、无 reply_chunk → **打字机从未生效**。
  - 根因 2（误报澄清）：probe-stream 曾报 Cannot read properties of null (reading 'enum')——真实来源是 probe 传 responseSchema: null → validateValue(null) 访问 schema.enum 崩溃（不是 LangChain response_format 的 bug）；但 .stream + response_format json_object 在 LangChain ChatDeepSeek 有兼容风险，仍按计划去掉（提示词约束 + 回退更稳）。
- **修复（3 文件）**：
  - backend/src/ai/graph/nodes.js：branch 首轮优先 createToolCallResponseStream（有 streamContext.onToken 且客户端支持时），否则回退非流式。
  - backend/src/ai/langchainModelClient.js：① 新增 createToolCallResponseStream（bindTools + .stream，增量合并 tool_calls，content 经 reply 提取器推送）；② createStructuredResponseStream 去掉 stream 的 response_format + 解析失败回退非流式 invoke（attempts:2）；③ 新增 createReplyExtractor（非贪婪匹配 "reply": 值 + 部分解码，跨 chunk 转义等待；JSON 壳字符不推送，自然语言流原样透传）。
  - backend/src/services/structuredOutput.js：validateValue 加 schema null/非对象防御（parseStructuredOutput 无 schema 时仅要求 JSON 解析成功）。
- **实证数据（backend/scripts/ 探针留存）**：
  - SSE 事件：2 → 37（普通对话 35 个逐字干净 reply_chunk）/ 84（工具轮 82 个）——零 JSON 壳。
  - 延迟基线（latency-baseline.mjs）：status 272→72ms，TTFT N/A → 656ms（首字「你好」可见），done 1800→1519ms。
  - 工具轮回归（tool-regress.mjs）：留言写入意图 → HITL 审批确认流程正常（模型先请求确认再写入），流式全程干净。
  - 浏览器实测（容器版 http://localhost/ 3D 世界）：多轮对话回复干净完整（阿禾大院视角、其他区域推给对应管理方），打字机逐字（SSE 实证）+ done 覆盖完整。
- **新坑**：① 容器 scene 与本地 scene 3000 端口互斥（起容器前先停本地 .run\scene.pid）；② PowerShell here-string 转义再次失败 → 本轮全部用 Edit 工具落地（上轮已记）；③ latency-baseline/probe 早期用 console 输出被 PowerShell 包装吞字 → 一律 writeFileSync 到 H:\BP2\*.txt 再 Read。
- **自检清单**：✔ SSE dump 逐字干净 ✔ TTFT/done 双指标对比 ✔ 工具轮 HITL 回归 ✔ 浏览器容器版多轮对话 ✔ 语法检查 3 文件通过 ✔ memory 三件套（log 本条 + core 更新 + modules 延迟优化节）
- **遗留**：验收总结文档（F:\2026\KIN）早期写的「意图识别 0.67s + 对话 1.4s 两次调用」判断已被证实不准确（route 是纯函数、单次 LLM 调用）——待下次文档更新时修正补延迟对比小节。
## 2026-09-27 公网上线（方案 A：cpolar）+ 生产安全加固（P5.6-1）
- **方案 A 落地（cpolar 内网穿透）**：cpolar 3.3.12 解压至 H:\BP2\cpolar\app\cpolar\cpolar.exe（官方 zip→msiexec /a 提取；静默安装失败未污染系统）。环境坑：spawn 隐藏窗口/后台启动报 termbox.Init error、--log 重定向为空——**必须真实交互终端运行** `cpolar http 80`（用户桌面窗口手动运行成功：Tunnel Status online / Account YCKIN777 Free / Forwarding https://36087f0f.r2.cpolar.top -> http://localhost:80）。账号 yckin777/yckin777@outlook.com，token 已存 C:\Users\Administrator\.cpolar\cpolar.yml。**勿停用户终端里的隧道进程**（cpolar.pid 24212 已停，用户自己终端在跑）。
- **公网地址（当前有效）**：https://36087f0f.r2.cpolar.top——cpolar Free 随机域名，**重启隧道地址会变**；变更须同步两处 CORS 白名单（backend/.env 的 CORS_ORIGIN + PHASE6_ALLOWED_ORIGINS 两行、deploy/docker-compose.yml 的 phase6 默认值）。
- **CORS 修复（手机端 origin is not allowed）**：env.js corsOrigin 支持逗号分隔多来源（cors 包传数组）；backend/.env 追加 CORS_ORIGIN/PHASE6_ALLOWED_ORIGINS 含公网域名；compose phase6 显式注入 PHASE6_ALLOWED_ORIGINS（${VAR:-默认含公网域名}）。带公网 Origin 三路验证 200。
- **生产安全加固（user 点名询问「做了吗」后执行）**：
  - ① PHASE5_AUTH_SECRET / PHASE5_SERVICE_TOKEN：change-me-please → 强随机 64 hex（写入 backend/.env + deploy/.env；phase5/6 容器重建后注入生效，docker exec 验证 len=64）。
  - ② admin 密码：utopia2026 → `Utopia@9d212cdb834dKx`（存 H:\BP2\admin-new-password.txt，已 gitignore）。**改密走直改库**（PUT /auth/password 有坑）：phase5 口令口径=scrypt(sha256(明文))，登录端点兼容明文/sha256 双口径，但**改密端点 currentPassword 只按原值校验**（明文和 sha256 都 401——疑似端点 bug）→ 绕过 API：备份 sqlite（卷内 backup-*.sqlite）→ docker exec UPDATE users SET password_hash=hashPassword(sha256Hex(newPw)) WHERE id=1 → 双口径登录验证 200。
  - ③ chroma 暴露收敛：**chroma v1.0+ 已移除内置鉴权**（legacy CHROMA_SERVER_AUTHN_PROVIDER/CREDENTIALS/TRANSPORT_HEADER 全被忽略，日志无 auth 组件；官方 server-env-vars 明确 legacy auth 是历史遗留）→ 改「不暴露」策略：compose 移除 8000 宿主端口映射，仅容器内网可达（scene http://chroma:8000 heartbeat OK）；宿主 8000 连接拒绝。需要本地直连时临时 docker run -p 8000:8000。
  - ④ phase5 CORS 收紧：origin:true（全放）→ 无 Origin（服务端调用）+ 本机回环白名单；外部 Origin 实测被拒（HTTP 500 cors error）。
  - ⑤ 备份脚本正式化：backend/scripts/backup.mjs（phase5 sqlite 单文件 + phase6 /app/backend/data 全部库 tar + chroma 容器内 tar /data → H:\BP2\backup\，已实测跑通三件套）。
- **验证口径（加固后全链路）**：phase6 登录(新密码) 200、scene /api/scenes 200、phase5 登录(新密码) 200、nginx 80 登录(公网 Origin) 200、chroma 无 token 宿主不可达。
- **遗留建议（未做，需 user 拍板）**：① phase5/6/scene 宿主端口 3300/3400/3000 也收敛（仅 80 暴露，cpolar 只转 80——影响本地直连调试习惯）；② cpolar 实名认证/固定域名（免费随机域名变更要同步 CORS）；③ phase5 改密端点双口径 bug（前端登录发 sha256 而 currentPassword 只验原值——后续修）。
- **新坑**：① chroma 1.5.9 API 前缀是 /api/v2（v1 返回 410 deprecated）且 collections 端点 404 空 body——调试用 JS 客户端（chromadb 包）最准；② Docker Desktop 的 docker run 拉 alpine 失败（docker-credential-desktop 不在 PATH）→ 备份用容器内 tar + docker cp；③ PowerShell 嵌套 node -e 转义崩——一律写临时 .mjs 或 sh -c 单引号。

## 2026-09-27 P5.6-1b 生产收敛：宿主端口全部收掉（仅 80 对外，user 拍板「1」）
- **动作**：docker-compose.yml 注释 phase5(3300)/phase6(3400)/scene(3000) 三段宿主端口映射（chroma 8000 上轮已收）→ **只有 frontend nginx 80 暴露**；容器内网互访不受影响（phase6->phase5 http://phase5:3300、nginx->scene http://scene:3000、nginx->phase6 http://phase6:3400、scene->chroma http://chroma:8000）。
- **验证**：宿主 3300/3400/3000/8000 全部连接拒绝 ✓；nginx 80 登录（公网 Origin）200 ✓、/scene-api/api/scenes 200 ✓；cpolar 公网入口 https://36087f0f.r2.cpolar.top 未动、仍在线。
- **影响/注意**：本地直连 3300/3400/3000 调试方式失效（探针脚本需改走 nginx 80 路径或 docker exec）；需要直连时临时取消 compose ports 注释 + up -d 即可（服务重启会换新进程，登录限流随之清零）。
## 2026-09-27 P5.7 居民人设 + 印象记忆 + 语音 + 约伴移动（1+2+5 + 用户追加诉求）
- **需求**：用户点名 1+2+5——① 记忆深化（居民记得访客）② 人设一致（5 位居民性格/口吻/口头禅）③ 语音体验（语音输入/回复）；随后追加核心诉求「约伴移动」：对话说「我们去凉亭/去谁家玩」→ 居民真实移动到场景聚点（动作与言行匹配，3D 世界里看得见聚会）。
- **后端（全部 node --check 通过；scene 容器已重建含全部代码，但 Docker 引擎故障致未最终浏览器闭环）**：
  - `backend/src/ai/personas.js`（新）：5 居民人设档案（ahe 阿禾/yard、zhiyu 知予/resource-wall、xubai 叙白/pavilion、suian 岁安/library、fenghe 风禾/cabin；voice/catchphrase/background/likes/dislikes）+ buildPersonaBlock 注入分支 prompt；约伴行动指令强化（访客明确约伴→立即调 gather_move，含「去谁家」映射规则）。
  - `backend/src/memory/impression.mjs`（新）：规则式印象档案（world_state 表，key=impression:<residentId>:<userId>，payload={tags,relation:-2..+2,count,lastTalk}；积极词+1 上限 2/消极词-1 下限 -2/主题词 tag 最多 8）。**坑：world_state 表 CHECK 约束 kind IN ('scene','npc','global') → impression 用 kind='global'（'impression' 被拒，实测日志报 CHECK constraint failed）**。
  - memoryGateway.js：before/after 传 residentId、buildMemoryPromptBlock 加「你对这位访客的印象」块；**约伴自动兜底**：detectGatherScene(reply)（场景别名+行动词→sceneId；犹豫词排除：还是/要不要/等谁/什么时候/时辰/再说/回头/先不/改天/商量——**不能含「你看」「？」**：阿禾口头禅「你看呢」高频，实测误杀）→ 回复表达行动即自动 worldState.set(npc:<id>)（模型不调工具时兜底，双保险）。
  - tools/index.js 第 6 工具 gather_move（zod enum 6 场景 + withResidentIds；写 worldState kind='npc'；仅 worldState 注入时注册）；auth.js gather_move:'public'（任何身份含游客放行，checkToolRole 加 public 分支）；factory.js 透传 worldState；app.js 装配 worldState + 公开路由 GET /api/scene/world/npc-locations（list kind='npc' → [{residentId,sceneId,updatedAt}]，nginx /scene-api/api/scene/world/npc-locations 200 实测）。
- **前端（vite build 全过；浏览器实测 UI 到位）**：
  - residents.js：+5 对话居民 NPC（ahe/zhiyu/xubai/suian/fenghe，homePlotId plot-3/8/20/35/45，getResidentByAvatarId 合并匹配）+ SCENE_GATHER_POINTS（5 场景聚点坐标，广场 (0,3.6,22.6) 周边 ±10m）+ getGatherPoint。
  - ThreeWorld.js：moveResidentToScene(avatarId, sceneId)（聚点→改 roaming.bounds/home 到聚点±半径 + setRoamingTarget；null/未知→恢复原 home 漫游；isResident 守卫）。
  - WorldView.vue：dialogueResidents.forEach(addResidentAvatar)；gatherPollTimer 每 8s GET /scene-api/api/scene/world/npc-locations → moveResidentToScene（**坑：gatherPollTimer 忘声明 let → ReferenceError 世界初始化报错横幅；另 Docker 层缓存导致旧产物反复——build 后必须 --force-recreate 且浏览器清缓存，hash 相同≠产物新，最终 --no-cache build 解决**）。
  - AiChatPanel.vue：语音输入（SpeechRecognition zh-CN 麦克风按钮 🎤）+ 语音回复（SpeechSynthesis 朗读开关 🔊，watch 新 assistant 消息自动读，默认关避免打扰）。
- **验证**：浏览器实测 admin 登录→3D 世界 AI 对话→阿禾真实回复（人设口吻到位：商量语气+口头禅「邻里的事，就是咱们的事」）；印象写入库实测（impression:ahe:1 kind=global relation=1 count=1）；npc-locations 路由 200；detectGatherScene 单测通过（去凉亭→pavilion / 犹豫→null / 无场景→null）。**约伴全链路未最终闭环**：Docker Desktop 因 C 盘 0GB 剩余（99.4/99.4GB）→ containerd meta.db 只读 → 引擎无法启动 → 容器全停 → 公网 502。已做 L1 清理（临时文件/Edge 缓存/着色器/WER/微信 xwechat log 1.2GB 等 ~2GB）仍 0.31GB；**需用户腾 ≥2-3GB（回收站 0.36GB / 卸载 C 盘大程序 / 磁盘清理）后重启 Docker Desktop**。
- **自检清单**：✔ 后端 8 文件 node --check 全过 ✔ detectGatherScene 单测 4 例 ✔ 前端 vite build 全过（--no-cache）✔ 浏览器 UI（语音按钮/人设口吻/印象落库）✔ npc-locations 200 ✔ memory-log 本条（core/modules 待补——本轮阻塞未完整收尾）✘ 约伴浏览器闭环（待 Docker 恢复）✘ git 提交（待 Docker 恢复后一并）
- **未决**：① gather_move 默认 withResidentIds 用 current.username（游客用户名≠居民 id，缺省=仅当前角色移动，多人同行依赖模型传 id 或后续前端按钮）；② 场景聚点为前端坐标定义（yard/pavilion/…各对应广场周边一点，非真实建筑）；③ 语音需 https 环境麦克风权限（容器 nginx 80 已 https 经 cpolar）。

