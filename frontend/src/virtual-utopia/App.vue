<script setup>
import { computed, onMounted } from 'vue';
import AppHeader from './components/AppHeader.vue';
import ToastStack from './components/ToastStack.vue';
import { worldStore } from './stores/worldStore.js';

const persistenceLabel = computed(() => {
  const status = worldStore.state.persistence.status;

  if (status === 'saved') {
    return 'Phase5 持久化已连接';
  }

  if (status === 'saving') {
    return '正在保存到 Phase5';
  }

  if (status === 'offline') {
    return 'Phase5 离线，使用内存临时模式';
  }

  if (status === 'error') {
    return 'Phase5 保存异常';
  }

  return '登录后启用 Phase5 持久化';
});

onMounted(() => {
  void worldStore.restoreSession();
});
</script>

<template>
  <div class="vu-app">
    <AppHeader />
    <RouterView v-slot="{ Component }">
      <Transition name="vu-page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
    <footer class="vu-footer">
      <div class="vu-container vu-footer__inner">
        <span>虚拟乌托邦 · BP2 前端原型</span>
        <span>{{ persistenceLabel }}</span>
      </div>
    </footer>
    <ToastStack />
  </div>
</template>
