# 虚拟乌托邦 · 山林环境 Blender 2D 参考图提示词

> 纯文案交付，用于指导 Blender 手工建模前的「概念参考图」生成（文生图）。
> 本迭代所有模型目前由 three 基础几何程序化生成（零外部资源、可复现）；
> 若日后要换成 Blender 手工模型，先按本文件出参考图，再建模导出 GLB 替换（落位/材质/自检无需改）。
> 替换约定见 `docs/utopia-mountain-env-scheme.md` 与 `docs/pi-agent-mountain-env-instruction.md`。

---

## 使用要点（务必先读）

1. **两套图、两套用途**：
   - **山坡灌丛**（矮灌丛·向阳 / 矮灌丛·背阴 / 矮树丛 / 蕨类丛）—— 给「山坡植被」建模参考
   - **溪流乱石**（溪流毛石 / 溪流碎石）—— 给「溪流两岸装饰石」建模参考
2. **风格锚点统一**：宋式诧寂山居世界观，低饱和、哑光、自然风化的山林材质；与既有宅院材质（`utopia-manor-material-scheme.md` 的 stone/bamboo）同源。
3. **视角统一**：平视微俯（eye-level slight top-down），不画人物、不画建筑主体、不画天空云彩；
   只画「地上一丛植被」或「岸边一堆积石」，纯白无缝背景，方便抠图参考。
4. **硬性几何约束（建模导出时必须对齐）**：单模型 **300–800 三角面**、原点在底面中心、占地约
   0.8–1.4m、无动画、无骨架。落位由程序化散布决定，模型本身不要带旋转之外的变换。

---

## A. 山坡灌丛（4 款）

### A1 · 矮灌丛·向阳 `shrubSunny`
> English（直贴）:
> `Flat-lay botanical reference of a low sunny-slope shrub cluster, three overlapping rounded leafy mounds on a short woody stem, warm sage-green foliage (#6f9a54) with lighter highlights, compact and low crown, matte naturalist rendering, soft diffuse light, pure white seamless background, no sky no people no building, eye-level slight top-down view, architectural plant study style, not painterly not stylized`

中文对照：低矮向阳坡灌丛平铺参考，三根交叠圆润叶球生于短木茎上，暖 sage 绿（#6f9a54）带浅高光，冠低而紧凑，哑光自然写实，柔光，纯白无缝背景，无天无人无建筑，微俯平视，植物学研究图风格，非绘画非风格化。

负向词：`tall tree, flowering, cartoon, glossy, dramatic lighting, sky, person, house`

### A2 · 矮灌丛·背阴 `shrubShade`
> English（直贴）:
> `Flat-lay botanical reference of a shade-slope shrub cluster, four loose dark-green leafy mounds (#3f6f49) on a slender stem, taller and airier than sunny shrub, cool muted forest green, matte, damp woodland feel, pure white seamless background, eye-level slight top-down, plant study, not stylized illustration`

中文对照：背阴坡灌丛平铺参考，四团松散深绿叶球（#3f6f49）生于细茎，比向阳灌丛更高更透气，冷调哑光林下感，纯白背景，微俯平视，植物研究图，非风格化插画。

负向词：`bright warm color, flower, glossy, painting, sky, figure`

### A3 · 矮树丛 `dwarfTree`
> English（直贴）:
> `Flat-lay reference of a dwarf tree clump, thin trunk with four small rounded canopies,介于 shrub and small tree, sparse woodland grove feel, muted green (#557f48), matte bark, pure white background, eye-level slight top-down, botanical study, not concept sketch`

中文对照：矮树丛平铺参考，细干托四团小圆冠，介于灌丛与小树之间，疏林感，哑光灰绿（#557f48）树皮，纯白背景，微俯平视，植物研究图，非概念草图。

负向词：`full tree, palm, bloom, toon shading, sky`

### A4 · 蕨类丛 `fernClump`
> English（直贴）:
> `Flat-lay reference of a fern clump, twenty thin arching fronds radiating from base, feathery pinnate leaves, fresh green (#4e8a55), low ground-cover, matte, pure white seamless background, eye-level top-down, botanical illustration study, not stylized`

中文对照：蕨类丛平铺参考，二十根细弧叶片自基部放射，羽状复叶，鲜绿（#4e8a55），贴地低矮，哑光，纯白背景，俯视，植物插画研究，非风格化。

负向词：`flower, tree, glossy, painting, sky, person`

---

## B. 溪流乱石（2 款）

### B1 · 溪流毛石 `streamBoulder`
> English（直贴）:
> `Flat-lay reference of a streamside boulder cluster, one large weathered river rock (detail 2, irregular facets) with three medium and two small attendant stones, moss-dappled grey stone (#8d8b7b), wet bank feel, matte rough surface, pure white seamless background, eye-level slight top-down, geological specimen study, not stylized`

中文对照：溪岸毛石簇平铺参考，一块风化大河石（不规则刻面）配三中两小石，苔点灰石（#8d8b7b），湿润岸感，哑光粗糙面，纯白背景，微俯平视，地质标本研究图，非风格化。

负向词：`smooth marble, carved, polished, person, water surface, sky`

### B2 · 溪流碎石 `streamPebble`
> English（直贴）:
> `Flat-lay reference of a shallow-shoal pebble cluster, six flat low pebbles of varying size on a thin gravel bed, light grey stone (#9a9788), wet shallow-water edge, matte, pure white seamless background, eye-level top-down, specimen study, not painterly`

中文对照：浅滩碎石簇平铺参考，六块大小不一的扁平低石置于薄砾床，浅灰石（#9a9788），湿润浅水边，哑光，纯白背景，俯视，标本研究，非绘画。

负向词：`round ball, crystal, glossy, sky, figure`

---

## 出图参数建议

| 项 | 值 |
| --- | --- |
| 分辨率 | 1024×1024（正方形，便于抠图参考） |
| 采样 / 步数 | 默认即可，追求边缘清晰 |
| 负向词必备 | `sky, person, building, house, dramatic lighting, glossy, cartoon, stylized illustration` |
| 背景 | 强制 `pure white seamless background`（否则抠图参考无意义） |
| 视角 | `eye-level slight top-down`（与宅院概念图 `utopia-manor-concept-art-prompts.md` 的平视正立面不同——植被/石块用俯视参考更实用） |

## 关联文档

- `docs/utopia-mountain-env-scheme.md` — 整体方案（落位规则 / 材质 / 薄雾参数）
- `docs/pi-agent-mountain-env-instruction.md` — 部署指令 + 备份回滚 + scope + 自检清单
- `docs/utopia-manor-concept-art-prompts.md` — 宅院概念图提示词（同一世界观锚点）
