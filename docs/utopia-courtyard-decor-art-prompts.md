# 虚拟乌托邦 · 庭院小品 · Blender 建模用 2D 参考图提示词

> 用途：文生图产出**单品参考图**，供 Blender 手工建模对照（外轮廓、比例、细节层级）。
> 与 `utopia-manor-concept-art-prompts.md` 同一套画面语言：平视、纯白背景、只保留物件本身、偏效果图。
> 模型落地约束（与 `utopia-courtyard-decor-scheme.md` 一致）：**单件 300–800 三角面**、原点在**底面中心**、无动画、无贴图（材质走程序化共享贴图）。

---

## 0. 使用要点

1. **一次只出一件**。把「共用段」拼在「单品主体段」之后，构成一整段完整提示词。
2. **只是参考图，不做成品**：这批图用来定**轮廓与比例**。Blender 里请按下面的面数/尺寸表控制，不要照图堆细节。
3. **画面必须干净**：纯白背景、无环境、无地面阴影外的任何东西 —— 小品体积小，一旦有场景元素就说不清轮廓了。
4. 尺寸口径：下表括号里是**目标世界尺寸（米）**，对应项目里 `home.scale ≈ 0.92–1.18` 的宅院尺度。

---

## 1. 共用段（Style + Background + Constraint · 七款完全相同）

> 复制这段接在每件「主体段」的末尾。

```
single isolated small courtyard prop, Song-dynasty-inspired minimalist wabi-sabi garden object, low-saturation matte palette, restrained and quiet, clean crisp silhouette, clearly readable form and structure, centered composition, object fills most of the frame, base at the bottom edge, flat pure white seamless background, isolated object, nothing else in frame, no scenery, no horizon, no ground plane, no mountains, no trees, no plants, no people, no animals, no buildings, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```

**中文对照**：单件独立庭院小品；宋式极简诧寂园林物件；低饱和哑光；克制安静；**轮廓干净、形制清晰可读**；
构图居中、物件占满画幅、底面贴画幅下缘；**纯白无缝背景**；画面只有该物件——不要景、不要地平线、不要地面、
不要远山、不要树木植物、不要人畜、不要建筑、不要文字水印；柔和均匀棚拍光 + 底部极浅接触阴影；哑光质感；
**非绘画感、非插画风、非概念草图**；不要戏剧光、光晕、暗角；高细节 4K。

---

## 2. 七款小品的独立提示词

### 2.1 石凳 Stone Stool（台地 / 森林 · 目标 0.86 × 0.55 × 0.40 m）

```
Architectural reference image of a small Song-dynasty-inspired stone garden bench stool: a simple rectangular weathered stone bench, one slightly tapered stone seat slab on two short block stone legs, no backrest, no armrests, plain mortared stone surface, chipped worn edges, rough matte grey-brown stone, bare and unadorned, proportion roughly 2.2 : 1 in plan and low in height, single isolated small courtyard prop, Song-dynasty-inspired minimalist wabi-sabi garden object, low-saturation matte palette, restrained and quiet, clean crisp silhouette, clearly readable form and structure, centered composition, object fills most of the frame, base at the bottom edge, flat pure white seamless background, isolated object, nothing else in frame, no scenery, no horizon, no ground plane, no mountains, no trees, no plants, no people, no animals, no buildings, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```
**负向词**
```
carved ornament, dragon motif, engraved text, marble polish, glossy stone, golden trim, backrest, armrest, cushion, wooden stool, plastic chair, metal legs, multiple benches, group of objects, text, watermark, scene, background landscape
```

### 2.2 石板 Stone Slab / stepping stone（三类通用 · 目标 1.05 × 0.72 × 0.09 m）

```
Architectural reference image of a single flat stone stepping slab: one thin rectangular flagstone paving slab, gently irregular chipped edges, faintly uneven top face, natural split-stone surface with subtle grain and hairline cracks, matte weathered grey, very low profile, seen at a shallow eye-level angle so its thinness is obvious, proportion roughly 1.5 : 1 in plan and only about 9 cm thick, single isolated small courtyard prop, Song-dynasty-inspired minimalist wabi-sabi garden object, low-saturation matte palette, restrained and quiet, clean crisp silhouette, clearly readable form and structure, centered composition, object fills most of the frame, base at the bottom edge, flat pure white seamless background, isolated object, nothing else in frame, no scenery, no horizon, no ground plane, no mountains, no trees, no plants, no people, no animals, no buildings, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```
**负向词**
```
paving path, many stones, tiled floor, brick pattern, engraved carving, text on stone, glossy tile, marble, water, moss carpet, grass around, text, watermark, scene, background landscape
```

### 2.3 果树灌丛 Fruit-bearing Shrub（台地 / 森林 · 目标 1.1 × 1.0 × 1.15 m）

```
Architectural reference image of a small fruit-bearing garden shrub: a low slim dark timber trunk with two or three compact rounded canopies of muted sage-green leaves, a few small round pale-orange fruits visible at the canopy edges, sparse and airy, not a full tree, no visible roots, above-ground portion only, overall roughly as wide as it is tall, single isolated small courtyard prop, Song-dynasty-inspired minimalist wabi-sabi garden object, low-saturation matte palette, restrained and quiet, clean crisp silhouette, clearly readable form and structure, centered composition, object fills most of the frame, base at the bottom edge, flat pure white seamless background, isolated object, nothing else in frame, no scenery, no horizon, no ground plane, no mountains, no trees, no plants, no people, no animals, no buildings, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```
**负向词**
```
big tree, tall tree, forest, orchard row, flowers, blossoms, garden bed, planter pot, trellis, roots, soil mound, grass field, multiple shrubs, autumn red leaves, saturated green, text, watermark, scene, background landscape
```

### 2.4 小型景观石 Landscape Rock（临溪 / 森林 · 目标 1.4 × 0.9 × 0.62 m）

```
Architectural reference image of a small ornamental garden rock grouping: one main low angular weathered boulder with two smaller companion stones and one small chip stone beside it, irregular low-poly rock faces, natural grey-brown stone with pores and hairline cracks, matte and rough, no carving, no inscriptions, sits low and wide, single isolated small courtyard prop, Song-dynasty-inspired minimalist wabi-sabi garden object, low-saturation matte palette, restrained and quiet, clean crisp silhouette, clearly readable form and structure, centered composition, object fills most of the frame, base at the bottom edge, flat pure white seamless background, isolated object, nothing else in frame, no scenery, no horizon, no ground plane, no mountains, no trees, no plants, no people, no animals, no buildings, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```
**负向词**
```
tall standing stone, scholar rock with holes, carved inscription, statue, fountain, waterfall, mountain range, cliff, gravel zen garden rake pattern, many rocks scattered, water, moss carpet, text, watermark, scene, background landscape
```

### 2.5 矮竹丛 Low Bamboo Clump（临溪 · 目标 0.5 × 0.5 × 1.35 m）

```
Architectural reference image of a small low bamboo clump: about seven slim upright bamboo stalks of varying heights with faint node rings, a few thin sparse leaves near the tops, dry cut poles gathered at the base, tall and narrow proportion, no pot, no planter, above-ground portion only, single isolated small courtyard prop, Song-dynasty-inspired minimalist wabi-sabi garden object, low-saturation matte palette, restrained and quiet, clean crisp silhouette, clearly readable form and structure, centered composition, object fills most of the frame, base at the bottom edge, flat pure white seamless background, isolated object, nothing else in frame, no scenery, no horizon, no ground plane, no mountains, no trees, no plants, no people, no animals, no buildings, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```
**负向词**
```
bamboo forest, bamboo grove, tall bamboo wall, dense foliage, potted plant, planter, flowers, saturated green, panda, water, mist, text, watermark, scene, background landscape
```

### 2.6 大块毛石 Boulder（崖边 · 目标 1.6 × 1.2 × 0.9 m）

```
Architectural reference image of a large rough-hewn boulder stone: one dominant chunky rock mass with heavily fractured faceted faces, several smaller fractured blocks clustered and fused around its base, deep irregular crevices, coarse porous grey granite surface, matte and heavy, clearly heavier and blockier than an ornamental rock, no carving, single isolated small courtyard prop, Song-dynasty-inspired minimalist wabi-sabi garden object, low-saturation matte palette, restrained and quiet, clean crisp silhouette, clearly readable form and structure, centered composition, object fills most of the frame, base at the bottom edge, flat pure white seamless background, isolated object, nothing else in frame, no scenery, no horizon, no ground plane, no mountains, no trees, no plants, no people, no animals, no buildings, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```
**负向词**
```
boulder on mountain, cliff face, quarry, gravel pile, cobblestone pavement, carved relief, statue, polished granite, water, moss carpet, plants, text, watermark, scene, background landscape
```

### 2.7 简易石灯 Simple Stone Lantern（崖边 · 目标 0.68 × 0.68 × 1.35 m）

```
Architectural reference image of a small simple stone garden lantern: a short round stone base, a slim round stone shaft, a small square stone platform, a plain square light chamber with a small dark opening on one visible face, a shallow square pyramid stone roof cap and a tiny round stone finial, plain mortared stone, no carving, no inscription, unlit and empty, plainly built by hand, overall a tall narrow proportion about twice as tall as it is wide, single isolated small courtyard prop, Song-dynasty-inspired minimalist wabi-sabi garden object, low-saturation matte palette, restrained and quiet, clean crisp silhouette, clearly readable form and structure, centered composition, object fills most of the frame, base at the bottom edge, flat pure white seamless background, isolated object, nothing else in frame, no scenery, no horizon, no ground plane, no mountains, no trees, no plants, no people, no animals, no buildings, no text, no watermark, no logo, soft even neutral studio lighting, faint contact shadow at the base, matte finish, not painterly, not stylized illustration, not concept sketch, no dramatic lighting, no lens flare, no bloom, no vignette, high detail, 4k
```
**负向词**
```
japanese ornate lantern, bronze lantern, temple lantern, pagoda, glowing lamp, lit fire, flame, warm light, metal frame, paper shade, dragon carving, engraved text, electric lamp post, multiple lanterns, text, watermark, scene, background landscape
```

---

## 3. 建模与落地约束（Blender → GLB）

| 项 | 要求 |
| --- | --- |
| 三角面 | **单件 300–800**（当前程序化版本实测 304–420，可作为参考基准） |
| 原点 | **底面中心**（`Object → Set Origin → Origin to Geometry` 后把 `min.z` 归零） |
| 朝向 | 正面朝 **+Z**（项目按 `rotation.y` 摆放；`+Z` 为物件正面） |
| 尺寸 | 按 §2 各条括号里的目标尺寸，**不要**整体放大（落位环带按宅院底盘半径算，放大会穿出台基） |
| 材质 | **不内嵌贴图**（材质走程序化共享贴图，内嵌会白增文件体积）；导出时只保留 1 个材质槽即可 |
| 动画 | 无动画轨迹、无骨骼、无蒙皮 |
| 命名 | `stool.glb` / `slab.glb` / `fruitShrub.glb` / `landscapeRock.glb` / `bambooClump.glb` / `boulder.glb` / `stoneLantern.glb` |
| 放置 | `frontend/src/virtual-utopia/webgl/models/decor/` |

**替换步骤**（详细命令见 `docs/pi-agent-courtyard-decor-instruction.md`）：

```bash
node scripts/rollback-manor-deploy.mjs --target decor --backup   # 先备份（当前为空也安全）
cp <新件>.glb frontend/src/virtual-utopia/webgl/models/decor/stool.glb
node scripts/verify-courtyard-decor.mjs                          # 复跑自检（面数/落位/不阻挡）
```

> 提示：程序化几何在 `courtyardDecor.js` 的 `DECOR_RECIPES[role].build` 里；
> 换成 GLB 时把该函数改为返回 GLB 的几何即可，**落位、材质、自检逻辑一行都不用改**。

---

## 4. 变体开关

| 想要的图 | 替换方式 |
| --- | --- |
| 平视正立面（默认，建模主参考） | `shallow eye-level angle`（石板那条）/ 其余默认即为平视 |
| 带体积感的 3/4 辅图 | 追加 `eye-level three-quarter front-left view, gentle perspective` |
| 俯视定轮廓（看平面占比） | 追加 `top-down orthographic view, flat even lighting` |
| 只留线稿（量尺寸用） | 追加 `clean monochrome line drawing, flat shading, white background` |

三张图要保持"同一套方案"：固定 seed、同比例、只换主体段。
