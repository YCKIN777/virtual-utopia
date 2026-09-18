# 虚拟乌托邦 BP4-M5

BP4-M5在独立目录中复用冻结的BP2 Three.js世界，提供50户山林庄园的3D前端入口、漫游、家园搭建和实时状态展示。

## 范围

- 只读加载冻结的Three.js世界、地形、溪流、山体、生活广场和50户木屋点位。
- WASD与鼠标视角漫游沿用原有ThreeWorld交互。
- 地块选择、5×5院落网格和6类低模素材。
- 素材放置、旋转、删除、保存与刷新恢复。
- 家园布局WebSocket事件：`home.layout.updated`。
- M1在线状态、Avatar和语音状态桥接。
- M5实时频道中的本地Avatar位姿上报和远端Avatar显示。
- 单元测试、前端构建和Playwright E2E测试。

本模块只新增`bp3/bp4/m5`，不修改BP1、BP2、BP3、BP4-M1、BP4-M2、BP4-M3和BP4-M4代码及冻结归档。

## 启动

```powershell
cd H:\BP2\bp3\bp4\m5
npm install

$env:BP4_M5_PORT='3571'
$env:BP4_M5_DB_PATH='H:\BP2\bp3\bp4\m5\data\bp4_m5.sqlite'
$env:BP4_M5_BP3_DB_PATH='H:\BP2\bp3\data\virtual_utopia_bp3.sqlite'
$env:BP4_M5_TICKET_SECRET='bp4-m1-local-ticket-secret'
$env:BP4_M5_M1_BASE_URL='http://127.0.0.1:3531'
node backend/src/server.js
```

前端：

```powershell
cd H:\BP2\bp3\bp4\m5
node node_modules\vite\bin\vite.js --config frontend\vite.config.js
```

默认地址：

```text
3D世界：http://127.0.0.1:5217
API：http://127.0.0.1:3571
WebSocket：ws://127.0.0.1:3571/ws/bp4/m5/realtime
```

## 测试

```powershell
npm run check
npm run build
npm run test:e2e
```

详细验收结果见`docs/BP4-M5-ACCEPTANCE.md`。
