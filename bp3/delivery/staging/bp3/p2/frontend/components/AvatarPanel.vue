<script setup>
defineProps({
  actions: {
    type: Array,
    default: () => [],
  },
  emotes: {
    type: Array,
    default: () => [],
  },
  state: {
    type: Object,
    default: null,
  },
  busy: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits(['select', 'close']);
</script>

<template>
  <section class="bp3-p2-panel">
    <header class="bp3-p2-panel__header">
      <div>
        <span class="bp3-p2-kicker">AVATAR ACTIONS</span>
        <h2>表情与动作</h2>
      </div>
      <button
        type="button"
        class="bp3-p2-close"
        aria-label="关闭"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <p class="bp3-p2-current">
      当前：{{ state?.actionId || 'idle' }}
      <span v-if="state?.emoteId"> · {{ state.emoteId }} </span>
    </p>

    <div class="bp3-p2-subsection">
      <span class="bp3-p2-label">动作</span>
      <div class="bp3-p2-action-grid">
        <button
          v-for="action in actions"
          :key="action.id"
          type="button"
          :class="{
            'is-active': state?.actionId === action.id,
          }"
          :disabled="busy"
          @click="
            emit('select', {
              actionId: action.id,
              emoteId: state?.emoteId || null,
            })
          "
        >
          {{ action.name }}
        </button>
      </div>
    </div>

    <div class="bp3-p2-subsection">
      <span class="bp3-p2-label">表情</span>
      <div class="bp3-p2-action-grid">
        <button
          v-for="emote in emotes"
          :key="emote.id"
          type="button"
          :class="{
            'is-active': state?.emoteId === emote.id,
          }"
          :disabled="busy"
          @click="
            emit('select', {
              actionId: state?.actionId || 'idle',
              emoteId: emote.id,
            })
          "
        >
          {{ emote.name }}
        </button>
      </div>
    </div>
  </section>
</template>
