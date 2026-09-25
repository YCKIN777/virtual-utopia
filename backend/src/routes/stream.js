// backend/src/routes/stream.js
// P4: 流式对话端点 —— POST /api/scene/route/stream（SSE）。
// 事件协议：
//   event: status      → { phase: 'thinking' | 'tool_calling' | 'tool_result', toolNames? }
//   event: reply_chunk → { token: '<模型输出片段>' }（最终轮 token 流，前端打字机渲染）
//   event: done        → { payload: <完整响应，同 /scene/route> }（meta 在此事件补全）
//   event: error       → { code, message }
// 会话历史由 checkpoint（conversationId）承担，不依赖旧 sessionStore。
import { Router } from 'express';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export const createStreamRouter = ({ orchestrator }) => {
  const router = Router();

  router.post('/scene/route/stream', async (request, response) => {
    response.set(SSE_HEADERS);
    response.flushHeaders();

    const send = (event, data) => {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const heartbeat = setInterval(() => {
      response.write(': ping\n\n');
    }, 15000);
    let settled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      response.end();
    };

    // 注意：不能用 request.on('close') —— Node 在请求 body 读完后即触发该事件，
    // 会误判客户端断开导致提前 end 流。用 response.on('close') 且仅当响应尚未正常结束时
    // 才兜底收尾（客户端中途断开场景）。
    response.on('close', () => {
      if (!response.writableEnded) {
        settle();
      }
    });

    try {
      send('status', { phase: 'thinking' });

      const handleStream =
        typeof orchestrator.handleStream === 'function'
          ? orchestrator.handleStream.bind(orchestrator)
          : null;

      if (!handleStream) {
        // 未启用流式（legacy 编排）：降级为一次性响应
        const payload = await orchestrator.handle(request.body);
        send('reply_chunk', { token: payload.result.reply });
        send('done', { payload });
        settle();
        return;
      }

      const payload = await handleStream(request.body, {
        onStatus: (status) => send('status', status),
        onToken: (token) => send('reply_chunk', { token }),
        userContext: request.userContext,
      });

      // P4 HITL：图在 approval 节点暂停 → 发 approval_pending 事件，前端据此渲染审批卡片。
      if (payload?.status === 'pending_approval') {
        send('status', { phase: 'approval_pending', approval: payload.approval });
      }

      send('done', { payload });
    } catch (error) {
      send('error', {
        code: error.code || error.name || 'UNKNOWN_ERROR',
        message: error.message || 'Request failed',
      });
    } finally {
      settle();
    }
  });

  return router;
};
