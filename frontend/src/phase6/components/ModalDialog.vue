<script setup>
defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
});

defineEmits(['close']);
</script>

<template>
  <Teleport to="body">
    <Transition name="phase6-modal">
      <div
        v-if="open"
        class="phase6-modal-backdrop"
        role="presentation"
        @mousedown.self="$emit('close')"
      >
        <section
          class="phase6-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <header class="phase6-modal__header">
            <div>
              <h2>{{ title }}</h2>
              <slot name="header" />
            </div>
            <button
              type="button"
              class="phase6-icon-button"
              aria-label="关闭"
              @click="$emit('close')"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div class="phase6-modal__body">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="phase6-modal__footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
