// backend/src/routes/resume.js
// P4: HITL 恢复端点 —— POST /api/scene/route/resume
// body: { conversationId, decision: { approved: boolean, reason?: string } }
// 对同一 thread 以 Command({ resume }) 继续图执行（approval 节点 interrupt 的恢复）。
// 返回与 /scene/route 相同的完整响应结构。
// 待办⑥：resume 权限从「仅 admin」升级为「admin 或会话 owner」——
//   ① admin：可审批任意会话（KIN 管理通道，不变）；
//   ② 非 admin：conversationId 必须注册过 owner 且 userId 匹配（owner 恢复自己的会话），
//      无归属记录或归属不符 → 403（防伪造 conversationId 越权恢复他人会话）。
import { Router } from 'express';

export const createResumeRouter = ({ orchestrator, conversationRegistry }) => {
  const router = Router();

  const assertResumePermission = (userContext, conversationId) => {
    // 游客：不可审批/恢复
    if (!userContext?.userId) {
      return {
        allowed: false,
        message: '登录后方可执行恢复操作',
      };
    }

    // KIN（admin）：管理通道，任意会话可审批
    if (userContext.role === 'admin') {
      return { allowed: true };
    }

    // 非 admin：校验 conversationId → owner 归属
    const owner = conversationRegistry?.getOwner(conversationId);

    if (!owner) {
      return {
        allowed: false,
        message: '会话归属未登记，仅 KIN（管理员）可审批',
      };
    }

    if (owner.userId !== userContext.userId) {
      return {
        allowed: false,
        message: '该会话不属于当前用户，无法恢复',
      };
    }

    return { allowed: true };
  };

  router.post('/scene/route/resume', async (request, response) => {
    try {
      // P4 收尾：身份由 sceneAuth 中间件经 phase6 /auth/me 解析注入 request.userContext。
      // 待办⑥：归属校验（admin 任意 / owner 放行 / 无记录或非 owner 403）。
      const conversationId = request.body?.conversationId;

      if (!conversationId) {
        return response.status(400).json({
          error: 'INVALID_REQUEST',
          message: '缺少 conversationId',
        });
      }

      const permission = assertResumePermission(
        request.userContext,
        conversationId,
      );

      if (!permission.allowed) {
        return response.status(403).json({
          error: 'FORBIDDEN',
          message: permission.message,
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
