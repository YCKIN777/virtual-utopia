<script setup>
defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (value) =>
      ['primary', 'secondary', 'ghost', 'danger'].includes(value),
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
  type: {
    type: String,
    default: 'button',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition duration-hig disabled:cursor-not-allowed disabled:opacity-45"
    :class="[
      {
        'bg-accent text-white shadow-hig-soft hover:bg-accent-strong active:scale-[0.98]':
          variant === 'primary',
        'border border-line bg-surface text-ink hover:border-accent/45 hover:bg-surface-muted active:scale-[0.98]':
          variant === 'secondary',
        'text-muted hover:bg-surface-muted hover:text-ink active:scale-[0.98]':
          variant === 'ghost',
        'bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]':
          variant === 'danger',
        'h-9 px-4 text-sm': size === 'sm',
        'h-11 px-5 text-sm': size === 'md',
        'h-12 px-6 text-base': size === 'lg',
      },
    ]"
  >
    <slot />
  </button>
</template>
