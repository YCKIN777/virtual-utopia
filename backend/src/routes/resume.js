// backend/src/routes/resume.js
// P4: HITL 恢复端点 —— POST /api/scene/route/resume
// body: { conversationId, decision: { approved: boolean, reason?: string } }
// 对同一 thread 以 Command({ resume }) 继续图执行（approval 节点 interrupt 的恢复）。
// 返回与 /scene/route 相同的完整响应结构。
import { Router } from 'express';

export const createResumeRouter = ({ orchestrator }) => {
  const router = Router();

  router.post('/scene/route/resume', async (request, response) => {
    try {
      // P4 收尾：审批恢复属敏感操作 —— 仅 KIN（admin）可批准/拒绝。
      // 身份由 sceneAuth 中间件经 phase6 /auth/me 解析注入 request.userContext。
      if (request.userContext?.role !== 'admin') {
        return response.status(403).json({
          error: 'FORBIDDEN',
          message: '仅 KIN（管理员）可执行审批操作',
        });
      }

      const payload = await orchestrator.resume(request.body);

      response.json(payload);
    } catch (error) {
      const statusCode = error.statusCode || 400;

      response.status(statusCode).json({
        error: error.code || 'RESUME_ERROR',
        message: error.message || '恢复请求失败',
      });
    }
  });

  return router;
};
