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
  - `ai/`（LangGraph 重构层，2026-09-25：langchainModelClient / graph / tools / memory / rag）
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
  - `backend/data/langgraph.sqlite` LangGraph 图检查点（thread_id=conversationId 断点续跑，2026-09-25）

## 三、运行环境
- phase5（3300）：`PHASE5_AUTH_SECRET=changeme`、`PHASE5_SERVICE_TOKEN=changeme`、`PHASE5_BOOTSTRAP_ADMIN_PASSWORD=utopia2026`、`PHASE5_DB_PATH=H:\BP2\data\virtual_utopia_phase5.sqlite`
- phase6（3400）：`PHASE5_SERVICE_TOKEN=changeme`（网关直连 phase5）
- 管理员账号：`admin` / `utopia2026`（即 KIN，role=admin）
- 前端构建：`VITE_PHASE6_GATEWAY_URL=http://localhost:3400 node node_modules/vite/bin/vite.js build --config frontend/src/virtual-utopia/vite.config.js`

## 四、开发铁则（永久约束）
1. 不改动已验收通过的模块。
2. 任务完成后：追加记录到 memory-log.md + 更新 memory-modules.md 对应章节 + 附自检清单；**同时更新本文件第八节「当前交接点」（上一轮停在/下一轮要做/相关文件）**，保证下次开新窗口能直接接上。
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
- AI 编排 env 开关（backend/.env + .env.example，2026-09-25）：`AI_LLM_BACKEND=langchain`（legacy 回退旧 deepSeekClient）、`AI_RAG_BACKEND=langchain`（回退自研 RAG）、`USE_LANGGRAPH=1`（0 回退旧静态 if/else 编排）、`AI_MEMORY_ENABLED`（默认开，'false' 关）、`AI_HITL_ENABLED`（默认开）、`AI_APPROVAL_TOOLS=guestbook_write`（逗号分隔可扩展）；DeepSeek：`DEEPSEEK_BASE_URL=https://api.deepseek.com`、model `deepseek-chat`。
- 真实认证（2026-09-26）：`PHASE6_BASE_URL=http://localhost:3400`（sceneAuth 调 phase6 /auth/me）；无 token=游客；resume 仅 admin。**phase5 不读 .env**，启动须 `node --env-file=.env src/phase5/server.js` 或注入 `PHASE5_AUTH_SECRET`/`PHASE5_SERVICE_TOKEN`/`PHASE5_BOOTSTRAP_ADMIN_PASSWORD`（bootstrap 默认 admin/utopia2026）；phase6 自读 .env。
- 本机 Node 服务绑定 IPv6 → 验证用 `localhost` 而非 `127.0.0.1`；Chroma 启动命令：`& 'H:\BP2\.venv-chroma\Scripts\chroma.exe' run --path 'H:\BP2\.chroma-data' --host 127.0.0.1 --port 8000`。

## 八、当前交接点（上下文快满 / 新窗口 / 换智能体时从这里接）
> 每次收工前更新本节；新窗口/换智能体第一句让其读本文件，按本节继续，不要重新讨论方向。
- 当前进度（截至 2026-09-26）：**LangGraph 重构 P0–P4 全部落地并验证**（自研 AI 编排 → LangChain.js + LangGraph.js；业务层 phase5/6/7 与 8 个 SQLite 库零改动）+ **P4 收尾三项（HITL/prompt 改句/工具剪枝）+ 场景服务真实认证落地 + Chroma 数据治理落地**。
  - P0 基座：6 个 @langchain 包 + zod 4.6.5 锁版本（--save-exact）；基线 42/42 全绿。
  - P1 模型层：`langchainModelClient.js` 惰性实例化（ChatDeepSeek 构造即校 key）；AI_LLM_BACKEND 择 langchain/legacy，三处装配点注入；verify-llm 真实流式 10 chunks。
  - P2 RAG 组件化 + Chroma：`@langchain/chroma` 包不存在（404），集成在 `@langchain/community`（须 `--legacy-peer-deps`）；本机无 Docker → venv 跑 Chroma；E2E 双引擎结果逐位一致。
  - P3 图编排：`src/ai/graph/`（Annotation.Root + SqliteSaver + 5 分支节点 + finalize）；节点名不撞 state 字段（intent→route）；thread_id=conversationId 断点续跑 / 不带则 ephemeral 临时线程。
  - P4a 5 工具全开：`src/ai/tools/`（auth 角色矩阵 + index 5 工具）；ChatDeepSeek 无 .bind → `response_format:{type:'json_object'}`（工具轮不加）。
  - P4b 真实 HTTP：context.js（AsyncLocalStorage 承载 userContext）+ factory.js（与 phase6 同库业务工具集）；toolAuth.test.js 无身份全拒绝；HTTP E2E viewer 问名额返回真实 14 项数据；回归 42→45。
  - P4c 流式 + 长记忆：`createStructuredResponseStream` + SSE 路由 `POST /api/scene/route/stream`（断线判定 `response.on('close')` + writableEnded，勿用 request.on('close')）；verify-stream 202 chunks 通过；memoryGateway before 召回/after 落库（AI_MEMORY_ENABLED）。
  - P4 收尾三项：① HITL（KIN 审批）interrupt/Command({resume})/isInterrupted() + resume 路由 + 前端审批卡片（verify-hitl 批准执行/拒绝不执行）；② prompt 矛盾句（createBranchAgent.js 第 40 行改「允许工具+写入须确认/审批」）；③ 工具历史剪枝 pruneToolMessages；另修前端 SSE done 双包装解包 bug。
  - **真实认证（2026-09-26）**：`src/middleware/sceneAuth.js` Bearer→phase6 /auth/me 解析身份注入 request.userContext；无 token=游客（写工具/审批被拒）；无效 token 401；认证服务不可达 503；**body.user 直传废弃**；resume 仅 admin（403）；前端外层壳新增 authService/authStore + ScenePageShell 身份栏/登录弹窗；sceneApi 三方法自动带 Bearer（key `scene-app.phase5.token`）；PHASE6_BASE_URL 配置；vite `/phase6-api` proxy。
  - **Chroma 数据治理与生产部署（2026-09-26）**：新增 `scripts/chroma.mjs`（start/stop/status/reset/reset-data 五子命令，纯 Node 原生）；`start-all.mjs` 集成 Chroma 可选启动（venv，health `/api/v2/heartbeat`）；`deploy/chroma.docker-compose.yml` 生产模板（本机无 Docker 未实测）；`.env.example` 补 CHROMA_URL/CHROMA_COLLECTION/RAG_DOCS_DIR。**4 层排障**：① 旧 `.chroma-data` SQLite 损坏（进程被强杀）→ chroma 打印 listening 后静默退出 → `reset-data` 备份重建；② chromadb 1.5.9（Rust 版）API 为 `/api/v2/*`（v1 全 410）；③ node spawn 子进程父退出即被 Job Object 终止 → `detached:true`；④ 本环境 node 子进程 PATH 精简（无 powershell/netstat）→ PID 文件 + process.kill。
  - 验证：后端 **54/54**（45 + sceneAuth 9）、前端 **16/16**（9 + authService 6 + token 断言）、vite build（54 modules）；verify-auth 6 PASS、verify-hitl 场景 A/B、verify-stream 完整流式 79 chunks + 记忆落库；规划文档 `F:\2026\KIN\虚拟乌托邦·LangGraph重构整体架构规划.md` 已交付（P0–P4 ✅、P4 收尾 ✅、真实认证 ✅、LangSmith 定价、决策点状态）。
- 当前状态：**P5.1–P5.3 全部闭环**（P5.1/P5.2 2026-09-26，P5.3 2026-09-27）。P5.3 生产化四项：⑨ 三入口 build 验证（b56b26f，build-all.mjs，preview 三入口 200）；⑩ 全栈 Docker 编排模板（3512b01，deploy/ docker-compose + 双 Dockerfile + nginx.conf，本机无 Docker 未实测；修正 chroma healthcheck v1→v2）；⑪ LangSmith Developer 层接入（6ae66bb，装 langsmith 0.10.5——@langchain/langsmith 包 404、正确包名 langsmith；tracing 环境变量驱动零代码，配 key 后可观测图执行/工具调用/审批流）；⑫ env 治理（4928508，.env.example 生产强随机提示 + 补 PHASE5_ENABLED/PHASE6_HOME_SOCIAL_DB_PATH/PORT/CORS_ORIGIN，.env.example 冒烟可起）。
- 下一步待办：**P5.4 全部闭环 + shell 下线**（⑬⑭⑮ + ⑯ shell 移除，HEAD=f352c36）；P5.3/P5.4 + Docker + 验收总结全部闭环（101/101、双模式回归、文档 F:\2026\KIN\虚拟乌托邦·LangGraph重构验收总结.md）；P5.5-1 工程完善闭环（commit 967f5eb：后台链接/密钥插值/docker wrapper；模型路径验证无需改）；**P5.5-2 方向②延迟优化闭环**（打字机真实生效：首轮改流式工具轮 createToolCallResponseStream + createStructuredResponseStream 去 response_format 回退 + createReplyExtractor 只推干净 reply 文本 + structuredOutput 防御；SSE 事件 2→37/84 零壳、TTFT N/A→656ms、done 1800→1519ms；浏览器容器版多轮对话干净完整）；剩余：方向③新功能（长期）、验收总结文档补延迟对比小节（早期「两次调用」判断不准确、route 纯函数单次调用）。
- 相关文件：backend/src/ai/**（modelClientFactory / graph / tools / memory / rag）、backend/src/middleware/sceneAuth.js、backend/src/routes/{stream,resume}.js（P5.2-⑧ 加审计写入+GET audit）、backend/src/app.js、backend/src/config/env.js、backend/src/services/{captchaService,conversationRegistry,sceneAuditStore}.js（P5.2-⑥⑧ SQLite 持久化）、backend/src/server.js（生产装配持久化实例）、backend/src/agents/branches/createBranchAgent.js（第 40 行）、frontend/src/{services/{sceneApi,authService}.js, stores/{conversationStore,authStore}.js, components/scene/{ScenePageShell,SceneConversationPanel}.vue}、scripts/{chroma,start-all}.mjs、backend/scripts/{verify-*.mjs,cleanup-test-data.mjs}、deploy/chroma.docker-compose.yml、backend/.env(.example)；数据：backend/data/{captcha,conversation-registry,scene-audit}.db、H:\BP2\data\virtual_utopia_phase5.sqlite
- 运行状态：AI_LLM_BACKEND=langchain、AI_RAG_BACKEND=langchain、USE_LANGGRAPH=1、AI_MEMORY_ENABLED、AI_HITL_ENABLED、AI_APPROVAL_TOOLS=guestbook_write、AI_TOOLS_DEBUG=false（默认关，排查工具轮开 true）、PHASE6_BASE_URL=http://localhost:3400（backend/.env）；回退=对应开关置 legacy/0/'false'。
- 坑备忘：本机 Node 绑定 IPv6 → 验证用 `localhost` 而非 `127.0.0.1`；**phase5 不读 .env，启动须 `node --env-file=.env src/phase5/server.js` 或注入 PHASE5_AUTH_SECRET/SERVICE_TOKEN/BOOTSTRAP_ADMIN_PASSWORD（bootstrap 默认 admin/utopia2026）**；**Chroma 统一用 `node scripts/chroma.mjs start/stop/status/reset/reset-data`（勿再手动 venv 直跑）**；chromadb 1.5.9 API 为 /api/v2/*（v1 410）；node spawn 须 detached 才脱离父进程；本环境 node PATH 无 powershell/netstat；13 条坑见 memory-log.md 2026-09-25 条目、4+4 条见 2026-09-26 两条目。

- **当前交接点更新（2026-09-27 公网上线 + 安全加固后）**：
  - **公网上线（方案 A：cpolar 内网穿透）已生效**：公网地址 https://36087f0f.r2.cpolar.top（cpolar Free 随机域名，**重启会变**；变更须同步 backend/.env CORS_ORIGIN/PHASE6_ALLOWED_ORIGINS 两行 + deploy/docker-compose.yml phase6 默认值）；隧道由用户真实终端窗口运行（cpolar http 80，勿停其进程；cpolar.exe 在 H:\BP2\cpolar\app\cpolar\，token 已存 C:\Users\Administrator\.cpolar\cpolar.yml，账号 yckin777 Free）。手机端 CORS 已修复（env.js 逗号列表 + 白名单含公网域名）。
  - **生产安全加固完成（P5.6-1，未提交 git 前先看下方 commit 状态）**：PHASE5_AUTH_SECRET/SERVICE_TOKEN=强随机 64 hex（backend/.env + deploy/.env + 容器注入验证 len=64）；**admin 密码已改**=`Utopia@9d212cdb834dKx`（存 H:\BP2\admin-new-password.txt 已 gitignore；旧 utopia2026 失效——**所有旧 token 已随密钥轮换失效，重新登录用新密码**）；chroma 移除宿主端口映射（1.0+ 无内置鉴权，仅容器内网可达，宿主 8000 连接拒绝）；phase5 CORS origin:true→无 Origin+回环白名单；备份脚本 backend/scripts/backup.mjs（phase5 sqlite+phase6 tgz+chroma tgz → H:\BP2\backup\，已实测）。**阶段验证**：phase6 登录(新密码)/scene/phase5/nginx 80 全 200；chroma 宿主不可达、scene 内网 heartbeat OK。
  - **密码口径坑（重要）**：phase5 口令=scrypt(sha256(明文))；登录端点兼容明文/sha256 双口径，**改密端点 PUT /auth/password 的 currentPassword 只按原值校验（双口径都 401，端点 bug）→ 改密须直改库**（备份→docker exec UPDATE users SET password_hash=hashPassword(sha256Hex(newPw)) WHERE id=1）。
  - **待决/遗留**：① 3300/3400/3000 宿主端口是否也收敛（仅 80 暴露）——影响本地直连调试，需 user 拍板；② cpolar 实名/固定域名（可选）；③ phase5 改密端点双口径 bug 后续修；④ 验收总结文档补延迟对比小节（仍待办）。
  - git 状态：P5.6-1 改动（5 源码文件 + compose + .gitignore + 探针 + memory 三件套）**未提交**，commit 信息建议 `P5.6-1 公网上线(cpolar) + 生产安全加固(密钥/密码/chroma收敛/CORS)`；`.env` 与 admin-new-password.txt 不入库。
