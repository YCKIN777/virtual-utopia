// backend/src/ai/graph/state.js
// P3: AgentState 定义（LangGraph Annotation.Root）。
// messages 由 addMessages reducer 追加，Checkpointer 自动持久化（thread_id=conversationId）。
// 其余字段为路由/回复载体，单次图执行内传递。
import { Annotation, addMessages } from '@langchain/langgraph';

export const SceneStateAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: addMessages,
    default: () => [],
  }),
  sceneId: Annotation({ default: () => null }),
  sceneName: Annotation({ default: () => null }),
  inputContent: Annotation({ default: () => null }),
  requestHistory: Annotation({ default: () => [] }),
  intent: Annotation({ default: () => null }),
  risk: Annotation({ default: () => 'low' }),
  riskSignals: Annotation({ default: () => [] }),
  targetAgentId: Annotation({ default: () => null }),
  branchName: Annotation({ default: () => null }),
  branchAgent: Annotation({ default: () => null }),
  mode: Annotation({ default: () => null }),
  reply: Annotation({ default: () => null }),
  resultRisk: Annotation({ default: () => 'low' }),
  resultActions: Annotation({ default: () => [] }),
  fallback: Annotation({ default: () => false }),
  fallbackReason: Annotation({ default: () => null }),
  model: Annotation({ default: () => null }),
  usage: Annotation({ default: () => null }),
  attempts: Annotation({ default: () => 0 }),
  latencyMs: Annotation({ default: () => 0 }),
  finalResponse: Annotation({ default: () => null }),
  // P4 工具能力：注入工具集 + ReAct 循环载体
  tools: Annotation({ default: () => null }),
  // P4: 当前请求的用户上下文（{ userId, role, username }，来自 HTTP body.user），
  // execute_tools 节点执行工具前写入 AsyncLocalStorage，供工具 getContext 读取。
  userContext: Annotation({ default: () => null }),
  companions: Annotation({ default: () => [] }),
  // P4: 长记忆召回结果（{ memories, worldStates }），route 节点注入、branch 拼入系统提示。
  memoryContext: Annotation({ default: () => null }),
  toolCalls: Annotation({ default: () => [] }),
  toolResults: Annotation({ default: () => [] }),
  toolLoopCount: Annotation({ default: () => 0 }),
  maxToolRounds: Annotation({ default: () => 4 }),
  // P4: HITL（KIN 审批）—— approval 节点 interrupt 的载体。
  approvalRequest: Annotation({ default: () => null }), // 发给前端的审批请求
  approvalDecision: Annotation({ default: () => null }), // { approved, reason }（resume 注入）
  approvalDenied: Annotation({ default: () => false }), // 审批拒绝标记
});
