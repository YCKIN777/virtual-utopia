import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const p2Directory = path.resolve(rootDirectory, '..');
const bp3Directory = path.resolve(p2Directory, '..');
const bp2WorldDirectory = path.join(
  bp3Directory,
  '..',
  'frontend',
  'src',
  'virtual-utopia',
  'webgl',
);
const p2ProxyTarget =
  process.env.BP3_P2_PROXY_TARGET || 'http://127.0.0.1:3521';
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
    port: 5187,
    fs: {
      allow: [rootDirectory, bp2WorldDirectory],
    },
    proxy: {
      '/bp3-p2-api': {
        target: p2ProxyTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/bp3-p2-api/, ''),
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
    port: 5187,
  },
  build: {
    outDir: path.join(rootDirectory, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(rootDirectory, 'p2.html'),
    },
  },
});
