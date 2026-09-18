<script setup>
defineProps({
  event: {
    type: Object,
    default: null,
  },
  open: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close']);
</script>

<template>
  <section
    v-if="open && event"
    class="bp3-p1-dialog-backdrop"
    @click.self="emit('close')"
  >
    <article
      class="bp3-p1-panel bp3-p1-event-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="世界事件"
    >
      <span class="bp3-p1-kicker">WORLD EVENT</span>
      <h2>{{ event.title }}</h2>
      <p>{{ event.description }}</p>
      <div class="bp3-p1-event-meta">
        <span>状态：{{ event.status }}</span>
        <span v-if="event.endsAt">
          截止：{{ new Date(event.endsAt).toLocaleString('zh-CN') }}
        </span>
      </div>
      <button
        type="button"
        class="bp3-p1-button is-primary"
        @click="emit('close')"
      >
        知道了
      </button>
    </article>
  </section>
</template>
