import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const bp3Directory = path.resolve(rootDirectory, '../../..');
const bp2WorldDirectory = path.join(
  bp3Directory,
  '..',
  'frontend',
  'src',
  'virtual-utopia',
  'webgl',
);
const m5ProxyTarget =
  process.env.BP4_M5_PROXY_TARGET || 'http://127.0.0.1:3571';
const phase5ProxyTarget =
  process.env.PHASE5_PROXY_TARGET || 'http://localhost:3300';

export default defineConfig({
  root: rootDirectory,
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@bp2-world': bp2WorldDirectory,
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5217,
    fs: {
      allow: [rootDirectory, bp2WorldDirectory],
    },
    proxy: {
      '/bp4-m5-api': {
        target: m5ProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/bp4-m5-api/, ''),
      },
      '/phase5-api': {
        target: phase5ProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/phase5-api/, ''),
      },
      '/ws/bp4/m5': {
        target: m5ProxyTarget.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5217,
  },
  build: {
    outDir: path.join(rootDirectory, 'dist'),
    emptyOutDir: true,
  },
});
