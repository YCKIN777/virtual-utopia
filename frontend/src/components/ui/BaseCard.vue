<script setup>
defineProps({
  padded: {
    type: Boolean,
    default: true,
  },
  elevated: {
    type: Boolean,
    default: false,
  },
});
</script>

<template>
  <section
    class="rounded-hig-lg border border-line/75 bg-surface"
    :class="[
      padded ? 'p-5 sm:p-6' : '',
      elevated ? 'shadow-hig' : 'shadow-hig-soft',
    ]"
  >
    <header v-if="$slots.header" class="mb-5">
      <slot name="header" />
    </header>

    <slot />

    <footer v-if="$slots.footer" class="mt-5 border-t pt-4 hairline">
      <slot name="footer" />
    </footer>
  </section>
</template>
