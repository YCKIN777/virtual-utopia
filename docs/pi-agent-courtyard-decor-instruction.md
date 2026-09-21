# 【交付 Pi Agent】庭院装饰小品部署执行指令 + 完整自检清单

> 任务：把「三类宅院差异化庭院小品」部署进虚拟乌托邦。
> 仓库根：`H:\BP2`　前端 dev：`http://localhost:5199`　后端：3300 / 3400
> 本指令全部为**可复制执行**的命令；每一步都带**校验命令 + 预期结果**，任一步不达标即停下。

**配套工具（同批交付，均可直接运行）**

| 脚本 | 作用 |
| --- | --- |
| `scripts/run-manor-deploy-check.mjs` | **总控**：范围守卫 + 模型侧 + 场景侧 + **庭院小品** + 材质 + 业务回归，输出自检清单对照表 |
| `scripts/verify-courtyard-decor.mjs` | 庭院小品单点自检（成套差异 / 300–800 面 / 不阻挡 / 只读约束） |
| `scripts/rollback-manor-deploy.mjs` | **备份 / 回滚**：`--target decor` 管小品 GLB，`--target manor` 管宅院 GLB |
| `scripts/verify-manor-deploy.mjs` | 宅院模型 + 场景侧校验（挂载/落位/穿模/性能/漫游） |

> 最短路径：`node scripts/run-manor-deploy-check.mjs --fast` → 全绿即交付。

---

## 0. 硬性边界（越界即回滚，不要"顺手优化"）

**本迭代只允许新增/修改**：
- `frontend/src/virtual-utopia/webgl/decorations/**`（小品模块）
- `frontend/src/virtual-utopia/webgl/models/decor/*.glb`（若换成 Blender 模型）
- `frontend/src/virtual-utopia/webgl/materials/**`（仅当需要微调小品材质）

**禁止改**：`worldLayout.js` 的 `homes`（地块坐标）、宅院边界/缩放/旋转规则、碰撞盒、居民 AI 闲逛
（`updateRoamingAgents` / `pickRoamingWaypoint` / `RESIDENT_ROAM_RADIUS`）、相机漫游（`moveCamera` / `controls`）、
`backend/**`、注册审批、聊天、人设。

不新增动画、不写自定义 shader、不给小品加光源、不把小品注册进 `clickableMeshes`。

---

## 1. 前置事实（已实测，直接照用）

### 1.1 七款小品与三角面预算

| 角色 | 名称 | 三角面（实测） | 目标世界尺寸（m） | 归属 |
| --- | --- | --- | --- | --- |
| `stool` | 石凳 | 312 | 0.86 × 0.55 × 0.40 | 台地 / 森林 |
| `slab` | 石板 | 304 | 1.05 × 0.72 × 0.09 | 三类通用 |
| `fruitShrub` | 果树灌丛 | 340 | 1.10 × 1.00 × 1.15 | 台地 / 森林 |
| `landscapeRock` | 小型景观石 | 420 | 1.40 × 0.90 × 0.62 | 临溪 / 森林 |
| `bambooClump` | 矮竹丛 | 336 | 0.50 × 0.50 × 1.35 | 临溪 |
| `boulder` | 大块毛石 | 340 | 1.60 × 1.20 × 0.90 | 崖边 |
| `stoneLantern` | 简易石灯 | 344 | 0.68 × 0.68 × 1.35 | 崖边 |

约束：**单件 300–800 面**（自检器按这个区间硬判）；原点在**底面中心**；无动画、无蒙皮；不内嵌贴图。

### 1.2 落位规则（决定了"不阻挡 / 不穿模 / 不越界"）

所有落位参数都是**实测当前场景**得到的，没有任何硬编码坐标：

| 量 | 来源 | 用途 |
| --- | --- | --- |
| `clear` | 该户底盘（石台基 / 地面光圈）水平半径 | 落位半径的**上界**基准 |
| `top` | 底盘顶面高度 | 落地 `y` |
| `bodyRadius` | 房屋主体网格中「离宅院中心最远」的水平距离 | **不贴墙**退让的基准 |

```
半径下界 = max(clear × 0.72,  bodyRadius + 0.40)
半径上界 = clear × 0.99            # 不越出台基
上界 ≤ 下界 → 记 noRoom 跳过（该户确实没空间，不强行塞）
```
另外两条不重叠判据：小品之间 = 双方水平半径之和 + 0.15m；与既有庭院小品 = 双方半径之和 + 0.10m。
判断用「水平半径」（与旋转无关），**不用包围盒** —— 宅院 group 带 -90° 旋转，轴对齐包围盒会虚胖一倍。

### 1.3 当前实测基线

| 指标 | 数值 |
| --- | --- |
| 落位总数 | 238 件 / 覆盖 45 处宅院（≥90%） |
| 实例网格 / 材质 | 13 个 `InstancedMesh` / 28 份材质（全部复用共享贴图，**0 新增显存**） |
| 新增三角面 | ≈ 82,475 ≈ 全场的 **16.9%** |
| 越出台基 / 侵入主体 / 与既有小品重叠 | 0 / 0 / 0 |
| `clickableMeshes` / 碰撞体 | 0 / 0（本项目 webgl 层本就没有碰撞系统） |

---

## 2. 执行步骤（Pi Agent 按序执行）

### Step 0 · 备份与开工检查

```bash
cd /h/BP2
git status --short                 # 预期：干净或只有本次要动的文件
git rev-parse --short HEAD         # 记下基线 commit，回滚用
node scripts/rollback-manor-deploy.mjs --target decor --backup    # 快照小品 GLB（当前为空也安全）
node scripts/rollback-manor-deploy.mjs --target decor --list      # 确认快照
```

### Step 1 · 直接跑自检（程序化版本无需放文件）

```bash
cd /h/BP2
node scripts/verify-courtyard-decor.mjs
```
预期：14 条断言**全部 OK**（见 §3）。当前仓库即为此状态。

### Step 2 · （可选）换成 Blender 手工模型

```bash
# 先按 docs/utopia-courtyard-decor-art-prompts.md 出图 → Blender 建模 → 导出 GLB
cp <新件>.glb frontend/src/virtual-utopia/webgl/models/decor/stool.glb
# 命名必须与角色 key 一致：stool / slab / fruitShrub / landscapeRock / bambooClump / boulder / stoneLantern
node scripts/verify-courtyard-decor.mjs      # 面数（300–800）、落位、不阻挡全部重跑
```
> 程序化几何在 `decorations/courtyardDecor.js` 的 `DECOR_RECIPES[role].build`；
> 换 GLB 只需把该函数改成返回 GLB 几何，**落位 / 材质 / 自检逻辑都不用改**。

### Step 3 · 构建校验

```bash
cd /h/BP2/frontend/src/virtual-utopia
node ../../../node_modules/vite/bin/vite.js build --config vite.config.js 2>&1 | tail -5
```
> ⚠️ **必须显式带 `--config`**：`npx vite build` 会误用 `frontend/vite.config.js` 构建根应用。

### Step 4 · 全量自检（一条命令）

```bash
cd /h/BP2
node scripts/run-manor-deploy-check.mjs --fast   # 约 8~10 分钟（跳过慢套件）
node scripts/run-manor-deploy-check.mjs          # 约 25 分钟（含居民漫游）
```

步骤与清单项的映射：

| 步骤 id | 内容 | 覆盖清单项 |
| --- | --- | --- |
| `scope` | 改动范围守卫（git 证明只动了模型/材质/小品模块） | 硬性规则（其余业务保持原样） |
| `glb` / `scene` | 宅院模型预检 + 场景侧 | 宅院挂载/悬停/穿模/占地/性能/相机 |
| **`decor`** | **庭院小品自检** | **成套差异 / 300–800 面 / 不阻挡居民** |
| `materials` | 材质共享与复用 | 材质替换生效 |
| `beacons` | 灯笼/木牌锚定 | 屋面构件未受影响 |
| `roaming` | 居民院内闲逛（慢，`--fast` 跳过） | 无穿墙 / 路径正常 |
| `chat` / `persona` | 聊天 / 人设 | 原有业务正常 |

只跑某几步：`--only=scope,decor`（`--list` 查看全部 id）。

### Step 5 · 提交与生效

```bash
cd /h/BP2
git add frontend/src/virtual-utopia/webgl/decorations frontend/src/virtual-utopia/webgl/ThreeWorld.js
git commit -m "迭代：三类宅院差异化庭院小品（仅视觉层，未动地块/边界/碰撞/AI/相机）"
```
前端 5199 是 Vite dev server，保存即热更。**本迭代不需要重启 3300/3400**（无后端改动）。

---

## 3. 完整自检清单（逐项打勾，每项都给了"怎么验 + 预期"）

### A. 成套与差异化（`node scripts/verify-courtyard-decor.mjs`）

- [ ] **A1 小品已装配且自成一组** —— `庭院小品已装配，且自成一组（与宅院主体结构隔离）` OK
      （断言：组名 = `courtyard-decor`、组内**没有**任何宅院模型网格、宅院组内**没有**小品网格）
- [ ] **A2 覆盖面达标** —— `宅院覆盖 ≥90%` OK（实测 45/50；被既有庭院小品占满的宅院不强行塞）
- [ ] **A3 台地成套** —— `terrace` 集合含 `stool` + `fruitShrub` + `slab`
- [ ] **A4 临溪成套** —— `stream` 集合含 `landscapeRock` + `bambooClump` + `slab`
- [ ] **A5 崖边成套** —— `cliff` 集合含 `boulder` + `stoneLantern` + `slab`
- [ ] **A6 三套互不串味** —— `三套语汇确实不同` OK（台地无毛石/石灯，临溪无石凳/毛石，崖边无矮竹/果树）

### B. 模型轻量化与只读约束

- [ ] **B1 单件三角面 300–800** —— `单物件三角面全部落在 300–800` OK（实测 304–420）
- [ ] **B2 未加入 clickableMeshes** —— `未加入 clickableMeshes` OK（`clickableMeshes` 仍为 846，其中小品 0）
- [ ] **B3 未新增碰撞体** —— `未新增任何碰撞体 / 物理体` OK（碰撞相关字段为空）
- [ ] **B4 未改房屋主体** —— A1 的"结构隔离"断言 + `scope` 步骤的 git 证据

### C. 不阻挡与不穿模

- [ ] **C1 不越出台基** —— `小品全部落在所属宅院的底盘环带内` OK（越界 0）
- [ ] **C2 不贴墙、不穿模** —— `与房屋主体保持退让（落点在主体水平半径之外）` OK（侵入 0，最小余量 0.40m）
- [ ] **C3 不与既有庭院小品重叠** —— `与既有庭院小品无重叠（间距 − 半径和 ≥ 0）` OK（重叠 0）
- [ ] **C4 居民不受影响** —— `居民全部在场、状态正常、坐标有限` + `居民未被迫离开宅院` OK
- [ ] **C5 漫游回归** —— `node scripts/test-resident-roaming.mjs` 全通过（速度 ≤1.7m/s、静止零位移、停留 8–15s、贴近不窜走）

### D. 性能与其他业务

- [ ] **D1 渲染开销未显著上升** —— 总控 `scene` 步骤 `triangles ≤ 基线 × 1.6` OK
      （小品 +16.9%；换成 2000–3000 面宅院后仍应通过，若不通过先调 LOD 距离）
- [ ] **D2 无控制台报错** —— `全程 0 控制台报错` OK
- [ ] **D3 相机漫游正常** —— 总控 `scene` 步骤 `相机漫游可用` OK（真按 W → `keys` 识别 + 相机位移）
- [ ] **D4 原有业务未受影响** —— `scope` 步骤通过（允许面只有模型/材质/小品模块），
      且 `chat` / `persona` / `roaming` 三个回归套件全绿

---

## 4. 失败处置与回滚

| 症状 | 判定 | 处置 |
| --- | --- | --- |
| B1 FAIL（面数超 800） | 模型太重 | Blender 里 Decimate 到 300–800；不要靠缩小（尺寸会错） |
| C1 FAIL（越出台基） | 模型被放大 | 按 §1.1 目标尺寸重导；**不要**改 `RING_FACTOR` 去迁就 |
| C2 FAIL（贴墙/穿模） | 小品挤进房屋主体 | 调 `HOUSE_MARGIN`（0.4 → 0.55），或按 §1.1 缩尺寸 |
| C3 FAIL（与既有小品重叠） | 撞上矮篱/菜畦 | 调 `PROP_GAP`（0.1 → 0.3），或调 `DECOR_GAP` |
| A2 FAIL（覆盖不足 90%） | 太多宅院没空间 | 调 `DECOR_GAP`/`PROP_GAP` 放宽，或减少 `GROUP_DECOR_SETS` 的 count |
| C4/C5 FAIL（居民异常） | 越界改动 | 立刻回滚：`git checkout -- <文件>`，并检查是否动了 `updateRoamingAgents` / `RESIDENT_ROAM_RADIUS` |
| `scope` 出现 ✗ | 越界改动 | `git checkout -- <文件>`；改回后重跑 `--only=scope` |
| D1 FAIL（渲染开销） | 三角面涨太多 | 先看该步的 `drawCalls/triangles` 比值；必要时减少小品数量 |

```bash
# ① 只看会还原什么
node scripts/rollback-manor-deploy.mjs --target decor --dry-run
# ② 一键还原小品 GLB（程序化版本无 GLB 时是空操作，安全）
node scripts/rollback-manor-deploy.mjs --target decor
# ③ 复验
node scripts/verify-courtyard-decor.mjs
# ④ 彻底回滚代码（保留 .workbuddy 备份）
git reset --hard <Step 0 记录的基线 commit>
```

---

## 5. 一句话交付口径

> 只新增 `webgl/decorations/**`（+ 可选 `webgl/models/decor/*.glb`）；
> 七款小品单件 300–800 面、复用宅院共享贴图（0 新增显存）、按三类宅院差异化落位；
> 不新增碰撞体、不加入 `clickableMeshes`、不越出台基、不与既有小品重叠、不动居民与相机逻辑；
> 交付前跑 **`node scripts/run-manor-deploy-check.mjs`**，清单全 ✅ 且退出码 0 才算完成。
