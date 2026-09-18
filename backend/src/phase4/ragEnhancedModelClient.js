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
  });
};
