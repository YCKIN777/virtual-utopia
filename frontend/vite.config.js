import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // P4 收尾：外层场景应用登录（phase6 账号体系）经该代理转发，避免跨域。
    proxy: {
      '/phase6-api': {
        target: 'http://localhost:3400',
        changeOrigin: true,
      },
    },
  },
});
