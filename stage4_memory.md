# 虚拟乌托邦项目｜阶段四完整记忆文档

> 用途：归档阶段四RAG与主Agent集成模块的设计、交付文件、配置项、测试结果、运行方式和当前状态。
> 适用：总控Agent / CodeX读取，掌握阶段四完整上下文，保护阶段一至阶段三冻结成果不被改动。

## 1. 项目全局状态

项目名称：virtual-utopia BP2

当前整体状态：

- 阶段一【已冻结】：工程、HIG组件、矢量地图和六场景容器已交付。
- 阶段二【已冻结】：分支Agent、场景绑定、会话隔离和真实DeepSeek E2E已验收。
- 阶段三【已冻结】：独立RAG知识库模块已开发并完成自测。
- 阶段四【开发+自测完成，等待整体项目验收】：RAG知识库与主Agent对话链路集成完成。

阶段四核心目标：在保持原有Agent调度、场景绑定、会话隔离和DeepSeek调用逻辑不变的前提下，通过独立增强层按开关向System Prompt注入RAG检索片段。

## 2. 交付范围

新增模块目录：`backend/src/phase4/`

新增文件：

- `backend/src/phase4/config.js`
- `backend/src/phase4/ragClient.js`
- `backend/src/phase4/ragEnhancedModelClient.js`
- `backend/src/phase4/server.js`
- `backend/src/phase4/index.js`
- `backend/tests/rag.agent.integration.e2e.mjs`

未修改：

- 阶段二已验收核心源码。
- `scripts/scene-flow.e2e.mjs`
- `backend/src/server.js`
- `stage2_memory.md`
- `stage3_memory.md`
- 项目原有`.env`文件。

## 3. 模块架构

阶段四复用原有`createApp`和Agent调度链路，通过包装`modelClient.createStructuredResponse`扩展模型调用，不改变Agent注册、场景映射、会话边界和分支Agent人设。

| 模块                        | 职责                                                           |
| --------------------------- | -------------------------------------------------------------- |
| `config.js`                 | 读取阶段四开关、RAG地址、阈值、TopK和端口配置                  |
| `ragClient.js`              | 调用RAG `3100`查询接口并执行相似度阈值过滤                     |
| `ragEnhancedModelClient.js` | 将召回片段注入System Prompt，再调用原模型客户端                |
| `server.js`                 | 组合原DeepSeek客户端、RAG客户端、增强模型客户端和原`createApp` |
| `index.js`                  | 导出阶段四公共集成能力                                         |

## 4. 核心对话链路

完整逻辑：

`用户提问 → ENABLE_RAG_ENHANCE开关判断 → 开关开启时调用RAG查询接口 → 按RAG_SIMILARITY_THRESHOLD过滤 → 将召回chunk、source、chunkIndex、similarity注入System Prompt → 调用DeepSeek → 返回Agent回答`

开关关闭链路：

`用户提问 → 直接调用原模型客户端 → 完全保持阶段二Agent对话逻辑`

增强规则：

1. `ENABLE_RAG_ENHANCE=true`时才发起RAG请求。
2. RAG请求调用`POST /api/rag/query`。
3. 相似度低于阈值的召回结果直接丢弃。
4. 无有效召回结果时不注入参考上下文，仍沿用原模型调用。
5. 有效召回结果追加到第一个System消息末尾。
6. 阶段二System Prompt、分支人设和场景边界不会被替换。

## 5. 配置项

配置优先读取环境变量，不修改项目原有`.env`文件。

| 配置项                     | 默认值                  | 说明                     |
| -------------------------- | ----------------------- | ------------------------ |
| `ENABLE_RAG_ENHANCE`       | `false`                 | RAG增强总开关，默认关闭  |
| `RAG_BASE_URL`             | `http://localhost:3100` | RAG独立服务地址          |
| `RAG_SIMILARITY_THRESHOLD` | `0.2`                   | 最低召回相似度           |
| `RAG_TOP_K`                | `5`                     | 最大召回数量，范围1至20  |
| `RAG_COLLECTION`           | `virtual_utopia_rag`    | 查询集合名称             |
| `PHASE4_PORT`              | 代码默认`3000`          | 推荐集成运行端口为`3200` |

## 6. 集成E2E测试

独立测试脚本：`backend/tests/rag.agent.integration.e2e.mjs`

测试场景一，开关开启：

- 向真实ChromaDB和RAG服务写入测试知识文档。
- 通过阶段四增强模型客户端发起场景对话。
- 确认RAG查询请求发生。
- 确认测试文档片段注入System Prompt。
- 确认回答路径包含`参考资料`。

测试场景二，开关关闭：

- 使用同一测试知识库和测试问题。
- 不发起RAG查询请求。
- System Prompt不包含RAG参考资料块。
- 回答完全沿用原Agent模型调用路径。

## 7. 测试结果

集成E2E完整结果：

```json
{
  "collectionName": "virtual_utopia_phase4_e2e_29444_1789528358053",
  "enabled": {
    "status": 200,
    "reply": "参考资料：# RAG与主Agent集成测试",
    "ragRequests": 1,
    "referenceInjected": true
  },
  "disabled": {
    "status": 200,
    "reply": "基础回答：资源如何分类并保留来源标签",
    "ragRequests": 0,
    "referenceInjected": false
  }
}
```

回归结果：

- 新增JavaScript文件语法检查通过。
- 新增文件UTF-8、无BOM、LF换行。
- `npm run check`通过。
- 前端测试：9/9通过。
- 后端原阶段二测试：33/33通过。
- 原有阶段二测试全部保留，无回归失败。
- 阶段四入口验证可启动，默认`ragEnhanceEnabled=false`。

## 8. 架构约束

1. 复用原有`createApp`和Agent调度链路。
2. 会话隔离、场景绑定、分支Agent和行为边界完全保留。
3. 不修改阶段二任何已验收源码。
4. 不修改阶段二E2E脚本和阶段二/阶段三记忆文档。
5. 阶段四只实现RAG检索结果注入Agent提示词。
6. 不新增账号权限、消息持久化或其他业务能力。

## 9. 运行前置

1. 启动Chroma服务，监听`http://localhost:8000`。
2. 启动RAG独立服务，监听`http://localhost:3100`。
3. 设置阶段四配置并启动phase4服务，推荐监听`3200`。

Chroma启动命令：

```powershell
node --input-type=module -e "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); require('chromadb-js-bindings-win32-x64-msvc').cli(['chroma','run','--path','H:/BP2/artifacts/rag-chroma','--host','localhost','--port','8000']);"
```

RAG服务启动命令：

```powershell
node backend/src/rag/httpServer.js
```

阶段四服务启动命令：

```powershell
$env:PHASE4_PORT='3200'
$env:ENABLE_RAG_ENHANCE='true'
node backend/src/phase4/server.js
```

关闭RAG增强时：

```powershell
$env:PHASE4_PORT='3200'
$env:ENABLE_RAG_ENHANCE='false'
node backend/src/phase4/server.js
```

阶段四集成E2E执行命令：

```powershell
node backend/tests/rag.agent.integration.e2e.mjs
```

## 10. 当前运行状态

验证完成后，Chroma、RAG和phase4临时服务均已停止。

需要验证时按以下顺序启动：

`Chroma 8000 → RAG服务 3100 → phase4服务 3200`

## 11. 阶段四状态

阶段四状态：【开发+自测完成，等待整体项目验收】。

未收到新的明确指令前，不启动后续阶段开发，不扩展RAG与Agent集成之外的业务功能。
