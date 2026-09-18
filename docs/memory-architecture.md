# 虚拟乌托邦 Agent 跨会话记忆架构

> 对标豆包记忆分层模型：**短期会话记忆 + 用户全局长期记忆 + 虚拟世界状态记忆**。
> 模块位置：`backend/src/memory/`（独立模块，不修改 phaseN 冻结源码）。
> 数据库：独立 SQLite `data/virtual_utopia_memory.sqlite`。

## 1. 架构总览

```text
POST /api/chat
      │
      ▼
memoryOrchestrator（调度总入口）
      │  组装 prompt = systemPrompt + 长期记忆 + worldState + 会话messages
      ├──▶ memoryRetriever   （长期记忆召回，importance 降序，预留向量接口）
      ├──▶ worldState         （世界状态读写，upsert + JSON）
      └──▶ memoryExtractor    （异步记忆提炼，LLM + 去重 + 冲突降级，不阻塞响应）
```

## 2. 数据表结构（5 张）

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `users` | 用户身份 | `id`(PK) / `username` / `created_at` / `updated_at` |
| `conversations` | 会话 | `id`(PK) / `user_id`(FK) / `scene_id` / `title` |
| `messages` | 短期会话记忆（消息历史） | `id`(PK) / `conversation_id`(FK) / `role` / `content` / `created_at` |
| `user_memory` | 用户全局长期记忆 | `id`(PK) / `user_id`(FK) / `content` / `category` / `importance`(0~1) |
| `world_state` | 虚拟世界状态记忆 | `key`(PK, 如 `scene:yard`/`npc:ahe`) / `kind` / `payload_json`(JSON) |

> 完整 DDL 见 `backend/src/memory/migrate-memory.sql`。时间统一 UTC ISO-8601。

## 3. 核心模块

| 模块 | 职责 |
| --- | --- |
| `database.mjs` | 打开独立 SQLite + 应用 `migrate-memory.sql` |
| `llmClient.mjs` | 轻量 LLM 客户端（无 key 自动 mock 模式） |
| `memoryRetriever.mjs` | 长期记忆召回，`importance` 降序；`retrieveByVector` 预留向量接口 |
| `memoryExtractor.mjs` | 异步提炼事实入库；去重（规范化全等）+ 冲突权重降级（×0.5） |
| `worldState.mjs` | 世界状态 upsert 读写，JSON 存场景/NPC 数据 |
| `memoryOrchestrator.mjs` | 调度入口，组装 prompt，异步触发提炼 |
| `httpServer.mjs` | 5 个 API 路由 |
| `server.mjs` | 服务入口，挂载 `guard.js` 防护组装器 |

## 4. API 路由

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/conversation/create` | 新建会话（body: `userId`, `sceneId?`, `title?`） |
| GET | `/api/conversation/:id` | 获取会话消息 |
| POST | `/api/chat` | 对话主入口（body: `userId`, `conversationId?`, `message`, `sceneId?`） |
| GET | `/api/user/memory?userId=` | 获取用户记忆列表 |
| DELETE | `/api/user/memory/:mid` | 删除单条记忆 |

默认端口 `3600`（`MEMORY_PORT` 可覆盖）。

## 5. 调用时序

### 5.1 对话主流程（POST /api/chat）

```text
1. ensureUser(userId)                        确保用户存在
2. conversationId 不存在 → createConversation 新建会话
3. buildContext：召回长期记忆 + 世界状态 + 会话历史（历史为「本轮之前」的消息）
4. appendMessage(user, 当前消息)               落库用户消息
5. assemblePrompt：systemPrompt+记忆+世界状态+历史+当前输入
6. LLM 生成回复（无 key 时 mock 回显上下文摘要）
7. appendMessage(assistant, 回复)              落库助手回复
8. setImmediate → memoryExtractor.extractFacts  异步提炼（不阻塞响应）
9. 返回 { conversationId, reply, memories, worldStates, historyCount, prompt }
```

### 5.2 两个核心场景

- **场景1（新窗口新建会话）**：不传 `conversationId` → 新建会话；`buildContext` 召回该 `user_id` 的长期记忆 + 世界状态，`history` 为空（无历史上下文）。
- **场景2（新窗口带 conversation_id）**：传入 `conversationId` → `buildContext` 完整加载该会话历史消息，上下文无缝衔接。

## 6. 记忆提炼（异步，不阻塞）

- 有 `DEEPSEEK_API_KEY`：调用 LLM 提取结构化事实 `[{category, content, importance}]`。
- 无 key：启发式回退，正则提取「我喜欢/偏好/我是…」等显式陈述。
- **去重**：规范化内容全等则跳过。
- **冲突降级**：同类目且共享主语片段但内容不同 → 旧记忆 `importance × 0.5`。

## 7. 扩展方案

1. **向量检索**：`memoryRetriever.retrieveByVector` 已预留接口。未来在 `user_memory` 增 `embedding` 列（或接 ChromaDB），按 `queryEmbedding` 余弦相似度召回，替代当前 importance 排序。
2. **记忆遗忘/衰减**：按 `importance` 与 `updated_at` 实现时间衰减（低权重久未更新记忆自动降级或归档）。
3. **世界状态多实例**：`world_state` 的 `key` 已支持 `scene:*`/`npc:*`/`global` 多命名空间，可平滑扩展。
4. **记忆服务鉴权**：当前 API 依赖 guard 全局限流 + 安全头；后续可在路由层加 `userId` 归属校验（防越权读他人记忆）。

## 8. 测试

```powershell
node scripts/test-memory.mjs      # 冒烟测试：验证场景1/场景2 + 异步提炼
node scripts/test-memory-e2e.mjs  # 全链路 E2E：真实 HTTP + SQLite 持久化
```

## 9. 全链路联调结论（2026-09-18）

前后端记忆架构端到端联调（真实 HTTP 服务 + 真实 SQLite 持久化）全部通过：

| 场景 | 验证内容 | 结果 |
| --- | --- | --- |
| 1 | 新会话（不传 conversation_id）→ 自动加载长期记忆 + 世界状态，历史=0 | ✅ |
| 2 | 新窗口带 conversation_id → 完整拉取历史消息 + 续接（历史>0） | ✅ |
| 3 | F5 刷新 → URL/localStorage 恢复 conversation_id，上下文不丢 | ✅ |
| 4 | 发送消息 → 异步记忆提炼不阻塞（主响应 ~200ms），新事实写入 user_memory | ✅ |
| 5 | 修改世界状态 → 重启后 world_state 正确持久化加载 | ✅ |

**联调中发现并修复的问题**：
- `chat` 入口对陈旧/越权的 `conversation_id` 未做归属校验，可能导致 FK 约束失败或跨用户访问。已修复：`conversation_id` 不存在或不属于当前 `user_id` 时自动回退新建会话（见 memoryOrchestrator 的 `chat`）。

**已知设计约定（非 bug）**：
- `world_state` 写入为程序化接口（`orchestrator.worldState.set`），暂无 HTTP 写接口；若未来 3D 游戏层需前端直接写入，可新增 `/api/world/state`。
- 记忆提炼 `extractFacts` 假设用户已存在（由 `chat` 的 `ensureUser` 保证）；直接调用需先确保用户。
