<script setup>
import { computed, useId } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  label: {
    type: String,
    default: '',
  },
  hint: {
    type: String,
    default: '',
  },
  error: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: 'text',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue']);
const inputId = useId();
const descriptionId = computed(() => `${inputId}-description`);

const updateValue = (event) => {
  emit('update:modelValue', event.target.value);
};
</script>

<template>
  <label :for="inputId" class="block">
    <span v-if="label" class="mb-2 block text-sm font-medium text-ink">
      {{ label }}
    </span>

    <input
      :id="inputId"
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="Boolean(error)"
      :aria-describedby="hint || error ? descriptionId : undefined"
      class="h-11 w-full rounded-hig border bg-surface px-4 text-[16px] text-ink outline-none transition duration-hig placeholder:text-muted/60 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-65 sm:text-sm"
      :class="
        error
          ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100'
          : 'border-line focus:border-accent/55 focus:ring-4 focus:ring-accent/10'
      "
      @input="updateValue"
    />

    <span
      v-if="hint || error"
      :id="descriptionId"
      class="mt-2 block text-xs leading-5"
      :class="error ? 'text-red-600' : 'text-muted'"
    >
      {{ error || hint }}
    </span>
  </label>
</template>
