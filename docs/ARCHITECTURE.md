# 虚拟乌托邦・ARCHITECTURE.md（唯一权威蓝图）

> 本文件是「虚拟乌托邦」网站架构的
>
> **唯一权威来源**
>
> 。
> 其它文档（API_REFERENCE、OPERATIONS_MANUAL、安全报告、部署指南等）作为
>
> **细节参考**
>
> 在第 10 节挂链接；一旦细节文档与本文件冲突，
>
> **以本文件为准**
>
> 。
> 本文件随架构调整持续更新，每次调整在第 0 节追加决策记录。
> 最近更新：2026-09-23



***

## 0. 决策记录（ADR，按时间倒序追加）



| 日期         | 决策       | 结论                                                               |
| ---------- | -------- | ---------------------------------------------------------------- |
| 2026-09-23 | 现役服务范围   | **phase5/phase6 为唯一现役**；phase4、phase7 **归档冻结，不再改动**              |
| 2026-09-23 | 数据库拆分    | **保持分库 SQLite**（按业务域分库），补迁移机制与 store 层；不合并、不上 PG                 |
| 2026-09-23 | 实时通信     | **现在就把 3s 轮询 + presence 升级为 WebSocket 推送**（新消息 / 好友 / 居民回复 / 参观） |
| 2026-09-23 | 居民 AI 定位 | **定位为点缀**：轻量实现（固定人设 + 简单记忆 + 超时兜底 + 日成本上限），不做重 RAG / 评估投入        |
| 2026-09-23 | 文档治理     | **新建本文件为唯一权威蓝图**，旧文档降级为细节参考并挂链接                                  |
| 2026-09-23 | 产品路线     | 个人主页 → 世界 → 社交按 **1→2→3** 落地：①主页回我家 ②属地聊天 ③串门留言簿（详见第 9 节）            |

> 备注：「保持分库」指维持当前 8 个按业务域拆分的 SQLite 文件；如需合并为单库，须在此另开决策。



***

## 1. 产品定位与技术栈



* **产品**：多人在线 3D 乡墅世界（WebGL 低多边形庄园）。用户漫游广场、进宅院参观、和居民 / 邻居文字聊天、维护个人主页。

* **规模定位（刻意做小）**：原住民上限 **50**、访客 **200**、临时小群 **≤8**、无点赞 / 热度 / 排行。架构按「亲密小世界」设计，**不做 Web 级扩容**。

* **技术栈**：


  * 前端：Vue3 + Vite + Three.js（pnpm workspace，`frontend/`）

  * 后端：Node.js（ESM）（`backend/src/`）

  * 存储：SQLite（**WAL 模式**）+ 本地文件（将来迁 OSS）

  * AI：DeepSeek（`deepSeekClient.js`）

* **永久铁律**：**Three.js 永远跑在用户浏览器端**。服务器只做两件事 —— 托管 `dist` 静态资源、跑 Node 业务接口。**禁止在服务端安装 / 执行 Three.js 渲染**。



***

## 2. 部署拓扑（域名无关，现在就定型）



```
&#x20;           用户浏览器 (Vue3 + Three.js 客户端渲染)

&#x20;                       │

&#x20;                       ▼

&#x20;                ┌──────────────┐

&#x20;                │  Nginx       │  80/443

&#x20;                │  · 托管 dist │  (glb / 贴图 / three.js / html / js)

&#x20;                │  · 反代      │

&#x20;                └──────┬───────┘

&#x20;                       │

&#x20;       ┌───────────────┼────────────────┐

&#x20;       ▼                ▼                ▼

&#x20; phase5:3300     phase6:3400        (静态直出)

&#x20; 核心域API        网关 + 社交域API + WS

&#x20;       │                │

&#x20;       └──── X-Service-Token 内部互调 ────┘

&#x20;                       │

&#x20;             SQLite×8 (WAL) + 上传目录

&#x20;                       │

&#x20;                  定时备份 → 另一块盘 / OSS
```

**域名到位时的「插入点」（架构零改动）**：



1. DNS A 记录指向服务器 IP；

2. Nginx 申请 Let's Encrypt 证书，全站 301 到 `https://`；

3. WebSocket 升级为 `wss://`；

4. 浏览器端 API/WS 基址通过环境变量注入（`VITE_PHASE6_GATEWAY_URL`），切换时只改构建变量。

**进程管理**：phase5 /phase6 用 pm2 或 systemd 常驻；Nginx 只暴露 80/443/22。



***

## 3. 服务分解（现役 = phase5 + phase6）

### 3.1 phase5（:3300）— 核心域

职责：账号、鉴权、会话、知识文档。



* 表：users、chat\_sessions、知识文档、rag\_logs

* 对外：被 phase6 通过 `X-Service-Token` 调用；不直接暴露给前端。

### 3.2 phase6（:3400）— 网关 + 社交域（前端唯一入口）

职责：统一鉴权中间件、路由聚合、WebSocket 升级、全部社交业务。



* 业务 store：`plotAssignmentStore`（宅院分配）、`visitorQuotaStore`（配额）、`auditStore`（审计）、`friendStore`（好友）、`residentCardStore`（S1 卡片）、`guestbookStore`（S2 留言簿）、`residentSocialStore`（S3 名录 / 私聊 / 群）、`presenceStore`（在线状态）。

* 服务：`residentChatService`（居民对话）、`uploadService`（上传）、`httpClient`（调 phase5）、`validation`（入参校验）。

### 3.3 agents/ — 居民 AI（轻量，见第 6 节）

`orchestrator.js` 调度、`registry.js` 注册、`intentPolicy.js` 意图策略；5 个固定角色：`ahe / fenghe / suian / xubai / zhiyu`。

### 3.4 冻结区



* **phase4、phase7 归档冻结**：代码保留、不再修改；新功能一律落在 phase5/6。

* 清理 `.bak / .chatbak / .residentchatbak` 等迭代遗留文件（在不影响现役的前提下逐步删）。



***

## 4. 数据架构（保持分库 SQLite）

### 4.1 库与 owner（现状，保持）



| SQLite 文件                       | 业务域            | owner store         |
| ------------------------------- | -------------- | ------------------- |
| virtual\_utopia\_phase5.sqlite  | 账号 / 会话 / 文档   | phase5              |
| phase6\_plot\_assignment.sqlite | 宅院分配           | plotAssignmentStore |
| phase6\_visitor\_quota.sqlite   | 访客 / 原住民配额     | visitorQuotaStore   |
| phase6\_audit.sqlite            | 审计日志           | auditStore          |
| phase6\_resident\_cards.sqlite  | S1 居民卡片        | residentCardStore   |
| phase6\_guestbook.sqlite        | S2 展示板 / 留言簿   | guestbookStore      |
| phase6\_resident\_social.sqlite | S3 名录 / 私聊 / 群 | residentSocialStore |
| virtual\_utopia\_memory.sqlite  | 居民记忆           | agents/memory       |

### 4.2 硬性要求



* **Migrations 必须真正跑起来**：目前仅 `0001_ops_meta.sql`。建立 `migrations/` 执行器，每次 schema 变更落一个带序号的 SQL，启动时按序执行并记录 `ops_meta`。

* **store/DAO 收口**：所有 SQL 只能写在各 `*Store.js` 里，业务代码不直接拼 SQL；统一参数化查询，杜绝注入。

* **WAL 模式**保持开启（已有 `-wal/-shm`）。

* **文件上传**：先存本地 `data/` 子目录（头像 / 图片白名单 + 大小上限），上线后迁 OSS；上传目录禁止执行脚本。

* **备份**：cron 每日备份全部 SQLite + 上传目录到独立磁盘 / OSS，保留最近 7 份。



***

## 5. 实时通信（WebSocket，本次新增重点）

**取代 3s 轮询；轮询保留为 WS 不通时的降级兜底。**

### 5.1 连接约定



* 入口：phase6（:3400）升级 HTTP 连接为 WS。

* **握手鉴权**：连接时携带与 REST 相同的 Bearer Token，鉴权失败直接关闭。

* 心跳：30s ping/pong；断线指数退避重连（1s→2s→4s，封顶 15s）。

### 5.2 事件目录（`域:动作`）



| 事件                        | 触发时机              | 方向       |
| ------------------------- | ----------------- | -------- |
| `chat:message`            | 世界聊天 / 私聊 / 群聊新消息 | 服务端→相关方  |
| `friend:request`          | 收到好友申请 / 通过       | 服务端→对方   |
| `resident:reply`          | 居民 AI 回复生成完成      | 服务端→对话用户 |
| `visit:enter`             | 有访客进入 / 离开宅院      | 服务端→院主   |
| `presence:online/offline` | 用户上下线             | 服务端→可见范围 |
| `place:chat`             | 某宅院 / 广场的属地聊天新消息 | 服务端→该地点在场者 |
| `visitor:list`           | 有访客到访 / 离开，院主侧到访列表更新 | 服务端→院主（第二批） |
| `card:rsvp`              | 出游 / 心愿卡片被报名 / 响应 | 服务端→卡片作者（第二批） |

### 5.3 消息信封



```
{ "id": "uuid", "ts": 1710000000000, "from": "user\_id", "type": "chat:message", "payload": { } }
```

### 5.4 限流与防滥用

单连接每分钟消息上限、单条大小上限；超阈值断开并记审计。



***

## 6. 居民 AI（定位：点缀，轻量）

定位是「像邻居的小点缀」，**不投入重 RAG / 重记忆**，目标是稳定、便宜、不打扰。



* **人设**：5 个角色各一份固定人设文件，运行期不变。

* **记忆**：只保留当前对话上下文 + 极简用户偏好；**不做长期向量记忆库**。

* **调用**：DeepSeek，单次设超时（如 15s）；超时或报错 → 返回一句温柔兜底文案，**对话不卡死**。

* **成本闸**：单居民 / 每日 token 上限，超限降级或提示；用量记审计。

* **不做**：不建 RAG 召回评估集、不做多轮深度推理、不上多居民复杂协作。后续若居民升级为产品灵魂，另开决策再投入。



***

## 7. 安全架构

### 7.1 身份与会话



* 密码 argon2/bcrypt 哈希存储（上线前核实现状存储方式）；短时效 Token + refresh。

* **密钥从环境变量读取**：`AUTH_SECRET`、`SERVICE_TOKEN` 严禁 `changeme` 写死入库；上线前全部换强随机值。

* admin 默认密码登录后强制改密。

### 7.2 授权（RBAC + 资源级）



* 角色：`admin`(KIN) / `editor`(原住民) / `viewer`(游客)，在 phase6 鉴权中间件统一判定。

* 资源级：`visitEnabled` 宅院参观、卡片 `self/residents` 权限 ——**API 层再判一次，不靠前端隐藏**。

* 游客默认 403 清单（居民后台 / 名录 / 私聊 / 群 / S1/S2）在中间件硬编码白名单。

### 7.3 输入与注入



* 入参走 `validation.js`；SQL 全参数化；聊天 / 留言入库前 XSS 转义。

* 上传：图片类型白名单 + 大小上限。

### 7.4 网络



* HTTPS/WSS（域名到位后）；CORS 白名单；登录 / 注册 / 发消息 / 调 AI 分别限流。

### 7.5 审计

`auditStore` 记录：登录成功 / 失败、权限变更、admin 操作、上传、AI 用量与花费、迁出 / 封禁。关键操作（审批入驻、改密、分配宅院）必须留痕。



***

## 8. 横切能力



* **日志 / 可观测**：结构化日志 + 请求级 trace；记录每接口耗时、AI 的 tokens / 成本 / 错误率；上线后做简单看板。

* **测试**：保留现有 store 单测（33+）与前端单测；补齐 WebSocket 事件测试；配好 `DEEPSEEK_API_KEY` 把 E2E 跑绿。

* **CI**：每次提交自动跑单测 + 构建。



***

## 9. 产品路线（功能优先级，2026-09-23 定）

按 **1 → 2 → 3** 顺序落地，每完成一项跑回归（单测 + E2E）再进下一项，不并行。

### 第一批（现在做）

1. **P1-1 主页回我家**：个人主页加「回我的宅院 / 我现在在哪」入口，点击从 ProfileView 切回 ThreeWorld 并定位到自己的地块 / 当前位置。
   - 依赖：前端路由 + `worldStore` 定位；无需新事件。
2. **P1-2 属地聊天**：聊天栏随所在地点切换频道（广场频道 / 当前宅院频道），同地点在场者互相可见。
   - 新事件：`place:chat`（见 5.2）。
3. **P1-3 串门留言簿**：访客进院触发 `visit:enter` 通知院主；留言簿改成可回复的对话（非单向墙）。
   - 复用 `visit:enter`；留言簿表加回复关系（parent_id / 线程）。

### 第二批（第一批验收后）

- 卡片可交互化：出游卡「报名」、心愿卡「响应」、随记评论（新事件 `card:rsvp`）。
- 访客足迹：「最近 N 人来过你家」（新事件 `visitor:list`）。
- 世界 Avatar 点出迷你主页（头像 / 在线 / 打招呼）。

### 第三批（氛围层，轻量）

- 5 个 AI 村民暖场：评论新卡片、点灯时刻提醒、偶尔提及邻居（走第 6 节轻量调用 + 日成本上限）。
- 每日小仪式（晨间广场 / 晚间点灯），不记分、不排行。

### 明确不做

- 不做公开热度 / 排行 / 全员大群；不做随机匹配；不做重 AI 记忆。


## 10. 上线前检查清单（P0，域名无关的先做）



* [ ] 换 `AUTH_SECRET` / `SERVICE_TOKEN` 为强随机值（环境变量注入）

* [ ] admin 默认密码改掉

* [ ] 验证密码哈希存储方式，不用明文

* [ ] 每日 SQLite + 上传目录备份任务跑通

* [ ] WebSocket 替换轮询上线，轮询作降级

* [ ] 登录 / 注册 / 发消息 / AI 限流生效

* [ ] 防火墙只开 80/443/22

* [ ] migrations 执行器跑通，存量 schema 落基线

* [ ] （域名到位后）DNS + HTTPS + WSS + 强制跳转



***

## 11. 关联文档（细节参考，与本文件冲突以本文件为准）



* [API\_REFERENCE.md](./API_REFERENCE.md) — 接口细节

* [OPERATIONS\_MANUAL.md](./OPERATIONS_MANUAL.md) — 运维操作手册

* [deployment.md](./deployment.md) / [LOCAL\_DEPLOYMENT\_GUIDE.md](./LOCAL_DEPLOYMENT_GUIDE.md) — 部署

* [ENVIRONMENT\_DEPENDENCIES.md](./ENVIRONMENT_DEPENDENCIES.md) — 环境依赖

* [BP2 项目安全与工程化交付报告.md](./BP2项目安全与工程化交付报告.md) — 安全 / 工程化历史交付

* [BP2 项目风险整改清单.md](./BP2项目风险整改清单.md) — 风险整改

* [memory-architecture.md](./memory-architecture.md) — 记忆子系统细节