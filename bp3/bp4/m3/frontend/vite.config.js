import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const m3ProxyTarget =
  process.env.BP4_M3_PROXY_TARGET || 'http://127.0.0.1:3551';
const phase5ProxyTarget =
  process.env.PHASE5_PROXY_TARGET || 'http://localhost:3300';

export default defineConfig({
  root: rootDirectory,
  base: './',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5197,
    proxy: {
      '/bp4-m3-api': {
        target: m3ProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/bp4-m3-api/, ''),
      },
      '/phase5-api': {
        target: phase5ProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/phase5-api/, ''),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5197,
  },
  build: {
    outDir: path.join(rootDirectory, 'dist'),
    emptyOutDir: true,
  },
});
