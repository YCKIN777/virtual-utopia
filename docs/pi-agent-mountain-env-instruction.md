# 虚拟乌托邦 · 山林公共环境细化 —— Pi Agent 部署执行指令

> 本文件是给 Pi Agent 的**可执行部署手册**。范围：只为虚拟乌托邦新增「山林公共环境视觉层」
> （山坡植被 / 溪流乱石 / 林间薄雾）。
> **全局硬性约束**：禁止改动地块坐标、宅院边界、碰撞盒、原有地形高程、河道位置、居民 AI 闲逛、
> 相机漫游、后端、注册审批、聊天、人设；不新增复杂动画、不修改导航路径。

---

## 0. 改动文件清单（供 scope 守卫核对）

| 文件 | 类型 | 是否业务 |
| --- | --- | --- |
| `frontend/src/virtual-utopia/webgl/decorations/mountainEnv.js` | 新增环境模块 | 视觉层（允许） |
| `frontend/src/virtual-utopia/webgl/ThreeWorld.js` | 外科式接入 4 处 | 装配层（需人工确认） |
| `scripts/verify-mountain-env.mjs` | 新增自检脚本 | 非产品 |
| `scripts/rollback-mountain-env.mjs` | 新增备份/回滚脚本 | 非产品 |
| `scripts/run-manor-deploy-check.mjs` | 总控新增 `env` 步 + scope 放宽 | 非产品 |
| `docs/utopia-mountain-env-*.md` | 新增文档 | 非产品 |

> ThreeWorld.js 的 4 处改动：① import `buildMountainEnv` / `updateMountainEnvMist`；
> ② init 里 `buildFoothillBuffer()` 之后调 `this.buildMountainEnv()`；
> ③ 新增 `buildMountainEnv()` 方法（只读 homes/hubs/地形/河道，落位后挂到 `this.mountainEnv`）；
> ④ animate 循环里调 `updateMountainEnvMist(this.mountainEnv, elapsed)`（仅极慢旋转薄雾层）。
> **均不涉及坐标/边界/碰撞/AI/相机/后端/聊天/人设。**

---

## 1. Pi 部署执行步骤（严格按顺序）

```bash
# 1) 前置备份（记录部署前 HEAD + 环境相关文件清单）
node scripts/rollback-mountain-env.mjs --backup

# 2) 资源预检（结构 / 三角面预算 / 向阳背阴 / 溪流石带 / 不阻挡 / 薄雾 / 0 报错）
node scripts/verify-mountain-env.mjs

# 3) 导入环境 GLB 资源，按配置做实例化散布
#    —— 本迭代为程序化几何，无需外部 GLB；若后续换 Blender 模型，按 mountainEnv.js 的
#       ENV_RECIPES[role].build 替换为 loadModel 几何即可（落位/材质/自检无需改）。

# 4) 更新环境材质与薄雾后处理参数
#    —— 材质与薄雾参数已在 mountainEnv.js / buildMountainEnv 内置（见 §3），无需手动改。

# 5) 运行完整版全量自检（不使用 --fast 快速模式）
node scripts/run-manor-deploy-check.mjs --only=scope,glb,scene,decor,env,materials,beacons,chat,persona
#    或全量（含慢套件 roaming）：
node scripts/run-manor-deploy-check.mjs

# 6) 出现 FAIL 项立刻执行回滚脚本
node scripts/rollback-mountain-env.mjs

# 7) 全部校验通过后 git 提交，写入 memory-shturl 变更记录
git add -A && git commit -m "迭代：山林公共环境细化（山坡植被/溪流乱石/林间薄雾，仅视觉层）"
#    并在 .workbuddy/memory/YYYY-MM-DD.md 追加变更记录
```

> **关键**：步骤 5 必须跑**完整版**（不要 `--fast`），居民漫游回归（`roaming`）要真实验证居民未被新增环境小品卡住。
> 任一步 FAIL → 立即执行步骤 6 回滚，不要带着 FAIL 提交。

---

## 2. 备份 / 回滚脚本

### `scripts/rollback-mountain-env.mjs`（本迭代专用，纯代码 git 快照式）

```bash
node scripts/rollback-mountain-env.mjs --backup   # 部署前：快照当前 HEAD + 环境文件清单
node scripts/rollback-mountain-env.mjs            # 部署失败：git checkout <sha> -- <环境文件>
node scripts/rollback-mountain-env.mjs --dry-run  # 只看会还原什么
node scripts/rollback-mountain-env.mjs --list     # 列出当前备份快照
```

- 本迭代环境是**程序化几何**，没有 GLB / 贴图二进制资产，故"备份"= 记录部署前 commit SHA +
  环境相关文件清单（mountainEnv.js、ThreeWorld.js）；"回滚"= 把这些文件还原到该 SHA 版本。
- 备份落 `.workbuddy/tmp/mountain-env-backup.json`（工作区，不入库）。

### 与既有工具的关系
- 宅院主体 / 庭院小品回滚仍用 `scripts/rollback-manor-deploy.mjs --target manor|decor`。
- 本环境迭代**不触碰**宅院模型与庭院小品，回滚互不影响。

---

## 3. 资源参数（③交付物详解）

### 3.1 山坡植被材质（6 款，实例化）

| 角色 | 基色 | roughness | metalness | 贴图 | 单件三角面 |
| --- | --- | --- | --- | --- | --- |
| `shrubSunny` 矮灌丛·向阳 | `#6f9a54` | 1.0 | 0 | 无（纯色） | ~344 |
| `shrubShade` 矮灌丛·背阴 | `#3f6f49` | 1.0 | 0 | 无（纯色） | ~424 |
| `dwarfTree` 矮树丛 | `#557f48` | 1.0 | 0 | 无（纯色） | ~356 |
| `fernClump` 蕨类丛 | `#4e8a55` | 1.0 | 0 | 无（纯色） | ~320 |
| `streamBoulder` 溪流毛石 | `#8d8b7b` | 1.0 | 0 | 复用 manorMaterials `stone` | ~580 |
| `streamPebble` 溪流碎石 | `#9a9788` | 0.98 | 0 | 复用 manorMaterials `stone` | ~480 |

- 植被纯色 → **0 新增贴图显存**；溪流石复用既有毛石程序化贴图 → **0 新增显存**。
- 全部 `MeshStandardMaterial`（无自定义 shader、无动画、无 render target）。

### 3.2 林间薄雾后处理参数（全局柔雾层）

| 参数 | 低带 | 高带 | 说明 |
| --- | --- | --- | --- |
| y（中心高度） | 5.5 | 9.5 | 贴地高度带 |
| height | 11 | 16 | 带厚 |
| radius | 150 | 178 | 覆盖全场景 |
| color | `#cfe0d8` | `#dbe7df` | 极浅青灰 |
| opacity | 0.07 | 0.05 | **极低，不糊化中近景** |
| 几何 | CylinderGeometry(openEnded) | 同左 | 双面 / depthWrite=false / `fog:false` |
| 漂移 | 0.03 rad/s（受 windEnabled 门控） | 同左 | 极慢，几乎不可察 |

> 既有的 `THREE.Fog` 昼夜/雨天动态逻辑**完全不动**，本层只是叠加的氛围薄雾。近景（<30m）物件可见度不受影响。

---

## 4. 改动范围守卫（scope）配置

`run-manor-deploy-check.mjs` 的 scope 守卫已放宽为允许：
- `frontend/src/virtual-utopia/webgl/decorations/`（含 mountainEnv.js）
- `frontend/src/virtual-utopia/webgl/materials/`
- `frontend/src/virtual-utopia/webgl/models/*.glb`

`ThreeWorld.js` 仍属 **REVIEW**（装配层，非业务逻辑）—— 自检会列出其 hunk 行段供人工核对，
确认仅新增「import / 调用 / 新方法 / 薄雾漂移」四处，未触碰坐标/边界/碰撞/AI/相机/后端/聊天/人设。

越界判定（命中即 FAIL，必须回滚）：文件名含 `worldLayout|homes|plots?`（地块）、
`collision|collider`（碰撞）、`resident|roam|avatar`（居民 AI）、`camera|controls`（相机）、
`backend/`（后端）、`chat|residentChat`（聊天）、`persona`（人设）。

---

## 5. 完整自检清单（对应交付物 ⑤）

| # | 自检项 | 验证方式 |
| --- | --- | --- |
| ✅ | 环境资源挂载正常，无模型悬浮、穿模 | verify：结构隔离 + 溪流石在带(0 落水/0 越岸) + 0 报错 |
| ✅ | 页面帧率稳定，实例化渲染生效，性能无明显下滑 | verify：6 个 InstancedMesh + 薄雾 2 个；draw call 增量极小 |
| ✅ | 居民 Avatar 全场景闲逛正常，不会被新增灌木/石块卡住 | verify：距宅院 ≥8m、距枢纽 ≥7m + roaming 回归通过 |
| ✅ | 地形高程、河道位置、地块划分完全保持原样 | scope 守卫（无 worldLayout 改动）+ 落位只读 getTerrainHeight/getStreamX |
| ✅ | 庭院原有房屋、庭院小品保持不变 | verify：courtyard-decor 仍在 + decor 自检仍全绿 |
| ✅ | 相机漫游功能正常，薄雾渲染正常，无画面异常 | scene 自检 + verify 薄雾层存在 + 0 报错 |
| ✅ | 注册、申请审批、居民聊天、人设全部原有业务功能正常 | scope 守卫 + chat/persona 回归全绿 |
| ✅ | 变更记录写入 memory-shturl | 见 §1 步骤 7 |

---

## 6. 失败处置与回滚

| 现象 | 处置 |
| --- | --- |
| `verify-mountain-env.mjs` 任一 FAIL | 立即 `node scripts/rollback-mountain-env.mjs` |
| scope 守卫报越界（动了地块/碰撞/AI…） | `git checkout -- <文件>` 还原，禁止提交 |
| 全量自检 `roaming` 失败（居民被卡） | 回滚 env，检查 HOME_CLEAR / HUB_CLEAR 是否过小 |
| 薄雾导致画面发白 | 回滚 env，检查 MIST_PARAMS.opacity（应 ≤0.07） |

---

## 7. 关联文档

- `docs/utopia-mountain-env-scheme.md` — 整体设计方案（落位规则 / 材质 / 薄雾）
- `docs/utopia-mountain-env-art-prompts.md` — Blender 2D 参考图提示词
- `docs/pi-agent-courtyard-decor-instruction.md` — 庭院小品部署（同一套工具链）
- `docs/pi-agent-manor-deploy-instruction.md` — 宅院 GLB 部署（同一套工具链）
