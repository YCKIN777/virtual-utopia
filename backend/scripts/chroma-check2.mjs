// 用 chromadb JS 客户端（与 scene 同款）测鉴权
import { writeFileSync, readFileSync } from 'node:fs';
import { ChromaClient } from 'chromadb';
const out = [];
const env = readFileSync('H:/BP2/backend/.env', 'utf8');
const token = (env.match(/^CHROMA_AUTH_TOKEN=(.*)$/m) || [])[1] || '';
const base = { host: 'localhost', port: 8000 };
for (const [name, opts] of [['无 token', {}], ['带 token', { headers: { 'X-Chroma-Token': token } }]]) {
  try {
    const c = new ChromaClient({ ...base, ...opts });
    const cols = await c.listCollections();
    out.push(`${name}: OK collections=${JSON.stringify(cols).slice(0, 100)}`);
  } catch (e) {
    const msg = String(e.message || e).slice(0, 150);
    out.push(`${name}: ERR ${msg}`);
  }
}
writeFileSync('H:/BP2/chroma-check2.txt', out.join('\n'), 'utf8');
