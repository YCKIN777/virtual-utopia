const viteEnv = import.meta.env || {};
const codeGenerationRequested =
  viteEnv.VITE_CODEX_CODE_GENERATION_ENABLED === 'true';

export const runtimeConfig = Object.freeze({
  appTitle: viteEnv.VITE_APP_TITLE || '虚拟乌托邦',
  apiBaseUrl: viteEnv.VITE_API_BASE_URL || '/api',
  mode: viteEnv.MODE || 'test',
  codeGenerationEnabled: viteEnv.DEV && codeGenerationRequested,
});
