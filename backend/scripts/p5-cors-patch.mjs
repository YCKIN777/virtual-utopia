// phase5 CORS 收紧：origin:true -> 无 Origin + 回环白名单
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'H:/BP2/backend/src/phase5/httpServer.js';
let t = readFileSync(p, 'utf8');
const old = `  app.use(
    cors({
      origin: true,
    }),
  );`;
const next = `  app.use(
    cors({
      // P5.6-1 生产安全加固：origin:true（全放）收紧为「无 Origin（服务端调用）+ 本机回环」。
      // phase5 仅被 phase6 容器内调用（无 Origin 头）与 nginx 同域反代；浏览器直连 3300 仅限本机调试。
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        try {
          const { hostname } = new URL(origin);
          if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            hostname === '[::1]'
          ) {
            callback(null, true);
            return;
          }
        } catch {
          /* 非法 Origin 一律拒绝 */
        }
        callback(new Error('origin is not allowed'));
      },
    }),
  );`;
if (!t.includes(old)) {
  writeFileSync('H:/BP2/p5-cors-patch.txt', '旧串未命中', 'utf8');
  process.exit(0);
}
t = t.replace(old, next);
writeFileSync(p, t, 'utf8');
writeFileSync('H:/BP2/p5-cors-patch.txt', 'phase5 CORS 已收紧', 'utf8');
