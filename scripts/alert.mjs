#!/usr/bin/env node
/**
 * 健康检查 + 告警脚本（独立于冻结代码）。
 *
 * 用法：
 *   node scripts/alert.mjs [--webhook=<url>]
 *
 * 说明：
 *   - 依次探测 phase5 / phase6 健康接口。
 *   - 任一失败即输出告警 JSON，并可选 POST 到 webhook（企业微信/钉钉/自建）。
 *   - 建议接入 Windows 计划任务或 pm2 cron 周期性执行。
 */
const TARGETS = [
  {
    name: 'phase5',
    url:
      process.env.PHASE5_HEALTH_URL ||
      'http://127.0.0.1:3300/api/phase5/health',
  },
  {
    name: 'phase6',
    url: process.env.PHASE6_HEALTH_URL || 'http://127.0.0.1:3400/health',
  },
];

const webhookArg = process.argv.find((a) => a.startsWith('--webhook='));
const webhookUrl = webhookArg ? webhookArg.slice('--webhook='.length) : null;

const check = async (name, url) => {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { name, ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (error) {
    return {
      name,
      ok: false,
      status: null,
      ms: Date.now() - started,
      error: error && error.message,
    };
  }
};

const main = async () => {
  const results = [];
  for (const t of TARGETS) {
    results.push(await check(t.name, t.url));
  }

  for (const r of results) {
    const detail = r.ok ? String(r.status) : r.error || 'unreachable';
    console.log((r.ok ? '[ok] ' : '[FAIL] ') + r.name + ' ' + detail + ' ' + r.ms + 'ms');
  }

  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    const alert = {
      event: 'health-alert',
      ts: new Date().toISOString(),
      failures: failures.map((f) => f.name),
    };
    console.error(JSON.stringify(alert));

    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(alert),
        });
      } catch (error) {
        console.error('[alert] webhook 发送失败: ' + (error && error.message));
      }
    }
    process.exit(1);
  }
};

main();
