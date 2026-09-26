# memory-modules.md — 模块详情（按需读对应章节）

> 仅当前任务需要时，再读取对应章节，禁止一次性全读。
> 每个模块章节记录：文件路径、关键实现、验收状态、自检清单。

## 目录
1. KIN Avatar 模块
2. 39号宅院装扮面板
3. 50宅院地块 + assignHome
4. 参观权限 + 参观开关
5. 全局多人聊天模块
6. 访客名额权限模块
7. 家园装饰素材库扩充（树木/景观小品/庭院摆件）
8. Avatar 居民智能体基础模板（复用 KIN 角色框架）
9. 居民 AI 一对一对话能力
10. LangGraph 重构（AI 编排层）

---

## 1. KIN Avatar 模块
（详情待补，或参考 memory-log.md 对应条目）

## 2. 39号宅院装扮面板
（详情待补，或参考 memory-log.md 对应条目）

## 3. 50宅院地块 + assignHome
（详情待补，或参考 memory-log.md 对应条目）

## 4. 参观权限 + 参观开关
（详情待补，或参考 memory-log.md 对应条目）

## 5. 全局多人聊天模块
- 后端：`backend/src/phase6/gatewayService.js`（`sendWorldChatMessage`，单条 200 字符，缓存 50 条；端点 GET/POST `/api/phase6/chat/world`）
- 前端：`stores/worldStore.js`（`worldChat` 状态 + `loadWorldChat` + `sendWorldChat`）、`components/WorldChatPanel.vue`
- 机制：3s 轮询拉取；消息存 phase5 `world-chat-global` 会话（全局广播 + 持久化）。
- 已知局限：非 websocket 实时；轮询约 3s 延迟。

## 6. 访客名额权限模块
- 后端：`backend/src/phase6/visitorQuotaStore.js`（SQLite 2 表）+ 11 个 API 端点。
- 前端：world 访客邀请/注册 UI + admin 访客名额统计面板。
- 认证：Bearer，不受 service token 影响。

## 7. 家园装饰素材库扩充（树木/景观小品/庭院摆件）

> 定稿规范

1. 新增家园装扮素材，分三大类别：树木类、景观小品类、庭院摆件。
2. 素材字段：id、name、category、previewAsset、modelAsset、scaleMin、scaleMax、hasCollision；素材注册进装扮面板。
3. 复用现有拖拽摆放、移动、删除逻辑；摆放数据保存在宅院 items 数组，随 world-session 快照持久化。
4. 边界校验：素材禁止摆放到宅院地块外（isInNoPlaceZone），支持手动重叠摆放（hasCollision=false）。
5. 模型按需实例加载，优化 3D 渲染性能；本次开发不修改宅院分配、参观权限、聊天、Avatar 漫游代码，回归测试全部通过。

### 实现记录
- 分类 id：`garden-trees`（乔木/幼树苗/竹丛/开花树）、`garden-landscape`（景石/小型假山/溪滩石块/矮灌木丛）、`garden-ornaments`（石灯笼/木桌+木凳/粗陶陶罐/园艺花钵），均 `cost:0` 自动解锁。
- 碰撞语义：`materialHasCollision = homeMaterialMap[id]?.hasCollision !== false`；旧素材无字段→默认碰撞(行为不变)；景观类 false→允许重叠。
- 改动文件：`data/homeMaterials.js`（+3 分类 +12 素材）、`components/HomeDecorator.vue`（allowedCategories 注册 + hasCollision 碰撞接入）。
- 备份：`homeMaterials.js.matlibbak`、`HomeDecorator.vue.matlibbak`。
- 自检：三类展示✓ / 拖拽摆放✓ / 重叠摆放✓ / 删除✓ / 持久化✓ / 回归(后端33+前端13)✓ / Playwright 0 报错✓（截图 `vu_screens/decor_materials_trees.png`、`decor_materials_ornaments.png`）。

## 8. Avatar 居民智能体基础模板（复用 KIN 角色框架）

> 定稿规范

1. 复用现有 KIN 角色 3D 模型/骨骼/行走/待机动画体系，搭建居民 Avatar 基础模板；居民与 KIN 共用同一套角色渲染管线、移动控制逻辑。
2. 居民角色数据结构：avatarId、residentName、homePlotId、avatarColor、position、rotation、currentState(idle/walk)。
3. 自动漫游：居民在自己所属宅院范围内缓慢闲逛，不越出地块边界。
4. 身份标识：头顶显示昵称；KIN 保留金冠特殊标识，居民不显示金冠。
5. 交互基础：玩家靠近居民触发聊天弹窗入口（仅预留入口，不实现对话大模型逻辑）。
6. 居民状态纳入 world-session 快照持久化，页面刷新后位置/状态不重置。

### 实现记录
- 数据：`data/residents.js`（seedResidents 5 户 + RESIDENT_CHAT_DISTANCE=4.0）。
- ThreeWorld 新增方法（仅新增，未改 KIN 原有方法）：`addResidentAvatar`（复用 `addRoamingAgent`，isLord=false，bounds=宅院中心 ±2.3）、`getResidentAvatarStates`、`restoreResidentAvatarStates`、`getResidentsNearLocal`。
- 快照：`worldStore.js` 新增 `residentStates` 状态 + `setResidentStates`（含 queuePersist），`createWorldSnapshot` 增加 `residents` 字段，`applyWorldSnapshot` 恢复。
- 后端：`gatewayService.js` `WORLD_SNAPSHOT_KEYS` 追加 `'residents'`（快照校验白名单，向后兼容）。
- 视图：`WorldView.vue` 挂载时实例化 5 居民 + 恢复持久化状态 + 3s 同步 + 600ms 邻近检测 + 聊天入口/弹窗 UI。
- 备份：`ThreeWorld.js.residentbak`、`worldStore.js.residentbak`、`WorldView.vue.residentbak`、`gatewayService.js.residentbak`。
- 自检：实例化✓ / 金冠(居民无、KIN 有)✓ / 宅院范围内漫游✓ / 聊天入口✓ / 持久化✓ / 回归(后端33+前端13+phase6 16)✓ / Playwright 0 报错✓（截图 `vu_screens/resident_avatar_world.png`）。

## 9. 居民 AI 一对一对话能力

> 定稿规范

1. 复用已预留【与X交谈】入口：玩家靠近居民(≤4m)点击交谈，唤起独立一对一对话弹窗。
2. 对话隔离：居民对话为单人私聊会话，与全局世界聊天独立、消息互不互通；每个居民独立会话上下文，互不共享。
3. UI 面板：弹窗展示居民头像+名称；上下消息流(玩家消息/居民回复)；输入框回车发送，单条≤200字符，禁止空消息；可关闭，关闭后保留历史。
4. 会话持久化：每个居民独立会话存储，纳入 world-session 快照，刷新后聊天记录不丢失。
5. 后端逻辑：复用现有 LLM 接口(createLlmClient)，传入 residentName，给提示词绑定该居民人设。
6. 人设模板：居民为本宅院住户，性格温和，熟悉本家园环境，可描述庭院/风景，不越界讨论外部无关内容。

### 实现记录
- 后端新增：`phase6/residentChatService.js`（人设提示词 + LLM 调用 + mock 降级 + 校验），端点 `POST /api/phase6/chat/resident`（app.js 新增，Bearer 认证 + audit）。
- 后端快照：`gatewayService.js` `WORLD_SNAPSHOT_KEYS` 追加 `'residentChats'`。
- 前端：`gatewayClient.js` 新增 `sendResidentChat`；`worldStore.js` 新增 `residentChats` 状态 + `sendResidentChat`（乐观追加用户消息 + 追加助手回复 + queuePersist）+ 快照 `residentChats` 字段。
- 前端 UI：新增 `components/ResidentChatPanel.vue`（头像/名称/消息流/输入框/发送/关闭）；`WorldView.vue` 将原预留弹窗替换为真实聊天面板。
- 注意：`backend/.env.development` 的 `DEEPSEEK_API_KEY=` 为空，会覆盖 `.env` 真实 key；`residentChatService.js` 内部以 `dotenv override` 重新加载 `backend/.env` 获取真实 key。
- 备份：`app.js.residentchatbak`、`gatewayService.js.residentchatbak`、`gatewayClient.js.residentchatbak`、`worldStore.js.residentchatbak`、`WorldView.vue.residentchatbak`。
- 自检：靠近显示按钮✓ / 唤起+关闭✓ / 带人设回复✓ / 200字符+空消息拦截✓ / 会话隔离✓ / 快照持久化+刷新保留✓ / 回归(后端33+前端13+phase6 16)✓ / Playwright 0 报错✓（截图 `vu_screens/resident_chat_dialog.png`）。

## 10. LangGraph 重构（AI 编排层）

> 定稿规范（2026-09-25 用户逐项拍板）

1. 自研 AI 编排（deepSeekClient 熔断+并发+重试+JSON 解析 240+ 行 + 静态 if/else orchestrator + 5 个纯 Prompt 分支 Agent）重构为 LangChain.js + LangGraph.js 图编排；**业务层（phase5/6/7 + 8 个 SQLite 库）零改动**。
2. 模型继续用 DeepSeek（`@langchain/deepseek`，deepseek-chat）；首批 5 个工具全开；LangSmith 免费 Developer 层；试点=居民 AI 对话。
3. 保留完整回退开关：AI_LLM_BACKEND / AI_RAG_BACKEND / USE_LANGGRAPH / AI_MEMORY_ENABLED / AI_HITL_ENABLED。

### 文件路径
- 模型层：`backend/src/ai/{schemas.js, langchainModelClient.js, modelClientFactory.js}`（AI_LLM_BACKEND 择 langchain/legacy，三处装配点注入）。
- 图编排：`backend/src/ai/graph/{state.js, checkpointer.js, nodes.js, graphOrchestrator.js}`（Annotation.Root + SqliteSaver + 5 分支节点 + finalize）。
- 工具：`backend/src/ai/tools/{auth.js, index.js, context.js, factory.js}`（角色矩阵 + 5 工具 + AsyncLocalStorage 用户上下文 + 与 phase6 同库业务工具集）。
- 长记忆：`backend/src/ai/memory/memoryGateway.js`（before 召回注入 / after 落库+异步提炼）。
- RAG：`backend/src/ai/rag/`（组件化 + Chroma 集成）。
- 路由：`backend/src/routes/{stream.js, resume.js}`、`backend/src/app.js`（stream+resume 挂载）、`backend/src/config/env.js`（ai 块含 hitlEnabled/approvalTools）。
- 前端：`frontend/src/services/sceneApi.js`（sendMessageStream/resumeApproval）、`frontend/src/stores/conversationStore.js`（DEFAULT_USER/流式/审批）、`frontend/src/components/scene/SceneConversationPanel.vue`（打字机+审批卡片）。

### 关键实现
- **图结构**：`START → route →(risk=high→safety : scene→branch×5) → branch →(有 toolCalls→[敏感→approval(HITL)]→execute_tools→回 branch : finalize) → finalize → END`；SQLite Checkpointer `backend/data/langgraph.sqlite`（thread_id=conversationId 断点续跑，不带则 `ephemeral-${uuid}` 临时线程零污染）。
- **模型适配器**：ChatDeepSeek 构造即校 key → `langchainModelClient.js` 惰性实例化缓存；无 `.bind` → 结构化输出 `invoke(messages, {response_format:{type:'json_object'}})`（prompt 含「仅返回合法 JSON」）；工具轮 bindTools 不加 response_format（互斥）。
- **5 工具权限矩阵**：query_friends→resident/admin、guestbook_write→editor/admin、plot_lookup/quota_overview/resident_card_lookup→viewer+、无身份 role=null 全拒绝。
- **长记忆**：memoryGateway before 召回注入 / after 落库+异步提炼，AI_MEMORY_ENABLED 开关；memory 库落库验证通过。
- **HITL（KIN 审批）**：LangGraph 原生 `interrupt`/`Command({resume})`/`isInterrupted()`（`__interrupt__` 键）；approval 节点 + resume 路由 `POST /api/scene/route/resume` + 前端审批卡片；verify-hitl.mjs 批准路径真实执行、拒绝路径不执行。
- **流式 SSE**：`createStructuredResponseStream`（.stream + json_object + onToken）+ `POST /api/scene/route/stream`；断线判定用 `response.on('close')` + `writableEnded`（勿用 request.on('close')）。
- **prompt 改句**：`createBranchAgent.js` 第 40 行改为「允许使用工具 + 写入须确认/审批」（一处改 5 分支）；`pruneToolMessages` 剪枝断点续跑工具历史（AI tool_calls + ToolMessage）。
- **工具调试门控（2026-09-26）**：`AI_TOOLS_DEBUG`（`env.ai.toolsDebug`，默认 false）控制 nodes.js 5 处 `[debug-branch]` 日志（toolCalls 数/路径分支/错误 code+cause）；memoryGateway 2 处错误日志常开不入门控。

### 验收状态
- 后端回归 **45/45**（42 旧 + toolAuth 3）、前端 9/9、vite build 通过。
- 冒烟：verify-llm.mjs 真实流式 10 chunks；verify-stream.mjs 202 chunks 全通过；verify-hitl.mjs 批准/拒绝双路径；RAG E2E 双引擎（自研 vs LangChain）结果逐位一致；HTTP E2E viewer 问名额返回真实 14 项数据；记忆落库验证通过。

### 真实认证（2026-09-26 落地）
- 后端废弃 `body.user` 直传（可伪造身份）；新增 `src/middleware/sceneAuth.js`：请求带 `Authorization: Bearer` 时调 phase6 `/api/phase6/auth/me` 解析 `{id, username, role, displayName}` 并归一化为 `{userId, role, username}` 注入 `request.userContext`；无 token=游客（role=null，写工具/审批被拒）；无效 token→401；认证服务不可达→503。
- `src/app.js` 以 `/api/scene/route` 前缀挂载（route/stream/resume 三端点统一鉴权）；`src/routes/resume.js` 追加「仅 admin 可审批」（游客/editor→403）。
- `src/ai/graph/graphOrchestrator.js`：`buildInput`/`persistMemory` 改收 `userContext` 参数，body.user 不再信任。
- 前端：`services/authService.js`（phase6 登录/me/logout + sha256 密码链路 + localStorage key `scene-app.phase5.token`）、`stores/authStore.js`（unknown/guest/authenticated 三态 + ensureSession/login/logout）、`sceneApi.js` 三方法自动带 Bearer、`conversationStore.js` 删除 DEFAULT_USER、`ScenePageShell.vue` 身份栏 + 登录弹窗、`vite.config.js` 加 `/phase6-api` proxy。
- 配置：`PHASE6_BASE_URL`（默认 http://localhost:3400）。
- 启动：phase5 不读 .env，须 `node --env-file=.env src/phase5/server.js` 或注入 `PHASE5_AUTH_SECRET/SERVICE_TOKEN/BOOTSTRAP_ADMIN_PASSWORD`（bootstrap 默认 admin/utopia2026）。

### 已知局限
- 外层壳登录为最小实现（无注册入口/验证码）；resume 审批人校验仅限 admin 角色（conversationId→owner 归属校验待加）；sceneAuth 调 phase6 无超时重试；前端登录 token 与主世界各自独立存储（跨应用同源共享待定）。
- 前端默认身份 DEFAULT_USER（userId:1, resident/editor）已废弃（2026-09-26 真实认证落地后删除）。
- `@langchain/community` 须 `--legacy-peer-deps`（可选 peer stagehand 要求 zod ^3 与项目 zod 4.6.5 冲突）。
- 详细 13 条坑（惰性实例化 / response_format / 节点名撞字段 / thread_id 语义 / SSE 断线 / interrupt 约束 / 工具消息累积等）见 memory-log.md 2026-09-25 条目。

### resume 会话归属校验（2026-09-26 落地）
- `conversationRegistry`（`src/services/conversationRegistry.js`）：内存 Map `conversationId → owner{userId,role,username}`；`handle`/`handleStream` 持久会话（带 conversationId）注册（游客不注册）。
- resume 三层校验：游客 403 → admin 放行（KIN 审批）→ 非 admin 须 `userId===owner`（无记录/不匹配 403；防 conversationId 伪造越权恢复）。
- 验证：`tests/conversationRegistry.test.js`（5）+ `tests/resumeRoute.test.js`（6）；后端 83/83。
- 局限：registry 内存态（重启即失，非 admin 恢复需重新 handle）；owner 恢复=本人确认（KIN 审批仍 admin 优先）。

### 审批清单（P5.2-⑤ 2026-09-26 收窄为写入类）
- **当前默认 `AI_APPROVAL_TOOLS=guestbook_write`**（写入类）；query_friends 为无参数、仅查本人数据的只读工具，**移出审批**（避免「查自己好友也卡 KIN 审批」扰民；未来涉他人隐私工具配置驱动加回）。
- 审批判定配置驱动：`routeAfterBranch` 检查 `env.ai.approvalTools.includes(call.name)`（已 export 供单测）；新增敏感工具仅改配置，零代码。
- 验证：`tests/approvalRouting.test.js` 7/7（query_friends→execute_tools / guestbook_write→approval / 混合→approval / 多值解析）；verify-hitl 场景 A 实测 query_friends 直接执行不审批（thinking→tool_calling→tool_result）。
- 行为记录：DeepSeek 对 guestbook_write 写入类受场景人设「写入须先确认/审批」约束倾向文本澄清不调工具（verify-hitl 场景 B/C 记录为模型行为，非框架缺陷；脚本为行为自适应 E2E，路由正确性由单测覆盖）。
- 局限：审批粒度工具级（整轮暂停），无参数级审批。

### 外层壳注册 + 图形验证码（2026-09-26 落地）
- 验证码：`src/services/captchaService.js`（4 位数字 SVG + 干扰线；内存 Map 5 分钟过期、一次性、上限 1000 自动清理）+ `GET /api/scene/route/captcha`（公开）。
- 注册代理：`src/routes/register.js`（`POST /api/scene/route/register`：镜像 phase5 入参校验 → 验证码校验（403 CAPTCHA_INVALID）→ 转发 phase5 `/api/phase5/auth/register`（**phase5 零改动**）→ 201 pending；phase5 错误透传、不可达 503）。`env.js` 增 `phase5.baseUrl`（PHASE5_BASE_URL）。
- 前端：`sceneApi.getCaptcha/register` + `ScenePageShell.vue` 登录/注册双 tab（验证码图点击刷新、本地规则校验、成功切回登录并预填用户名）。
- 权限：注册端点公开（sceneAuth 对无 token 游客放行）；新用户 role=editor + status=pending，需 KIN 在 phase6 审批激活后可登录。
- 关键：路由内路径不带 `/api` 前缀（app.js 已挂 `/api`）；验证码内存态（多实例需共享存储）。
- 环境治理（pnpm 12）：`pnpm-workspace.yaml` 须写 `nodeLinker: hoisted`（本机无管理员/开发者模式不能建 symlink）+ `allowBuilds`（better-sqlite3/esbuild 构建脚本）；.npmrc 已不再读取链接器配置。

### Chroma 数据治理与生产部署（2026-09-26 落地）
- 治理脚本：`scripts/chroma.mjs`（start/stop/status/reset/reset-data 五子命令，纯 Node 原生零 shell 依赖；start 用 `detached:true` 脱离 Job Object + PID 文件 `.chroma-data/chroma.pid` + 轮询 `/api/v2/heartbeat`；stop 读 PID 文件 `process.kill`；reset 删 collection 幂等；reset-data 数据目录损坏时重命名备份 `.corrupt-<时间戳>` 并重建空目录，不删数据）。
- 编排集成：`scripts/start-all.mjs` 新增 chroma 可选服务（kind=venv，health `/api/v2/heartbeat`，required=false——venv 缺失只降级 RAG 不阻塞业务）。
- 生产部署：`deploy/chroma.docker-compose.yml`（chromadb/chroma:1.5.9 + 数据卷 + healthcheck；本机无 Docker 未实测）；`CHROMA_URL` 指向远端即可（https 自动 ssl）；`.env.example` 补 `CHROMA_URL/CHROMA_COLLECTION/RAG_DOCS_DIR`。
- **关键坑（4 层排障）**：① 旧 `.chroma-data` SQLite 未干净关闭（进程被强杀）→ chroma 打印 listening 后静默退出 → reset-data 备份重建；② chromadb 1.5.9（Rust 版）API 路径 `/api/v1/*` 全 410 Gone，正确为 `/api/v2/*`（心跳/collections 走 `/api/v2/tenants/default_tenant/databases/default_database/collections`）；③ node spawn 子进程在父退出时被 Job Object 终止 → 必须 `detached:true`；④ 本环境 node 子进程 PATH 精简（无 powershell/netstat）→ 进程管理用 PID 文件 + process.kill。
- 验证：chroma.mjs 全链路 start→status→reset→stop 通过（父退出后服务存活）；start-all 冒烟 phase5/phase6/chroma 三就绪、停止后端口全释放；后端回归 54/54。

### P5.2 安全与治理四项（2026-09-26 落地）
- **⑥ captcha/conversationRegistry 落 SQLite**：`captchaService.js` / `conversationRegistry.js` 存储层从内存 Map 迁至 `node:sqlite`（WAL）：`backend/data/captcha.db`（captcha_entries：一次性/5min 过期/上限清理）、`backend/data/conversation-registry.db`（conversation_owners：ON CONFLICT 保留 created_at、FIFO 上限清理）。
  - 分层：模块单例默认 `:memory:`（多测试进程并发打开同一持久化文件会 `database is locked`）；**生产装配在 `server.js` 显式注入持久化实例**（`createApp` 增 `captchaService` 注入参数）。
  - 跨重启：captchaId 未过期仍可校验、resume 归属仍可校验（测试 close→reopen 覆盖）。
  - 测试：`tests/persistenceServices.test.js` 9 例（一次性/过期/上限/文件跨重启）。
- **⑦ 账号与测试数据清理**：`scripts/cleanup-test-data.mjs`（可复现，--dry-run 预览；ESM 顶层禁 return，须 if/else）。已删 smoke_*/probe*/p5probe 5 账号 + chroma corrupt 备份 2 目录（0.6MB）；保留真实/演示账号 + ui_zzzz（用户已批准）+ moved_out/disabled 历史（保 phase6 外键）。
- **⑧ KIN 审批决策审计留痕**：`src/services/sceneAuditStore.js`（`backend/data/scene-audit.db`，表 scene_audit_events：conversation_id/actor_user_id/actor_username/actor_role/approved/reason/ip/user_agent/created_at，索引 created+id，排序 `ORDER BY created_at DESC, id DESC` 防同毫秒不稳）。
  - resume 路由：决策成功后 record（审计失败 console.warn 不阻断主流程）；403/失败不写；`GET /api/scene/route/audit`（admin 查询，approved 过滤 + limit/offset，limit 钳 500）。
  - 测试：`tests/sceneAudit.test.js` 3 例 + `tests/resumeRoute.test.js` 新增 3 例（admin 批准留痕/owner 拒绝留痕/403 不写）。
- 回归：后端全量 **101/101**；E2E：admin 查审计 200 / 非 admin 403 / 验证码端点 200 / verify-hitl 通过。
- commit 链：e9176c4（⑤）→ 753b726（⑥）→ 9430f28（⑦）→ d7ed2b1（⑧）。
### P5.3 生产化四项（2026-09-27 落地）
- **⑨ 构建**：`scripts/build-all.mjs`（build/preview/all）；三入口 dist 产物：frontend/dist、frontend/src/virtual-utopia/dist、frontend/src/phase6/dist；preview 默认端口 4173/5176/5177（dev 端口被占用时用）。
- **⑩ Docker**：`deploy/` 全家桶（docker-compose.yml + Dockerfile.backend + Dockerfile.frontend + nginx.conf）；chroma 模板 healthcheck 已修正 /api/v2。未实测（无 Docker）。
- **⑪ LangSmith**：`langsmith`（0.10.5，注意包名非 @langchain/langsmith）；环境变量驱动零代码；`.env.example` 有开启步骤。
- **⑫ env**：`.env.example` 生产强随机提示 + 补 PHASE5_ENABLED/PHASE6_HOME_SOCIAL_DB_PATH/PORT/CORS_ORIGIN。
- 回归：101/101。
### P5.4-⑬ 3D 世界 AI 对话（2026-09-27，commit 79d94b5）
- 文件：services/sceneClient.js、stores/aiChatStore.js、components/AiChatPanel.vue、WorldView.vue 挂载、vite.config.js /scene-api 代理。
- 认证：virtual-utopia.phase5.token（sessionStorage）同一 token 直通 scene Bearer。
- 代理：vite /scene-api → http://localhost:3000（dev 同源免 CORS）；生产需 nginx /scene-api/ → scene（deploy/nginx.conf 待补，模板未实测）。