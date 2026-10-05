# 虚拟乌托邦 · 五十户山林庄园城镇

一个由 **AI 居民** 驱动的 3D 虚拟小镇：LangGraph 多智能体编排 + Three.js 3D 世界漫游，**对话即行动**——你和居民口头约伴，他们会真的在 3D 世界里走到广场、凉亭或某个人的家门口。

## ✨ 亮点

- **LangGraph 多智能体编排**：意图识别 → 5 位居民分支 → 工具调用 → 记忆更新 → 流式回复，全链路可 trace（LangSmith）
- **3D 世界**：50 户宅院、生活广场、凉亭、藏书楼、木屋，第三人称漫游（WASD/鼠标）
- **对话与动作一致**：口头约伴 → `gather_move` 工具 → 3D 居民真实移动（去广场 / 去凉亭 / 去某人家门口）
- **多人同行**：对话面板勾选同行（≤4 人），一次约伴全员一起走
- **记忆系统**：SQLite 印象/事实记忆 + Chroma 向量记忆，居民记得你
- **语音输入输出**：浏览器麦克风 + TTS 语音回复
- **人机协同（HITL）**：敏感操作（如留言板写入）进入管理端审批流
- **生产安全加固**：限流、认证、密钥隔离、管理员审核

## 🏗 架构

```text
浏览器（Vue3 + Three.js 3D 世界）
   │  http(s)
   ▼
nginx :80  ── 静态前端（frontend）
   ├─ /scene-api   → scene   :3000   LangGraph 编排核心
   ├─ /phase5-api  → phase5  :3300   认证 / 限流
   └─ /phase6-api  → phase6  :3400   网关 / HITL 审批 / 管理端
                              │
scene :3000                     │
   ├─ LangGraph 图               │
   │   ├─ 意图路由 → 5 居民分支（阿禾/知予/叙白/岁安/风禾）
   │   ├─ 工具集：gather_move（约伴移动）、guestbook、好友、名额、卡片等
   │   └─ 记忆网关（SQLite 事实/印象 + Chroma 向量）
   ├─ world_state（NPC 位置：plaza / plot-3 等）
   └─ phase6 联动（审批回调、会话校验）
Chroma :8000   向量记忆库
SQLite          会话 / 业务数据 / 记忆
Docker Compose  一键编排全部服务
cpolar / 云主机  公网访问
```

**对话 → 动作链路**：消息 → LangGraph 图（意图识别）→ 分支居民生成回复 + 工具调用 → `gather_move` 写 NPC 位置 → 前端轮询 world_state → Three.js 把居民移动到目标场景（广场 / 凉亭 / 具体宅院 plot）。

## 🧰 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3、Vite、Three.js、Pinia |
| AI 编排 | LangChain / LangGraph、LangSmith 追踪 |
| 模型 | DeepSeek V3（DeepSeek API + SiliconFlow 双通道） |
| 记忆 | SQLite（事实/印象）、Chroma（向量） |
| 后端 | Node.js、Express（scene / phase5 / phase6 三服务） |
| 部署 | Docker Compose、nginx 网关、cpolar 内网穿透 |

## 📁 目录结构

```text
.
├─ backend/                  # Node.js 后端（LangGraph 核心）
│  ├─ src/ai/graph/          # LangGraph 图（state / nodes / orchestrator）
│  ├─ src/ai/tools/          # 业务工具集（gather_move 等）
│  ├─ src/ai/memory/         # 记忆网关（SQLite + 印象 + 约伴兜底）
│  ├─ src/ai/personas.js     # 5 位居民人设
│  ├─ src/phase5/            # 认证 / 限流服务
│  └─ src/phase6/            # 网关 / HITL 审批
├─ frontend/                 # Vue3 + Three.js 3D 世界
│  └─ src/virtual-utopia/    # WebGL 渲染、AI 对话面板、世界状态
├─ deploy/                   # Docker 编排（compose / Dockerfile / nginx）
├─ docs/                     # 设计文档
├─ memory-core.md            # 项目记忆（核心）
├─ memory-log.md             # 迭代日志
└─ memory-modules.md         # 模块记忆
```

## 🚀 快速开始（Docker）

```powershell
# 1. 准备环境变量（从示例复制，填入真实密钥）
Copy-Item backend/.env.example backend/.env

# 2. 一键编排启动（5 个容器：frontend / scene / phase6 / phase5 / chroma）
docker compose -f deploy/docker-compose.yml up -d --build

# 3. 访问
#    本机：      http://localhost
#    公网（可选）：cpolar http 80（内网穿透）
```

> 开发模式（热更新）见 `docs/`；管理员账号首次启动后生成于 `admin-new-password.txt`（已 gitignore）。

## 🔐 安全说明

- 真实密钥只在 `backend/.env` / `deploy/.env`（均已 gitignore，**绝不入库**）
- 管理员初始密码写入 `admin-new-password.txt`（gitignore）
- 历史入库的 `.env.development/.env.production` 均为空密钥占位（已从跟踪移除）
- 生产态强制关闭代码生成能力；phase5 认证限流；phase6 HITL 审批

## 📌 状态

P5.x 迭代中：对话即行动（约伴/多人同行/宅院聚会）已闭环，正在打磨语音与公网体验。
