# 模块清单

## 1. 后端记忆模块（`backend/src/memory/`）

| 模块 | 类型 | 职责 |
| --- | --- | --- |
| `database.mjs` | 基础设施 | 打开独立 SQLite + 应用 `migrate-memory.sql` + `embedding` 列兼容迁移 |
| `llmClient.mjs` | 基础设施 | 轻量 LLM 客户端（无 key 自动 mock 模式） |
| `embedding.mjs` | 基础设施 | 确定性本地 Embedding 向量生成（字符 n-gram 哈希）+ 余弦相似度 |
| `memoryRetriever.mjs` | 核心 | 长期记忆召回：向量相似度 + importance 二次排序，权重/向量模式切换 |
| `memoryExtractor.mjs` | 核心 | 异步记忆提炼：LLM 提取事实 + 去重 + 冲突降级 + 向量入库 |
| `worldState.mjs` | 核心 | 虚拟世界状态 upsert 读写，JSON 存场景/NPC |
| `memoryOrchestrator.mjs` | 核心 | 记忆调度总入口：组装 systemPrompt+记忆+世界状态+会话历史 |
| `httpServer.mjs` | 接口 | 6 个 API 路由（会话/对话/记忆 CRUD） |
| `server.mjs` | 入口 | 挂载 guard 防护组装器 + 优雅关闭 + 进程守卫 |
| `index.mjs` | 导出 | 统一导出 |
| `migrate-memory.sql` | 迁移 | 5 张表 DDL（users/conversations/messages/user_memory/world_state） |

## 2. 前端会话模块（`frontend/src/session/`）

| 模块 | 类型 | 职责 |
| --- | --- | --- |
| `sessionApi.js` | 逻辑 | API 客户端（chat/list/get/create + listMemories/deleteMemory/clearMemories） |
| `sessionStore.js` | 逻辑 | localStorage 持久化 userId / 会话列表 / 当前会话 ID |
| `sessionUtils.js` | 逻辑 | URL 解析 conversation_id / openConversation / pushState |
| `ConversationSidebar.vue` | 组件 | 历史会话侧边栏（列表渲染 + 新开窗口） |
| `ChatPanel.vue` | 组件 | 聊天面板（发送/接续/刷新上下文） |
| `MemoryPanel.vue` | 组件 | 记忆管理面板（列表/单条删除/一键清空） |
| `SessionView.vue` | 页面 | 侧边栏 + 聊天面板组合页 |

## 3. 防护中间件（`backend/src/runtime/`，依赖）

| 模块 | 职责 |
| --- | --- |
| `guard.js` | 非侵入式防护组装器（日志/安全头/限流包裹） |
| `rateLimit.js` | 内存滑动窗口限流 + 登录防爆破 |
| `securityHeaders.js` | 安全响应头（CSP/HSTS/X-Frame-Options 等） |
| `requestLogger.js` | requestId + 访问耗时日志 |
| `logger.js` | 结构化 JSON 日志 |

## 4. 运维脚本（`scripts/`）

| 脚本 | 职责 |
| --- | --- |
| `test-memory.mjs` | 后端记忆冒烟（2 场景） |
| `test-memory-e2e.mjs` | 全链路 E2E（7 场景，真实 HTTP+SQLite） |
| `test-all.mjs` | 全量单测 + E2E 聚合 |
| `supervise.mjs` | 进程守护（崩溃自动重启） |
| `check-env.mjs` | 环境变量预检 |
| `check-frozen.mjs` | 冻结边界检查 |
| `audit-secrets.mjs` | 密钥扫描 |
| `backup-data.mjs` | SQLite 备份 |
| `alert.mjs` | 健康检查告警 |
| `migrate.mjs` | 通用数据库迁移 |
