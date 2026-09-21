# 虚拟乌托邦 ·「宋式诧寂山居」三套轻量化宅院 · TripoSR 文生 3D 提示词

> 目标模型：HuggingFace TripoSR / 文本条件 3D 生成（OpenAI-CLIP 风格条件）
> 输出资产：`glb`，三角面 **2000–3000**，原点位于**地面中心**，供 Three.js 网页场景直接替换。
> 对应现有资产命名：`terrace-manor.glb` / `stream-manor.glb` / `cliff-manor.glb`（后两者为新增，另见 `forest-manor.glb` 保留）。

---

## 0. 使用要点（先看这 3 条，能显著提高出片率）

1. **TripoSR 官方是「图生 3D」**。若你用的是官方 Space，推荐先用下面任一提示词走 `文生图 → TripoSR`：
   出图时追加 **`single isolated object, plain white background, three-quarter front-left view, soft even studio lighting, no ground shadow, centered, full object in frame`**，再喂给 TripoSR。
   若用文本条件变体（text-to-3D Space），可直接把「粘贴用提示词」整段丢进去。
2. **复合词（rammed-earth / blue-grey / single-story / three-quarter）用连字符**，CLIP 类条件更稳。
3. **三角面数不由提示词精确控制**。提示词里写 `low-poly, about 2500 triangles` 只是**倾向性引导**；真正的 2000–3000 面请在导出后做一次 decimate（Blender: Decimate→Collapse 目标面数），并**重新居中到地面原点**（`Object → Set Origin → Origin to Geometry(Bounds)` 后再把 `min.z` 归零）。

---

## 1. 台地宅院（Terrace Manor）

### 1.1 粘贴用提示词（English · 单段直贴）

```
Single isolated building asset for a 3D web scene: a small Song-dynasty-inspired minimalist wabi-sabi mountain dwelling on a flat terrace, low single-story, an open small enclosed courtyard with generous negative space, a wide low-eave front porch, shallow-pitch blue-grey clay-tile roof with clearly layered eaves, rammed-earth walls, exposed raw timber posts and beams with believable mortise-and-tenon joinery sitting on irregular rough-stone plinths, a few flat stone stepping slabs, two low stone stools, sparse fruit trees at the courtyard corner, low rammed-earth courtyard wall with a simple timber gate, muted low-saturation matte palette (weathered earth beige, ochre grey, dull teal-grey tile), fine rammed-earth grain with hairline cracks, blue-grey tiles showing tile channels and chipped weathered edges, raw timber with visible grain and light wear, natural aged mottled patina, calm spacious peaceful sunlit healing atmosphere, realistic believable timber-frame structure, restrained and quiet, no palace, no dougong bracket sets, no multi-story, no modern architecture, no glass curtain wall, clean low-poly game-ready exterior asset, about 2500 triangles, single object, origin at the center of the ground plane, fixed footprint about 9 m by 9 m, single story height about 4.5 m, no interior furniture, no complex carvings, no ornaments, no people, no text, no watermark, plain white background, soft even studio lighting, three-quarter front view
```

### 1.2 中文对照

单件建筑资产（3D 网页场景用）：宋式极简诧寂山居，位于平整台地上，低矮单层；**开阔的小型围合庭院、留白充足**；**宽檐门廊**；平缓青灰瓦屋顶、**屋檐层次清晰**；夯土墙；裸露原木梁柱、**榫卯/搭接自然**，落在不规则毛石柱础上；庭院内少量平整石板、两张矮石凳、角落疏散果树；低矮夯土院墙 + 简易木门；低饱和哑光配色（夯土米、赭灰、暗青灰瓦）；夯土墙带细颗粒与**细微裂纹**；青灰瓦保留**瓦缝与边缘风化缺角**；原木可见木纹与**轻微使用痕迹**；自然旧化斑驳；安静、舒展、向阳、治愈；结构真实合理；克制不张扬。**拒绝**宫殿、斗拱、多层建筑、现代建筑、玻璃幕墙、室内家具、复杂雕花。

### 1.3 负向提示词（Negative / Avoid）

```
palace, imperial roof, dougong bracket set, multi-story, tower, glass curtain wall, concrete modernism, neon, glossy plastic, saturated vivid colors, castle, interior furniture, bedding, dishes, ornate carving, dragon motif, gold trim, people, animals, text, watermark, logo, busy clutter
```

---

## 2. 临溪宅院（Streamside Manor）

### 2.1 粘贴用提示词（English · 单段直贴）

```
Single isolated building asset for a 3D web scene: a small Song-dynasty-inspired minimalist wabi-sabi mountain dwelling beside a stream, low single-story, slightly raised on short timber and stone piles, a waterfront wooden deck extending toward the water, a cantilevered eave over the water edge, low bamboo fence, flat stone slab path at the entrance, shallow-pitch blue-grey clay-tile roof with clearly layered eaves, washed earth-plaster and rammed-earth walls, exposed raw timber posts and beams with believable joinery, irregular rough-stone footing, damp weathering and faint moss on the stone base, a few smooth stepping stones and one low stone stool, muted low-saturation matte palette (pale earth beige, washed ochre, dull blue-grey tile, weathered wood), fine wall grain with hairline cracks, blue-grey tiles with tile channels and chipped weathered edges, raw timber with visible grain and slight water stains, natural aged mottled patina, light airy flowing gentle soft quiet healing atmosphere, realistic believable timber-frame structure, no palace, no dougong bracket sets, no multi-story, no modern architecture, no glass curtain wall, clean low-poly game-ready exterior asset, about 2500 triangles, single object, origin at the center of the ground plane, fixed footprint about 9 m by 9 m including the deck, single story height about 4.5 m, no interior furniture, no complex carvings, no people, no text, no watermark, plain white background, soft even studio lighting, three-quarter front view
```

### 2.2 中文对照

单件建筑资产（3D 网页场景用）：临溪而建的宋式极简诧寂山居，低矮单层；以短木桩+毛石墩**略微架空**；**亲水木平台**伸向水边；**临水侧檐口悬挑**；**矮竹篱**；门前**石板路**；平缓青灰瓦、屋檐层次清晰；夯土+抹泥墙（水岸做旧）；裸露原木梁柱、搭接自然；不规则毛石基础；**基部有潮湿风化与淡淡苔痕**；少量光滑汀步石 + 一张矮石凳；低饱和哑光配色（浅夯土米、水洗赭、暗青灰瓦、做旧木）；墙面细颗粒与细微裂纹；瓦面有瓦缝与风化缺角；原木见木纹与**轻微水渍**；自然斑驳；轻盈、通透、柔和、安静、治愈；结构真实。**拒绝**宫殿、斗拱、多层、现代建筑、玻璃幕墙、室内家具、复杂雕花。

### 2.3 负向提示词

```
palace, imperial roof, dougong bracket set, multi-story, tower, glass curtain wall, concrete modernism, neon, glossy plastic, saturated vivid colors, ornate carving, gold trim, interior furniture, people, boats, masts, text, watermark, logo, busy clutter
```

---

## 3. 崖边宅院（Cliffside Manor）

### 3.1 粘贴用提示词（English · 单段直贴）

```
Single isolated building asset for a 3D web scene: a small Song-dynasty-inspired minimalist wabi-sabi mountain dwelling built against a rock face on a cliff, low single-story, a high proportion of rough-stone masonry walls made of irregular stacked stones with deep mortar joints, a few small cantilevered windows projecting from the stone wall, a small shallow-pitch blue-grey clay-tile roof tucked under the rock overhang with clearly layered eaves, supporting rock outcrop on the back side, exposed raw timber lintels and posts with believable joinery, rammed-earth wall panels filling between stones, irregular rough-stone footing anchored into the slope, a narrow stone slab path and one low stone stool, muted low-saturation matte palette (grey-brown stone, earth beige, dull blue-grey tile, weathered dark timber), fine stone surface with pores and hairline cracks, blue-grey tiles with tile channels and chipped weathered edges, raw timber with visible grain and light wear, natural aged mottled patina, secluded quiet shadowed stable hermit-like calm healing atmosphere, realistic believable structure, no palace, no dougong bracket sets, no multi-story, no modern architecture, no glass curtain wall, clean low-poly game-ready exterior asset, about 2500 triangles, single object, origin at the center of the ground plane, fixed footprint about 9 m by 9 m, single story height about 4.5 m, no interior furniture, no complex carvings, no people, no text, no watermark, plain white background, soft even studio lighting, three-quarter front view
```

### 3.2 中文对照

单件建筑资产（3D 网页场景用）：依崖而筑的宋式极简诧寂山居，低矮单层；**毛石砌墙占比更高**，石块不规则、灰缝深；**几扇悬挑小窗**凸出于石墙；平缓青灰瓦小屋顶**收在岩檐之下**、檐口层次清晰；背侧为**山体岩壁**承托；裸露原木过梁与柱、搭接自然；石块之间以夯土补填；不规则毛石基础**嵌入坡体**；窄石板路与一张矮石凳；低饱和哑光配色（灰褐石、夯土米、暗青灰瓦、深做旧木）；石面有细孔与细微裂纹；瓦面瓦缝与风化缺角；原木见木纹与轻微磨损；自然斑驳；**隐居、静谧、偏冷、稳固**、治愈；结构真实。**拒绝**宫殿、斗拱、多层、现代建筑、玻璃幕墙、室内家具、复杂雕花。

### 3.3 负向提示词

```
palace, imperial roof, dougong bracket set, multi-story, tower, glass curtain wall, concrete modernism, neon, glossy plastic, saturated vivid colors, ornate carving, gold trim, cave temple, statue, interior furniture, people, text, watermark, logo, floating geometry, disconnected parts
```

---

## 4. 落地到 Three.js 的硬约束清单（三套统一）

| 项 | 要求 | 备注 |
| --- | --- | --- |
| 格式 | `glb`（单文件、内嵌材质） | 现有资产同格式 |
| 三角面 | **2000–3000** | 生成后 decimate 到区间；超 3000 网页移动端会掉帧 |
| 原点 | **地面中心**（`x=z=0`，`min.y=0`） | 便于 `addResidentAvatar` / Manor 放置不偏移 |
| 占地 | **≈9 m × 9 m 固定**（含院落/平台） | 三套一致，替换模型不改变布局 |
| 层数/高度 | 单层，总高 **≈4.5 m** | 与现有 manor 视觉比例一致 |
| 动画 | **无**（静态网格，无骨骼/无关键帧） | 场景只用位置/旋转 |
| 贴图 | 1 张 ≤1024² 的哑光 PBR（或仅 baseColor） | 追求轻量可只保留 baseColor |
| 附加 | 不合法线翻转、无孤立碎片、无地面/阴影烘焙 | 阴影由场景光照实时产生 |

### 4.1 命名与接入（已核对现有代码，非猜测）

```
frontend/src/virtual-utopia/webgl/models/terrace-manor.glb   # 台地宅院（替换现有同名文件）
frontend/src/virtual-utopia/webgl/models/cliff-manor.glb     # 崖边宅院（替换现有同名文件）
frontend/src/virtual-utopia/webgl/models/stream-manor.glb    # 临溪宅院（新增）
```

**现状（`modelLoader.js` / `ThreeWorld.js`）**：只加载了 3 个 manor 模型 —— `cliffManor` / `forestManor` / `terraceManor`；
选型逻辑（`ThreeWorld.js` 约 2877 行与 3052 行两处）是：

```js
home.group === 'cliff'  ? this.models.cliffManor
: home.group === 'forest' ? this.models.forestManor
: this.models.terraceManor          // ← 台地组与临溪组当前都复用 terraceManor
```

- **台地 / 崖边**：直接替换同名 `glb` 即可，**零代码改动**。
- **临溪（新增）**：需要 3 处小改 ——
  1. `modelLoader.js`：加一行 `loadModel('./models/stream-manor.glb')`，并在返回对象里加 `streamManor`；
  2. `ThreeWorld.js` 约 2877 行与 3052 行的选型分支里，加 `home.group === 'stream' ? this.models.streamManor`（放在 fallback 之前）；
  3. 材质按组上色已有现成表（`groupWood = { cliff, forest, terrace, stream }`），无需再改。
- 若暂时不想改代码，可先把「临溪宅院」的生成结果**覆盖到 `terrace-manor.glb`**，台地与临溪两组会同时换成新外观（视觉上仍成立，但不区分）。

