// backend/src/routes/captcha.js
// 待办⑤：图形验证码端点 —— GET /api/scene/route/captcha
// 公开端点（游客可访问）：生成 4 位数字 SVG 验证码，返回 captchaId + 图片 data URL。
import { Router } from 'express';

export const createCaptchaRouter = ({ service }) => {
  const router = Router();

  router.get('/scene/route/captcha', (_request, response) => {
    const { captchaId, image } = service.create();

    response.json({ captchaId, image });
  });

  return router;
};
