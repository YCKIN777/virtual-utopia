<script setup>
defineProps({
  maxHeight: {
    type: String,
    default: '24rem',
  },
});
</script>

<template>
  <div
    class="overflow-y-auto overscroll-contain rounded-hig [scrollbar-color:rgb(var(--c-line))_transparent] [scrollbar-width:thin]"
    :style="{ maxHeight }"
  >
    <slot />
  </div>
</template>
