<script setup>
import { worldStore } from '../stores/worldStore.js';
</script>

<template>
  <div class="vu-toast-stack" aria-live="polite">
    <TransitionGroup name="vu-toast">
      <article
        v-for="toast in worldStore.state.toasts"
        :key="toast.id"
        class="vu-toast"
        :class="`vu-toast--${toast.tone}`"
      >
        <span class="vu-toast__dot" aria-hidden="true" />
        <div>
          <strong v-if="toast.title">{{ toast.title }}</strong>
          <p>{{ toast.message }}</p>
        </div>
        <button
          type="button"
          aria-label="关闭提示"
          @click="worldStore.dismissToast(toast.id)"
        >
          ×
        </button>
      </article>
    </TransitionGroup>
  </div>
</template>
