# 虚拟乌托邦 BP4 附加模块 A 验收文档

## 1. 验收范围

本模块只实现玩家家园归属与访问权限系统：

- 家园绑定玩家。
- `private`私有、`friends`好友可见、`public`公开三档权限。
- 好友名单。
- 仅房主可编辑，访客只读。
- 权限管理面板。
- M1 WebSocket兼容的实时权限通知。
- 单元测试和E2E权限场景测试。

不开发3D渲染。BP1、BP2、BP3、BP4-M1/M2/M3/M4和BP4-M5代码未修改。

## 2. 独立目录

```text
H:\BP2\bp3\bp4\module-a\
  backend/src/
  backend/tests/
  frontend/src/
  tests/module-a.e2e.mjs
  artifacts/
```

## 3. 权限模型

访问模式：

- `private`：仅房主可查看。
- `friends`：房主和好友名单中的玩家可查看。
- `public`：所有已认证玩家可查看。

编辑规则：

- 仅房主可编辑。
- 好友和公开访客均为只读。
- 管理员可以管理归属和访问权限，但不会自动获得家园编辑权。
- viewer不能修改归属或访问权限，写入返回403。

## 4. 家园归属

M1兼容接口：

```text
PUT /api/bp4/module-a/homes/:plotId/owner
```

请求：

```json
{
  "ownerUserId": 2,
  "ownerUsername": "owner"
}
```

启动时自动创建50户地块，并可选从BP3 `bp3_plot_owners`只读导入已有归属。

## 5. 访问权限与好友

接口：

```text
GET  /api/bp4/module-a/homes/:plotId/access
PUT  /api/bp4/module-a/homes/:plotId/access
```

更新请求：

```json
{
  "accessMode": "friends",
  "friendUserIds": [4, 7]
}
```

权限校验：

```text
GET  /api/bp4/module-a/homes/:plotId/my-access?action=view
GET  /api/bp4/module-a/homes/:plotId/my-access?action=edit
POST /api/bp4/module-a/homes/:plotId/evaluate
```

## 6. 运营面板

M3源码冻结，因此新增独立M3扩展面板，不修改`bp4/m3/frontend`：

```text
http://127.0.0.1:5227
```

面板功能：

- 登录和运营角色识别。
- 50户家园列表。
- 房主绑定。
- 私有、好友可见、公开切换。
- 好友玩家ID维护。
- 权限校验预览。
- 实时权限变更通知。

## 7. 实时权限通知

M1源码冻结，因此模块A复用M1的`createTicketService`和`createRealtimeHub`，在独立服务中提供相同协议：

```text
POST /api/bp4/module-a/realtime/ticket
ws://127.0.0.1:3581/ws/bp4/realtime
```

事件：

```text
event.updated
  data.kind = home.ownership.updated
  data.kind = home.access.updated
```

事件包含地块、权限模式、房主、好友名单、版本号和更新时间。

## 8. 数据存储

模块A独立数据库：

```text
H:\BP2\bp3\bp4\module-a\data\bp4_module_a.sqlite
```

新增表：

- `bp4_module_a_users`
- `bp4_module_a_homes`
- `bp4_module_a_friends`
- `bp4_module_a_permission_events`
- `bp4_module_a_audit_logs`

## 9. 测试结果

静态检查和单元测试：

- `npm run check`通过。
- 单元测试2/2通过。
- 覆盖房主绑定、三档权限、好友访问、访客只读、管理员不自动编辑、viewer管理越权。

构建：

- `npm run build`通过。

E2E测试：

- `npm run test:e2e`通过。
- 50户家园加载通过。
- 私有权限：仅房主可查看和编辑。
- 好友权限：好友可查看，好友不可编辑。
- 公开权限：访客可查看，访客不可编辑。
- 非房主管理员编辑被拒绝。
- viewer修改权限返回403。
- 实时权限事件4条。
- 桌面和移动端截图通过。

截图：

```text
H:\BP2\bp3\bp4\module-a\artifacts\module-a-panel.png
H:\BP2\bp3\bp4\module-a\artifacts\module-a-mobile.png
```

## 10. 自检清单

- BP1、BP2、BP3、BP4-M1/M2/M3/M4和BP4-M5原有代码未修改。
- 家园归属、三档访问权限、实时权限通知和后台管理完整。
- 单元测试和E2E测试通过。
- 新增Markdown为UTF-8、无BOM、LF。
