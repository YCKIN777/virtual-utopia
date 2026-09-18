export class StructuredOutputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StructuredOutputError';
    this.code = 'STRUCTURED_OUTPUT_ERROR';
    this.statusCode = 502;
  }
}

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const validateValue = (value, schema, path) => {
  if (schema.enum && !schema.enum.includes(value)) {
    throw new StructuredOutputError(
      `${path} must be one of: ${schema.enum.join(', ')}`,
    );
  }

  if (schema.type === 'object') {
    if (!isObject(value)) {
      throw new StructuredOutputError(`${path} must be an object`);
    }

    for (const field of schema.required || []) {
      if (!(field in value)) {
        throw new StructuredOutputError(`${path}.${field} is required`);
      }
    }

    const properties = schema.properties || {};

    if (
      schema.additionalProperties === false &&
      Object.keys(value).some((field) => !(field in properties))
    ) {
      throw new StructuredOutputError(`${path} contains unknown fields`);
    }

    for (const [field, propertySchema] of Object.entries(properties)) {
      if (field in value) {
        validateValue(value[field], propertySchema, `${path}.${field}`);
      }
    }

    return value;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      throw new StructuredOutputError(`${path} must be an array`);
    }

    value.forEach((item, index) => {
      validateValue(item, schema.items || {}, `${path}[${index}]`);
    });

    return value;
  }

  if (schema.type && typeof value !== schema.type) {
    throw new StructuredOutputError(`${path} must be a ${schema.type}`);
  }

  if (
    typeof schema.maxLength === 'number' &&
    typeof value === 'string' &&
    value.length > schema.maxLength
  ) {
    throw new StructuredOutputError(
      `${path} exceeds max length ${schema.maxLength}`,
    );
  }

  return value;
};

export const parseStructuredOutput = (content, schema) => {
  if (typeof content !== 'string' || content.trim() === '') {
    throw new StructuredOutputError('Model returned empty content');
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new StructuredOutputError('Model returned invalid JSON');
  }

  return validateValue(parsed, schema, 'response');
};
