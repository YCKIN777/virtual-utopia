<script setup>
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { computed } from 'vue';
import { runtimeConfig } from './config/runtime.js';
import BaseToastStack from './components/ui/BaseToastStack.vue';

const route = useRoute();
const sceneName = computed(() => route.meta.sceneName || '');
</script>

<template>
  <div class="app-shell">
    <header class="sticky top-0 z-40 border-b bg-canvas/90 backdrop-blur-xl">
      <div class="page-container flex h-16 items-center justify-between gap-6">
        <RouterLink
          to="/"
          class="flex min-w-0 items-center gap-3 rounded-full"
          aria-label="返回世界地图"
        >
          <span
            class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-white"
            aria-hidden="true"
          >
            乌
          </span>
          <span
            class="truncate text-[15px] font-semibold tracking-normal text-ink"
          >
            {{ runtimeConfig.appTitle }}
          </span>
        </RouterLink>

        <div
          v-if="sceneName"
          class="min-w-0 truncate text-sm text-muted"
          aria-live="polite"
        >
          {{ sceneName }}
        </div>
      </div>
    </header>

    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>

    <BaseToastStack />
  </div>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
