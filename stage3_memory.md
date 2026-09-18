# 虚拟乌托邦项目｜阶段三完整记忆文档

> 用途：归档阶段三RAG向量知识库模块的开发成果、测试结果、运行方式、架构边界和当前状态。
> 适用：总控Agent / CodeX读取，掌握阶段三完整上下文，保护阶段二已验收代码不被改动。

## 1. 项目全局状态

项目名称：virtual-utopia BP2

当前整体状态：

- 阶段二【已冻结】：全部子任务验收完成，原有阶段二代码、测试和E2E流程保持有效。
- 阶段三【开发+自测完成，等待验收】：RAG向量知识库模块已新增并完成独立全链路测试。

阶段三核心目标：在不侵入阶段二Agent调度、主后端和会话隔离逻辑的前提下，新增独立的RAG知识库服务，实现文档加载、文本分块、向量入库和相似度召回。

## 2. 交付范围

新增模块目录：`backend/src/rag/`

新增文件：

- `backend/src/rag/config.js`
- `backend/src/rag/errors.js`
- `backend/src/rag/documentLoader.js`
- `backend/src/rag/textChunker.js`
- `backend/src/rag/embedding.js`
- `backend/src/rag/vectorStore.js`
- `backend/src/rag/ingestService.js`
- `backend/src/rag/retrievalService.js`
- `backend/src/rag/validation.js`
- `backend/src/rag/httpServer.js`
- `backend/src/rag/index.js`
- `backend/tests/rag.vector.e2e.mjs`
- `backend/rag-docs/.gitkeep`

依赖变更：

- `backend/package.json`新增`chromadb`依赖，版本范围`^3.5.0`。
- `package-lock.json`同步记录ChromaDB Node SDK及其依赖。

## 3. 模块架构

RAG模块采用独立Express服务，不挂载到原阶段二后端入口，不修改`backend/src/server.js`、`backend/src/app.js`或原有路由。

| 模块                  | 职责                                |
| --------------------- | ----------------------------------- |
| `config.js`           | 读取环境变量并提供默认配置          |
| `documentLoader.js`   | 加载`.md`、`.txt`文档并校验路径     |
| `textChunker.js`      | 文本规范化和重叠分块                |
| `embedding.js`        | 生成确定性384维本地哈希向量         |
| `vectorStore.js`      | 通过ChromaDB Node SDK写入和查询向量 |
| `ingestService.js`    | 串联加载、分块、稳定ID生成和入库    |
| `retrievalService.js` | 校验查询参数并调用相似度召回        |
| `validation.js`       | 校验HTTP请求参数                    |
| `httpServer.js`       | 提供独立RAG HTTP服务                |
| `index.js`            | 导出RAG模块公共能力                 |

## 4. 核心能力清单

1. 文档加载：支持递归加载`RAG_DOCS_DIR`中的`.md`和`.txt`文档。
2. UTF-8读取：按UTF-8读取文本，跳过空文档，拒绝不支持的文件类型和目录越界路径。
3. 文本分块：默认每块800字符，块间重叠120字符，优先在段落、换行和句子边界切分。
4. 确定性chunkID：使用`sha256(source + chunkIndex + chunkText)`生成稳定ID，相同内容重复入库时执行upsert。
5. 向量入库：通过ChromaDB Node SDK写入文档、预计算向量、元数据和chunk文本。
6. 相似度召回：使用余弦距离查询，`similarity = 1 - distance`。
7. 查询返回：每个匹配结果返回`chunk`文本、`source`源文件路径、`chunkIndex`、`distance`、`similarity`。
8. 集合隔离：默认集合名称为`virtual_utopia_rag`，请求可覆盖为测试或业务集合名。
9. 错误处理：文档、参数、路径和Chroma连接异常均返回结构化JSON错误。

## 5. API设计

RAG独立服务默认监听：`http://localhost:3100`

### 5.1 健康检查

`GET /health`

返回RAG服务状态、Chroma地址和默认集合名称。

### 5.2 文档入库

`POST /api/rag/ingest`

请求示例：

```json
{
  "paths": ["example.md"],
  "collectionName": "virtual_utopia_rag",
  "chunkSize": 800,
  "chunkOverlap": 120,
  "reset": false
}
```

返回内容包含：

- `collectionName`
- `documents`
- `chunks`
- `ids`

### 5.3 相似度查询

`POST /api/rag/query`

请求示例：

```json
{
  "query": "社区资源如何分类",
  "collectionName": "virtual_utopia_rag",
  "topK": 5
}
```

返回结构：

```json
{
  "query": "社区资源如何分类",
  "collectionName": "virtual_utopia_rag",
  "matches": [
    {
      "id": "chunk-id",
      "chunk": "召回文本",
      "source": "example.md",
      "chunkIndex": 0,
      "distance": 0.18,
      "similarity": 0.82
    }
  ]
}
```

## 6. 数据流转

入库链路：

`文档路径 → 路径校验 → UTF-8读取 → LF规范化 → 文本分块 → chunkID生成 → 本地向量生成 → Chroma upsert → 返回入库统计`

查询链路：

`查询文本 → 参数校验 → 查询向量生成 → Chroma余弦检索 → distance/similarity转换 → 返回chunk及源文件信息`

## 7. 运行配置

配置优先读取环境变量，不修改项目原有`.env`文件。

| 环境变量            | 默认值                              |
| ------------------- | ----------------------------------- |
| `CHROMA_URL`        | `http://localhost:8000`             |
| `CHROMA_COLLECTION` | `virtual_utopia_rag`                |
| `RAG_PORT`          | `3100`                              |
| `RAG_DOCS_DIR`      | `H:\BP2\backend\rag-docs`           |
| `RAG_CHUNK_SIZE`    | `800`                               |
| `RAG_CHUNK_OVERLAP` | `120`                               |
| `RAG_BASE_URL`      | 测试脚本默认`http://localhost:3100` |

## 8. 测试与验证结果

独立向量E2E脚本：`backend/tests/rag.vector.e2e.mjs`

验证内容：

- 调用RAG服务`POST /api/rag/ingest`完成文档写入。
- 调用RAG服务`POST /api/rag/query`完成相似度召回。
- 验证返回字段`chunk`、`source`、`chunkIndex`、`distance`、`similarity`。
- 验证测试集合清理和测试文档清理。

验收测试结果：

- 文档入库：1份。
- 生成chunk：1个。
- 查询召回：成功。
- 测试样例distance：`0.6153198`。
- 测试样例similarity：`0.38468`。
- 语法自检：全部新增JavaScript文件通过。
- 文件格式：UTF-8、无BOM、LF换行。
- `npm run check`：通过。
- 前端测试：9/9通过。
- 后端原阶段二测试：33/33通过。
- 原有阶段二测试全部保留，无回归失败。

## 9. 架构与冻结约束

1. RAG模块独立运行，不侵入原Agent总控、分支Agent、会话隔离和主后端。
2. 不修改阶段二任何已验收源码。
3. 不修改`server.js`、`scene-flow.e2e.mjs`、`stage2_memory.md`或项目原有`.env`文件。
4. ChromaDB作为独立向量数据库运行，RAG服务通过HTTP API访问。
5. 当前阶段三范围仅包含RAG知识库能力，不包含账号权限、消息持久化或其他阶段功能。

## 10. 运行前置

1. 启动Chroma服务，监听`http://localhost:8000`。
2. 启动RAG独立HTTP服务：

```powershell
node backend/src/rag/httpServer.js
```

3. 执行向量E2E测试：

```powershell
node backend/tests/rag.vector.e2e.mjs
```

当前验证环境的Chroma服务已停止，需按上述顺序重新启动后再执行RAG测试。

Windows x64环境下`chromadb@3.5.0`自带的`chroma run` CLI存在架构限制，可使用已安装的Windows x64绑定启动Chroma服务：

```powershell
node --input-type=module -e "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); require('chromadb-js-bindings-win32-x64-msvc').cli(['chroma','run','--path','H:/BP2/artifacts/rag-chroma','--host','localhost','--port','8000']);"
```

## 11. 阶段三状态

阶段三状态：【开发+自测完成，等待验收】。

未收到新的明确指令前，不启动后续阶段开发，不扩展RAG范围之外的业务功能。
