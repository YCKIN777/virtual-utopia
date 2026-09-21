# 虚拟乌托邦 ·「宋式诧寂山居」三套宅院 · 2D 建筑效果图提示词

> **用途**：文生图产出**建筑外立面参考图**，供 Blender 手工建模对照。
> **画面定位**：建筑效果图（architectural visualization）——平视建筑主体、纯白纯色背景、画面只保留房屋本体。
> **范围声明**：本次迭代**只产出提示词文案**，不改动虚拟乌托邦任何业务代码、资产与配置。

---

## 0. 使用要点（先看这 4 条）

1. **一次只出一套**。三套的建筑形态差异（台地/临溪/崖边）靠「主体段」区分；把主体段与下面的**共用段**拼成**一整段**再投喂，风格才会统一成"同一家设计院出的同一套方案"。
2. **必须是平视正立面**。不要 3/4 透视、不要鸟瞰、不要仰视。理由：模型外立面的开间比例、檐口高度、门窗定位要以正投影为基准，透视会带来看不准的尺度误差。若你需要一张带体积感的辅图，按第 4 节的「变体开关」换词，**不要**直接改本提示词。
3. **纯白背景要写死后缀**。多数模型默认会加地面/天空/环境光晕。共用段已写 `flat pure white seamless background (#FFFFFF)` + `isolated object, nothing else in frame`；若仍出现环境，把 `pure white` 提到句子最前再跑，或加权重 `(pure white background:1.3)`。
4. **`（...）` 与权重语法是给 SD/Flux 用的**，Midjourney 请改用 `--no` 与 `--style raw`，见第 5 节。

---

## 1. 共用段（Style + Background + Constraint · 三套完全相同）

> 复制这一整段，**接在每套「主体段」的末尾**，构成完整提示词。

```
architectural elevation rendering, architectural visualization, straight-on eye-level front view, orthographic-like minimal perspective, single-story low-rise Song-dynasty-inspired minimalist wabi-sabi mountain dwelling, shallow-pitch blue-grey clay-tile gable roof with clearly layered eaves and visible tile channels, rammed-earth walls, exposed raw timber posts and beams with believable joinery, irregular rough-stone footing, low-saturation matte palette (weathered earth beige, ochre grey, dull teal-grey tile, raw wood brown), fine rammed-earth grain with hairline cracks and mottled patina, chipped weathered tile edges, timber with visible grain and light wear, subtle natural weathering, clean crisp linework, clearly readable massing and structure, centered composition, building fills most of the frame, floor at the bottom edge, flat pure white seamless background, isolated object, only the building itself in frame, no scenery, no horizon, no ground plane, no mountains, no hills, no trees, no plants, no shrubs, no people, no animals, no vehicles, no furniture inside, no interior, no furniture, no complex carving, no ornaments, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, restrained and quiet, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```

**中文对照**：建筑立面效果图 / 建筑可视化；**平视正立面**、接近正交、透视最小；单层低矮宋式诧寂山居；**平缓青灰瓦悬山顶**、**屋檐层次清晰、可见瓦缝**；夯土墙；裸露原木梁柱、搭接自然；不规则毛石地基；低饱和哑光配色（夯土米、赭灰、暗青灰瓦、原木褐）；夯土细颗粒 + 细微裂纹 + 斑驳旧化；瓦缘风化缺角；木纹清晰、轻微使用痕迹；**线条干净、体量与结构清晰可读**；构图居中、建筑占满画幅、地面贴画幅下缘；**纯白无缝背景**；画面**只有房屋本体**——不要景、不要地平线、不要地面、不要远山丘陵、不要树木植物、不要人畜车辆、不要室内与室内家具、不要复杂雕花、不要文字水印；柔和均匀的中性棚拍光 + 底部极浅接触阴影；哑光质感；克制安静；**非绘画感、非插画风、非概念草图**；不要戏剧光、不要光晕、不要暗角；高细节 4K。

---

## 2. 三套独立完整提示词

> 下面每条都是 **「主体段 + 共用段」拼接后的完整单段**，可直接整段复制粘贴。

### 2.1 台地宅院（Terrace Manor）

**关键词**：开阔小院 · 宽檐门廊 · 少量石凳 · 舒展平和

```
Architectural elevation rendering of a single low-rise Song-dynasty-inspired minimalist wabi-sabi mountain dwelling built on a flat terrace: one story only, a generous open front courtyard with plenty of negative space, a wide low-eave front porch with three visible timber posts, a low rammed-earth courtyard wall with a simple timber gate on one side, two low stone stools and a short run of flat stone stepping slabs in the courtyard, a shallow-pitch blue-grey clay-tile gable roof with clearly layered eaves and deep overhang, rammed-earth walls, exposed raw timber posts and beams with believable joinery, irregular rough-stone footing plinth under the whole front, calm spacious and peaceful composition, architectural elevation rendering, architectural visualization, straight-on eye-level front view, orthographic-like minimal perspective, single-story low-rise Song-dynasty-inspired minimalist wabi-sabi mountain dwelling, shallow-pitch blue-grey clay-tile gable roof with clearly layered eaves and visible tile channels, rammed-earth walls, exposed raw timber posts and beams with believable joinery, irregular rough-stone footing, low-saturation matte palette (weathered earth beige, ochre grey, dull teal-grey tile, raw wood brown), fine rammed-earth grain with hairline cracks and mottled patina, chipped weathered tile edges, timber with visible grain and light wear, subtle natural weathering, clean crisp linework, clearly readable massing and structure, centered composition, building fills most of the frame, floor at the bottom edge, flat pure white seamless background, isolated object, only the building itself in frame, no scenery, no horizon, no ground plane, no mountains, no hills, no trees, no plants, no shrubs, no people, no animals, no vehicles, no furniture inside, no interior, no furniture, no complex carving, no ornaments, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, restrained and quiet, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```

**负向词（Negative / Avoid）**

```
palace, imperial roof, dougong bracket set, multi-story, tower, high-rise, glass curtain wall, concrete modernism, neon, glossy plastic, saturated vivid colors, castle, mountains, hills, landscape, horizon, sky, clouds, trees, forest, bamboo grove, flowers, grass field, gardening, people, animals, birds, cars, text, watermark, logo, signature, frame, border, interior, furniture, bedding, dishes, lantern glow at night, dramatic sunset lighting, painterly brush strokes, watercolor, anime, lowres, blurry, distorted perspective, tilted camera, fisheye, fisheye lens, fisheye distortion, duplicated columns, floating roof, broken roof geometry, extra chimneys
```

**该套要点**：门廊柱必须**可数**（三根），院墙只在**一侧**出现以保持"开阔留白"；石凳两张、贴地不显眼；地基毛石沿整个正面连续可见。**不要**画果树（本次硬性要求画面只保留房屋本体），庭院留白靠空地表现。

---

### 2.2 临溪宅院（Streamside Manor）

**关键词**：亲水木平台 · 矮竹篱 · 门前石板 · 临水悬挑檐口

```
Architectural elevation rendering of a single low-rise Song-dynasty-inspired minimalist wabi-sabi mountain dwelling beside water: one story only, slightly raised above the ground on short timber posts and rough-stone piers, a waterfront wooden deck running across the front with visible plank joints, a cantilevered eave projecting forward over the front edge, a low bamboo-pole fence along the deck edge (dry cut poles only, no living bamboo), a flat stone slab path leading to the entrance, shallow-pitch blue-grey clay-tile gable roof with clearly layered eaves, washed earth-plaster and rammed-earth walls, exposed raw timber posts and beams with believable joinery, irregular rough-stone footing with damp weathering and faint moss staining, light airy and gentle composition, architectural elevation rendering, architectural visualization, straight-on eye-level front view, orthographic-like minimal perspective, single-story low-rise Song-dynasty-inspired minimalist wabi-sabi mountain dwelling, shallow-pitch blue-grey clay-tile gable roof with clearly layered eaves and visible tile channels, rammed-earth walls, exposed raw timber posts and beams with believable joinery, irregular rough-stone footing, low-saturation matte palette (pale earth beige, washed ochre, dull blue-grey tile, weathered wood), fine wall grain with hairline cracks and mottled patina, chipped weathered tile edges, timber with visible grain, slight water stains and light wear, subtle natural weathering, clean crisp linework, clearly readable massing and structure, centered composition, building fills most of the frame, deck at the bottom edge, flat pure white seamless background, isolated object, only the building itself in frame, no scenery, no horizon, no water, no river, no ground plane, no mountains, no hills, no trees, no plants, no shrubs, no people, no animals, no boats, no vehicles, no interior, no furniture, no complex carving, no ornaments, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, restrained and quiet, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```

**负向词（Negative / Avoid）**

```
palace, imperial roof, dougong bracket set, multi-story, tower, high-rise, glass curtain wall, concrete modernism, neon, glossy plastic, saturated vivid colors, castle, water, river, stream, lake, ripples, reflection pool, waterfall, bridge, boat, pier, railing of metal, landscape, horizon, sky, clouds, mountains, hills, trees, forest, bamboo grove, flowers, grass, moss field, people, animals, birds, text, watermark, logo, signature, frame, border, interior, furniture, dramatic sunset lighting, painterly brush strokes, watercolor, anime, lowres, blurry, distorted perspective, tilted camera, fisheye distortion, duplicated columns, floating roof, broken roof geometry
```

**该套要点**：**"水"绝对不能画出来**——"临溪"只通过**架空于木桩与毛石墩的底座 + 亲水木平台 + 前伸悬挑檐口**三个建筑构件表达，背景仍是纯白。竹篱写明 `dry cut poles only, no living bamboo`，避免生成竹丛。底座潮湿风化与淡苔痕保留（是材质信息，不是植被）。

---

### 2.3 崖边宅院（Cliffside Manor）

**关键词**：毛石墙占比高 · 靠山稳固 · 悬挑小窗 · 隐居静谧

```
Architectural elevation rendering of a single low-rise Song-dynasty-inspired minimalist wabi-sabi mountain dwelling built against a rock face: one story only, a high proportion of rough-stone masonry walls stacked from irregular stones with deep recessed mortar joints, two small projecting cantilevered windows on the front wall, rammed-earth infill panels between the stone courses, a rear rough-stone retaining wall built tightly against the back of the building as part of the massing, a small shallow-pitch blue-grey clay-tile gable roof tucked low under the eave line, exposed raw timber lintels and posts with believable joinery, irregular rough-stone footing anchored into a low rock base, a narrow flat stone slab path and one low stone stool at the entrance, secluded quiet and stable composition, architectural elevation rendering, architectural visualization, straight-on eye-level front view, orthographic-like minimal perspective, single-story low-rise Song-dynasty-inspired minimalist wabi-sabi mountain dwelling, shallow-pitch blue-grey clay-tile gable roof with clearly layered eaves and visible tile channels, rammed-earth walls, exposed raw timber posts and beams with believable joinery, irregular rough-stone footing, low-saturation matte palette (grey-brown stone, earth beige, dull blue-grey tile, weathered dark timber), fine stone surface with pores and hairline cracks, chipped weathered tile edges, timber with visible grain and light wear, subtle natural weathering, clean crisp linework, clearly readable massing and structure, centered composition, building fills most of the frame, base at the bottom edge, flat pure white seamless background, isolated object, only the building itself in frame, no scenery, no horizon, no ground plane, no mountains, no cliffs in the background, no hills, no trees, no plants, no shrubs, no people, no animals, no vehicles, no interior, no furniture, no complex carving, no ornaments, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, restrained and quiet, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```

**负向词（Negative / Avoid）**

```
palace, imperial roof, dougong bracket set, multi-story, tower, high-rise, glass curtain wall, concrete modernism, neon, glossy plastic, saturated vivid colors, castle, fortress, battlement, crenellation, dramatic cliff, valley, gorge, mountain range, background mountain, landscape, horizon, sky, clouds, trees, forest, pine, bamboo grove, flowers, grass, vines, climbing plants, people, animals, birds, text, watermark, logo, signature, frame, border, interior, furniture, dramatic sunset lighting, god rays, painterly brush strokes, watercolor, anime, lowres, blurry, distorted perspective, tilted camera, fisheye distortion, duplicated columns, floating roof, broken roof geometry
```

**该套要点**：**"靠山"不能画成远山**——改用**紧贴建筑背立面的毛石挡墙**（`rear rough-stone retaining wall ... as part of the massing`）来表达"靠山稳固"，背景依旧纯白。毛石必须**占比最高**（约墙体 60–70%），夯土只在石缝间做填板。悬挑小窗**只开两扇**，避免生成现代大面积玻璃窗。

---

## 3. 三套对照速查

| 维度 | 台地宅院 | 临溪宅院 | 崖边宅院 |
|---|---|---|---|
| 建筑底座 | 平整毛石台基，落地 | **架空**于短木桩 + 毛石墩 | 低岩体 + 毛石基座，向下方延伸 |
| 屋顶 | 大出檐、高悬（舒展） | 前檐**前伸悬挑**（轻盈） | 檐口压低、贴屋面（静谧） |
| 主墙体 | 夯土为主 | 夯土 + 抹泥 | **毛石为主（60–70%）**，夯土仅作填板 |
| 门廊/开窗 | 三柱宽檐门廊 | 木平台 + 前檐悬挑 | **仅两扇悬挑小窗** |
| 环境表征 | 开阔院墙（单侧）+ 石凳 | 木平台 + 干竹篱 + 石板路 | 背立面紧贴毛石挡墙 |
| 氛围 | 舒展、平和、向阳 | 轻盈、通透、柔和 | 隐居、静谧、稳固 |

---

## 4. 变体开关（改一个 token 就换图，**主体段其余不动**）

| 想要的图 | 替换方式 |
|---|---|
| 正立面（默认，建模主参考） | `straight-on eye-level front view` |
| 带体积感的 3/4 辅图 | `straight-on eye-level front view` → `eye-level three-quarter front-left view, gentle perspective` |
| 侧立面（验进深/屋顶坡度） | `straight-on eye-level front view` → `straight-on eye-level side elevation view` |
| 背立面（崖边宅院必补） | `straight-on eye-level front view` → `straight-on eye-level rear elevation view` |
| 只留线稿（量尺寸用） | 在共用段末追加 `clean monochrome line drawing, flat shading, white background` |

> **三张图要保持"同一套方案"**：同一模型、同一 seed 家族、同一画面比例，只换主体段。建议固定 seed，仅微调（±0 或同 seed 不同 prompt 强度），不要三张各用不同风格词。

---

## 5. 出图参数建议

| 平台 | 参数 |
|---|---|
| **分辨率 / 比例** | 建议 **3:2 横构图**（如 1536×1024）或 1:1（1024×1024）。建筑约 9m 宽 × 4.5m 高，横构图更贴外立面比例 |
| **SD / SDXL / Flux** | Steps 28–32，CFG 4.5–6（偏高会过锐显得假），Sampler `DPM++ 2M Karras` 或 `Euler a`，Seed 固定 |
| **Midjourney** | `--ar 3:2 --style raw --stylize 50 --no scenery,sky,landscape,trees,people,water`（负面用 `--no`） |
| **通用** | 一次出 4 张挑 1 张；**优先取结构正确**的那张（屋顶层次/柱数/开间），细节斑驳可以后期叠加，结构错了没法改 |

---

## 6. 画面硬性要求 → 落点对照（自检用）

| 硬性要求 | 提示词落点 |
|---|---|
| 平视建筑主体 | `straight-on eye-level front view, orthographic-like minimal perspective` |
| 纯白纯色背景 | `flat pure white seamless background (#FFFFFF)` + `no ground plane, no horizon` |
| 不要远山 / 树木 / 人物 | 共用段 `no mountains, no hills, no trees, no plants, no people...` + 各套负向词再加固 |
| 画面只保留房屋本体 | `isolated object, only the building itself in frame` |
| 单层低矮 | `single-story low-rise`、`one story only` |
| 平缓青灰悬山瓦屋顶 | `shallow-pitch blue-grey clay-tile gable roof with clearly layered eaves` |
| 夯土墙面 | `rammed-earth walls` + 颗粒/细裂纹/斑驳材质词 |
| 原木梁柱 | `exposed raw timber posts and beams with believable joinery` |
| 毛石地基 | `irregular rough-stone footing`（崖边为 `rough-stone masonry walls` 为主） |
| 低饱和哑光 + 轻微风化旧化 | `low-saturation matte palette`、`subtle natural weathering`、`mottled patina` |
| 构图居中、轮廓清晰、线条干净 | `centered composition`、`clean crisp linework`、`clearly readable massing and structure` |
| 偏建筑效果图 | `architectural elevation rendering, architectural visualization` |
| 拒绝夸张艺术画风 | `not painterly, not stylized illustration, not concept sketch, no dramatic lighting` + 负向词含 watercolor / anime / god rays |
| 只画外立面、不画室内 | `no interior, no furniture`、`no interior` 双向写入 |
| 不要复杂雕花装饰 | `no complex carving, no ornaments` |

---

## 7. Blender 建模参考用法（拿到图后怎么用）

1. **定比例**：以正立面图为基准，先把**开间数、柱位、檐口高度、屋脊高度、台基高度**按图切分；不要凭感觉先拉体块。
2. **补角度**：至少再出「侧立面」一张，才能定**屋顶坡度与进深**；崖边宅院额外补「背立面」（毛石挡墙与岩体咬合方式）。用第 4 节的变体开关出图。
3. **三套共用骨架**：先把「屋顶 / 夯土墙 / 原木梁柱 / 毛石基座」四层做成同一套模块，再按三套的差异（底座架空、墙体占比、檐口高低）改局部——这样三套在 Three.js 场景里才像同一个村落的同一门派。
4. **和 3D 资产对齐**：Blender 手工模型导出后仍要满足既有部署基线（`docs/pi-agent-manor-deploy-instruction.md`）：
   - 占地基线 `terrace 4.03×4.19`、`forest 4.03×4.19`、`cliff 4.50×3.95`
   - 高度 `terrace 3.40` / `forest 2.90` / `cliff 5.92`（`cliff` 的 `min.y ≈ -2.77` 是插进崖体的咬合底座，**不要抬到 0**）
   - 三角面 2000–3000，无动画、无蒙皮，原点落地面中心
5. **材质对照**：颜色/粗糙度取值直接对齐 `docs/utopia-manor-material-scheme.md`（earth / timber / tile / stone / slab / bamboo，`metalness=0`、`roughness ≥ 0.85`）。

---

## 8. 关联文档

- `docs/utopia-manor-triposr-prompts.md` — 同三套宅院的**文生 3D** 提示词（glb 资产）
- `docs/utopia-manor-material-scheme.md` — Three.js 材质参数方案与贴图配方
- `docs/pi-agent-manor-deploy-instruction.md` — GLB 部署执行指令与自检清单
