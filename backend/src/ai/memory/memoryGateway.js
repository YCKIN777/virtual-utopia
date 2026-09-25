// backend/src/ai/memory/memoryGateway.js
// P4: 长记忆网关 —— LangGraph 图编排与自研 memory 库（5 表）的桥接。
// before：按 userId + 查询召回长期记忆（向量/权重）与世界状态，注入系统提示（双读旧表）；
// after：落库本轮 user/assistant 消息 + 异步增量提炼（影子写入 → 提炼入 user_memory）。
// 设计：与规划一致——旧 5 表先双读兜底 + 影子写入，LangGraph 官方 SQLite Store 到位后再切换。
import {
  openMemoryDatabase,
  newId,
  now,
} from '../../memory/database.mjs';
import { createMemoryRetriever } from '../../memory/memoryRetriever.mjs';
import { createWorldStateStore } from '../../memory/worldState.mjs';
import { createMemoryExtractor } from '../../memory/memoryExtractor.mjs';
import { createEmbeddingGenerator } from '../../memory/embedding.mjs';

export const createMemoryGateway = ({ db, enabled = true } = {}) => {
  if (!enabled) {
    return null;
  }

  const database = db ?? openMemoryDatabase();
  const embeddingGenerator = createEmbeddingGenerator();
  const retriever = createMemoryRetriever({
    db: database,
    embeddingGenerator,
  });
  const worldState = createWorldStateStore({ db: database });
  // 无 LLM 配置时 extractor 走启发式提炼（不阻塞、不抛错）
  const extractor = createMemoryExtractor({ db: database, embeddingGenerator });

  const ensureUser = (userId) => {
    const existing = database
      .prepare('SELECT id FROM users WHERE id = ?')
      .get(userId);

    if (!existing) {
      database
        .prepare(
          'INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)',
        )
        .run(userId, now(), now());
    }
  };

  const ensureConversation = (conversationId, userId, sceneId) => {
    const existing = database
      .prepare('SELECT id FROM conversations WHERE id = ?')
      .get(conversationId);

    if (!existing) {
      database
        .prepare(
          `INSERT INTO conversations
           (id, user_id, scene_id, title, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, ?)`,
        )
        .run(conversationId, userId, sceneId || null, now(), now());
    }
  };

  const appendMessage = (conversationId, role, content) => {
    database
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(newId('msg'), conversationId, role, content, now());
    database
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(now(), conversationId);
  };

  /**
   * 读取阶段：召回记忆 + 世界状态（供系统提示注入）。
   * query 用于向量召回；conversationId 非必需（记忆按 userId 维度）。
   */
  const before = ({ userId, query }) => {
    if (!userId) {
      return { memories: [], worldStates: [] };
    }

    const memories = retriever.retrieve({ userId, query, limit: 12 });
    const worldStates = worldState.list();

    return {
      memories: memories.map((memory) => ({
        id: memory.id,
        content: memory.content,
        category: memory.category,
        importance: memory.importance,
      })),
      worldStates,
    };
  };

  /**
   * 写入阶段：落库本轮对话 + 异步提炼（fire-and-forget，不阻塞响应）。
   */
  const after = ({ userId, conversationId, sceneId, userContent, reply }) => {
    if (!userId || !userContent) {
      return;
    }

    const conversation = conversationId || newId('conv');

    try {
      ensureUser(userId);
      ensureConversation(conversation, userId, sceneId);
      appendMessage(conversation, 'user', userContent);

      if (reply) {
        appendMessage(conversation, 'assistant', reply);
      }

      setImmediate(() => {
        extractor
          .extractFacts({
            userId,
            conversationId: conversation,
            messages: [
              { role: 'user', content: userContent },
              ...(reply ? [{ role: 'assistant', content: reply }] : []),
            ],
          })
          .catch((error) =>
            console.error('[memory-gateway] 记忆提炼失败:', error?.message),
          );
      });
    } catch (error) {
      console.error('[memory-gateway] 记忆写入失败:', error?.message);
    }
  };

  return Object.freeze({
    before,
    after,
    retriever,
    worldState,
    extractor,
    close() {
      database.close();
    },
  });
};

// 装配便捷入口：按 AI_MEMORY_ENABLED（默认开）决定是否启用；关闭返回 null（图不带记忆节点）。
export const createConfiguredMemoryGateway = (
  environment = process.env,
) => {
  if (environment.AI_MEMORY_ENABLED === 'false') {
    return null;
  }

  return createMemoryGateway();
};

export const buildMemoryPromptBlock = (context = {}) => {
  const { memories, worldStates } = context ?? {};
  const blocks = [];

  if (memories && memories.length > 0) {
    blocks.push(
      '## 用户长期记忆（仅供个性化参考；与当前指令冲突时以当前指令为准）\n' +
        memories
          .map((memory, index) => `${index + 1}. [${memory.category}] ${memory.content}`)
          .join('\n'),
    );
  }

  if (worldStates && worldStates.length > 0) {
    blocks.push(
      '## 世界状态\n' +
        worldStates
          .map((state) => `- ${state.key}(${state.kind}): ${JSON.stringify(state.payload)}`)
          .join('\n'),
    );
  }

  return blocks.length > 0 ? `\n\n${blocks.join('\n\n')}` : '';
};
