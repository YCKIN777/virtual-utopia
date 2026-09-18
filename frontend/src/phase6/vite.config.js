import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDirectory,
  base: './',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5174,
  },
  preview: {
    host: '0.0.0.0',
    port: 5174,
  },
  build: {
    outDir: path.join(rootDirectory, 'dist'),
    emptyOutDir: true,
  },
});
