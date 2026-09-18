/**
 * 记忆调度总入口：组装 systemPrompt + 召回长期记忆 + worldState + 当前会话 messages。
 * 提供 buildContext（可测试核心）与 chat（主对话入口，异步记忆提炼不阻塞响应）。
 */
import { createMemoryRetriever } from './memoryRetriever.mjs';
import { createWorldStateStore } from './worldState.mjs';
import { createMemoryExtractor } from './memoryExtractor.mjs';
import { newId, now } from './database.mjs';

const DEFAULT_SYSTEM_PROMPT = '你是虚拟乌托邦的社区助手，请结合用户的长期记忆与当前世界状态，给出连贯、个性化的回答。';

export const createMemoryOrchestrator = ({
  db,
  llmClient,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
} = {}) => {
  const retriever = createMemoryRetriever({ db });
  const worldState = createWorldStateStore({ db });
  const extractor = createMemoryExtractor({ db, llmClient });

  const ensureUser = (userId) => {
    if (!userId) throw new Error('userId is required');
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!existing) {
      db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)').run(
        userId,
        now(),
        now(),
      );
    }
  };

  const createConversation = ({ userId, sceneId, title }) => {
    ensureUser(userId);
    const id = newId('conv');
    db.prepare(
      'INSERT INTO conversations (id, user_id, scene_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, userId, sceneId || null, title || null, now(), now());
    return { id, userId, sceneId: sceneId || null, title: title || null };
  };

  const getMessages = (conversationId) =>
    db
      .prepare(
        'SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      )
      .all(conversationId);

  const appendMessage = (conversationId, role, content) => {
    const id = newId('msg');
    const createdAt = now();
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, conversationId, role, content, createdAt);
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
      createdAt,
      conversationId,
    );
    return { id, role, content, createdAt };
  };

  const deleteMemory = (memoryId) => {
    const result = db.prepare('DELETE FROM user_memory WHERE id = ?').run(memoryId);
    return result.changes > 0;
  };

  const listConversations = ({ userId }) =>
    db
      .prepare(
        'SELECT id, user_id, scene_id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC',
      )
      .all(userId);

  /**
   * 组装上下文：召回长期记忆 + 世界状态 + 会话历史（不含即将写入的当前消息）。
   */
  const buildContext = ({ userId, conversationId }) => {
    const memories = retriever.retrieve({ userId, limit: 20 });
    const worldStates = worldState.list();
    const history = conversationId ? getMessages(conversationId) : [];
    return { userId, conversationId, memories, worldStates, history, systemPrompt };
  };

  const assemblePrompt = (context, userMessage) => {
    const memoryBlock =
      context.memories.length > 0
        ? '## 用户长期记忆\n' +
          context.memories
            .map(
              (m, i) =>
                `${i + 1}. [${m.category}] ${m.content} (importance=${m.importance})`,
            )
            .join('\n')
        : '## 用户长期记忆\n（无）';
    const worldBlock =
      context.worldStates.length > 0
        ? '## 世界状态\n' +
          context.worldStates
            .map((w) => `- ${w.key}(${w.kind}): ${JSON.stringify(w.payload)}`)
            .join('\n')
        : '## 世界状态\n（无）';
    const historyBlock =
      context.history.length > 0
        ? '## 历史消息\n' +
          context.history.map((m) => `${m.role}: ${m.content}`).join('\n')
        : '## 历史消息\n（新会话，无历史）';
    return [
      context.systemPrompt,
      memoryBlock,
      worldBlock,
      historyBlock,
      '## 当前用户输入',
      userMessage,
    ].join('\n\n');
  };

  const mockReply = (context) =>
    '[mock] 已接收。加载长期记忆 ' +
    context.memories.length +
    ' 条，世界状态 ' +
    context.worldStates.length +
    ' 项，历史消息 ' +
    context.history.length +
    ' 条。';

  /**
   * 主对话入口：新建或复用会话 → 落库用户消息 → 组装上下文 → 生成回复 → 落库 →
   * 异步记忆提炼（setImmediate，不阻塞响应）。
   */
  const chat = async ({ userId, conversationId, message, sceneId }) => {
    ensureUser(userId);
    const convId = conversationId || createConversation({ userId, sceneId }).id;

    const context = buildContext({ userId, conversationId: convId });
    appendMessage(convId, 'user', message);
    const prompt = assemblePrompt(context, message);

    let reply;
    if (llmClient && llmClient.enabled) {
      const res = await llmClient.complete([
        { role: 'system', content: prompt },
        { role: 'user', content: message },
      ]);
      reply = res.content || '';
    } else {
      reply = mockReply(context);
    }
    appendMessage(convId, 'assistant', reply);

    // 异步记忆提炼：不阻塞主响应
    const extractMessages = [
      ...context.history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
      { role: 'assistant', content: reply },
    ];
    setImmediate(() => {
      extractor
        .extractFacts({ userId, conversationId: convId, messages: extractMessages })
        .catch((error) =>
          console.error('[memory] 记忆提炼失败:', error && error.message),
        );
    });

    return {
      conversationId: convId,
      reply,
      prompt,
      memories: context.memories,
      worldStates: context.worldStates,
      historyCount: context.history.length,
    };
  };

  return {
    ensureUser,
    createConversation,
    listConversations,
    getMessages,
    appendMessage,
    deleteMemory,
    buildContext,
    chat,
    retrieveMemory: retriever.retrieve,
    worldState,
    retriever,
    extractor,
  };
};
