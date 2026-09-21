#!/usr/bin/env node
/**
 * 宅院 GLB 部署「一键自检」总控 —— Pi Agent 只需跑这一条命令。
 *
 *   node scripts/run-manor-deploy-check.mjs                 # 全量（含慢套件，约 20 分钟）
 *   node scripts/run-manor-deploy-check.mjs --fast          # 跳过慢套件（约 6~8 分钟）
 *   node scripts/run-manor-deploy-check.mjs --only=scope    # 只跑某几步（逗号分隔 id）
 *   node scripts/run-manor-deploy-check.mjs --base=HEAD~1   # 指定改动范围守卫的对比基线
 *   node scripts/run-manor-deploy-check.mjs --list          # 列出步骤与对应的自检清单项
 *
 * 它做三件事：
 *   0. 改动范围守卫：用 git 证明「只动了模型与材质」，其余业务文件一个都没碰（对应硬性部署规则）
 *   1. 依次跑模型侧 / 场景侧 / 各业务回归套件（每条输出实时透传）
 *   2. 汇总成一张「自检清单 → 通过/失败」表，并给出总退出码
 *
 * 退出码：0 = 全通过；1 = 有失败项。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;

const argOf = (flag, fallback = null) => {
  const withEq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (withEq) return withEq.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')
    ? process.argv[idx + 1]
    : fallback;
};

const FAST = process.argv.includes('--fast');
const ONLY = argOf('--only');
const BASE = argOf('--base', 'HEAD~1');
const COOLDOWN_MS = Number(argOf('--cooldown', '5')) * 1000;
const onlySet = ONLY ? new Set(ONLY.split(',').map((s) => s.trim())) : null;

// ---------------------------------------------------------------- 步骤定义
/**
 * coverage 里的字符串直接对应交付给 Pi Agent 的自检清单条目。
 * slow=true 的步骤在 --fast 下跳过。
 */
const STEPS = [
  {
    id: 'scope',
    title: '改动范围守卫（git 证明只动了模型/材质）',
    coverage: ['硬性部署规则：其余业务系统全部保持原样'],
    slow: false,
    run: () => runScopeGuard(),
  },
  {
    id: 'glb',
    title: 'A. 模型侧预检（GLB 结构/尺度/原点）',
    coverage: ['建筑不悬浮、无穿模，占地范围和原始建筑一致', '模型成功挂载到对应地块（前置）'],
    slow: false,
    exec: ['scripts/verify-manor-deploy.mjs', '--glb-only'],
  },
  {
    id: 'scene',
    title: 'B–F. 场景侧校验（挂载/落位/穿模/既有系统/性能/漫游）',
    coverage: [
      '模型成功挂载到对应地块',
      '建筑不悬浮、无穿模，占地范围和原始建筑一致',
      '页面加载速度无明显下降，帧率稳定',
      '相机漫游正常',
    ],
    slow: false,
    exec: ['scripts/verify-manor-deploy.mjs'],
  },
  {
    id: 'materials',
    title: '建筑材质：共享材质/贴图/复用（材质替换生效）',
    coverage: ['加载新 ThreeJS 材质，替换旧建筑材质'],
    slow: false,
    exec: ['scripts/test-manor-materials.mjs'],
  },
  {
    id: 'beacons',
    title: '回归：居民屋顶暖灯与木牌锚定',
    coverage: ['建筑不悬浮（灯笼仍正确锚定在屋顶）'],
    slow: false,
    exec: ['scripts/test-resident-beacons.mjs'],
  },
  {
    id: 'roaming',
    title: '回归：居民院内闲逛（无穿墙、路径正常）',
    coverage: ['居民 Avatar 可正常在院内闲逛，无穿墙、路径异常'],
    slow: true,
    exec: ['scripts/test-resident-roaming.mjs'],
  },
  {
    id: 'chat',
    title: '回归：居民聊天 / @直聊 / 未登录提示',
    coverage: ['居民聊天等原有业务功能全部正常'],
    slow: false,
    exec: ['scripts/test-resident-chat-entry.mjs'],
  },
  {
    id: 'persona',
    title: '回归：居民人设与真实 LLM',
    coverage: ['人设等原有业务功能全部正常'],
    slow: false,
    exec: ['scripts/test-resident-persona.mjs'],
  },
];

if (process.argv.includes('--list')) {
  console.log('自检步骤：\n');
  STEPS.forEach((s, i) => {
    console.log(`${i}. [${s.id}] ${s.title}${s.slow ? '  （慢，--fast 时跳过）' : ''}`);
    s.coverage.forEach((c) => console.log(`     → 覆盖清单项：${c}`));
  });
  process.exit(0);
}

// ---------------------------------------------------------------- 工具
const results = [];
const pushResult = (id, title, ok, extra = '', seconds = 0) => {
  results.push({ id, title, ok, extra, seconds: Number(seconds.toFixed(1)) });
};

const runNode = (args) => {
  const [script, ...rest] = args;
  const started = Date.now();
  const res = spawnSync(NODE, [path.join(ROOT, script), ...rest], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return { code: res.status, seconds: (Date.now() - started) / 1000 };
};

// ---------------------------------------------------------------- 0. 范围守卫
const ALLOWED = [
  { re: /^frontend\/src\/virtual-utopia\/webgl\/models\/.*\.glb$/, label: '房屋模型（GLB）' },
  { re: /^frontend\/src\/virtual-utopia\/webgl\/materials\//, label: '建筑材质模块' },
];
/** 装配层：属于「把新模型/新材质接上」的必要改动，但文件里也含业务代码 → 只提示、不判失败。 */
const REVIEW = [
  { re: /^frontend\/src\/virtual-utopia\/webgl\/modelLoader\.js$/, label: '模型加载清单' },
  { re: /^frontend\/src\/virtual-utopia\/webgl\/ThreeWorld\.js$/, label: '世界装配（含选型分支）' },
];
const NON_PRODUCT = [
  { re: /^docs\//, label: '文档' },
  { re: /^scripts\//, label: '自检脚本' },
  { re: /^\.workbuddy\//, label: '工作区（不入库）' },
  { re: /^vu_screens\//, label: '自测截图' },
];
const FORBIDDEN_HINT = [
  { re: /worldLayout|homes|plots?/i, hint: '地块坐标 / 宅院边界' },
  { re: /collision|collider/i, hint: '碰撞盒' },
  { re: /resident|roam|avatar/i, hint: '居民 AI 闲逛 / Avatar' },
  { re: /camera|controls/i, hint: '相机漫游' },
  { re: /^backend\//, hint: '后端' },
  { re: /chat|residentChat/i, hint: '聊天' },
  { re: /persona/i, hint: '人设' },
];

function runScopeGuard() {
  const git = (args) =>
    spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout || '';

  const list = (raw) =>
    raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

  const committed = list(git(['diff', '--name-only', `${BASE}...HEAD`]));
  const working = list(git(['diff', '--name-only', 'HEAD']));
  const untracked = list(git(['ls-files', '--others', '--exclude-standard']));
  const all = [...new Set([...committed, ...working, ...untracked])];

  const allowed = [];
  const review = [];
  const nonProduct = [];
  const violations = [];

  all.forEach((file) => {
    if (ALLOWED.some((r) => r.re.test(file))) {
      allowed.push(file);
      return;
    }
    if (REVIEW.some((r) => r.re.test(file))) {
      review.push(file);
      return;
    }
    if (NON_PRODUCT.some((r) => r.re.test(file))) {
      nonProduct.push(file);
      return;
    }
    const hint = FORBIDDEN_HINT.find((r) => r.re.test(file));
    violations.push({ file, hint: hint ? hint.hint : '未知业务文件' });
  });

  console.log(`对比基线: ${BASE}（含工作区未提交改动）`);
  console.log(`允许改动（模型 / 材质）: ${allowed.length} 个`);
  allowed.forEach((f) => console.log(`  · ${f}`));

  if (nonProduct.length) {
    console.log(`非产品面（文档 / 脚本 / 工作区截图）: ${nonProduct.length} 个（不影响业务）`);
    nonProduct.slice(0, 8).forEach((f) => console.log(`  · ${f}`));
    if (nonProduct.length > 8) console.log(`  · …（其余 ${nonProduct.length - 8} 个略）`);
  }

  if (review.length) {
    console.log(`\n需人工确认（装配层，非业务逻辑；请核对改动仅限"模型选型/包围盒"）: ${review.length} 个`);
    review.forEach((file) => {
      const diff = spawnSync(
        'git',
        ['diff', '-U0', BASE, '--', file],
        { cwd: ROOT, encoding: 'utf8' },
      ).stdout || '';
      const hunks = list(diff)
        .filter((l) => l.startsWith('@@'))
        .map((l) => l.replace(/@@.*?@@/, '').trim())
        .slice(0, 10);
      console.log(`  ! ${file}`);
      if (hunks.length) {
        hunks.forEach((h) => console.log(`      改动行段: ${h}`));
      } else {
        console.log('      （工作区版本，无 hunk 信息；请人工 diff 核对）');
      }
    });
    console.log('  参考做法：临溪新变体只需改 modelLoader 的加载清单与 ThreeWorld 的选型分支/边界兜底。');
  }

  if (violations.length) {
    console.log(`\n越界改动: ${violations.length} 个 —— 违反硬性部署规则！`);
    violations.forEach((v) => console.log(`  ✗ ${v.file}   （疑似：${v.hint}）`));
    console.log('\n处理建议：这些文件必须还原 ——  git checkout -- <文件>');
    return 1;
  }

  console.log('\nOK 改动范围合规：只涉及模型与材质（装配层见上方提示），未触碰地块/边界/碰撞/AI/相机/后端/聊天/人设');
  return 0;
}

// ---------------------------------------------------------------- 前置：服务可达
async function preflight() {
  const probe = async (url) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return res.status;
    } catch {
      return 0;
    }
  };

  const world = await probe('http://localhost:5199/');
  console.log(`前端世界 5199: ${world || '不可达'}`);
  if (!world) {
    console.log('FAIL 前端世界不可达 —— 请先启动 5199（vite dev）再跑自检。');
    return false;
  }
  const p6 = await probe('http://localhost:3400/health');
  console.log(`phase6 3400: ${p6 || '不可达'}  （仅 chat/persona 套件需要，不可达时那两步会失败）`);
  return true;
}

// ---------------------------------------------------------------- 主流程
const selected = onlySet ? STEPS.filter((s) => onlySet.has(s.id)) : STEPS;
if (!selected.length) {
  console.log('没有匹配的步骤（检查 --only 的 id）。用 --list 查看可用 id。');
  process.exit(1);
}

console.log('=== 宅院 GLB 部署自检 ===');
console.log(`模式: ${FAST ? 'fast（跳过慢套件）' : '全量'} · 步骤: ${selected.map((s) => s.id).join(' → ')}\n`);

if (!(await preflight())) {
  process.exit(1);
}

for (const [index, step] of selected.entries()) {
  console.log(`\n──────── [${index + 1}/${selected.length}] ${step.title} ────────`);

  if (step.slow && FAST) {
    console.log('SKIP --fast 模式跳过该慢套件（如需完整回归请去掉 --fast）');
    pushResult(step.id, step.title, true, 'SKIPPED (--fast)');
    continue;
  }

  let code = 1;
  let seconds = 0;

  if (typeof step.run === 'function') {
    const started = Date.now();
    code = await step.run();
    seconds = (Date.now() - started) / 1000;
  } else {
    const res = runNode(step.exec);
    code = res.code;
    seconds = res.seconds;
  }

  pushResult(step.id, step.title, code === 0, `exit=${code}`, seconds);

  // 步骤间冷却：连续跑多个重套件会让 phase5 持久化接口偶发瞬时 503，留一点喘息。
  if (COOLDOWN_MS > 0 && index < selected.length - 1) {
    await new Promise((r) => setTimeout(r, COOLDOWN_MS));
  }
}

// ---------------------------------------------------------------- 汇总
console.log('\n\n=================== 部署自检汇总 ===================');
const w = Math.max(...results.map((r) => r.title.length), 10);
results.forEach((r) => {
  console.log(
    `${r.ok ? 'OK  ' : 'FAIL'} ${r.title.padEnd(w)}  ${String(r.extra).padEnd(16)} ${r.seconds}s`,
  );
});

console.log('\n---------------- 自检清单对照 ----------------');
const CHECKLIST = [
  ['模型成功挂载到对应地块', ['glb', 'scene']],
  ['建筑不悬浮、无穿模，占地范围和原始建筑一致', ['glb', 'scene', 'beacons']],
  ['页面加载速度无明显下降，帧率稳定', ['scene']],
  ['居民 Avatar 可正常在院内闲逛，无穿墙、路径异常', ['roaming']],
  ['相机漫游正常', ['scene']],
  ['注册、申请审批、居民聊天、人设等原有业务功能全部正常', ['scope', 'chat', 'persona']],
];

CHECKLIST.forEach(([label, ids]) => {
  const involved = results.filter((r) => ids.includes(r.id));
  const notSelected = ids.filter((id) => !results.some((r) => r.id === id));
  const allExecuted = notSelected.length === 0;
  const ok = involved.length > 0 && involved.every((r) => r.ok);
  const skippedAll =
    involved.length > 0 && involved.every((r) => r.extra.includes('SKIPPED'));
  const mark = !allExecuted || skippedAll ? '➖' : ok ? '✅' : '❌';
  const detail = involved
    .map((r) => `${r.id}:${r.extra.includes('SKIPPED') ? '跳过' : r.ok ? '通过' : '失败'}`)
    .concat(notSelected.map((id) => `${id}:未执行`))
    .join(' ');
  console.log(`${mark} ${label}  [${detail || '未执行'}]`);
});

const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.extra.includes('SKIPPED'));
console.log(
  `\n=== ${failed.length === 0 ? '全部通过' : failed.length + ' 项失败'}${skipped.length ? `（${skipped.length} 项因 --fast 跳过）` : ''} ===`,
);
if (failed.length) {
  console.log('失败步骤：' + failed.map((r) => r.id).join(', '));
  console.log('回滚方式：node scripts/rollback-manor-deploy.mjs   （或 git reset --hard <基线 commit>）');
}
process.exit(failed.length ? 1 : 0);
