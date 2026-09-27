// backend/src/ai/graph/graphOrchestrator.js
// P3: LangGraph StateGraph 图编排 —— 居民 AI 对话试点。
// 图结构：START → route →(条件边: high→safety / 分支路由)→ branch×5 →(P4 工具轮)
//         → approval(敏感工具,HITL) → execute_tools → branch … → finalize → END
// 接口与旧 createSceneOrchestrator 完全一致（handle(body) → {sceneId, sceneName, result, meta}），
// 由 orchestrator.js 按 USE_LANGGRAPH 开关选择。
// thread_id 语义：请求带 conversationId → SQLite Checkpointer 断点续跑（服务端状态）；
//              不带 → 临时唯一 thread（行为与旧编排一致，历史靠 request.history 传递）。
// P4 HITL：命中敏感工具（approvalTools）时，approval 节点 interrupt 暂停图执行，
// 返回 { status:'pending_approval', approval }；前端经 POST /api/scene/route/resume
// 以 Command({ resume }) 恢复同一 thread，图继续执行。
import { randomUUID } from 'node:crypto';
import { START, END, Command, StateGraph, isInterrupted, INTERRUPT } from '@langchain/langgraph';
import { env } from '../../config/env.js';
import { branchAgents } from '../../agents/branches/index.js';
import { normalizeSceneRequest } from '../../services/sceneRouter.js';
import { SceneStateAnnotation } from './state.js';
import { createCheckpointer } from './checkpointer.js';
import {
  createIntentNode,
  safetyNode,
  createBranchNode,
  createApprovalNode,
  createToolsNode,
  finalizeNode,
} from './nodes.js';
import { streamingContextStorage } from '../tools/context.js';
import { createConversationRegistry } from '../../services/conversationRegistry.js';

const routeBranch = (state) => {
  if (state.risk === 'high') {
    return 'safety';
  }

  return state.targetAgentId;
};

// P4：branch 之后 —— 有工具调用则进 execute_tools 节点；若含敏感工具且 HITL 开启，
// 先进 approval 节点等 KIN 审批。
// 待办④：导出供单测（approvalRouting.test.js）—— 审批清单为配置驱动（env.ai.approvalTools）。
export const routeAfterBranch = (state) => {
  if (state.toolCalls.length === 0) {
    return 'finalize';
  }

  if (
    env.ai.hitlEnabled &&
    state.toolCalls.some((call) => env.ai.approvalTools.includes(call.name))
  ) {
    return 'approval';
  }

  return 'execute_tools';
};

// P4：approval 之后 —— 审批通过才执行工具，拒绝则直接 finalize（approval 节点已产出拒绝回复）。
const routeAfterApproval = (state) =>
  state.approvalDecision?.approved === true ? 'execute_tools' : 'finalize';

// P4：execute_tools 之后 —— 工具轮数未超限则回分支（让模型基于结果总结），超限则结束。
const routeAfterTools = (state) =>
  state.toolLoopCount >= (state.maxToolRounds ?? 4)
    ? 'finalize'
    : state.targetAgentId;

export const buildSceneGraph = ({
  modelClient,
  checkpointer,
  tools = null,
  memoryGateway = null,
}) => {
  const toolRegistry = tools
    ? Object.fromEntries(tools.map((registeredTool) => [registeredTool.name, registeredTool]))
    : {};
  const intentNode = createIntentNode({ memoryGateway });

  let graph = new StateGraph(SceneStateAnnotation)
    .addNode('route', intentNode)
    .addNode('safety', safetyNode)
    .addNode('finalize', finalizeNode);

  if (tools) {
    graph = graph.addNode('execute_tools', createToolsNode(toolRegistry));

    // P4: HITL 审批节点（敏感工具执行前 interrupt 暂停）
    if (env.ai.hitlEnabled) {
      graph = graph.addNode('approval', createApprovalNode());
    }
  }

  for (const agent of Object.values(branchAgents)) {
    graph = graph.addNode(
      agent.id,
      createBranchNode(agent, modelClient),
    );
  }

  graph = graph
    .addEdge(START, 'route')
    .addConditionalEdges('route', routeBranch)
    .addEdge('safety', 'finalize');

  for (const agent of Object.values(branchAgents)) {
    graph = graph.addConditionalEdges(agent.id, routeAfterBranch);
  }

  if (tools) {
    graph = graph.addConditionalEdges('approval', routeAfterApproval);
    graph = graph.addConditionalEdges('execute_tools', routeAfterTools);
  }

  return graph
    .addEdge('finalize', END)
    .compile({ checkpointer });
};

export const createSceneGraphOrchestrator = ({
  modelClient,
  checkpointer,
  tools = null,
  memoryGateway = null,
  // 待办⑥：conversationId → owner 归属注册表（resume 归属校验用）。
  conversationRegistry = createConversationRegistry(),
} = {}) => {
  const graph = buildSceneGraph({
    modelClient,
    checkpointer: checkpointer ?? createCheckpointer(),
    tools,
    memoryGateway,
  });

  const buildInput = (body, request, userContext) => {
    const input = {
      sceneId: request.sceneId,
      sceneName: request.sceneName,
      inputContent: request.input.content,
      requestHistory: request.history,
    };

    if (tools) {
      input.tools = tools;
    }

    // P4 收尾：请求级用户上下文由 HTTP 层真实认证注入（sceneAuth 中间件经 phase6
    // /auth/me 解析 Bearer token → { userId, role, username }）。不再接受 body.user
    // 直传（可伪造身份）；无 token 时 userContext=null（游客，工具按角色矩阵拒绝）。
    if (userContext) {
      input.userContext = userContext;
    }

    return input;
  };

  const persistMemory = (body, request, finalState, userContext) => {
    if (memoryGateway && userContext?.userId && finalState?.reply) {
      memoryGateway.after({
        userId: userContext.userId,
        conversationId: body.conversationId,
        sceneId: request.sceneId,
        // P5.7：记录是哪个居民角色在和你对话（印象按居民维度积累）
        residentId: finalState.branchAgent?.id,
        userContent: request.input.content,
        reply: finalState.reply,
      });
    }
  };

  // 待办⑥：持久会话（带 conversationId）注册 owner 归属，供 resume 校验。
  const registerOwner = (body, userContext) => {
    if (body.conversationId) {
      conversationRegistry.register(body.conversationId, userContext);
    }
  };

  const invokeGraph = (input, threadId) => {
    const config = { configurable: { thread_id: threadId } };

    return graph.invoke(input, config);
  };

  // P4: 检测 interrupt 暂停 —— invoke 正常返回但带 __interrupt__ 键，
  // 说明图在 approval 节点停下等 KIN 审批（finalResponse 为空）。
  const toPendingApproval = (finalState) => {
    const interrupt = finalState?.[INTERRUPT]?.[0]?.value ?? null;

    if (!interrupt) return null;

    return {
      status: 'pending_approval',
      conversationId: null, // 调用方填充
      approval: interrupt,
      finalResponse: null,
    };
  };

  return Object.freeze({
    async handle(body, { userContext } = {}) {
      const request = normalizeSceneRequest(body);
      const threadId = body.conversationId ?? `ephemeral-${randomUUID()}`;

      // 待办⑥：持久会话注册 owner 归属（游客不注册 —— userContext=null）
      registerOwner(body, userContext);

      const finalState = await invokeGraph(
        buildInput(body, request, userContext),
        threadId,
      );

      if (isInterrupted(finalState)) {
        const pending = toPendingApproval(finalState);
        pending.conversationId = body.conversationId || threadId;

        return pending;
      }

      persistMemory(body, request, finalState, userContext);

      return finalState.finalResponse;
    },

    // P4: 流式入口 —— 在 AsyncLocalStorage 中提供 { onStatus, onToken }，
    // branch 最终轮经模型 .stream 推 token、工具轮推阶段事件。
    // 若图在 approval 节点暂停，同样返回 pending_approval 载荷（SSE 层发 approval_pending 事件）。
    async handleStream(body, { onStatus, onToken, userContext } = {}) {
      const request = normalizeSceneRequest(body);
      const threadId = body.conversationId ?? `ephemeral-${randomUUID()}`;

      // 待办⑥：持久会话注册 owner 归属
      registerOwner(body, userContext);

      const streamContext = { onStatus, onToken };
      const finalState = await streamingContextStorage.run(
        streamContext,
        () => invokeGraph(buildInput(body, request, userContext), threadId),
      );

      if (isInterrupted(finalState)) {
        const pending = toPendingApproval(finalState);
        pending.conversationId = body.conversationId || threadId;

        return pending;
      }

      persistMemory(body, request, finalState, userContext);

      return finalState.finalResponse;
    },

    // P4: HITL 恢复入口 —— 对同一 thread 以 Command({ resume: decision }) 继续图执行。
    // decision 形如 { approved: boolean, reason?: string }（approval 节点 interrupt 的返回值）。
    async resume(body) {
      const { conversationId, decision } = body;

      if (!conversationId) {
        throw new SceneRequestError('缺少 conversationId', 'INVALID_REQUEST');
      }

      if (!decision || typeof decision.approved !== 'boolean') {
        throw new SceneRequestError('decision 必须包含 approved 布尔值', 'INVALID_REQUEST');
      }

      const config = { configurable: { thread_id: conversationId } };
      const finalState = await graph.invoke(
        new Command({ resume: decision }),
        config,
      );

      if (isInterrupted(finalState)) {
        const pending = toPendingApproval(finalState);
        pending.conversationId = conversationId;

        return pending;
      }

      // 恢复后正常收尾：记忆落库（body 只带 conversationId，未携带 user/scene，
      // 由 checkpoint 里的 state 回填 —— 简化：仅当 finalState 有 userContext 时落库）。
      if (memoryGateway && finalState.userContext?.userId && finalState.reply) {
        memoryGateway.after({
          userId: finalState.userContext.userId,
          conversationId,
          sceneId: finalState.sceneId,
          userContent: finalState.inputContent,
          reply: finalState.reply,
        });
      }

      return finalState.finalResponse;
    },
  });
};
