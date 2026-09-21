# 【交付 Pi Agent】三套宅院 GLB 模型部署执行指令 + 完整自检清单

> 任务：把「三套宋式诧寂山居宅院 GLB」部署进虚拟乌托邦项目。
> 仓库根：`H:\BP2`　前端 dev：`http://localhost:5199`　后端：3300 / 3400
> 本指令全部为**可复制执行**的命令与改动；每一步都带**校验命令 + 预期结果**，任一步不达标即停下、不要继续。

**配套工具（本文件同批交付，全部可直接运行）**

| 脚本 | 作用 |
| --- | --- |
| `scripts/run-manor-deploy-check.mjs` | **总控**：一条命令跑完「范围守卫 + 模型侧 + 场景侧 + 材质 + 业务回归」，并输出自检清单对照表 |
| `scripts/verify-manor-deploy.mjs` | 单点校验：A 模型侧 + B~F 场景侧（挂载/落位/穿模/既有系统/性能/漫游） |
| `scripts/inspect-manor-glb.mjs` | GLB 预检器（可单独用：`--baseline`、`--tris 2000 3000`） |
| `scripts/rollback-manor-deploy.mjs` | **备份 / 回滚**：`--backup` 快照、`--dry-run` 预演、直接跑则还原 |

> 最短路径：`node scripts/run-manor-deploy-check.mjs --fast` → 全绿即交付。

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
node scripts/rollback-manor-deploy.mjs --backup     # 快照三个 GLB（含 sha256 与几何）
node scripts/rollback-manor-deploy.mjs --list       # 确认快照已就位
```
> 备份落在 `.workbuddy/tmp/manor-backup/`（该目录不对 git 跟踪，不会污染提交）。
> 备份脚本会打印每个文件的 `sha256` 与「面数 / 占地 / 高度」，这是回滚后可验证的凭据。

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

> 提示：把新 GLB 放到临时目录、用 `--tris 2000 3000` 直接体检也可以，不必先覆盖正式文件。

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

### Step 6 · 全量自检（**一条命令**）

```bash
cd /h/BP2
node scripts/run-manor-deploy-check.mjs --fast     # 约 6~8 分钟：范围守卫 + 模型侧 + 场景侧 + 材质 + 业务回归（跳过慢套件）
node scripts/run-manor-deploy-check.mjs            # 约 20 分钟：连「居民漫游」慢套件一起跑（交付前建议跑这一版）
```

它会按序执行以下步骤，并把结果汇总成「自检清单 → ✅/❌」对照表（退出码 0 = 全通过）：

| 步骤 id | 内容 | 覆盖清单项 |
| --- | --- | --- |
| `scope` | **改动范围守卫**：用 git 证明只动了模型/材质 | 硬性部署规则（其余业务保持原样） |
| `glb` | A 模型侧预检 | 占地/高度/原点/无动画 |
| `scene` | B~F 场景侧校验 | 挂载、不悬浮、无穿模、性能、相机漫游 |
| `materials` | 建筑材质共享与复用 | 材质替换生效 |
| `beacons` | 灯笼/木牌仍锚定屋顶 | 不悬浮（灯笼挂点） |
| `roaming` | 居民院内闲逛（慢，`--fast` 跳过） | 无穿墙 / 路径正常 |
| `chat` | 聊天 / @直聊 / 未登录提示 | 聊天业务正常 |
| `persona` | 居民人设与真实 LLM | 人设业务正常 |

只跑某几步：`--only=scope,glb,scene`（`--list` 可查看全部 id）。
指定范围守卫的对比基线：`--base=HEAD~1`（默认）或 `--base=<基线 commit>`。

也支持逐个手跑（等价）：
```bash
node scripts/verify-manor-deploy.mjs            # 模型侧 + 场景侧（约 1.5 分钟）
node scripts/test-manor-materials.mjs           # 材质与复用
node scripts/test-resident-beacons.mjs          # 灯笼/木牌（含屋顶锚定、点击）
node scripts/test-resident-roaming.mjs          # 居民漫游（慢，约 10 分钟）
node scripts/test-resident-chat-entry.mjs       # 聊天 / @直聊 / 未登录
node scripts/test-resident-persona.mjs          # 人设 / 真实 LLM
```
每个脚本必须各自 `=== 汇总: 全部通过 ===`。

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

- [ ] **B1 模型成功挂载到对应地块** —— `全部 50 栋宅院挂载成功（模型网格非空）` OK（`total=50 empty=0`）
- [ ] **B2 建筑不悬浮** —— `无宅院悬浮` OK（terrace/forest 底面≈地面+0.2；cliff 因底座≈地面-3.1）
- [ ] **B3 与地块对齐、无穿模错位** —— `宅院与地块对齐（包围盒中心偏差 ≤1.5m）` OK（正常 dx/dz ≈ 0~0.5m）
- [ ] **B4 占地与原建筑一致** —— `占地与原模型一致（偏差 ≤18%）` OK
- [ ] **B5 既有系统在位** —— `灯笼×5 / 居民×5 / 可点击网格 / 玻璃夜光` OK
- [ ] **B6 材质方案生效** —— `共享材质库在用` OK；`node scripts/test-manor-materials.mjs` 复用率 > 5×
- [ ] **B7 页面加载与帧率** —— 脚本已自动判：
      - `世界初始化耗时未出现数量级劣化`（基线 16.7s，**硬上限 ×3 ≈ 50s**）。注意：该项受机器负载影响很大（实测 16.6~29.2s 波动），所以**只把数量级劣化当失败**；实测 >1.6× 会额外打一条 INFO 建议你空闲时复测。
      - `渲染开销未显著上升`（drawCalls ≤ 基线×1.3、triangles ≤ 基线×1.6）← **这条才是"模型变重了没有"的硬判据**（与机器负载无关，只与场景内容有关）
      - `LOD 分级仍在`（实测 48/50 栋带 LOD）
      - **关于 FPS 的诚实说明**：无头 swiftshader 环境里 rAF 被节流（实测 ~4.2s/帧），量的不是真实帧率，所以脚本**只把 rAF 帧时间当 INFO 打印、不当判据**。真实帧率请在带 GPU 的浏览器里开 `#/world`，用 DevTools `Performance` 录制或 F3 面板看：漫游 60 秒帧率稳定、无明显卡顿即可。若掉帧 → **只减小 LOD 切换距离**（不要动其它）。
- [ ] **B8 无穿模（互穿粗检）** —— `宅院互不互穿（XZ 包围盒重叠 >25% 的相邻宅院对数 = 0）` OK
- [ ] **B9 垂直落位正确（含 cliff 底座陷阱）** —— `垂直落位正确（非崖居贴地 ±0.6m；崖居保持其向下延伸的底座、未被抬到 0）` OK
      - 这一项专治最常见错误：把新 cliff 模型的 `min.y` 归零 → 12 栋崖居会整体抬升 2.8m（悬浮在崖壁上方）。
- [ ] **B10 相机漫游可用** —— `相机漫游可用（W 键被识别 · 按住后相机位移 > 0.3m）` OK、`松开按键后相机停下` OK
- [ ] **B11 0 控制台报错** —— `0 控制台报错` OK

### C. 行为回归（对应"原有业务全部正常"）

- [ ] **C1 居民 Avatar 正常漫游、无穿墙/路径异常** —— `node scripts/test-resident-roaming.mjs` 全通过（速度 ≤1.7m/s、静止零位移、停留 8–15s、贴近不窜走、路点在 5~6m 内）
- [ ] **C2 屋顶灯笼/木牌仍锚在屋顶** —— `node scripts/test-resident-beacons.mjs` 全通过（`roofY > homeY`、真实鼠标点击→信息卡）
- [ ] **C3 相机漫游正常** —— 自动已验（B10）；建议再手动走一遍：`#/world` 下 WASD、右键旋转、滚轮缩放、`重置视角` / `前往生活广场` 按钮可用，未出现穿地/卡死
- [ ] **C4 聊天 / @ 直聊 / 私聊回复** —— `node scripts/test-resident-chat-entry.mjs` 全通过
- [ ] **C5 注册 / 入驻申请审批** —— `scope` 步骤已用 git 证明 `backend/**` 与前端注册/审批文件**零改动**；如需端到端确认，手动：`#/register` 提交申请 → 管理台可查到；已有账号 `#/login` 可登录
- [ ] **C6 人设未被改动** —— `scope` 步骤不会把 `residentChatService.js` / `residents.js` 判为允许改动；出现即 FAIL
- [ ] **C7 未越界改动** —— `scope` 步骤通过：`node scripts/run-manor-deploy-check.mjs --only=scope`
      ```bash
      node scripts/run-manor-deploy-check.mjs --only=scope
      # 期望：OK 改动范围合规：只涉及模型与材质……
      #       若出现 ✗ 行 → 该文件越界，必须 git checkout -- <文件>
      ```
      > 它把改动分三档：**允许**（`models/*.glb`、`webgl/materials/**`）、**需人工确认**（`modelLoader.js` / `ThreeWorld.js` —— 装配层，会打印改动行段供你核对是否只改了"模型选型/包围盒"）、**越界**（其余一切，含 `worldLayout.js`、后端、聊天、人设）。

---

## 4. 失败处置与回滚

| 症状 | 判定 | 处置 |
| --- | --- | --- |
| A3/A4 FAIL | 新模型尺度不对 | 回 Step 1 归一化，**不要**改 `home.scale`（属宅院边界） |
| B2 悬浮（`floating>0`） | 模型底面被抬到原点之上 | 检查 `min.y`；cliff 需保留负值底座 |
| **B9 垂直落位 FAIL** | 典型是 cliff 的 `min.y` 被归零 | 恢复向下延伸的底座（`min.y ≈ -2.77`），否则 12 栋崖居整体悬空 2.8m |
| B3 对齐超标 | 模型水平中心不在原点 | Blender 重新 Set Origin 到占地中心 |
| **B8 互穿 FAIL** | 占地被放大到与邻栋重叠 | 归一化占地（A3），不要动地块坐标 |
| B7 掉帧/初始化变慢 | 面数增长过大 | 只调 LOD 切换距离（62 → 45/50）；或把模型压到 2000 面。**先看 `渲染开销未显著上升` 是否通过**——它通过就说明模型没变重，初始化慢大概率是机器负载 |
| B10 漫游 FAIL | 输入未生效或按键被吞 | 确认脚本输出 `keyHeld=true`；若为 false 说明键盘事件没到 window（检查页面焦点）；若 keyHeld=true 但位移为 0，检查 `moveCamera` 是否被改动（属越界） |
| `scope` 出现 ✗ | 越界改动 | `git checkout -- <文件>`；改回后重跑 `--only=scope` |
| 任何行为回归失败 | 越界改动 | 用下面的回滚，再从备份恢复 GLB |

```bash
# ① 只看会还原什么（不动文件）
node scripts/rollback-manor-deploy.mjs --dry-run
# ② 一键把三个 GLB 还原到 Step 0 的快照（并打印还原后的 sha256 / 几何）
node scripts/rollback-manor-deploy.mjs
# ③ 复验模型侧（秒级）
node scripts/verify-manor-deploy.mjs --glb-only
# ④ 若连代码也越界了：彻底回滚代码（保留 .workbuddy 备份目录）
git reset --hard <Step 0 记录的基线 commit>
```
> 备份目录可用 `--from <dir>` 指定，默认 `.workbuddy/tmp/manor-backup`；`--list` 可查看快照清单。

---

## 5. 一句话交付口径

> 只换 `models/terrace-manor.glb`、`models/forest-manor.glb`、`models/cliff-manor.glb`（可选新增 `stream-manor.glb`）+ 材质方案；
> 新模型必须归一化到基线占地/高度、原点在占地中心、无动画、cliff 保留负底座；
> 交付前跑 **`node scripts/run-manor-deploy-check.mjs`**（完整版），自检清单 6 项全部 ✅、脚本退出码 0 才算交付。
