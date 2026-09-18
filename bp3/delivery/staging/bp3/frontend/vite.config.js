import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const bp2Root = path.resolve(rootDirectory, '../..');
const bp2WorldDirectory = path.join(
  bp2Root,
  'frontend',
  'src',
  'virtual-utopia',
  'webgl',
);
const bp3ProxyTarget = process.env.BP3_PROXY_TARGET || 'http://127.0.0.1:3500';
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
    port: 5176,
    fs: {
      allow: [rootDirectory, bp2WorldDirectory],
    },
    proxy: {
      '/bp3-api': {
        target: bp3ProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/bp3-api/, ''),
      },
      '/phase5-api': {
        target: phase5ProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/phase5-api/, ''),
      },
      '/ws/bp3': {
        target: bp3ProxyTarget.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5176,
  },
  build: {
    outDir: path.join(rootDirectory, 'dist'),
    emptyOutDir: true,
  },
});
