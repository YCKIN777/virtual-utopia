// scene 段端口注释（针对精确串）
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'H:/BP2/deploy/docker-compose.yml';
let t = readFileSync(p, 'utf8');
const old = `    command: ["node", "backend/src/server.js"]
    ports:
      - "3000:3000"`;
const next = `    command: ["node", "backend/src/server.js"]
    # P5.6-1 生产收敛：移除宿主端口映射，仅容器内网可达（nginx 同域反代 /scene-api -> scene:3000）。
    # ports:
    #   - "3000:3000"`;
if (!t.includes(old)) {
  writeFileSync('H:/BP2/ports-patch.txt', 'scene 未命中', 'utf8');
  process.exit(0);
}
writeFileSync(p, t.replace(old, next), 'utf8');
writeFileSync('H:/BP2/ports-patch.txt', 'scene 端口已注释', 'utf8');
