<script setup>
import { computed, ref } from 'vue';
import BaseButton from '../ui/BaseButton.vue';
import BaseInput from '../ui/BaseInput.vue';
import BaseScroll from '../ui/BaseScroll.vue';
import { getSceneDefinition } from '../../config/scenes.js';
import { useToast } from '../../composables/useToast.js';
import { useSceneConversation } from '../../stores/conversationStore.js';

const props = defineProps({
  sceneId: {
    type: String,
    required: true,
  },
});

const toast = useToast();
const input = ref('');
const sceneIdRef = computed(() => props.sceneId);
const scene = computed(() => getSceneDefinition(props.sceneId));
const { conversation, sendMessage } = useSceneConversation(sceneIdRef);
const isUnavailable = computed(() => !scene.value?.agentEnabled);

const submitMessage = async () => {
  const content = input.value.trim();

  if (!content || conversation.value.loading) {
    return;
  }

  if (isUnavailable.value) {
    toast.info('该场景尚未开放');
    return;
  }

  input.value = '';

  try {
    await sendMessage(content);
  } catch (error) {
    toast.error(error.message || '消息发送失败', {
      title: scene.value?.name || '场景请求',
    });
  }
};
</script>

<template>
  <section class="flex h-full min-h-[360px] flex-col">
    <BaseScroll max-height="420px" class="min-h-0 flex-1 pr-1">
      <div
        v-if="conversation.messages.length === 0"
        class="grid min-h-[260px] place-items-center rounded-hig border border-dashed border-line bg-surface-muted/35 px-6 text-center"
      >
        <p class="max-w-xs text-sm leading-6 text-muted">
          {{ isUnavailable ? '远林暂未开放' : `${scene.name}会话已就绪` }}
        </p>
      </div>

      <div v-else class="space-y-3" aria-live="polite">
        <article
          v-for="message in conversation.messages"
          :key="message.id"
          class="flex"
          :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <p
            class="max-w-[82%] whitespace-pre-wrap rounded-hig px-4 py-3 text-sm leading-6"
            :class="
              message.role === 'user'
                ? 'bg-accent text-white'
                : 'border border-line/70 bg-surface-muted/65 text-ink'
            "
          >
            {{ message.content }}
          </p>
        </article>
      </div>
    </BaseScroll>

    <p
      v-if="conversation.error"
      class="mt-3 rounded-hig bg-red-50 px-4 py-3 text-sm text-red-700"
      role="alert"
    >
      {{ conversation.error }}
    </p>

    <form
      class="mt-4 flex items-center gap-2 border-t pt-4 hairline"
      @submit.prevent="submitMessage"
    >
      <BaseInput
        v-model="input"
        class="min-w-0 flex-1"
        :placeholder="isUnavailable ? '远林暂未开放' : '输入消息'"
        :disabled="conversation.loading || isUnavailable"
        @keydown.enter.prevent="submitMessage"
      />

      <BaseButton
        type="submit"
        size="md"
        :disabled="conversation.loading || isUnavailable || !input.trim()"
        aria-label="发送消息"
      >
        <svg
          v-if="!conversation.loading"
          viewBox="0 0 24 24"
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        <span
          v-else
          class="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
          aria-hidden="true"
        />
      </BaseButton>
    </form>
  </section>
</template>
