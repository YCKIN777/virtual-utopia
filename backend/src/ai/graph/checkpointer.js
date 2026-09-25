// backend/src/ai/graph/checkpointer.js
// P3: SQLite Checkpointer —— 短记忆持久化（thread_id=conversationId）。
// 数据文件默认 backend/data/langgraph.sqlite（与 memory 库同目录约定）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const defaultCheckpointDbPath = () =>
  path.resolve(moduleDir, '..', '..', '..', 'data', 'langgraph.sqlite');

export const createCheckpointer = ({ databasePath } = {}) => {
  const resolvedPath = databasePath || defaultCheckpointDbPath();

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  return SqliteSaver.fromConnString(resolvedPath);
};
