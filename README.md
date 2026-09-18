# 虚拟乌托邦

阶段一工程包含 Vue 3 前端、Express 后端、PostgreSQL 空表 Schema 占位，以及完整的 HIG 基础 UI、等轴测矢量地图和六个场景空容器。

## 技术栈

- 前端：Vue 3、Vite、Vue Router、TailwindCSS
- 后端：Node.js、Express、CORS、dotenv
- 数据库：PostgreSQL Schema 占位

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- PostgreSQL（仅在实际初始化数据库时需要）

## 目录结构

```text
.
├─ frontend/                  # Vue 3 前端
│  ├─ src/components/ui/      # 全局 HIG 基础组件
│  ├─ src/components/map/     # Canvas + SVG 等轴测地图
│  ├─ src/components/scene/   # 场景页面外壳
│  └─ src/views/scenes/       # 六个场景容器页面
├─ backend/                   # Express 后端
│  └─ src/routes/             # 基础空接口
└─ database/
   └─ schema.sql              # PostgreSQL 空表结构
```

## 安装

在项目根目录执行：

```powershell
npm install
```

## 环境变量

前端：

- `frontend/.env.development`：开发态，代码生成开关为 `true`
- `frontend/.env.production`：生产构建，代码生成开关为 `false`
- `VITE_API_BASE_URL`：后端 API 基础地址

后端：

- `backend/.env.development`：开发环境配置
- `backend/.env.production`：生产环境配置
- `DATABASE_URL`：PostgreSQL 连接地址
- `CODEX_CODE_GENERATION_ENABLED`：代码生成能力开关
- `SESSION_TTL_MS`：内存会话有效期
- `SESSION_CLEANUP_INTERVAL_MS`：过期会话清理周期
- `SESSION_MAX_COUNT`：内存会话数量上限

后端和前端生产包均会强制关闭代码生成能力，即使环境变量被误设为 `true`，生产态仍返回 `false`。

## 启动

安装依赖后，在根目录打开两个终端。

前端开发服务：

```powershell
npm run dev:frontend
```

访问 `http://localhost:5173`。

后端开发服务：

```powershell
npm run dev:backend
```

访问 `http://localhost:3000/api/health`。

## 构建与检查

前端生产构建：

```powershell
npm run build
```

基础检查：

```powershell
npm run check
```

后端自动化测试：

```powershell
npm test --workspace backend
```

阶段二全链路端到端测试：

```powershell
npm run test:e2e
```

E2E 使用内置模拟模型，通过真实浏览器、前端 API 客户端、后端总控、分支 Agent 和会话隔离层验证完整链路，不依赖真实 API Key。

## 场景分发接口

`POST /api/scene/route`

请求结构：

```json
{
  "sceneId": "yard",
  "input": {
    "content": "用户输入"
  },
  "history": [
    {
      "role": "assistant",
      "content": "历史消息"
    }
  ]
}
```

可用场景 ID：

- `yard`
- `pavilion`
- `resource-wall`
- `library`
- `cabin`
- `far-forest`

分支 Agent：

| Agent | 场景   | 职责边界                                       |
| ----- | ------ | ---------------------------------------------- |
| 阿禾  | 大院   | 社区需求澄清与行动建议，不替成员决定           |
| 知予  | 资源墙 | 当前输入中的资源分类与标签建议，不进行外部检索 |
| 叙白  | 议事亭 | 议题梳理与流程建议，不替群体裁决               |
| 岁安  | 书屋   | 仅生成记忆接口占位动作，不存储、不召回、不归档 |
| 风禾  | 小屋   | 私密陪伴与低压力建议，不持久化私聊内容         |

远林暂不绑定分支 Agent，等待后续明确分配。

接口使用 DeepSeek JSON 输出模式，并在返回前执行本地结构校验。未配置 `DEEPSEEK_API_KEY` 时接口返回 `503`，不会发起真实模型请求。

## 会话隔离

- `/api/scene/route` 首次请求会自动创建公共或私聊会话，并在 `meta.session` 返回会话标识。
- 大院、资源墙、议事亭和书屋使用互相隔离的公共会话。
- 小屋使用 `prv_` 前缀的独立私聊会话，仅允许风禾分支访问。
- 会话上下文仅保存在进程内存中，不写入 PostgreSQL 或浏览器存储。
- 会话达到 TTL 或数量上限后会自动清理，避免内存无限增长。

## 数据库初始化

本机安装 PostgreSQL 后执行：

```powershell
createdb virtual_utopia
psql -d virtual_utopia -f .\database\schema.sql
```

Schema 只创建空表结构，不写入业务数据。

## 页面路由

| 点位   | 路由                   |
| ------ | ---------------------- |
| 大院   | `/scene/yard`          |
| 议事亭 | `/scene/pavilion`      |
| 资源墙 | `/scene/resource-wall` |
| 书屋   | `/scene/library`       |
| 小屋   | `/scene/cabin`         |
| 远林   | `/scene/far-forest`    |

## 阶段边界

阶段一代码不包含对话、RAG、向量库、记忆检索、总控 Agent、分支智能体、互助、议事或归档业务逻辑。阶段二当前仅包含后端模型接入层与场景分发接口，不包含 RAG 或长期记忆能力。
