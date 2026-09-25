import { computed, reactive } from 'vue';
import { isKnownScene, isSceneAgentEnabled } from '../config/scenes.js';
import { sceneApi } from '../services/sceneApi.js';

const toHistory = (messages) =>
  messages.slice(0, -1).map(({ role, content }) => ({
    role,
    content,
  }));

// P4 收尾：身份由外层壳真实登录提供 —— sceneApi 自动携带 Bearer token（authService），
// 后端经 phase6 解析注入 userContext；未登录=游客（写类工具按角色矩阵拒绝）。
// 前端默认身份（body.user 直传）已废弃。
export const createConversationStore = ({
  requestMessage = (payload) => sceneApi.sendMessage(payload),
  requestMessageStream = (payload) => sceneApi.sendMessageStream(payload),
  requestResume = (payload) => sceneApi.resumeApproval(payload),
  createId = () => crypto.randomUUID(),
} = {}) => {
  const conversations = reactive(new Map());
  let messageSequence = 0;

  const getConversation = (sceneId) => {
    if (!isKnownScene(sceneId)) {
      throw new Error('未知场景');
    }

    if (!conversations.has(sceneId)) {
      conversations.set(sceneId, {
        messages: [],
        sessionId: null,
        loading: false,
        error: '',
        status: null, // thinking / tool_calling / tool_result / approval_pending
        statusDetail: null,
        pendingApproval: null, // HITL：{ status, conversationId, approval }
      });
    }

    return conversations.get(sceneId);
  };

  const createMessage = (role, content, meta = null) => ({
    id: createId() || `message-${++messageSequence}`,
    role,
    content,
    meta,
  });

  const validate = (sceneId, content) => {
    const normalizedContent = content.trim();

    if (!isKnownScene(sceneId)) {
      throw new Error('未知场景');
    }

    if (!isSceneAgentEnabled(sceneId)) {
      throw new Error('该场景尚未开放');
    }

    if (!normalizedContent) {
      throw new Error('消息不能为空');
    }

    return normalizedContent;
  };

  const sendMessage = async (sceneId, content) => {
    const normalizedContent = validate(sceneId, content);
    const conversation = getConversation(sceneId);
    conversation.error = '';
    conversation.loading = true;
    conversation.messages.push(createMessage('user', normalizedContent));
    const history = toHistory(conversation.messages);

    try {
      const sendRequest = () =>
        requestMessage({
          sceneId,
          sessionId: conversation.sessionId || undefined,
          input: {
            content: normalizedContent,
          },
          history,
        });
      let payload;

      try {
        payload = await sendRequest();
      } catch (error) {
        if (error.code === 'SESSION_NOT_FOUND' && conversation.sessionId) {
          conversation.sessionId = null;
          payload = await sendRequest();
        } else {
          throw error;
        }
      }

      if (payload.meta?.session?.id) {
        conversation.sessionId = payload.meta.session.id;
      }

      conversation.messages.push(
        createMessage('assistant', payload.result.reply, payload.meta || null),
      );

      return payload;
    } catch (error) {
      conversation.error = error.message || '请求处理失败';
      throw error;
    } finally {
      conversation.loading = false;
    }
  };

  // P4: 流式发送 —— 占位 assistant 消息实时追加 token（打字机），
  // 阶段状态（思考/工具调用）写入 conversation.status。
  const sendMessageStream = async (sceneId, content) => {
    const normalizedContent = validate(sceneId, content);
    const conversation = getConversation(sceneId);
    conversation.error = '';
    conversation.loading = true;
    conversation.status = 'thinking';
    conversation.statusDetail = null;
    conversation.messages.push(createMessage('user', normalizedContent));
    const history = toHistory(conversation.messages);
    const assistantMessage = createMessage('assistant', '');
    assistantMessage.streaming = true;
    conversation.messages.push(assistantMessage);

    try {
      await requestMessageStream({
        sceneId,
        sessionId: conversation.sessionId || undefined,
        input: {
          content: normalizedContent,
        },
        history,
        onStatus: (status) => {
          conversation.status = status.phase;

          if (status.toolNames?.length) {
            conversation.statusDetail = status.toolNames.join('、');
          }
        },
        onToken: (token) => {
          assistantMessage.content += token;
        },
        onDone: (payload) => {
          // P4 HITL：图在审批节点暂停 → 记录 pendingApproval，由审批卡片处理
          if (payload.status === 'pending_approval') {
            conversation.pendingApproval = payload;
            assistantMessage.streaming = false;
            assistantMessage.content = '该操作正在等待 KIN 审批…';
            return;
          }

          // 以完整回复兜底（token 流可能存在增量解析差异）
          assistantMessage.content = payload.result.reply;
          assistantMessage.meta = payload.meta || null;
          assistantMessage.streaming = false;

          if (payload.meta?.session?.id) {
            conversation.sessionId = payload.meta.session.id;
          }
        },
      });
    } catch (error) {
      assistantMessage.streaming = false;
      conversation.error = error.message || '请求处理失败';
      throw error;
    } finally {
      conversation.loading = false;
      conversation.status = null;
      conversation.statusDetail = null;
    }
  };

  // P4 HITL：审批恢复（批准/拒绝）—— 同一 conversationId 以 Command({ resume }) 恢复图执行。
  const resolveApproval = async (sceneId, { approved, reason = '' }) => {
    const conversation = getConversation(sceneId);
    const approval = conversation.pendingApproval;

    if (!approval?.conversationId) {
      throw new Error('没有待审批的操作');
    }

    conversation.loading = true;
    conversation.error = '';

    try {
      const payload = await requestResume({
        conversationId: approval.conversationId,
        decision: { approved, reason },
      });

      conversation.pendingApproval = null;

      // 审批结果作为新的 assistant 消息（批准=工具执行后的总结；拒绝=拒绝说明）
      conversation.messages.push(
        createMessage('assistant', payload.result.reply, payload.meta || null),
      );

      if (payload.meta?.session?.id) {
        conversation.sessionId = payload.meta.session.id;
      }

      return payload;
    } catch (error) {
      conversation.error = error.message || '审批处理失败';
      throw error;
    } finally {
      conversation.loading = false;
    }
  };

  return {
    conversations,
    getConversation,
    sendMessage,
    sendMessageStream,
    resolveApproval,
  };
};

export const conversationStore = createConversationStore();

export const useSceneConversation = (sceneId) => {
  const conversation = computed(() =>
    conversationStore.getConversation(sceneId.value),
  );

  return {
    conversation,
    sendMessage: (content) =>
      conversationStore.sendMessage(sceneId.value, content),
    sendMessageStream: (content) =>
      conversationStore.sendMessageStream(sceneId.value, content),
    resolveApproval: (options) =>
      conversationStore.resolveApproval(sceneId.value, options),
  };
};
