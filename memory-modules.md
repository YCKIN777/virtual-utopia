# memory-modules.md — 模块详情（按需读对应章节）

> 仅当前任务需要时，再读取对应章节，禁止一次性全读。
> 每个模块章节记录：文件路径、关键实现、验收状态、自检清单。

## 目录
1. KIN Avatar 模块
2. 39号宅院装扮面板
3. 50宅院地块 + assignHome
4. 参观权限 + 参观开关
5. 全局多人聊天模块
6. 访客名额权限模块
7. 家园装饰素材库扩充（树木/景观小品/庭院摆件）
8. Avatar 居民智能体基础模板（复用 KIN 角色框架）

---

## 1. KIN Avatar 模块
（详情待补，或参考 memory-log.md 对应条目）

## 2. 39号宅院装扮面板
（详情待补，或参考 memory-log.md 对应条目）

## 3. 50宅院地块 + assignHome
（详情待补，或参考 memory-log.md 对应条目）

## 4. 参观权限 + 参观开关
（详情待补，或参考 memory-log.md 对应条目）

## 5. 全局多人聊天模块
- 后端：`backend/src/phase6/gatewayService.js`（`sendWorldChatMessage`，单条 200 字符，缓存 50 条；端点 GET/POST `/api/phase6/chat/world`）
- 前端：`stores/worldStore.js`（`worldChat` 状态 + `loadWorldChat` + `sendWorldChat`）、`components/WorldChatPanel.vue`
- 机制：3s 轮询拉取；消息存 phase5 `world-chat-global` 会话（全局广播 + 持久化）。
- 已知局限：非 websocket 实时；轮询约 3s 延迟。

## 6. 访客名额权限模块
- 后端：`backend/src/phase6/visitorQuotaStore.js`（SQLite 2 表）+ 11 个 API 端点。
- 前端：world 访客邀请/注册 UI + admin 访客名额统计面板。
- 认证：Bearer，不受 service token 影响。

## 7. 家园装饰素材库扩充（树木/景观小品/庭院摆件）

> 定稿规范

1. 新增家园装扮素材，分三大类别：树木类、景观小品类、庭院摆件。
2. 素材字段：id、name、category、previewAsset、modelAsset、scaleMin、scaleMax、hasCollision；素材注册进装扮面板。
3. 复用现有拖拽摆放、移动、删除逻辑；摆放数据保存在宅院 items 数组，随 world-session 快照持久化。
4. 边界校验：素材禁止摆放到宅院地块外（isInNoPlaceZone），支持手动重叠摆放（hasCollision=false）。
5. 模型按需实例加载，优化 3D 渲染性能；本次开发不修改宅院分配、参观权限、聊天、Avatar 漫游代码，回归测试全部通过。

### 实现记录
- 分类 id：`garden-trees`（乔木/幼树苗/竹丛/开花树）、`garden-landscape`（景石/小型假山/溪滩石块/矮灌木丛）、`garden-ornaments`（石灯笼/木桌+木凳/粗陶陶罐/园艺花钵），均 `cost:0` 自动解锁。
- 碰撞语义：`materialHasCollision = homeMaterialMap[id]?.hasCollision !== false`；旧素材无字段→默认碰撞(行为不变)；景观类 false→允许重叠。
- 改动文件：`data/homeMaterials.js`（+3 分类 +12 素材）、`components/HomeDecorator.vue`（allowedCategories 注册 + hasCollision 碰撞接入）。
- 备份：`homeMaterials.js.matlibbak`、`HomeDecorator.vue.matlibbak`。
- 自检：三类展示✓ / 拖拽摆放✓ / 重叠摆放✓ / 删除✓ / 持久化✓ / 回归(后端33+前端13)✓ / Playwright 0 报错✓（截图 `vu_screens/decor_materials_trees.png`、`decor_materials_ornaments.png`）。

## 8. Avatar 居民智能体基础模板（复用 KIN 角色框架）

> 定稿规范

1. 复用现有 KIN 角色 3D 模型/骨骼/行走/待机动画体系，搭建居民 Avatar 基础模板；居民与 KIN 共用同一套角色渲染管线、移动控制逻辑。
2. 居民角色数据结构：avatarId、residentName、homePlotId、avatarColor、position、rotation、currentState(idle/walk)。
3. 自动漫游：居民在自己所属宅院范围内缓慢闲逛，不越出地块边界。
4. 身份标识：头顶显示昵称；KIN 保留金冠特殊标识，居民不显示金冠。
5. 交互基础：玩家靠近居民触发聊天弹窗入口（仅预留入口，不实现对话大模型逻辑）。
6. 居民状态纳入 world-session 快照持久化，页面刷新后位置/状态不重置。

### 实现记录
- 数据：`data/residents.js`（seedResidents 5 户 + RESIDENT_CHAT_DISTANCE=4.0）。
- ThreeWorld 新增方法（仅新增，未改 KIN 原有方法）：`addResidentAvatar`（复用 `addRoamingAgent`，isLord=false，bounds=宅院中心 ±2.3）、`getResidentAvatarStates`、`restoreResidentAvatarStates`、`getResidentsNearLocal`。
- 快照：`worldStore.js` 新增 `residentStates` 状态 + `setResidentStates`（含 queuePersist），`createWorldSnapshot` 增加 `residents` 字段，`applyWorldSnapshot` 恢复。
- 后端：`gatewayService.js` `WORLD_SNAPSHOT_KEYS` 追加 `'residents'`（快照校验白名单，向后兼容）。
- 视图：`WorldView.vue` 挂载时实例化 5 居民 + 恢复持久化状态 + 3s 同步 + 600ms 邻近检测 + 聊天入口/弹窗 UI。
- 备份：`ThreeWorld.js.residentbak`、`worldStore.js.residentbak`、`WorldView.vue.residentbak`、`gatewayService.js.residentbak`。
- 自检：实例化✓ / 金冠(居民无、KIN 有)✓ / 宅院范围内漫游✓ / 聊天入口✓ / 持久化✓ / 回归(后端33+前端13+phase6 16)✓ / Playwright 0 报错✓（截图 `vu_screens/resident_avatar_world.png`）。

## 9. 居民 AI 一对一对话能力

> 定稿规范

1. 复用已预留【与X交谈】入口：玩家靠近居民(≤4m)点击交谈，唤起独立一对一对话弹窗。
2. 对话隔离：居民对话为单人私聊会话，与全局世界聊天独立、消息互不互通；每个居民独立会话上下文，互不共享。
3. UI 面板：弹窗展示居民头像+名称；上下消息流(玩家消息/居民回复)；输入框回车发送，单条≤200字符，禁止空消息；可关闭，关闭后保留历史。
4. 会话持久化：每个居民独立会话存储，纳入 world-session 快照，刷新后聊天记录不丢失。
5. 后端逻辑：复用现有 LLM 接口(createLlmClient)，传入 residentName，给提示词绑定该居民人设。
6. 人设模板：居民为本宅院住户，性格温和，熟悉本家园环境，可描述庭院/风景，不越界讨论外部无关内容。

### 实现记录
- 后端新增：`phase6/residentChatService.js`（人设提示词 + LLM 调用 + mock 降级 + 校验），端点 `POST /api/phase6/chat/resident`（app.js 新增，Bearer 认证 + audit）。
- 后端快照：`gatewayService.js` `WORLD_SNAPSHOT_KEYS` 追加 `'residentChats'`。
- 前端：`gatewayClient.js` 新增 `sendResidentChat`；`worldStore.js` 新增 `residentChats` 状态 + `sendResidentChat`（乐观追加用户消息 + 追加助手回复 + queuePersist）+ 快照 `residentChats` 字段。
- 前端 UI：新增 `components/ResidentChatPanel.vue`（头像/名称/消息流/输入框/发送/关闭）；`WorldView.vue` 将原预留弹窗替换为真实聊天面板。
- 注意：`backend/.env.development` 的 `DEEPSEEK_API_KEY=` 为空，会覆盖 `.env` 真实 key；`residentChatService.js` 内部以 `dotenv override` 重新加载 `backend/.env` 获取真实 key。
- 备份：`app.js.residentchatbak`、`gatewayService.js.residentchatbak`、`gatewayClient.js.residentchatbak`、`worldStore.js.residentchatbak`、`WorldView.vue.residentchatbak`。
- 自检：靠近显示按钮✓ / 唤起+关闭✓ / 带人设回复✓ / 200字符+空消息拦截✓ / 会话隔离✓ / 快照持久化+刷新保留✓ / 回归(后端33+前端13+phase6 16)✓ / Playwright 0 报错✓（截图 `vu_screens/resident_chat_dialog.png`）。
