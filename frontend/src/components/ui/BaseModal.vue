<script setup>
import { onBeforeUnmount, watch } from 'vue';
import BaseButton from './BaseButton.vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  closeLabel: {
    type: String,
    default: '关闭',
  },
});

const emit = defineEmits(['update:modelValue']);

const close = () => emit('update:modelValue', false);

const handleKeydown = (event) => {
  if (event.key === 'Escape') {
    close();
  }
};

watch(
  () => props.modelValue,
  (isOpen) => {
    document.body.style.overflow = isOpen ? 'hidden' : '';

    if (isOpen) {
      window.addEventListener('keydown', handleKeydown);
    } else {
      window.removeEventListener('keydown', handleKeydown);
    }
  },
);

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[80] grid place-items-center bg-ink/20 p-4 backdrop-blur-sm"
        role="presentation"
        @mousedown.self="close"
      >
        <section
          class="w-full max-w-lg rounded-hig-lg border border-line/75 bg-surface p-5 shadow-hig sm:p-6"
          role="dialog"
          aria-modal="true"
          :aria-label="title || undefined"
        >
          <header class="flex items-start justify-between gap-5">
            <div>
              <h2 v-if="title" class="text-lg font-semibold tracking-normal">
                {{ title }}
              </h2>
              <slot name="header" />
            </div>

            <BaseButton
              variant="ghost"
              size="sm"
              :aria-label="closeLabel"
              @click="close"
            >
              <svg
                viewBox="0 0 24 24"
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </BaseButton>
          </header>

          <div class="mt-5">
            <slot />
          </div>

          <footer
            v-if="$slots.footer"
            class="mt-6 flex flex-wrap justify-end gap-2"
          >
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 180ms ease;
}

.modal-enter-active section,
.modal-leave-active section {
  transition: transform 180ms ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from section,
.modal-leave-to section {
  transform: translateY(8px) scale(0.985);
}
</style>
