/**
 * 前端「密码加密传输」：SHA-256 摘要（十六进制）。
 *
 * 与后端 `backend/src/phase5/security.js` 的 `sha256Hex` 保持一致，
 * 前端先对密码做 SHA-256，后端再对摘要做 scrypt 存储。
 */
export const sha256Hex = async (value) => {
  const text = String(value ?? '');

  try {
    if (globalThis.crypto?.subtle) {
      const data = new TextEncoder().encode(text);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', data);

      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // 非安全上下文 / 不支持 Web Crypto 时降级
  }

  return text;
};
