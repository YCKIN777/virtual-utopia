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
import { createImpressionStore } from '../../memory/impression.mjs';
import { createEmbeddingGenerator } from '../../memory/embedding.mjs';

export const createMemoryGateway = ({ db, enabled = true, llmClient } = {}) => {
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
  // P5.7 记忆深化①：居民对访客的印象档案（复用 world_state 表，kind='impression'）
  const impressionStore = createImpressionStore({ db: database, worldState });
  // 无 LLM 配置时 extractor 走启发式提炼（不阻塞、不抛错）
  const extractor = createMemoryExtractor({
    db: database,
    embeddingGenerator,
    llmClient,
  });

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
  const before = ({ userId, query, residentId } = {}) => {
    if (!userId) {
      return { memories: [], worldStates: [], impressions: null };
    }

    const memories = retriever.retrieve({ userId, query, limit: 12 });
    const worldStates = worldState.list();
    // P5.7：按当前对话的居民角色召回「TA 对你的印象」
    const impression = impressionStore.before(residentId, userId);

    return {
      memories: memories.map((memory) => ({
        id: memory.id,
        content: memory.content,
        category: memory.category,
        importance: memory.importance,
      })),
      worldStates,
      impressions: impression,
    };
  };

  /**
   * 写入阶段：落库本轮对话 + 异步提炼（fire-and-forget，不阻塞响应）。
   */
  const after = ({ userId, conversationId, sceneId, residentId, userContent, reply }) => {
    if (!userId || !userContent) {
      return;
    }

    // P5.7：更新「该居民对你的印象」（规则式，不阻塞）
    if (residentId) {
      try {
        impressionStore.after({ residentId, userId, userContent, reply });
      } catch (error) {
        console.error('[memory-gateway] 印象更新失败:', error?.message);
      }
    }

    // P5.7 约伴兜底：回复表达了「去某场景聚一聚」且模型未调 gather_move 时自动移动
    if (residentId && reply) {
      try {
        const sceneId = detectGatherScene(reply);
        if (sceneId) {
          worldState.set({
            key: `npc:${residentId}`,
            kind: 'npc',
            payload: { sceneId, updatedAt: new Date().toISOString() },
          });
          console.log(`[memory-gateway] 约伴自动移动: ${residentId} -> ${sceneId}`);
        }
      } catch (error) {
        console.error('[memory-gateway] 约伴自动移动失败:', error?.message);
      }
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

// P5.7 约伴自动兜底：模型若只口头约伴而未调 gather_move，按回复中的场景+行动词自动移动。
const GATHER_SCENES = [
  ['凉亭', '议事亭', 'pavilion'],
  ['大院', '院子里', 'yard'],
  ['资源墙', 'resource-wall'],
  ['书屋', '藏书楼', '书房', 'library'],
  ['小屋', '木屋', 'cabin'],
  ['远林', '山林', '森林', 'far-forest'],
];
const GATHER_ACTION_WORDS = ['去', '到', '聚', '走', '见', '来', '集合', '会合', '坐', '等', '动身', '一起', '出发'];
const GATHER_HESITATE_WORDS = ['还是', '要不要', '等谁', '什么时候', '时辰', '再说', '回头', '先不', '改天', '商量', '回头再说'];

export const detectGatherScene = (reply = '') => {
  if (!reply) return null;
  if (GATHER_HESITATE_WORDS.some((word) => reply.includes(word))) return null;
  if (!GATHER_ACTION_WORDS.some((word) => reply.includes(word))) return null;
  for (const [alias1, alias2, sceneId] of GATHER_SCENES) {
    if (reply.includes(alias1) || reply.includes(alias2)) return sceneId;
  }
  return null;
};

export const createConfiguredMemoryGateway = (
  environment = process.env,
  { modelClient } = {},
) => {
  if (environment.AI_MEMORY_ENABLED === 'false') {
    return null;
  }

  return createMemoryGateway({ llmClient: modelClient });
};

export const buildMemoryPromptBlock = (context = {}) => {
  const { memories, worldStates, impressions } = context ?? {};
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

  if (impressions) {
    const relationLabel =
      impressions.relation >= 2 ? '很熟' :
      impressions.relation === 1 ? '熟络' :
      impressions.relation === 0 ? '一般' :
      impressions.relation === -1 ? '有些疏远' : '不太愉快';
    blocks.push(
      '## 你对这位访客的印象（长期记忆）\n' +
        `- 你们已聊过 ${impressions.count} 次，关系：${relationLabel}（友好度 ${impressions.relation}/2）` +
        (impressions.tags?.length ? `\n- 记得 TA 常聊：${impressions.tags.join('、')}` : '') +
        (impressions.lastTalk ? `\n- 上次聊天：${impressions.lastTalk.slice(0, 10)}` : ''),
    );
  }

  return blocks.length > 0 ? `\n\n${blocks.join('\n\n')}` : '';
};
