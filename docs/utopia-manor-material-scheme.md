# 虚拟乌托邦 · 宋式诧寂山居「宅院材质方案」+ 贴图建议

> 迭代范围：**仅建筑材质与庭院小品材质**。不动地块坐标 / 宅院边界 / 碰撞盒 / 居民 AI / 相机 / 后端 / 聊天 / 人设，
> 不新增动画、不写自定义 shader。
> 代码入口：`frontend/src/virtual-utopia/webgl/materials/manorMaterials.js`
> 自测：`scripts/test-manor-materials.mjs`

---

## 1. 材质参数表（低饱和哑光）

`MANOR_ROLE_PRESETS`（颜色为组内基准，实际取 `MANOR_GROUP_TINTS` 的组团色偏）

| 角色 | 用途 | 基准色 | roughness | metalness | bumpScale | UV repeat | 贴图 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `earth` | 夯土墙面 | `#c3b39a` | 0.98 | 0 | 0.05 | 1.4 × 1.4 | 夯土图 |
| `timber` | 原木梁柱 | `#a8834f` | 0.90 | 0 | 0.04 | 2 × 2 | 木纹图 |
| `tile` | 青灰瓦屋顶 | `#6e7773` | 0.85 | 0 | 0.06 | 1 × 3 | 瓦面图 |
| `stone` | 毛石地基 | `#8f8c86` | 1.00 | 0 | 0.07 | 1 × 1 | 毛石图 |
| `slab` | 石板 / 平台 | `#a9a49c` | 0.94 | 0 | 0.05 | 1 × 1 | **复用毛石图** |
| `bamboo` | 竹篱 | `#9a9a74` | 0.92 | 0 | 0.04 | 2 × 1 | 竹身图 |
| `glass` | 窗（既有逻辑接管） | — | 0.35 | 0 | — | — | — |
| `foliage` | 植被（既有逻辑接管） | — | 1.00 | 0 | — | — | — |

**关键手法**：`metalness` 全 0、`roughness ≥ 0.85`（哑光）、颜色全部落在低饱和暖灰/青灰区间，
再用 `bumpScale 0.04–0.07` 出细微起伏 —— 氛围靠"粗糙度 + 微起伏 + 低饱和"三件套，而不是靠高光或强贴图对比。

> **实际粗糙度 = `roughness` × `roughnessMap`**（three 的乘法语义）。上表是**基准值**，
> 贴图会在此基础上逐像素调制（见 §3.1），所以哑光面不是"整块死平"，而是**斑驳处更哑、受光面略平**的层次。

## 2. 组团色偏（保留"每组略有差异"，整体压饱和）

| 组团 | 对应宅基 | earth | timber | tile | stone / slab | bamboo |
| --- | --- | --- | --- | --- | --- | --- |
| 台地 `terrace` | plot-1~13 | `#c6b69c` | `#ab8654` | `#707976` | `#918e88` / `#aca79f` | `#9c9c76` |
| 临溪 `stream` | plot-14~25 | `#c0b59f` | `#a17f52` | `#6d7775` | `#8c8983` / `#a7a29b` | `#969874` |
| 悬崖 `cliff` | plot-39~50 | `#c0b096` | `#a07a49` | `#6b7472` | `#8b8781` / `#a6a19a` | `#979772` |
| 森林 `forest` | plot-26~38 | `#bfb298` | `#8f6c40` | `#6a7270` | `#89857f` / `#a3a099` | `#94946e` |

## 3. 程序化贴图配方（CanvasTexture，1024²，确定性 seed）

| 贴图 | seed | 画法要点 |
| --- | --- | --- |
| 夯土 | 1101 | 底色 `#c3b39a` → 11 条横向夯层（浅色低透明）→ 54 团暗斑 + 30 团亮斑（径向渐变）→ 约 12000 粒颗粒 → 26 条细裂纹（1–1.6px 折线）→ 90 道秸秆/砂粒短划痕 |
| 原木 | 2202 | 底色 `#a8834f` → 14 条纵向色带 → 300 条竖纹（正弦微摆，透明度 0.05–0.21，宽 0.9/1.8 两档）→ 3 处木节（同心椭圆）→ 24 团暗斑 → 4000 粒颗粒 |
| 青灰瓦 | 3303 | 底色 `#6e7773` → 7 行瓦垄；每行 = 垄顶凹缝(3px)+亮边(2px)+9 列竖向搭接缝 → 每行 6 处风化缺角（扁椭圆，明暗各半）→ 40 团暗斑 + 18 团亮斑 |
| 毛石 | 4404 | 底色 `#7d7a75` → 5×4 抖动网格，每格画 7–10 顶点的**不规则多边形**（顶点半径 0.72–1.22 抖动）+ 每块独立明度 → 3.4px 深灰缝（`#464440` 系）→ 46 团暗斑 + 22 团亮斑 + 9000 粒孔隙 + 14 条裂纹 |
| 竹篱 | 5505 | 底色 `#9a9a74` → 9 根竖竹（每根独立明度 + 左暗/中亮/右暗横向渐变）→ 每根 3–5 道竹节（暗带 4px + 亮边 2px）→ 4000 粒颗粒 |

**凹凸图**：默认 `MANOR_SHARE_COLOR_AS_BUMP = true`，直接把颜色贴图当 `bumpMap`（Extra 显存 0）。
需要更精确的起伏时改为 `false` —— 会额外生成一张 `尺寸/2` 的灰度图（`grayscale + contrast`）。

### 3.1 粗糙度贴图 roughnessMap（默认开启）

由颜色贴图**逐像素派生**（`buildRoughnessCanvas`），只做 canvas 2D 运算 + standard PBR 通道，无 shader。
映射公式：`roughnessMap = 1 - (1 - lum)^gamma`，再线性压到各角色区间。

| 角色 | 调制带 `[下限, 上限, gamma]` | 实际粗糙度区间 | 观感 |
| --- | --- | --- | --- |
| `earth` 夯土 | `[0.78, 1.0, 1.0]` | 0.98 × 带 = **0.76 – 0.98** | 斑驳/裂纹处颗粒外露 → 最哑 |
| `timber` 原木 | `[0.80, 1.0, 1.1]` | 0.90 × 带 = **0.72 – 0.90** | 深木纹吸光、浅纹处留一点木脂微光 |
| `tile` 青灰瓦 | `[0.72, 1.0, 0.90]` | 0.85 × 带 = **0.61 – 0.85** | 瓦面残留釉光 vs 风化缺角，**对比最明显** |
| `stone` 毛石 | `[0.84, 1.0, 1.0]` | 1.00 × 带 = **0.84 – 1.00** | 灰缝极粗糙、石面略平 |
| `bamboo` 竹篱 | `[0.80, 1.0, 1.0]` | 0.92 × 带 = **0.74 – 0.92** | 竹节处最粗糙 |

- 下限最高的 `earth`（0.76）到上限 1.0 —— **全程仍在哑光区间**，"低饱和哑光"调性不被破坏。
- `slab` 复用 `stone` 的粗糙度贴图（连同贴图一起复用，所以运行期只有 **4 张** roughness 贴图）。
- 关掉：`MANOR_ROUGHNESS_MAP = false` → 退回"整块恒定粗糙度"，观感略平但功能不变（移动端兜底）。
- 想手调层次：只改 `ROLE_ROUGHNESS_BAND` 的这三个数即可，不必碰几何或其它参数。

## 4. 若要更真实：手作 / AI 贴图建议

程序化贴图胜在零资源、可复现、无版权风险；如果后续要更"照片感"，按下面的规格替换即可（**代码无需改**，只要把 `createManorTextureSet` 里的生成换成 `TextureLoader` 加载）：

| 项 | 建议 |
| --- | --- |
| 尺寸 | **1024 × 1024**（移动端兜底 512）；瓦面可用 1024×512 平铺 |
| 通道 | `baseColor`（sRGB）+ `roughness`（Linear，灰度）+ `normal`（Linear，切线空间）；`metalness` 保持纯黑 |
| 命名 | `earth_basecolor.png` / `earth_roughness.png` / `earth_normal.png`，同角色同名 |
| 色彩空间 | baseColor 必须 `colorSpace = SRGBColorSpace`；roughness / normal 保持默认（Linear） |
| 无缝 | 边缘必须可平铺（Offset 半幅后检查接缝）；夯土/毛石尤其明显 |
| 亮度区间 | 全图明度控制在中间调（15%–85%），避免纯黑/纯白死区；饱和 `S ≤ 18%` 维持诧寂调性 |
| AI 生成 | 提示词追加 `seamless tileable texture, flat even lighting, no shadows, no vignette, top-down orthographic, 4k then downscale to 1024`；生成后统一 `levels` 压饱和 + 去处高光 |
| 法线 | 可由 roughness/height 用 Blender 的 `Bake Normal` 或 `normalmap.js` 生成，强度 ≤ 0.35（哑光材质不宜强法线） |

## 5. 角色识别与调参入口（`manorMaterials.js` 顶部）

现有 GLB 的材质**没有命名**、也没有独立"夯土/毛石"槽位，因此用「颜色」判角色，规则按优先级：

```
玻璃(transparent 或 #77b9b5) → 植被(#4b8a5e/#3f774d/#416f45) → 屋顶(ROOF_HEXES 或 亮度<88)
        → 亮度>125 判夯土 → 其余判原木
```

三个调参旋钮：

1. `ROLE_LUMINANCE = { tile: 88, earth: 125 }` —— 改这两个数，整体挪动"哪块算瓦 / 哪块算夯土"。
2. `ROLE_COLOR_OVERRIDES = { 'a97945': 'timber' }` —— 单个颜色一键改判（颜色取 `material.color.getHexString()`）。
3. 想新增角色（例如 `plaster`）：在 `MANOR_ROLE_PRESETS` 加一条 + 在 `TEXTURE_RECIPES` 加一个画法即可，其余自动生效。

**当前实测命中**（50 栋、982 网格）：`timber 212 / tile 297 / earth 73 / slab 63`。
`stone` 与 `bamboo` 尚未命中 —— 现有 GLB 里没有石基/竹篱材质；等按 `docs/utopia-manor-triposr-prompts.md`
生成的新模型带上毛石地基与矮竹篱后，会自动落到这两个角色上（无需改代码）。

## 6. 性能与复用

| 指标 | 数值 | 说明 |
| --- | --- | --- |
| 贴图 | 5 张 1024² RGBA ≈ 20 MB 显存 | 颜色图兼作凹凸图，额外 0 |
| 粗糙度贴图 | +4~5 张 1024² RGBA ≈ 16–20 MB | 运行期实测 **4 张**（`slab` 复用 `stone`）；`MANOR_ROUGHNESS_MAP=false` 可省 |
| 材质 | 16 个（≤ 6 角色 × 4 组团） | 原来每网格 `clone()` |
| 复用率 | 982 网格 / 34 份材质 ≈ **28.9×** | 最热的一份材质覆盖 84 个网格、12 栋宅院 |
| 贴图复用 | 645 个网格 / **4 张** roughness 贴图 | 贴图也共享，不是每材质一份 |
| Shader | 全部内建 `MeshStandardMaterial` | 无自定义 shader、无 render target、无动画 |

落到移动端：把 `MANOR_TEXTURE_SIZE` 改成 `512` 即可（显存降到约 1/4），观感损失很小；
再配合 `MANOR_ROUGHNESS_MAP = false` 可进一步减半。

## 7. 接入改动清单（外科式）

| 文件 | 改动 |
| --- | --- |
| `webgl/materials/manorMaterials.js` | **新增**：预设 / 程序化贴图 / 共享材质库 / 角色识别 |
| `webgl/ThreeWorld.js` | ① 顶部新增 import；② `init()` 里 `loadWorldModels()` 后建 `this.manorMaterials`；③ `buildHomes` 里把「按组改色 + 逐网格 clone」换成「按角色取共享材质」（`hasInterior` 宅院仍克隆以隔离内部模式）；④ 庭院平台 → `slab`、临溪木平台/栏杆 → `timber` |
| `scripts/test-manor-materials.mjs` | **新增**自测 |

保留未动：玻璃的 `emissive` 夜光、`shellMaterials` 内部模式淡出、`clickableMeshes`、LOD、坐标与缩放。

## 8. 验收对照

| 要求 | 落点 |
| --- | --- |
| 低饱和哑光 | roughness ≥ 0.85 / metalness 0 / 全色域压饱和 → 见 §1、§2 |
| 哑光有层次（不是死平） | `roughnessMap` 逐像素调制 → 见 §3.1 |
| 夯土带颗粒斑驳 | 夯土图：夯层 + 双色斑块 + 12000 粒颗粒 + 26 条裂纹 |
| 木纹深浅自然变化 | 木纹图：14 色带 + 300 条不同透明度竖纹 + 木节 |
| 瓦片瓦缝磨损 | 瓦面图：垄顶凹缝 + 竖向搭接缝 + 每行 6 处风化缺角 |
| 毛石粗糙不规则 | 毛石图：抖动网格 + 不规则多边形块 + 3.4px 深缝 + 孔隙 |
| 贴图 1024×1024 | 默认 1024（`MANOR_TEXTURE_SIZE`），含 roughnessMap |
| 材质尽量复用 | 共享库 + slab 复用 stone 贴图 + 颜色图兼凹凸图 → 28.9×；贴图侧 645 网格仅 4 张 roughness |
| 不用复杂 shader | 只用内建 `MeshStandardMaterial`（map / bumpMap / roughnessMap） |
| 不新增动画 | 只改 `material` 创建与指派，未接触任何 `update`/时间逻辑 |
