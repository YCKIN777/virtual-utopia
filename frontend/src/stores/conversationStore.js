import { computed, reactive } from 'vue';
import { isKnownScene, isSceneAgentEnabled } from '../config/scenes.js';
import { sceneApi } from '../services/sceneApi.js';

const toHistory = (messages) =>
  messages.slice(0, -1).map(({ role, content }) => ({
    role,
    content,
  }));

export const createConversationStore = ({
  requestMessage = (payload) => sceneApi.sendMessage(payload),
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

  const sendMessage = async (sceneId, content) => {
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

  return {
    conversations,
    getConversation,
    sendMessage,
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
  };
};
