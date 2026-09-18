#!/usr/bin/env node
/**
 * 环境变量校验脚本（R-18）：启动服务前检查必填环境变量，缺项即报错并指明缺失项。
 *
 * 用法：
 *   node scripts/check-env.mjs [phase5|phase6]
 *   （不传则校验全部服务）
 */
const REQUIREMENTS = {
  phase5: [
    'PHASE5_AUTH_SECRET',
    'PHASE5_SERVICE_TOKEN',
    'PHASE5_BOOTSTRAP_ADMIN_PASSWORD',
  ],
  phase6: ['PHASE5_SERVICE_TOKEN'],
};

const target = process.argv[2];
const services = target
  ? { [target]: REQUIREMENTS[target] }
  : REQUIREMENTS;

if (target && !REQUIREMENTS[target]) {
  console.error('[env] 未知服务: ' + target + '（可用: ' + Object.keys(REQUIREMENTS).join(', ') + '）');
  process.exit(2);
}

let missing = 0;
for (const [service, vars] of Object.entries(services)) {
  const miss = (vars || []).filter((v) => !process.env[v]);
  if (miss.length > 0) {
    missing += miss.length;
    console.log('[env] ' + service + ' 缺失: ' + miss.join(', '));
  } else {
    console.log('[env] ' + service + ' 配置完整');
  }
}

if (missing === 0) {
  console.log('[env] 通过：必填环境变量已配置');
} else {
  console.log('[env] 缺失 ' + missing + ' 项必填环境变量，请先配置');
}
process.exit(missing === 0 ? 0 : 1);
