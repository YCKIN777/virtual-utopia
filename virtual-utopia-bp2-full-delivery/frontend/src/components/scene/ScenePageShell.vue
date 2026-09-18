<script setup>
import { useRouter } from 'vue-router';
import BaseButton from '../ui/BaseButton.vue';
import BaseCard from '../ui/BaseCard.vue';

defineProps({
  title: {
    type: String,
    required: true,
  },
  sceneKey: {
    type: String,
    required: true,
  },
});

const router = useRouter();

const returnToMap = () => {
  router.push({ name: 'map' });
};
</script>

<template>
  <main class="page-container py-6 sm:py-8">
    <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted">
          {{ sceneKey }}
        </p>
        <h1
          class="mt-1 text-2xl font-semibold tracking-normal text-ink sm:text-3xl"
        >
          {{ title }}
        </h1>
      </div>

      <BaseButton variant="secondary" size="sm" @click="returnToMap">
        <svg
          viewBox="0 0 24 24"
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        返回地图
      </BaseButton>
    </div>

    <BaseCard :padded="false" elevated>
      <div
        class="grid min-h-[480px] gap-px bg-line/70 lg:grid-cols-[minmax(0,1fr)_360px]"
      >
        <section class="bg-surface p-5 sm:p-7">
          <slot name="primary">
            <div
              class="h-full min-h-[360px] rounded-hig border border-dashed border-line bg-surface-muted/45"
              aria-label="主内容插槽"
            />
          </slot>
        </section>

        <aside class="bg-surface p-5 sm:p-7">
          <slot name="aside">
            <div
              class="h-full min-h-[280px] rounded-hig border border-dashed border-line bg-surface-muted/45"
              aria-label="侧内容插槽"
            />
          </slot>
        </aside>
      </div>

      <template v-if="$slots.footer" #footer>
        <slot name="footer" />
      </template>
    </BaseCard>
  </main>
</template>
