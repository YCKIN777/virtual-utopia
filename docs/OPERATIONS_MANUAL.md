# 虚拟乌托邦 BP2｜运维操作手册

## 1. 日常启动

1. 启动Phase5持久化服务。
2. 启动Phase6网关。
3. 启动前端5175。
4. 检查3300、3400和5175端口。
5. 打开 `http://localhost:5175/#/world`。

## 2. 健康检查

```powershell
Invoke-RestMethod http://localhost:3300/health
Invoke-RestMethod http://localhost:3400/health
Invoke-WebRequest http://localhost:5175/
```

预期：

- Phase5返回`status=ok`。
- Phase6返回`status=ok`。
- 前端返回HTTP 200。

## 3. 停止服务

按启动顺序反向停止：

```text
前端 → Phase6 → Phase5
```

停止前先确认没有正在保存的家园或聊天操作。

## 4. 账号操作

| 账号     | 角色   | 说明               |
| -------- | ------ | ------------------ |
| admin    | 管理员 | 创建用户、管理权限 |
| traveler | editor | 家园编辑和持久化   |
| viewer   | viewer | 只读漫游           |

生产环境应立即替换演示密码。

## 5. 冒烟测试

1. 登录editor。
2. 进入3D世界，确认Avatar和在线列表显示。
3. 使用WASD移动，确认idle/walk动画切换。
4. 打开家园编辑器，放置一个新素材并保存。
5. 刷新页面，确认素材恢复。
6. 打开世界聊天，发送一条消息。
7. 使用第二账号确认收到消息和Avatar。
8. 使用viewer确认无编辑器入口。

## 6. 自动化回归

```powershell
npm run check
node frontend/src/virtual-utopia/webgl/tests/world.e2e.mjs
node frontend/src/virtual-utopia/webgl/tests/home-decorator.e2e.mjs
node frontend/src/virtual-utopia/webgl/tests/multiplayer-avatar.e2e.mjs
node frontend/src/virtual-utopia/webgl/tests/world-chat.e2e.mjs
node backend/src/phase6/tests/phase6.gateway.e2e.mjs
node backend/src/phase6/tests/worldState.persistence.e2e.mjs
```

## 7. 数据备份

需要备份：

```text
H:\BP2\data\virtual_utopia_phase5.sqlite
H:\BP2\data\virtual_utopia_phase5.sqlite-wal
H:\BP2\data\virtual_utopia_phase5.sqlite-shm
H:\BP2\data\phase6_audit.sqlite
```

建议步骤：

1. 停止或暂停写入。
2. 复制上述文件到备份目录。
3. 恢复时保持文件名一致。
4. 启动Phase5和Phase6并执行健康检查。

## 8. 常见问题

### 登录显示Phase5离线

- 检查3300是否监听。
- 检查Phase5和Phase6的`PHASE5_SERVICE_TOKEN`是否一致。
- 检查CORS允许域名是否包含5175。

### 刷新后家园数据未恢复

- 检查浏览器是否允许`sessionStorage`。
- 检查`world-state`接口是否返回快照。
- 检查world会话ID是否为`world-<userId>`。

### Avatar或聊天不更新

- 检查3400 presence和chat接口。
- 检查登录令牌是否过期。
- 检查浏览器控制台是否有403或401错误。

### 编辑器入口不显示

- 确认账号角色为admin或editor。
- 确认用户已绑定地块。
- viewer账号不会显示编辑器入口。

## 9. 升级流程

1. 备份SQLite文件。
2. 停止前端、Phase6、Phase5。
3. 更新源码和依赖。
4. 执行`npm run check`。
5. 启动Phase5、Phase6和前端。
6. 执行冒烟测试和E2E。

## 10. 安全建议

- 使用随机高强度密钥。
- 不在客户端保存Phase5服务令牌。
- 生产环境使用HTTPS。
- 限制CORS允许来源。
- 定期清理审计日志和过期会话。
