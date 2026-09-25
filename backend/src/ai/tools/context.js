// backend/src/ai/tools/context.js
// P4: 工具执行上下文 —— AsyncLocalStorage 承载当前请求的用户上下文
// （{ userId, role, username }）。graph 的 execute_tools 节点在执行工具前
// 将 state.userContext 写入本存储，工具内的 getContext() 由此读取，
// 从而做到：工具集一次创建（app 级单例），用户上下文按请求隔离。
import { AsyncLocalStorage } from 'node:async_hooks';

export const toolContextStorage = new AsyncLocalStorage();

// P4: 流式上下文 —— graphOrchestrator.handleStream 在 ALS.run 中提供
// { onStatus, onToken } 回调，branch 节点流式轮从中读取并推送事件。
export const streamingContextStorage = new AsyncLocalStorage();
