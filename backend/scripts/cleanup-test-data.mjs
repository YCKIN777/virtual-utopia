// scripts/cleanup-test-data.mjs
// P5.2-⑦：测试账号与测试数据清理。
// 用途：删除活跃/待激活的自动化测试账号（smoke_* / probe* / p5probe 等前缀），
//      保留真实/演示账号与 moved_out/disabled 历史（保 phase6 外键引用安全）。
// 用法：node scripts/cleanup-test-data.mjs [--dry-run]
// 输出：删除清单 + 保留清单 + 清理后的用户统计。
import { DatabaseSync } from 'node:sqlite';

const DATABASE_PATH = process.env.PHASE5_DB_PATH || 'H:/BP2/data/virtual_utopia_phase5.sqlite';

// 保留清单：真实用户 / 演示账号 / 用户已批准的账号（铁律：已批准不删）。
const KEEP_USERNAMES = new Set([
  'admin',
  'traveler',
  'viewer',
  'KIN',
  'KIN777',
  'momo',
  'jev',
  'ui_zzzz', // 用户已批准
]);

// 清理规则：用户名以这些前缀开头，且不在保留清单内 → 删除。
const TEST_PREFIXES = ['smoke_', 'probe', 'p5probe'];

const dryRun = process.argv.includes('--dry-run');

const database = new DatabaseSync(DATABASE_PATH);
const rows = database
  .prepare('SELECT id, username, status, role FROM users ORDER BY id')
  .all();

const isTestAccount = (username) =>
  !KEEP_USERNAMES.has(username) &&
  TEST_PREFIXES.some((prefix) => username.startsWith(prefix));

const targets = rows.filter((row) => isTestAccount(row.username));
const keep = rows.filter((row) => !isTestAccount(row.username));

console.log(`[cleanup] ${dryRun ? 'DRY-RUN（不实际删除）' : '实际执行'}`);
console.log(`  命中测试账号 ${targets.length} 个：`);
for (const row of targets) {
  console.log(`    - ${row.username} (id=${row.id}, status=${row.status}, role=${row.role})`);
}

if (dryRun) {
  console.log(`  将保留 ${keep.length} 个账号`);
  database.close();
} else {
  const del = database.prepare('DELETE FROM users WHERE username = ?');
  for (const row of targets) del.run(row.username);

  const after = database
    .prepare('SELECT COUNT(*) AS count FROM users')
    .get().count;

  console.log(`  删除完成：${targets.length} 个；剩余 ${after} 个账号`);
  console.log(`  保留账号：${keep.map((r) => r.username).join(', ')}`);

  database.close();
}
