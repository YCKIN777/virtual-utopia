# 虚拟乌托邦 BP4-M5 验收文档

## 1. 验收范围

本阶段只实现BP4-M5的3D世界前端渲染与家园搭建交互：

- 独立M5前端壳，只读挂载冻结的BP2 Three.js世界。
- 50户独立地块选择、山谷山林环境与生活广场展示。
- WASD、鼠标视角漫游和室内模式原有入口。
- 院落5×5网格和6类低模素材。
- 素材放置、旋转、删除、保存和刷新恢复。
- 家园布局持久化与实时修改事件。
- M1在线状态、Avatar和语音状态桥接。
- M5实时频道中的本地Avatar位姿上报和远端Avatar显示。
- 单元测试、构建和E2E交互测试。

BP1、BP2、BP3、BP4-M1、BP4-M2、BP4-M3和BP4-M4代码未修改；50户坐标、地形、生活广场、溪流、山体、树木和原有Three.js美术结构保持冻结。

## 2. 3D世界基线复用

M5通过只读导入复用：

```text
H:\BP2\frontend\src\virtual-utopia\webgl\ThreeWorld.js
H:\BP2\frontend\src\virtual-utopia\webgl\worldLayout.js
```

50户地块和世界坐标直接读取`worldLayout.js`，M5不重新生成地形、不调整木屋点位，也不修改溪流、山体、广场、树木或原有室内场景。

## 3. 家园搭建交互

搭建模式提供：

- 50户地块选择。
- 5×5院落网格。
- 木椅、木桌、灯笼、盆栽、木栅栏和石火堆6类素材。
- 拖拽或点击放置。
- 90度旋转。
- 单件删除。
- 保存后页面刷新自动恢复。

每个家园最多保存30件物品。物品包含`materialId`、网格坐标和旋转角度；服务端会校验坐标范围并记录版本号。

## 4. HTTP接口

```text
GET  /api/bp4/m5/health
GET  /api/bp4/m5/session
GET  /api/bp4/m5/plots
POST /api/bp4/m5/realtime/ticket
GET  /api/bp4/m5/homes/:plotId/layout
PUT  /api/bp4/m5/homes/:plotId/layout
GET  /api/bp4/m5/homes/:plotId/events
```

身份认证复用Phase5/BP4-M1入口，M5服务端重新校验Bearer token。

## 5. 实时通道

入口：

```text
ws://127.0.0.1:3571/ws/bp4/m5/realtime?ticket=<ticket>
```

M5频道支持：

- `player.presence.updated`
- `avatar.state.updated`
- `voice.participant.updated`
- `home.layout.updated`

M1桥接读取`presence.updated`、`avatar.state.updated`和`voice.participant.updated`并转发到M5世界频道。M5客户端每250毫秒上报本地Avatar位置、旋转和`idle/walk`状态，其他在线客户端收到后更新远端Avatar。

家园布局保存通过HTTP持久化，成功后发布`home.layout.updated`，同一世界的其他在线客户端可实时刷新当前地块。

## 6. 持久化与权限

M5独立数据库：

```text
H:\BP2\bp3\bp4\m5\data\bp4_m5.sqlite
```

新增表：

- `bp4_m5_home_layouts`
- `bp4_m5_home_events`
- `bp4_m5_audit_logs`

权限规则：

- `admin`：可管理全部家园。
- `editor`：只能修改归属于当前账号的地块。
- `viewer`：只可漫游，编辑入口隐藏，写入接口返回403。
- 非地块归属用户修改他人家园返回403。

BP3持久化数据库仅以只读方式读取`bp3_plot_owners`，不修改其表结构。

## 7. 测试结果

静态检查和单元测试：

- `npm run check`通过。
- 单元测试2/2通过。
- 覆盖家园保存恢复、地块归属、viewer只读、事件顺序和resume。

生产构建：

- `npm run build`通过。
- Vite构建生成独立M5前端产物。

E2E测试：

- `npm run test:e2e`通过。
- 地块数量50。
- 拖拽放置物品成功。
- 保存后刷新恢复成功。
- M1在线状态桥接成功。
- M5远端Avatar位姿事件展示成功。
- M5实时通道状态为`online`。
- 桌面和移动端截图通过。

截图：

```text
H:\BP2\bp3\bp4\m5\artifacts\bp4-m5-world.png
H:\BP2\bp3\bp4\m5\artifacts\bp4-m5-mobile.png
```

## 8. 自检清单

- BP1、BP2、BP3和BP4-M1/M2/M3/M4原有代码未修改。
- 3D场景美术结构、50户坐标、地形、生活广场、溪流、山体和树木保持冻结。
- M5只新增独立目录、数据库、测试和文档。
- 家园放置、保存、刷新恢复和实时事件通过。
- viewer只读、editor归属校验和admin管理边界通过。
- 新增Markdown为UTF-8、无BOM、LF。
