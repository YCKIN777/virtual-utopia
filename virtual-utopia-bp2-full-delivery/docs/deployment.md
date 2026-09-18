# 虚拟乌托邦 BP2｜打包与本地部署文档

> 文档状态：阶段四已冻结，阶段四开发与自测完成，等待整体项目验收。
> 适用范围：Windows本地开发、本地部署、打包和全量回归验证。

## 1. 项目总览

虚拟乌托邦 BP2 当前由阶段一至阶段四组成：

| 阶段   | 状态                             | 能力清单                                                                        |
| ------ | -------------------------------- | ------------------------------------------------------------------------------- |
| 阶段一 | 已冻结                           | Vue 3前端、Express后端、HIG组件库、等轴测矢量地图、六场景容器、响应式页面       |
| 阶段二 | 已冻结                           | 五个分支Agent、场景与Agent绑定、对话面板、公共/私聊会话隔离、真实DeepSeek E2E   |
| 阶段三 | 已冻结                           | 独立RAG服务、文档加载、UTF-8读取、文本分块、ChromaDB向量入库、相似度召回        |
| 阶段四 | 开发自测完成，冻结，等待整体验收 | RAG与主Agent集成、`ENABLE_RAG_ENHANCE`开关、阈值过滤、System Prompt参考资料注入 |

### 1.1 系统架构文字版

```text
浏览器前端
  │
  │ HTTP 5173
  ▼
Vue 3 / Vite 前端
  │
  │ POST /api/scene/route
  ▼
phase4主服务 3200
  │
  ├─ ENABLE_RAG_ENHANCE=false
  │    └─ 直接调用原DeepSeek模型客户端
  │
  └─ ENABLE_RAG_ENHANCE=true
       │
       │ POST /api/rag/query
       ▼
     RAG服务 3100
       │
       │ ChromaDB Node SDK
       ▼
     ChromaDB 8000
       │
       └─ 返回chunk、source、chunkIndex、distance、similarity

RAG增强结果
  │
  └─ 按阈值过滤后注入DeepSeek System Prompt
       │
       ▼
     DeepSeek接口
       │
       ▼
     返回Agent回答
```

### 1.2 服务端口

| 服务             | 默认端口                   | 地址                    |
| ---------------- | -------------------------- | ----------------------- |
| 前端Vite开发服务 | `5173`                     | `http://localhost:5173` |
| ChromaDB         | `8000`                     | `http://localhost:8000` |
| RAG服务          | `3100`                     | `http://localhost:3100` |
| phase4主服务     | 推荐`3200`，代码默认`3000` | `http://localhost:3200` |

## 2. 环境依赖清单

### 2.1 必需环境

| 依赖         | 要求                           | 说明                                 |
| ------------ | ------------------------------ | ------------------------------------ |
| Node.js      | `>=20`，当前验证版本`v24.18.0` | phase4、RAG和后端均运行在Node.js环境 |
| npm          | `>=10`，当前验证版本`11.16.0`  | 安装依赖、构建和测试                 |
| ChromaDB     | 独立服务端口`8000`             | 阶段三向量数据库                     |
| DeepSeek API | 有效API Key和Endpoint          | 阶段二及阶段四模型调用               |

项目依赖包括：

- Vue 3、Vite、Vue Router、TailwindCSS
- Express、CORS、dotenv
- Playwright
- ChromaDB Node SDK，版本范围`^3.5.0`

### 2.2 操作系统支持

- 当前完整验证环境：Windows x64。
- Windows x64需要ChromaDB Node SDK提供的Windows绑定服务。
- Linux和macOS可使用对应平台可用的ChromaDB Node SDK绑定或兼容的Chroma服务端启动方式；本轮未在这些平台执行完整验证。
- Chroma数据目录当前使用`H:\BP2\artifacts\rag-chroma`，部署到其他机器时可替换为本地持久化目录。

### 2.3 安装项目依赖

在项目根目录执行：

```powershell
npm install
```

仅安装生产依赖：

```powershell
npm ci --omit=dev
```

## 3. 本地完整启动顺序

启动顺序固定为：

`Chroma 8000 → RAG服务 3100 → phase4主服务 3200 → 前端 5173`

### 3.1 启动ChromaDB

Windows x64推荐命令：

```powershell
node --input-type=module -e "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); require('chromadb-js-bindings-win32-x64-msvc').cli(['chroma','run','--path','H:/BP2/artifacts/rag-chroma','--host','localhost','--port','8000']);"
```

确认服务地址：

```text
http://localhost:8000
```

### 3.2 启动RAG服务3100

在项目根目录执行：

```powershell
node backend/src/rag/httpServer.js
```

健康检查：

```powershell
Invoke-RestMethod http://localhost:3100/health
```

### 3.3 启动phase4主服务3200

开启RAG增强：

```powershell
$env:PHASE4_PORT='3200'
$env:ENABLE_RAG_ENHANCE='true'
node backend/src/phase4/server.js
```

关闭RAG增强：

```powershell
$env:PHASE4_PORT='3200'
$env:ENABLE_RAG_ENHANCE='false'
node backend/src/phase4/server.js
```

健康检查：

```powershell
Invoke-RestMethod http://localhost:3200/api/health
```

### 3.4 启动前端

在项目根目录执行：

```powershell
npm run dev:frontend
```

访问：

```text
http://localhost:5173
```

## 4. 环境变量配置说明

配置优先读取运行环境变量，不要求修改项目原有`.env`文件。

### 4.1 DeepSeek配置

| 变量                | 推荐/默认值                | 说明             |
| ------------------- | -------------------------- | ---------------- |
| `DEEPSEEK_API_KEY`  | 必填                       | DeepSeek API凭据 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek接口地址 |
| `DEEPSEEK_MODEL`    | `deepseek-chat`            | 模型名称         |

### 4.2 RAG服务配置

| 变量                | 默认值                    | 说明             |
| ------------------- | ------------------------- | ---------------- |
| `CHROMA_URL`        | `http://localhost:8000`   | ChromaDB地址     |
| `CHROMA_COLLECTION` | `virtual_utopia_rag`      | 默认集合名称     |
| `RAG_PORT`          | `3100`                    | RAG HTTP服务端口 |
| `RAG_DOCS_DIR`      | `H:\BP2\backend\rag-docs` | 文档目录         |
| `RAG_CHUNK_SIZE`    | `800`                     | 文本块大小       |
| `RAG_CHUNK_OVERLAP` | `120`                     | 文本块重叠长度   |

### 4.3 阶段四RAG增强配置

| 变量                       | 默认值                  | 说明                               |
| -------------------------- | ----------------------- | ---------------------------------- |
| `ENABLE_RAG_ENHANCE`       | `false`                 | RAG增强总开关，默认关闭            |
| `RAG_BASE_URL`             | `http://localhost:3100` | RAG服务查询地址                    |
| `RAG_SIMILARITY_THRESHOLD` | `0.2`                   | 最低召回相似度，低于阈值的结果丢弃 |
| `RAG_TOP_K`                | `5`                     | 最大召回数量，范围1至20            |
| `RAG_COLLECTION`           | `virtual_utopia_rag`    | 集成查询使用的集合名称             |
| `PHASE4_PORT`              | 代码默认`3000`          | 推荐部署端口`3200`                 |

### 4.4 会话配置

| 变量                          | 默认值    | 说明                   |
| ----------------------------- | --------- | ---------------------- |
| `SESSION_TTL_MS`              | `1800000` | 会话有效期，默认30分钟 |
| `SESSION_CLEANUP_INTERVAL_MS` | `300000`  | 清理周期               |
| `SESSION_MAX_COUNT`           | `1000`    | 内存会话数量上限       |

### 4.5 前端配置

| 变量                | 说明                      |
| ------------------- | ------------------------- |
| `VITE_API_BASE_URL` | 前端访问的后端API基础地址 |

## 5. 项目打包步骤

### 5.1 前端构建

在项目根目录执行：

```powershell
npm run build
```

构建产物：

```text
frontend/dist/
```

### 5.2 后端整理

后端当前以Node.js源码运行，不在仓库中执行额外打包步骤。生产发布目录至少需要：

```text
backend/
├─ package.json
├─ src/
│  ├─ app.js
│  ├─ server.js
│  ├─ agents/
│  ├─ config/
│  ├─ routes/
│  ├─ services/
│  ├─ rag/
│  └─ phase4/
└─ rag-docs/
```

依赖安装使用根目录工作区：

```powershell
npm ci --omit=dev
```

### 5.3 推荐发布目录

```text
virtual-utopia-release/
├─ frontend/
│  └─ dist/
├─ backend/
│  ├─ package.json
│  ├─ src/
│  └─ rag-docs/
├─ package.json
├─ package-lock.json
├─ docs/
│  └─ deployment.md
└─ stage2_memory.md
   stage3_memory.md
   stage4_memory.md
```

Chroma持久化数据目录不放入发布包，部署机器应单独配置：

```text
artifacts/rag-chroma/
```

## 6. 全量回归测试清单

### 6.1 基础构建与原有测试

```powershell
npm run check
```

应覆盖：

- 阶段一前端生产构建。
- 阶段一前端测试。
- 后端原有语法检查。
- 阶段二原有后端测试。

### 6.2 阶段一UI回归

检查内容：

- 六个地图点位可显示、hover和点击。
- 大院、议事亭、资源墙、书屋、小屋、远林路由可访问。
- 地图展开/收起正常。
- HIG组件和页面布局正常。
- 桌面端和移动端无横向溢出。

### 6.3 阶段二Agent与会话回归

```powershell
npm run test:e2e
```

检查内容：

- 五个可用场景Agent正常响应。
- 场景切换和消息收发正常。
- 不同公共场景上下文隔离。
- 小屋私聊仅风禾可访问。
- 远林不发送后端请求。

阶段二E2E依赖真实DeepSeek接口配置。

### 6.4 阶段三RAG入库与检索回归

前置服务：

- Chroma `8000`
- RAG服务`3100`

执行：

```powershell
node backend/tests/rag.vector.e2e.mjs
```

检查内容：

- 文档加载和分块。
- ChromaDB向量写入。
- 相似度召回。
- `chunk`、`source`、`chunkIndex`、`distance`、`similarity`字段。

### 6.5 阶段四RAG-Agent集成回归

前置服务：

- Chroma `8000`
- RAG服务`3100`

执行：

```powershell
node backend/tests/rag.agent.integration.e2e.mjs
```

检查内容：

- `ENABLE_RAG_ENHANCE=true`时发生RAG查询。
- 召回片段注入System Prompt。
- 回答路径包含参考资料。
- `ENABLE_RAG_ENHANCE=false`时不调用RAG。
- 关闭开关时保持原Agent逻辑。

## 7. 故障排查清单

### 7.1 端口占用

检查8000、3100、3200端口：

```powershell
netstat -ano | Select-String ':8000'
netstat -ano | Select-String ':3100'
netstat -ano | Select-String ':3200'
```

查看进程：

```powershell
Get-Process -Id <PID>
```

终止确认无用的进程：

```powershell
Stop-Process -Id <PID>
```

### 7.2 Chroma连接失败

检查：

- Chroma是否监听`http://localhost:8000`。
- RAG服务`CHROMA_URL`是否与该地址一致。
- Windows x64是否使用兼容的Chroma绑定启动方式。
- `artifacts/rag-chroma`目录是否具有写入权限。

健康检查：

```powershell
Invoke-RestMethod http://localhost:3100/health
```

### 7.3 文档入库失败

检查：

- 文档扩展名是否为`.md`或`.txt`。
- 文档是否位于`RAG_DOCS_DIR`允许目录内。
- `paths`是否使用相对RAG文档根目录的路径。
- 文件是否为有效UTF-8文本。
- 文档是否为空。
- Chroma是否可连接。
- 集合名称是否有效。

### 7.4 RAG召回异常

检查：

- RAG服务3100是否正常运行。
- 文档是否已经成功入库。
- 查询集合名称是否与入库集合一致。
- `RAG_SIMILARITY_THRESHOLD`是否过高。
- `RAG_TOP_K`是否大于零。
- `ENABLE_RAG_ENHANCE`是否设置为`true`。
- phase4服务的`RAG_BASE_URL`是否指向`http://localhost:3100`。

### 7.5 DeepSeek调用失败

检查：

- `DEEPSEEK_API_KEY`是否已配置。
- `DEEPSEEK_BASE_URL`是否正确。
- `DEEPSEEK_MODEL`是否有效。
- 网络是否可以访问DeepSeek接口。
- 是否触发API限流或额度不足。

## 8. 冻结与验收状态

- 阶段一：冻结。
- 阶段二：冻结。
- 阶段三：冻结。
- 阶段四：开发自测完成，冻结，等待整体项目验收。

未收到新的明确指令前，不启动新功能开发，不修改已验收源码和阶段记忆文档。
