<script setup>
import { ref } from 'vue';

const props = defineProps({
  plotId: {
    type: String,
    default: '',
  },
  messages: {
    type: Array,
    default: () => [],
  },
  currentUserId: {
    type: Number,
    default: 0,
  },
  canModerate: {
    type: Boolean,
    default: false,
  },
  busy: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits(['create', 'delete', 'update:plotId', 'close']);

const content = ref('');

const submit = () => {
  const value = content.value.trim();

  if (!value) {
    return;
  }

  emit('create', value);
  content.value = '';
};
</script>

<template>
  <section class="bp3-p2-panel">
    <header class="bp3-p2-panel__header">
      <div>
        <span class="bp3-p2-kicker">HOME MESSAGES</span>
        <h2>家园留言板</h2>
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

    <label class="bp3-p2-field">
      <span class="bp3-p2-label">地块</span>
      <input
        :value="plotId"
        placeholder="plot-1"
        @input="emit('update:plotId', $event.target.value)"
      />
    </label>

    <div class="bp3-p2-message-form">
      <textarea
        v-model="content"
        rows="3"
        maxlength="500"
        placeholder="写下留言"
      />
      <button
        type="button"
        class="bp3-p2-button is-primary"
        :disabled="busy || !content.trim()"
        @click="submit"
      >
        发布留言
      </button>
    </div>

    <ul class="bp3-p2-message-list">
      <li v-for="message in messages" :key="message.id">
        <div class="bp3-p2-message-meta">
          <strong>{{ message.authorDisplayName }}</strong>
          <span>
            {{ new Date(message.createdAt).toLocaleString('zh-CN') }}
          </span>
        </div>
        <p>{{ message.content }}</p>
        <button
          v-if="message.authorUserId === currentUserId || canModerate"
          type="button"
          @click="emit('delete', message)"
        >
          删除
        </button>
      </li>
      <li v-if="!messages.length" class="bp3-p2-empty">暂无留言</li>
    </ul>
  </section>
</template>
