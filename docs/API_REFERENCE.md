# 虚拟乌托邦 BP2｜API 接口总览

> 更新时间：2026-09-17

## 1. 服务地址

| 服务           | 地址                  |
| -------------- | --------------------- |
| Phase2主后端   | http://localhost:3000 |
| Phase4集成后端 | http://localhost:3200 |
| Phase5持久化   | http://localhost:3300 |
| Phase6网关     | http://localhost:3400 |
| RAG服务        | http://localhost:3100 |

## 2. 认证约定

- 用户认证：`Authorization: Bearer <token>`
- 服务认证：`X-Phase5-Service-Token: <service-token>`
- JSON请求：`Content-Type: application/json`
- 错误响应通常包含`code`和`message`

## 3. Phase2主后端

| 方法 | 路径                | 说明          |
| ---- | ------------------- | ------------- |
| GET  | `/api/health`       | 健康检查      |
| GET  | `/api/capabilities` | 能力列表      |
| GET  | `/api/scenes`       | 场景列表      |
| POST | `/api/scene/route`  | Agent场景请求 |

`POST /api/scene/route`请求：

```json
{
  "sceneId": "yard",
  "input": {
    "content": "内容"
  },
  "history": []
}
```

## 4. RAG服务

| 方法 | 路径              | 说明            |
| ---- | ----------------- | --------------- |
| GET  | `/health`         | RAG和向量库状态 |
| POST | `/api/rag/ingest` | 文档入库        |
| POST | `/api/rag/query`  | 知识检索        |

## 5. Phase5持久化

### 健康

| 方法 | 路径                 |
| ---- | -------------------- |
| GET  | `/health`            |
| GET  | `/api/phase5/health` |

### 登录

| 方法 | 路径                      | 说明           |
| ---- | ------------------------- | -------------- |
| POST | `/api/phase5/auth/login`  | 用户名密码登录 |
| GET  | `/api/phase5/auth/me`     | 当前用户       |
| POST | `/api/phase5/auth/logout` | 退出           |

登录请求：

```json
{
  "username": "admin",
  "password": "password"
}
```

### 用户

| 方法 | 路径                    | 权限  |
| ---- | ----------------------- | ----- |
| POST | `/api/phase5/users`     | admin |
| GET  | `/api/phase5/users`     | admin |
| PUT  | `/api/phase5/users/:id` | admin |

角色仅允许`admin`、`editor`、`viewer`。

### 会话

| 方法   | 路径                       | 说明                     |
| ------ | -------------------------- | ------------------------ |
| POST   | `/api/phase5/sessions`     | 创建会话                 |
| GET    | `/api/phase5/sessions`     | 查询会话                 |
| GET    | `/api/phase5/sessions/:id` | 会话详情                 |
| PUT    | `/api/phase5/sessions/:id` | 更新消息、状态或过期时间 |
| DELETE | `/api/phase5/sessions/:id` | 软删除                   |

### 文档元数据

| 方法   | 路径                        |
| ------ | --------------------------- |
| POST   | `/api/phase5/documents`     |
| GET    | `/api/phase5/documents`     |
| GET    | `/api/phase5/documents/:id` |
| PUT    | `/api/phase5/documents/:id` |
| DELETE | `/api/phase5/documents/:id` |

### RAG日志

| 方法 | 路径                   |
| ---- | ---------------------- |
| POST | `/api/phase5/logs`     |
| GET  | `/api/phase5/logs`     |
| GET  | `/api/phase5/logs/:id` |

## 6. Phase6网关

### 健康

| 方法 | 路径                 |
| ---- | -------------------- |
| GET  | `/health`            |
| GET  | `/api/phase6/health` |

### 登录与用户

| 方法 | 路径                      | 权限     |
| ---- | ------------------------- | -------- |
| POST | `/api/phase6/auth/login`  | 公开     |
| GET  | `/api/phase6/auth/me`     | 登录用户 |
| POST | `/api/phase6/auth/logout` | 登录用户 |
| POST | `/api/phase6/users`       | admin    |

### world快照

| 方法 | 路径                      | 权限         |
| ---- | ------------------------- | ------------ |
| GET  | `/api/phase6/world-state` | 登录用户     |
| PUT  | `/api/phase6/world-state` | admin/editor |

快照结构：

```json
{
  "version": 1,
  "plotId": "plot-28",
  "courtyardItems": [],
  "interiorFurniture": [],
  "permissions": {
    "role": "editor",
    "canManageHome": true
  }
}
```

### 在线状态

| 方法   | 路径                   | 说明               |
| ------ | ---------------------- | ------------------ |
| GET    | `/api/phase6/presence` | 在线列表           |
| POST   | `/api/phase6/presence` | 上报位置和动画状态 |
| DELETE | `/api/phase6/presence` | 下线               |

位置请求：

```json
{
  "x": 0,
  "y": 0,
  "z": 0,
  "rotation": 0,
  "animationState": "idle"
}
```

`animationState`允许`idle`或`walk`。

### 世界聊天

| 方法 | 路径                              | 说明     |
| ---- | --------------------------------- | -------- |
| GET  | `/api/phase6/chat/world?limit=60` | 读取历史 |
| POST | `/api/phase6/chat/world`          | 发送消息 |

发送请求：

```json
{
  "content": "大家晚上好"
}
```

限制：

- 单条消息1至300字符。
- 保留最近200条。
- 使用固定会话`world-chat-global`。

### 文档和会话查询

| 方法   | 路径                           | 权限         |
| ------ | ------------------------------ | ------------ |
| GET    | `/api/phase6/documents`        | 登录用户     |
| GET    | `/api/phase6/documents/:id`    | 登录用户     |
| POST   | `/api/phase6/documents/upload` | admin/editor |
| DELETE | `/api/phase6/documents/:id`    | admin/editor |
| GET    | `/api/phase6/sessions`         | 登录用户     |
| GET    | `/api/phase6/sessions/:id`     | 登录用户     |
| GET    | `/api/phase6/audit/events`     | admin        |

## 7. 常用错误码

| 错误码                      | 说明                   |
| --------------------------- | ---------------------- |
| PHASE5_UNAUTHORIZED         | 用户未登录或凭据无效   |
| PHASE5_FORBIDDEN            | 用户权限不足           |
| PHASE6_UNAUTHORIZED         | 缺少或无效Bearer Token |
| PHASE6_FORBIDDEN            | 角色或地块权限不足     |
| PHASE6_VALIDATION_ERROR     | 请求参数不合法         |
| PHASE6_UPSTREAM_UNAVAILABLE | Phase5或其他上游不可用 |
