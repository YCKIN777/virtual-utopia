/**
 * 记忆模块 HTTP API（独立路由，不侵入冻结代码）。
 * 路由：
 *   POST   /api/conversation/create   新建会话
 *   GET    /api/conversation/:id      获取会话消息
 *   POST   /api/chat                  对话主入口（内部调用 memoryOrchestrator）
 *   GET    /api/user/memory           获取用户记忆列表
 *   DELETE /api/user/memory/:mid      删除单条记忆
 */
import express from 'express';

export const createMemoryApp = ({ orchestrator }) => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/conversation/create', (req, res) => {
    try {
      const { userId, sceneId, title } = req.body || {};
      const conv = orchestrator.createConversation({ userId, sceneId, title });
      res.status(201).json(conv);
    } catch (error) {
      res.status(400).json({ error: error && error.message });
    }
  });

  app.get('/api/conversation/list', (req, res) => {
    const { userId } = req.query;
    if (!userId) {
      res.status(400).json({ error: 'userId required' });
      return;
    }
    const conversations = orchestrator.listConversations({ userId });
    res.json({ userId, conversations });
  });

  app.get('/api/conversation/:id', (req, res) => {
    const messages = orchestrator.getMessages(req.params.id);
    res.json({ id: req.params.id, messages });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { userId, conversationId, message, sceneId } = req.body || {};
      const result = await orchestrator.chat({
        userId,
        conversationId,
        message,
        sceneId,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error && error.message });
    }
  });

  app.get('/api/user/memory', (req, res) => {
    const { userId } = req.query;
    if (!userId) {
      res.status(400).json({ error: 'userId required' });
      return;
    }
    const memories = orchestrator.retrieveMemory({ userId, limit: 100 });
    res.json({ userId, memories });
  });

  app.delete('/api/user/memory', (req, res) => {
    const { userId } = req.query;
    if (!userId) {
      res.status(400).json({ error: 'userId required' });
      return;
    }
    const cleared = orchestrator.clearMemory({ userId });
    res.json({ userId, cleared });
  });

  app.delete('/api/user/memory/:mid', (req, res) => {
    const deleted = orchestrator.deleteMemory(req.params.mid);
    res.json({ deleted });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
};
