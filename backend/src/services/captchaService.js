// backend/src/services/captchaService.js
// 待办⑤：外层壳注册/登录防滥用验证码服务。
// 内存存储：captchaId → { answer, expiresAt }；5 分钟过期、一次性（校验后删除）、
// 上限 1000 条自动清理过期项。生成 4 位数字 SVG（干扰线 + 随机位置，防 OCR/脚本）。
import { randomInt, randomUUID } from 'node:crypto';

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 1000;

const DIGITS = '23456789'; // 排除 0/1 易混淆数字

const toSvgDataUrl = (digits) => {
  const width = 128;
  const height = 40;
  const noises = [];
  let text = '';

  for (let i = 0; i < 4; i += 1) {
    const x = 12 + i * 28 + randomInt(-4, 5);
    const y = 18 + randomInt(-6, 7);
    const rotate = randomInt(-22, 23);
    text += `<text x="${x}" y="${y}" font-family="monospace" font-size="22" font-weight="bold" fill="#334155" transform="rotate(${rotate} ${x} ${y})">${digits[i]}</text>`;
  }

  // 4 条干扰线（交叉斜线 + 上下弧线模拟）
  for (let i = 0; i < 4; i += 1) {
    noises.push(
      `<line x1="${randomInt(0, width)}" y1="${randomInt(0, height)}" x2="${randomInt(0, width)}" y2="${randomInt(0, height)}" stroke="#94a3b8" stroke-width="1" opacity="0.55"/>`,
    );
  }

  for (let i = 0; i < 12; i += 1) {
    noises.push(
      `<circle cx="${randomInt(0, width)}" cy="${randomInt(0, height)}" r="1" fill="#cbd5e1" opacity="0.7"/>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f1f5f9"/>${noises.join('')}${text}</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

export const createCaptchaService = ({
  ttlMs = TTL_MS,
  maxEntries = MAX_ENTRIES,
  now = () => Date.now(),
} = {}) => {
  const store = new Map();

  const sweep = () => {
    if (store.size < maxEntries) return;

    const timestamp = now();

    for (const [id, entry] of store) {
      if (entry.expiresAt <= timestamp) {
        store.delete(id);
      }
    }
  };

  return {
    create() {
      sweep();

      const digits = Array.from({ length: 4 }, () =>
        DIGITS[randomInt(0, DIGITS.length)],
      ).join('');
      const captchaId = randomUUID();
      const expiresAt = now() + ttlMs;

      store.set(captchaId, { answer: digits, expiresAt });

      return { captchaId, image: toSvgDataUrl(digits) };
    },

    // 校验成功后立即删除（一次性）；不存在/已过期/答案错误均返回 false。
    verify(captchaId, answer) {
      if (!captchaId || !answer) return false;

      const entry = store.get(captchaId);

      if (!entry) return false;
      if (entry.expiresAt <= now()) {
        store.delete(captchaId);
        return false;
      }

      store.delete(captchaId);

      return String(answer).trim().toUpperCase() === entry.answer;
    },

    // 测试/诊断用：查看当前存量（不含答案）。
    size() {
      return store.size;
    },
  };
};

export const captchaService = createCaptchaService();
