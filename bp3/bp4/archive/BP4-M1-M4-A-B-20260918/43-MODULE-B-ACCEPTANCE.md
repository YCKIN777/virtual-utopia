# 虚拟乌托邦 BP4 附加模块 B 验收文档

## 1. 验收范围

本模块只实现玩家社交聊天系统：

- 世界全局频道。
- 家园私有频道。
- 玩家一对一私聊。
- 消息持久化。
- 历史消息查询。
- 消息撤回。
- 基础敏感词过滤。
- 家园权限联动。
- 前端调试聊天面板。
- 单元测试和E2E聊天场景测试。

不开发3D渲染。BP1、BP2、BP3、BP4-M1/M2/M3/M4、附加模块A和BP4-M5代码未修改。

## 2. 独立目录

```text
H:\BP2\bp3\bp4\module-b\
  backend/src/
  backend/tests/
  frontend/src/
  tests/module-b.e2e.mjs
  artifacts/
```

## 3. 频道模型

```text
world-main
home-plot-1
dm-2-3
```

权限：

- 世界频道：所有已认证玩家。
- 家园频道：调用模块A `/my-access?action=view`，仅允许该家园权限范围内的玩家。
- 私聊频道：只允许频道ID中的两名参与者。

## 4. 消息持久化与历史

模块B独立数据库：

```text
H:\BP2\bp3\bp4\module-b\data\bp4_module_b.sqlite
```

表：

- `bp4_module_b_users`
- `bp4_module_b_messages`
- `bp4_module_b_audit_logs`

接口：

```text
GET  /api/bp4/module-b/messages
POST /api/bp4/module-b/messages
POST /api/bp4/module-b/messages/:messageId/recall
```

历史查询必须再次执行频道权限校验，不能通过伪造频道ID读取无权消息。

## 5. 敏感词与撤回

基础敏感词过滤在消息落库前执行：

- 命中词替换为`***`。
- 消息标记`filtered=true`。
- 历史记录只保存过滤后的文本。

撤回规则：

- 发送者可以撤回自己的消息。
- 管理员可以执行消息治理撤回。
- 撤回后历史内容显示`[消息已撤回]`。
- 撤回事件通过`event.updated`实时广播。

## 6. M1 WebSocket协议

```text
POST /api/bp4/module-b/realtime/ticket
ws://127.0.0.1:3591/ws/bp4/realtime
```

客户端消息：

```text
chat.subscribe
chat.send
chat.recall
ack
resume
ping
```

服务端事件：

```text
subscribed
chat.message.ack
chat.message.created
chat.message.recall.ack
event.updated
error
```

## 7. 前端调试面板

```text
http://127.0.0.1:5237
```

支持：

- 世界公屏、家园频道、玩家私聊切换。
- 家园地块和私聊对象输入。
- 实时消息显示。
- 历史消息加载。
- 消息发送。
- 消息撤回。
- 敏感词过滤标记。
- 实时连接状态。

## 8. 测试结果

静态检查和单元测试：

- `npm run check`通过。
- 单元测试3/3通过。
- 覆盖世界消息、敏感词、持久化、家园权限、私聊参与者和撤回权限。

构建：

- `npm run build`通过。

E2E测试：

- `npm run test:e2e`通过。
- 世界公屏实时收发通过。
- 家园私有频道权限联动通过。
- 好友权限变更后进入家园频道通过。
- 私聊只允许两名参与者通过。
- 敏感词消息存储为`hello *** ***`。
- 消息撤回通过。
- 刷新后历史消息恢复通过。
- 桌面和移动端截图通过。

截图：

```text
H:\BP2\bp3\bp4\module-b\artifacts\module-b-chat.png
H:\BP2\bp3\bp4\module-b\artifacts\module-b-mobile.png
```

## 9. 自检清单

- 所有已冻结模块原有代码未修改。
- 世界公屏、家园频道、私聊、持久化、敏感词和权限联动完整。
- 单元测试和E2E测试通过。
- 新增Markdown为UTF-8、无BOM、LF。
