import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const moduleAProxyTarget =
  process.env.BP4_MODULE_A_PROXY_TARGET || 'http://127.0.0.1:3581';
const phase5ProxyTarget =
  process.env.PHASE5_PROXY_TARGET || 'http://localhost:3300';

export default defineConfig({
  root: rootDirectory,
  base: './',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5227,
    proxy: {
      '/module-a-api': {
        target: moduleAProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/module-a-api/, ''),
      },
      '/phase5-api': {
        target: phase5ProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/phase5-api/, ''),
      },
      '/ws/bp4/realtime': {
        target: moduleAProxyTarget.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5227,
  },
  build: {
    outDir: path.join(rootDirectory, 'dist'),
    emptyOutDir: true,
  },
});
