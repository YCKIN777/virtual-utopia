// stores/aiChatStore.js —— 3D 世界 AI 对话状态（scene 3000 LangGraph 流式 + KIN 审批）
// 与 shell 的 stores/conversationStore.js 同构（精简为单一场景 yard），
// 服务端状态经 LangGraph Checkpointer 维护，前端仅维护消息视图与阶段状态。
import { reactive } from 'vue';
import * as sceneClient from '../services/sceneClient.js';

const DEFAULT_SCENE_ID = 'yard';

let messageSequence = 0;

const createMessage = (role, content, meta = null) => {
  messageSequence += 1;
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `msg-${messageSequence}`,
    role,
    content,
    meta,
  };
};

const toHistory = (messages) =>
  messages.slice(0, -1).map(({ role, content }) => ({ role, content }));

const state = reactive({
  sceneId: DEFAULT_SCENE_ID,
  messages: [],
  sessionId: null,
  loading: false,
  error: '',
  status: null, // thinking / tool_calling / tool_result / approval_pending
  statusDetail: null,
  pendingApproval: null,
});

// 流式发送：占位 assistant 消息实时追加 token（打字机），阶段状态写入 state.status。
export async function sendStream(content) {
  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) {
    throw new Error('消息不能为空');
  }

  state.error = '';
  state.loading = true;
  state.status = 'thinking';
  state.statusDetail = null;
  state.messages.push(createMessage('user', normalizedContent));
  const history = toHistory(state.messages);
  const assistantMessage = createMessage('assistant', '');
  assistantMessage.streaming = true;
  state.messages.push(assistantMessage);

  try {
    await sceneClient.sendMessageStream({
      sceneId: state.sceneId,
      sessionId: state.sessionId || undefined,
      input: { content: normalizedContent },
      history,
      onStatus: (status) => {
        state.status = status.phase;
        if (status.toolNames?.length) {
          state.statusDetail = status.toolNames.join('、');
        }
      },
      onToken: (token) => {
        assistantMessage.content += token;
      },
      onDone: (payload) => {
        // HITL：图在审批节点暂停 → 记录 pendingApproval，由审批卡片处理
        if (payload.status === 'pending_approval') {
          state.pendingApproval = payload;
          assistantMessage.streaming = false;
          assistantMessage.content = '该操作正在等待 KIN 审批…';
          return;
        }
        assistantMessage.content = payload.result.reply;
        assistantMessage.meta = payload.meta || null;
        assistantMessage.streaming = false;
        if (payload.meta?.session?.id) {
          state.sessionId = payload.meta.session.id;
        }
      },
    });
  } catch (error) {
    assistantMessage.streaming = false;
    state.error = error.message || '请求处理失败';
    throw error;
  } finally {
    state.loading = false;
    state.status = null;
    state.statusDetail = null;
  }
}

// HITL：审批恢复（批准/拒绝）—— 同一 conversationId 以 Command({ resume }) 恢复图执行。
export async function resolveApproval({ approved, reason = '' }) {
  const approval = state.pendingApproval;
  if (!approval?.conversationId) {
    throw new Error('没有待审批的操作');
  }

  state.loading = true;
  state.error = '';

  try {
    const payload = await sceneClient.resumeApproval({
      conversationId: approval.conversationId,
      decision: { approved, reason },
    });
    state.pendingApproval = null;
    state.messages.push(
      createMessage('assistant', payload.result.reply, payload.meta || null),
    );
    if (payload.meta?.session?.id) {
      state.sessionId = payload.meta.session.id;
    }
    return payload;
  } catch (error) {
    state.error = error.message || '审批处理失败';
    throw error;
  } finally {
    state.loading = false;
  }
}

// 重置会话（开新话题）
export function resetConversation() {
  state.messages = [];
  state.sessionId = null;
  state.error = '';
  state.status = null;
  state.statusDetail = null;
  state.pendingApproval = null;
}

export const aiChatStore = Object.freeze({
  state,
  sendStream,
  resolveApproval,
  resetConversation,
});
