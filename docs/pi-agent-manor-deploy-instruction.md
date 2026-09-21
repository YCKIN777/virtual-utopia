# 【交付 Pi Agent】三套宅院 GLB 模型部署执行指令 + 完整自检清单

> 任务：把「三套宋式诧寂山居宅院 GLB」部署进虚拟乌托邦项目。
> 仓库根：`H:\BP2`　前端 dev：`http://localhost:5199`　后端：3300 / 3400
> 本指令全部为**可复制执行**的命令与改动；每一步都带**校验命令 + 预期结果**，任一步不达标即停下、不要继续。

---

## 0. 硬性边界（越界即回滚，不要"顺手优化"）

**只允许改**：建筑模型文件、建筑材质、庭院氛围小品（石板/矮篱等）。
**禁止改**：地块坐标 `worldLayout.js` 的 `homes`、宅院边界/缩放/旋转规则、碰撞盒、居民 AI 闲逛（`updateRoamingAgents`/`pickRoamingWaypoint`）、相机漫游（`moveCamera`/`controls`）、后端（`backend/**`）、注册审批、聊天、人设（`residentChatService.js`、`residents.js`）。

不新增动画、不写自定义 shader、不改 LOD 结构、不动 `glassMaterials` 夜光与 `shellMaterials` 内部模式逻辑。

---

## 1. 前置事实（已实测，直接照用）

### 1.1 文件与映射

| 地块组团 | 宅基 | 使用的模型文件 | 代码分支 |
| --- | --- | --- | --- |
| 台地 `terrace` | plot-1 ~ 13 | `terrace-manor.glb` | 默认分支 |
| 临溪 `stream` | plot-14 ~ 25 | **当前复用 `terrace-manor.glb`** | 默认分支 |
| 森林 `forest` | plot-26 ~ 38 | `forest-manor.glb` | `group === 'forest'` |
| 悬崖 `cliff` | plot-39 ~ 50 | `cliff-manor.glb` | `group === 'cliff'` |

模型目录：`frontend/src/virtual-utopia/webgl/models/`
加载器：`frontend/src/virtual-utopia/webgl/modelLoader.js`（`loadWorldModels()`）
选型与材质：`frontend/src/virtual-utopia/webgl/ThreeWorld.js`

### 1.2 基线数值（**换模型前实测**，新模型必须对齐这些数）

| 模型 | 三角面 | 占地(模型本地 x×z) | 高度 y | 底面 min.y | 水平中心 |
| --- | --- | --- | --- | --- | --- |
| `terrace-manor.glb` | 312 | 4.03 × 4.19 | 3.40 | 0.00 | (0.00, 0.08) |
| `forest-manor.glb` | 264 | 4.03 × 4.19 | 2.90 | 0.00 | (0.00, 0.08) |
| `cliff-manor.glb` | 300 | 4.50 × 3.95 | 5.92 | **-2.77** | (0.40, 0.17) |

> ⚠️ **三个必须知道的对齐陷阱**
> 1. **占地/高度必须归一化到上表**。场景里 `group.scale = home.scale × (variant===2 ? 1.16 : 1) × 1.18`，`group.position.y = home.y + 0.2` 是**写死**的（属于"宅院边界"，本次不许改）。所以新模型必须**自身就是基线尺寸**；若导出成 9m 级，请先在 Blender `Object → Transform → Scale` 或 `npx gltf-transform resize` 缩到基线，再部署。
> 2. **`cliff-manor.glb` 的 `min.y ≈ -2.77` 是它"插进崖体"的咬合方式**，不要为了"原点贴地"把它抬高到 0 —— 那会让 12 栋崖居整体悬空 2.8m。
> 3. **屋顶灯笼/木牌是自动跟模型高度的**：`getModelBounds()` 用模型的 `Box3.max.y` 算灯笼挂点，换模型后无需手改；但如果新屋顶比原来高/矮很多，请目视确认灯笼仍在屋脊正上方、木牌不埋进屋顶。

### 1.3 当前渲染开销（换模型后的性能基线）

- 初始化到可交互：**约 16.7s**（无头 swiftshader，真机会更快）
- 当前相机下：**drawCalls ≈ 3812、triangles ≈ 487,832**
- 旧宅院单栋仅 ~300 面 → 50 栋约 1.5 万面；换成 2000–3000 面后，宅院部分面数约 **+8 倍（≈ +10 万面）**，约占全场 +20%。

> 结论：面数增长可控，但**务必保留 `THREE.LOD`（62 距离切换代理）**；若移动端掉帧，把 LOD 切换距离从 62 调小（这是 LOD 参数，不是宅院边界，属允许范围内）。

---

## 2. 执行步骤（Pi Agent 按序执行）

### Step 0 · 备份与开工检查（必须）

```bash
cd /h/BP2
git status --short                      # 预期：干净或只有本次要动的文件
git rev-parse --short HEAD              # 记下基线 commit，回滚用
mkdir -p .workbuddy/tmp/manor-backup
cp frontend/src/virtual-utopia/webgl/models/*-manor.glb .workbuddy/tmp/manor-backup/
```
> 备份放在 `.workbuddy/tmp/`（该目录不对 git 跟踪，不会污染提交）。

### Step 1 · 新模型预检（**先预检，不合格不要放进去**）

```bash
node scripts/verify-manor-deploy.mjs --glb-only
```
预期输出（15 项全 OK + 3 条 INFO）：
- `[xxx] 无动画/无蒙皮` ✅
- `[xxx] 未悬空（min.y ≤ 0.08）` ✅（cliff 允许负值）
- `[xxx] 原点水平居中（≤0.6m）` ✅
- `[xxx] 占地与基线一致（±18%）` ✅ ← **这一项 FAIL 就必须回 Step 1 归一化尺寸**
- `[xxx] 高度与基线一致（±15%）` ✅
- `三角面落在 2000–3000` ✅

缩小/放大命令（任选其一）：
```bash
# 方式 A：gltf-transform（推荐，无 GUI）
npx -y @gltf-transform/cli resize in.glb out.glb --scale 0.447   # 例：9.0m → 4.03m
# 方式 B：Blender 里改 Object Scale 后 Ctrl+A → Apply Scale，再导出 GLB
```
同时确保：**原点在占地中心**（Blender: `Object → Set Origin → Origin to Geometry` 后再把底部对齐 y=0）、**无动画轨道**、**贴图不要内嵌**（材质用程序化方案，内嵌会显著增大文件）。

### Step 2 · 放置模型文件

```bash
cd /h/BP2
cp <新台地宅院>.glb frontend/src/virtual-utopia/webgl/models/terrace-manor.glb
cp <新森林宅院>.glb frontend/src/virtual-utopia/webgl/models/forest-manor.glb
cp <新崖边宅院>.glb frontend/src/virtual-utopia/webgl/models/cliff-manor.glb
# 若还要新开「临溪」变体，额外放一份：
cp <新临溪宅院>.glb frontend/src/virtual-utopia/webgl/models/stream-manor.glb
node scripts/verify-manor-deploy.mjs --glb-only   # 再确认一次（文件名对齐后基线对比才生效）
```

> 文件名必须**完全同名**（`terrace-manor.glb` / `forest-manor.glb` / `cliff-manor.glb`），否则 `modelLoader.js` 找不到。

### Step 3 · 建筑材质（本迭代已完成，**无需再改**）

材质方案已在 `frontend/src/virtual-utopia/webgl/materials/manorMaterials.js`，并在 `ThreeWorld.js` 的 `buildHomes` 里按角色分配共享材质。
**新模型只需保证材质槽能被识别**：用「颜色」判角色（玻璃=带 alpha、植被=绿、屋顶=暗棕、其余按亮度分夯土/原木）。
若新模型的颜色与旧模型差异大导致分错，改 `manorMaterials.js` 顶部两个旋钮即可（**只动这一个文件**）：
```js
export const ROLE_LUMINANCE = { tile: 88, earth: 125 };      // 亮度分档
export const ROLE_COLOR_OVERRIDES = { 'a97945': 'timber' };  // 单色一键改判
```

### Step 4 · （仅当启用「临溪」新变体才做）4 处精确小改

> 现在 `stream` 组团复用台地模型。要真正区分，改这 4 处（**除这 4 处外不要动其它行**）：

**4.1 `frontend/src/virtual-utopia/webgl/modelLoader.js` 第 31–36 行**
```js
  const [tree, cliffManor, forestManor, terraceManor, streamManor, bridgeSegment] =
    await Promise.all([
      loadModel(new URL('./models/tree.glb', import.meta.url).href),
      loadModel(new URL('./models/cliff-manor.glb', import.meta.url).href),
      loadModel(new URL('./models/forest-manor.glb', import.meta.url).href),
      loadModel(new URL('./models/terrace-manor.glb', import.meta.url).href),
      loadModel(new URL('./models/stream-manor.glb', import.meta.url).href),
      loadModel(new URL('./models/bridge-segment.glb', import.meta.url).href),
    ]);
```
**4.2 同文件返回对象**（第 40–45 行）追加 `streamManor,`

**4.3 `ThreeWorld.js` `getModelBounds()` 第 2875–2886 行**（灯笼挂点缓存，**必须一起改**）
```js
  getModelBounds(group) {
    const key =
      group === 'cliff' ? 'cliff'
      : group === 'forest' ? 'forest'
      : group === 'stream' ? 'stream'
      : 'terrace';
    if (this._modelBoundsCache[key]) return this._modelBoundsCache[key];
    const model =
      key === 'cliff' ? this.models.cliffManor
      : key === 'forest' ? this.models.forestManor
      : key === 'stream' ? this.models.streamManor
      : this.models.terraceManor;
    ...
```
**4.4 `ThreeWorld.js` `buildHomes()` 第 3058–3061 行**
```js
      const source =
        home.group === 'cliff' ? this.models.cliffManor
        : home.group === 'forest' ? this.models.forestManor
        : home.group === 'stream' ? this.models.streamManor
        : this.models.terraceManor;
```

### Step 5 · 构建校验

```bash
cd /h/BP2/frontend/src/virtual-utopia && node ../../../node_modules/vite/bin/vite.js build --config vite.config.js 2>&1 | tail -5
```
> ⚠️ **必须显式带 `--config`**：直接 `npx vite build` 会误用 `frontend/vite.config.js`，构建的是根应用，`dist/` 也落错地方。
预期：`✓ built in Xs`，无报错。

### Step 6 · 全量自检（一条命令 + 三个回归）

```bash
cd /h/BP2
node scripts/verify-manor-deploy.mjs            # 模型侧 + 场景侧（约 1.5 分钟）
node scripts/test-manor-materials.mjs           # 材质与复用
node scripts/test-resident-beacons.mjs          # 灯笼/木牌（含屋顶锚定、点击）
node scripts/test-resident-roaming.mjs          # 居民漫游（不窜点/不追不上）
```
四个脚本必须**全部 `=== 汇总: 全部通过 ===`**。

### Step 7 · 提交与生效

```bash
cd /h/BP2
git add frontend/src/virtual-utopia/webgl/models/ frontend/src/virtual-utopia/webgl/modelLoader.js frontend/src/virtual-utopia/webgl/ThreeWorld.js
git commit -m "部署：三套宋式诧寂山居宅院 GLB（仅替换模型与材质，占地/坐标/逻辑未动）"
```
前端 5199 是 Vite dev server，**保存即热更**；如需彻底刷新：

```bash
# PowerShell（PowerShell 工具里执行；注意先停旧进程再起）
$env:NODE_ENV='development'
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' `
  -ArgumentList 'node_modules/vite/bin/vite.js','--port','5199' `
  -WorkingDirectory 'H:\BP2\frontend\src\virtual-utopia' -WindowStyle Hidden
```
> 本迭代**不需要重启 3300/3400**（没有后端改动）。

---

## 3. 完整自检清单（逐项打勾，每项都给了"怎么验 + 预期"）

### A. 模型侧（`node scripts/verify-manor-deploy.mjs --glb-only`）

- [ ] **A1 模型成功挂载到对应地块** —— 三个 GLB 文件名与目录正确，`loadWorldModels()` 能加载：脚本 A 段无 `可解析` FAIL
- [ ] **A2 原点落在占地中心** —— `原点水平居中（≤0.6m）` OK；`未悬空（min.y ≤ 0.08）` OK
- [ ] **A3 占地与原模型一致** —— `占地与基线一致（±18%）` OK（terrace/forest 4.03×4.19；cliff 4.50×3.95）
- [ ] **A4 高度与原模型一致** —— `高度与基线一致（±15%）` OK（3.40 / 2.90 / 5.92）
- [ ] **A5 三角面 2000–3000** —— `三角面落在 2000–3000` OK
- [ ] **A6 无动画/无蒙皮** —— `无动画/无蒙皮` OK

### B. 场景侧（`node scripts/verify-manor-deploy.mjs`）

- [ ] **B1 模型成功挂载到对应地块** —— `全部 50 栋宅院挂载成功（模型网格非空）` OK
- [ ] **B2 建筑不悬浮** —— `无宅院悬浮` OK（terrace/forest 底面≈地面+0.2；cliff 因底座≈地面-3.1）
- [ ] **B3 与地块对齐、无穿模错位** —— `宅院与地块对齐（包围盒中心偏差 ≤1.5m）` OK（正常 dx/dz ≈ 0~0.5m）
- [ ] **B4 占地与原建筑一致** —— `占地与原模型一致（偏差 ≤18%）` OK
- [ ] **B5 既有系统在位** —— `灯笼×5 / 居民×5 / 可点击网格 / 玻璃夜光` OK
- [ ] **B6 材质方案生效** —— `共享材质库在用` OK；`node scripts/test-manor-materials.mjs` 复用率 > 5×
- [ ] **B7 页面加载与帧率** —— 记下脚本打印的 `世界初始化耗时` 与 `drawCalls / triangles`，与 §1.3 基线对比：
      - 初始化 ≤ 30s（无头）/ 真机应明显更快
      - `triangles` 增幅 ≤ 30%；`drawCalls` 基本不变（材质共享后不应上涨）
      - 真机用 60 秒漫游目视：帧率稳定、无明显卡顿；若掉帧 → **减小 LOD 切换距离**（不要动其它）
- [ ] **B8 0 控制台报错** —— `0 控制台报错` OK

### C. 行为回归（对应"原有业务全部正常"）

- [ ] **C1 居民 Avatar 正常漫游、无穿墙/路径异常** —— `node scripts/test-resident-roaming.mjs` 全通过（速度 ≤1.7m/s、静止零位移、停留 8–15s、贴近不窜走、路点在 5~6m 内）
- [ ] **C2 屋顶灯笼/木牌仍锚在屋顶** —— `node scripts/test-resident-beacons.mjs` 全通过（`roofY > homeY`、真实鼠标点击→信息卡）
- [ ] **C3 相机漫游正常** —— 手动：`#/world` 下 WASD 走动、右键旋转、滚轮缩放、`重置视角` / `前往生活广场` 按钮可用；未出现穿地/卡死
- [ ] **C4 聊天 / @ 直聊 / 私聊回复** —— `node scripts/test-resident-chat-entry.mjs` 全通过
- [ ] **C5 注册 / 入驻申请审批** —— 手动：`#/register` 提交申请 → 管理台/审批接口可查到；已有账号 `#/login` 可登录
- [ ] **C6 人设未被改动** —— `git diff HEAD~1 --stat` 中**不得出现** `residentChatService.js` / `residents.js`
- [ ] **C7 未越界改动** —— `git diff HEAD~1 --stat` 只应包含 `models/*.glb`（+ 若启用临溪变体的两处代码）
      ```bash
      git diff HEAD~1 --stat
      # 期望：仅 webgl/models/*.glb（+ modelLoader.js / ThreeWorld.js 两处选型）
      ```

---

## 4. 失败处置与回滚

| 症状 | 判定 | 处置 |
| --- | --- | --- |
| A3/A4 FAIL | 新模型尺度不对 | 回 Step 1 归一化，**不要**改 `home.scale`（属宅院边界） |
| B2 悬浮（`floating>0`） | 模型底面被抬到原点之上 | 检查 `min.y`；cliff 需保留负值底座 |
| B3 对齐超标 | 模型水平中心不在原点 | Blender 重新 Set Origin 到占地中心 |
| B7 掉帧 | 面数增长过大 | 只调 LOD 切换距离（62 → 45/50）；或把模型压到 2000 面 |
| 任何行为回归失败 | 越界改动 | `git checkout -- <文件>` 或 `git reset --hard <基线 commit>`，再从备份恢复 GLB |

```bash
# 一键回滚模型（保留代码改动时）
cp .workbuddy/tmp/manor-backup/*.glb frontend/src/virtual-utopia/webgl/models/
# 彻底回滚
git reset --hard <Step 0 记录的基线 commit>
```

---

## 5. 一句话交付口径

> 只换 `models/terrace-manor.glb`、`models/forest-manor.glb`、`models/cliff-manor.glb`（可选新增 `stream-manor.glb`）+ 材质方案；
> 新模型必须归一化到基线占地/高度、原点在占地中心、无动画；
> 改完跑 `node scripts/verify-manor-deploy.mjs` 与三个回归脚本，四条 `全部通过` 才算交付。
