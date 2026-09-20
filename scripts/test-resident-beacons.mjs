#!/usr/bin/env node
/**
 * 阶段一(调整)验收自测：屋顶暖黄小灯笼 + 木牌署名（替换原强光柱）。
 * 依赖运行中的世界前端(5199)。世界为纯前端 3D 渲染，无需登录。
 * 验证：5 盏暖灯、木牌锚定屋顶、白天不发光、傍晚/夜间自动亮起、可点击识别、0 控制台报错；
 *       并输出白天/夜晚截图。
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const WORLD = process.env.WORLD_URL || 'http://localhost:5199';
const SCREEN_DIR = path.resolve('vu_screens');
mkdirSync(SCREEN_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

const results = [];
const record = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`);
};

// 截图非验收必需（模型不可读图），且 swiftshader 下偶发卡在字体等待。
// 用 try/catch 包住，失败只提示不影响功能验收汇总。
const safeShot = async (name) => {
  try {
    await page.screenshot({
      path: path.join(SCREEN_DIR, name),
      animations: 'disabled',
      timeout: 60000,
    });
    console.log(`截图已保存 · ${name}`);
  } catch (e) {
    console.log(`截图跳过 · ${name} · ${String(e.message).split('\n')[0]}`);
  }
};

try {
  await page.goto(`${WORLD}/#/world`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__utopiaWorld), null, { timeout: 45000 });
  await page.waitForFunction(() => window.__utopiaWorld.homeObjects.size >= 50, null, {
    timeout: 45000,
  });
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const EXPECTED = ['plot-2', 'plot-15', 'plot-25', 'plot-40', 'plot-48'];
    const keys = [...w.residentBeacons.keys()];
    const details = keys.map((id) => {
      const b = w.residentBeacons.get(id);
      const home = w.homeObjects.get(id)?.home;
      return {
        id,
        roofY: +b.group.position.y.toFixed(2),
        homeY: home ? +home.y.toFixed(2) : null,
        signLocalY: +b.sign.position.y.toFixed(2),
        hasSignTexture: Boolean(b.sign.material?.map),
        hasLantern: Boolean(b.haloMaterial && b.paperMaterial && b.light),
        noBeam: !('outerMaterial' in b) && !('coreMaterial' in b),
      };
    });
    const clickableResidentHome = w.clickableMeshes.filter(
      (m) => m.userData?.selectionType === 'residentHome',
    ).length;
    return { size: w.residentBeacons.size, keys, EXPECTED, details, clickableResidentHome };
  });

  record('屋顶暖灯+木牌 数量 = 5', info.size === 5, `实际 ${info.size}`);
  record(
    '暖灯对应 5 个原住民 plot',
    JSON.stringify([...info.keys].sort()) === JSON.stringify([...info.EXPECTED].sort()),
    info.keys.join(','),
  );
  record(
    '每处是柔光小灯笼(无刺眼强光柱)',
    info.details.every((d) => d.hasLantern && d.noBeam),
  );
  record(
    '每盏灯笼下方含木牌(Sprite + CanvasTexture)',
    info.details.every((d) => d.hasSignTexture),
  );
  record(
    '木牌锚定在屋顶上方(roofY > homeY，signLocalY > 0)',
    info.details.every((d) => d.roofY > (d.homeY ?? -1) && d.signLocalY > 0),
    info.details.map((d) => `${d.id}:${d.roofY}>${d.homeY}`).join(' '),
  );
  record(
    '灯笼/木牌网格可点击(clickableMeshes 含 residentHome ≥15)',
    info.clickableResidentHome >= 15,
    `count=${info.clickableResidentHome}`,
  );

  // 白天：普通小灯笼不发光。
  // 昼夜过渡是带阻尼的平滑插值；无头 swiftshader 帧率极低，这里用确定性方式快进过渡，
  // 再等待渲染帧把灯笼材质更新生效，避免依赖墙钟时间。
  await page.evaluate(() => {
    const w = window.__utopiaWorld;
    w.autoDayCycle = false;
    w.setTimePeriod('day');
    for (let i = 0; i < 160; i += 1) w.updateDayMode(0.05);
  });
  await page.waitForFunction(
    () => window.__utopiaWorld.residentBeacons.get('plot-2').light.intensity < 0.08,
    null,
    { timeout: 30000, polling: 200 },
  );
  const day = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const b = w.residentBeacons.get('plot-2');
    return {
      light: +b.light.intensity.toFixed(3),
      halo: +b.haloMaterial.opacity.toFixed(3),
      nightBlend: +(w.nightBlend ?? 0).toFixed(3),
    };
  });
  record(
    '白天：灯笼不发光(点光≈0、光晕≈0)',
    day.light < 0.08 && day.halo < 0.08,
    `light=${day.light} halo=${day.halo} nightBlend=${day.nightBlend}`,
  );
  await safeShot('beacon_day_overview.png');

  // 傍晚/夜间：暖黄小灯自动亮起
  await page.evaluate(() => {
    const w = window.__utopiaWorld;
    w.setTimePeriod('night');
    for (let i = 0; i < 160; i += 1) w.updateDayMode(0.05);
  });
  await page.waitForFunction(
    () => window.__utopiaWorld.residentBeacons.get('plot-2').light.intensity > 0.4,
    null,
    { timeout: 30000, polling: 200 },
  );
  const night = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const b = w.residentBeacons.get('plot-2');
    return {
      light: +b.light.intensity.toFixed(3),
      halo: +b.haloMaterial.opacity.toFixed(3),
      nightBlend: +(w.nightBlend ?? 0).toFixed(3),
    };
  });
  record(
    '夜晚：暖黄小灯亮起(点光>0.4、光晕>0.25)',
    night.light > 0.4 && night.halo > 0.25,
    `light=${night.light} halo=${night.halo} nightBlend=${night.nightBlend}`,
  );
  await page.evaluate(() => window.__utopiaWorld.flyToOverview());
  await page.waitForTimeout(3800);
  await safeShot('beacons_night_overview.png');

  // 近景：手动把相机放到阿岚 plot-2 附近，避开 flyToHome 的非户主浮层
  await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const g = w.residentBeacons.get('plot-2').group.position;
    w.flyAnimation = null;
    w.overviewMode = false;
    w.controls.target.set(g.x, g.y + 2, g.z);
    w.camera.position.set(g.x + 13, g.y + 9, g.z + 13);
    w.camera.lookAt(g.x, g.y + 2, g.z);
    w.controls.update();
  });
  await page.waitForTimeout(1800);
  await safeShot('beacon_closeup_alan.png');

  // 真实鼠标点击木牌 → 信息卡识别（此视角无浮层遮挡）
  const coords = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const b = w.residentBeacons.get('plot-2');
    const rect = w.renderer.domElement.getBoundingClientRect();
    const p = b.group.position.clone().add(b.sign.position);
    p.project(w.camera);
    return {
      x: rect.left + (p.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-p.y * 0.5 + 0.5) * rect.height,
    };
  });
  await page.mouse.click(coords.x, coords.y);
  await page.waitForTimeout(900);
  const card = await page.evaluate(() => {
    const el = document.querySelector('.vu-world-info');
    if (!el) return null;
    return {
      text: el.textContent.replace(/\s+/g, ' ').trim(),
      kicker: el.querySelector('.vu-kicker')?.textContent.trim() || '',
      hasFly: Boolean(el.querySelector('.vu-world-info__action')),
    };
  });
  record(
    '真实鼠标点击木牌→信息卡识别为「阿岚的家 / RESIDENT HOME」',
    Boolean(card) && card.text.includes('阿岚') && card.kicker.includes('RESIDENT HOME') && card.hasFly,
    card ? `${card.kicker} · ${card.text.slice(0, 18)}` : 'no card',
  );
  await safeShot('beacon_click_info.png');

  const meaningfulErrors = errors.filter((e) => !/favicon/i.test(e) && !/401/.test(e));
  record('全程 0 控制台报错', meaningfulErrors.length === 0, meaningfulErrors.slice(0, 3).join(' | '));
} catch (error) {
  record('执行异常', false, error.message);
} finally {
  await ctx.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== 汇总: ${failed.length === 0 ? '全部通过' : failed.length + ' 项失败'} ===`);
process.exit(failed.length ? 1 : 0);
