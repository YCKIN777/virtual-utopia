const DEFAULT_TERMS = ['傻逼', '操你', '赌博', '诈骗', 'shit', 'fuck'];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createSensitiveFilter = ({ terms = DEFAULT_TERMS } = {}) => {
  const normalizedTerms = [
    ...new Set(terms.map((term) => String(term).trim()).filter(Boolean)),
  ];
  const expression = new RegExp(
    normalizedTerms.map(escapeRegex).join('|'),
    'giu',
  );

  const evaluate = (content) => {
    const matches = [
      ...new Set(
        content.match(expression)?.map((match) => match.toLowerCase()) || [],
      ),
    ];

    return {
      content: content.replace(expression, '***'),
      filtered: matches.length > 0,
      matches,
    };
  };

  return Object.freeze({
    evaluate,
    terms: normalizedTerms,
  });
};
