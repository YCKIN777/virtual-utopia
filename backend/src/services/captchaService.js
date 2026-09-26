// backend/src/services/captchaService.js
// 待办⑤：外层壳注册/登录防滥用验证码服务。
// P5.2-⑥（2026-09-26）：存储从内存 Map 落 SQLite（backend/data/captcha.db，跨重启持久化）。
// 语义不变：5 分钟过期、一次性（校验后删除）、上限清理；生成 4 位数字 SVG（干扰线 + 随机位置）。
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 1000;

const DIGITS = '23456789'; // 排除 0/1 易混淆数字

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '../..');

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
  // 默认内存（测试/回退友好）；生产持久化由 server.js 显式传入 backend/data/captcha.db。
  databasePath = ':memory:',
  ttlMs = TTL_MS,
  maxEntries = MAX_ENTRIES,
  now = () => Date.now(),
} = {}) => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS captcha_entries (
      id TEXT PRIMARY KEY,
      answer TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_captcha_expires
      ON captcha_entries(expires_at);
  `);

  const sweep = () => {
    const timestamp = now();

    // 先清过期项，再按总量上限清理最旧的一半
    database
      .prepare('DELETE FROM captcha_entries WHERE expires_at <= ?')
      .run(timestamp);

    const { count } = database
      .prepare('SELECT COUNT(*) AS count FROM captcha_entries')
      .get();

    if (count >= maxEntries) {
      const rows = database
        .prepare(
          `SELECT id FROM captcha_entries
           ORDER BY expires_at ASC
           LIMIT ?`,
        )
        .all(Math.ceil(maxEntries / 2));

      const remove = database.prepare('DELETE FROM captcha_entries WHERE id = ?');
      for (const row of rows) remove.run(row.id);
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

      database
        .prepare(
          `INSERT INTO captcha_entries (id, answer, expires_at) VALUES (?, ?, ?)`,
        )
        .run(captchaId, digits, expiresAt);

      return { captchaId, image: toSvgDataUrl(digits) };
    },

    // 校验成功后立即删除（一次性）；不存在/已过期/答案错误均返回 false。
    verify(captchaId, answer) {
      if (!captchaId || !answer) return false;

      const entry = database
        .prepare(
          'SELECT answer, expires_at FROM captcha_entries WHERE id = ?',
        )
        .get(captchaId);

      if (!entry) return false;

      // 一次性：无论对错，校验后即删除
      database
        .prepare('DELETE FROM captcha_entries WHERE id = ?')
        .run(captchaId);

      if (entry.expires_at <= now()) return false;

      return String(answer).trim().toUpperCase() === entry.answer;
    },

    // 测试/诊断用：查看当前存量（不含答案）。
    size() {
      return database
        .prepare('SELECT COUNT(*) AS count FROM captcha_entries')
        .get().count;
    },

    // 测试专用：读取某验证码的存储答案（不删除）。
    _answerForTest(captchaId) {
      const row = database
        .prepare('SELECT answer FROM captcha_entries WHERE id = ?')
        .get(captchaId);

      return row?.answer ?? null;
    },

    close() {
      database.close();
    },
  };
};

// 模块单例：默认内存（兼容旧行为）；生产持久化实例在 server.js 装配。
export const captchaService = createCaptchaService();
