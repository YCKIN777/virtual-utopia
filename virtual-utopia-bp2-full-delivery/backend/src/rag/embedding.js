export const EMBEDDING_DIMENSIONS = 384;

const hashToken = (token) => {
  let hash = 2166136261;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const tokenize = (text) => {
  const normalized = text.normalize('NFKC').toLowerCase();
  const latinTokens = normalized.match(/[a-z0-9]+/g) || [];
  const hanCharacters = [...normalized].filter((character) =>
    /\p{Script=Han}/u.test(character),
  );
  const hanBigrams = hanCharacters
    .slice(0, -1)
    .map((character, index) => character + hanCharacters[index + 1]);
  const tokens = [...latinTokens, ...hanCharacters, ...hanBigrams];

  return tokens.length > 0 ? tokens : [normalized];
};

export const embedText = (text, dimensions = EMBEDDING_DIMENSIONS) => {
  const vector = new Array(dimensions).fill(0);

  for (const token of tokenize(text)) {
    const hash = hashToken(token);
    const index = hash % dimensions;
    const sign = hashToken(`sign:${token}`) % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
};

export const embedTexts = async (texts) => texts.map((text) => embedText(text));
