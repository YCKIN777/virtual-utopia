import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const moduleBProxyTarget =
  process.env.BP4_MODULE_B_PROXY_TARGET || 'http://127.0.0.1:3591';
const phase5ProxyTarget =
  process.env.PHASE5_PROXY_TARGET || 'http://localhost:3300';

export default defineConfig({
  root: rootDirectory,
  base: './',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5237,
    proxy: {
      '/module-b-api': {
        target: moduleBProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/module-b-api/, ''),
      },
      '/phase5-api': {
        target: phase5ProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/phase5-api/, ''),
      },
      '/ws/bp4/realtime': {
        target: moduleBProxyTarget.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5237,
  },
  build: {
    outDir: path.join(rootDirectory, 'dist'),
    emptyOutDir: true,
  },
});
