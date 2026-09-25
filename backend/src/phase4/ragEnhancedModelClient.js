const getLatestUserMessage = (messages) =>
  [...messages].reverse().find((message) => message.role === 'user')?.content ||
  '';

const createReferenceBlock = (matches) =>
  [
    '以下是RAG知识库检索到的参考资料，仅可用于当前场景回答：',
    ...matches.map((match, index) =>
      [
        `[参考资料 ${index + 1}]`,
        `source: ${match.source}`,
        `chunkIndex: ${match.chunkIndex}`,
        `similarity: ${match.similarity}`,
        `content: ${match.chunk}`,
      ].join('\n'),
    ),
    '请结合参考资料回答；若使用了资料，请在回答中明确包含“参考资料”。',
  ].join('\n\n');

const injectReferenceContext = (messages, referenceBlock) => {
  let injected = false;

  return messages.map((message) => {
    if (injected || message.role !== 'system') {
      return message;
    }

    injected = true;

    return {
      ...message,
      content: `${message.content}\n\n${referenceBlock}`,
    };
  });
};

export const createRagEnhancedModelClient = ({
  modelClient,
  ragClient,
  enabled,
}) => {
  if (
    !modelClient ||
    typeof modelClient.createStructuredResponse !== 'function'
  ) {
    throw new TypeError('modelClient is required');
  }

  if (!ragClient || typeof ragClient.retrieve !== 'function') {
    throw new TypeError('ragClient is required');
  }

  return Object.freeze({
    async createStructuredResponse(request) {
      if (!enabled) {
        return modelClient.createStructuredResponse(request);
      }

      const query = getLatestUserMessage(request.messages);

      if (query.trim() === '') {
        return modelClient.createStructuredResponse(request);
      }

      const matches = await ragClient.retrieve(query);

      if (matches.length === 0) {
        return modelClient.createStructuredResponse(request);
      }

      return modelClient.createStructuredResponse({
        ...request,
        messages: injectReferenceContext(
          request.messages,
          createReferenceBlock(matches),
        ),
      });
    },
    // P4: 工具调用轮透传（不注入 RAG 参考资料——该轮输出是 tool_calls，
    // 由模型自行决定是否调用工具；RAG 增强仅作用于最终结构化回复轮）。
    async createToolCallResponse(request) {
      return modelClient.createToolCallResponse(request);
    },
    // P4: 流式结构化轮——与 createStructuredResponse 同样的 RAG 注入语义，再流式输出。
    async createStructuredResponseStream(request) {
      if (!enabled) {
        return modelClient.createStructuredResponseStream(request);
      }

      const query = getLatestUserMessage(request.messages);

      if (query.trim() === '') {
        return modelClient.createStructuredResponseStream(request);
      }

      const matches = await ragClient.retrieve(query);

      if (matches.length === 0) {
        return modelClient.createStructuredResponseStream(request);
      }

      return modelClient.createStructuredResponseStream({
        ...request,
        messages: injectReferenceContext(
          request.messages,
          createReferenceBlock(matches),
        ),
      });
    },
  });
};
