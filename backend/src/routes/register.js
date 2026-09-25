// backend/src/routes/register.js
// 待办⑤：外层壳注册端点 —— POST /api/scene/route/register
// 公开端点（游客可访问）：图形验证码校验通过后，转发 phase5 /api/phase5/auth/register
// 创建居民入驻申请（status=pending，等 KIN 在 phase6 审批激活）。phase5 零改动。
import { Router } from 'express';

export class RegisterError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'RegisterError';

    if (options.code) {
      this.code = options.code;
    }

    if (options.statusCode) {
      this.statusCode = options.statusCode;
    }
  }
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

const validateRegisterBody = (body = {}) => {
  const username = String(body.username || '').trim();
  const displayName = String(body.displayName || '').trim();
  const password = String(body.password || '');

  if (username.length < 3) {
    throw new RegisterError('用户名至少 3 个字符', {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  }

  if (!USERNAME_PATTERN.test(username)) {
    throw new RegisterError('用户名只能包含字母、数字和下划线', {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  }

  if (displayName.length < 2 || displayName.length > 24) {
    throw new RegisterError('昵称需为 2-24 个字符', {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  }

  if (password.length < 6) {
    throw new RegisterError('密码至少 6 个字符', {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  }

  // 透传可选资料字段（与 phase5 register 入参一致）
  const profile = {};

  for (const key of [
    'hobbies',
    'occupation',
    'selfIntro',
    'contact',
    'address',
  ]) {
    if (body[key] !== undefined) {
      profile[key] = String(body[key]).trim();
    }
  }

  return { username, displayName, password, profile };
};

export const createRegisterRouter = ({
  phase5BaseUrl,
  captcha,
  fetchImpl = globalThis.fetch,
}) => {
  const registerUrl = `${phase5BaseUrl}/api/phase5/auth/register`;

  const router = Router();

  router.post('/scene/route/register', async (request, response, next) => {
    try {
      const { username, displayName, password, profile } = validateRegisterBody(
        request.body,
      );

      const captchaOk = captcha.verify(
        request.body?.captchaId,
        request.body?.captchaAnswer,
      );

      if (!captchaOk) {
        throw new RegisterError('验证码错误或已过期，请刷新后重试', {
          code: 'CAPTCHA_INVALID',
          statusCode: 403,
        });
      }

      let phase5Response;

      try {
        phase5Response = await fetchImpl(registerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            password,
            displayName,
            ...profile,
          }),
        });
      } catch (error) {
        throw new RegisterError('注册服务暂不可用，请稍后再试', {
          code: 'REGISTER_SERVICE_UNAVAILABLE',
          statusCode: 503,
        });
      }

      const payload = await phase5Response.json().catch(() => null);

      if (!phase5Response.ok) {
        // 透传 phase5 校验错误（用户名/昵称占用、格式不符等）
        throw new RegisterError(
          payload?.message || '注册失败，请稍后再试',
          {
            code: payload?.code || 'REGISTER_FAILED',
            statusCode: phase5Response.status || 400,
          },
        );
      }

      response.status(201).json({
        id: payload?.id,
        username: payload?.username ?? username,
        displayName: payload?.displayName ?? displayName,
        role: payload?.role,
        status: payload?.status ?? 'pending',
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
