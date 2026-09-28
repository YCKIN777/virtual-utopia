<script setup>
import { onMounted } from 'vue';
import ToastStack from './components/ToastStack.vue';
import { worldStore } from './stores/worldStore.js';

onMounted(() => {
  void worldStore.restoreSession();
});
</script>

<template>
  <div class="vu-app">
    <RouterView v-slot="{ Component }">
      <Transition name="vu-page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
    <ToastStack />
  </div>
</template>
