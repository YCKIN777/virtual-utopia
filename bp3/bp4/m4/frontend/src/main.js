import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';

createApp(App).mount('#bp4-m4-app');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => null);
  });
}
