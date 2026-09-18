<script setup>
defineProps({
  message: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    default: '',
  },
  tone: {
    type: String,
    default: 'info',
    validator: (value) => ['info', 'success', 'error'].includes(value),
  },
});

defineEmits(['close']);
</script>

<template>
  <div
    class="pointer-events-auto flex min-w-0 items-start gap-3 rounded-hig border border-line/75 bg-surface px-4 py-3 shadow-hig"
    role="status"
  >
    <span
      class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
      :class="{
        'bg-accent': tone === 'info',
        'bg-emerald-500': tone === 'success',
        'bg-red-500': tone === 'error',
      }"
      aria-hidden="true"
    />

    <div class="min-w-0 flex-1">
      <p v-if="title" class="text-sm font-semibold text-ink">{{ title }}</p>
      <p class="text-sm leading-5 text-muted">{{ message }}</p>
    </div>

    <button
      type="button"
      class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-muted hover:text-ink"
      aria-label="关闭提示"
      @click="$emit('close')"
    >
      <svg
        viewBox="0 0 24 24"
        class="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </div>
</template>
