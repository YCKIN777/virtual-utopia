<script setup>
import { computed } from 'vue';

const props = defineProps({
  tasks: {
    type: Array,
    default: () => [],
  },
  catalog: {
    type: Array,
    default: () => [],
  },
  busy: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits(['accept', 'claim', 'close']);

const catalogById = computed(
  () => new Map(props.catalog.map((item) => [item.itemId, item])),
);

const itemName = (itemId) => catalogById.value.get(itemId)?.name || itemId;

const rewardText = (task) => {
  const rewards = task.rewardItems
    .map((item) => `${itemName(item.itemId)} ×${item.quantity}`)
    .join('，');
  const shards = task.rewardShards ? `世界碎片 ×${task.rewardShards}` : '';

  return [rewards, shards].filter(Boolean).join('，') || '无';
};

const progressPercent = (task) => {
  const progress = task.instance?.progress || 0;

  return Math.min(
    100,
    Math.round((progress / Math.max(task.targetQuantity, 1)) * 100),
  );
};
</script>

<template>
  <section class="bp3-p1-panel bp3-p1-task-panel">
    <header class="bp3-p1-panel__header">
      <div>
        <span class="bp3-p1-kicker">TASK BOARD</span>
        <h2>世界任务</h2>
      </div>
      <button
        type="button"
        class="bp3-p1-close"
        aria-label="关闭"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <ul class="bp3-p1-task-list">
      <li v-for="task in tasks" :key="task.id">
        <div class="bp3-p1-task-heading">
          <div>
            <strong>{{ task.title }}</strong>
            <span>{{ task.description }}</span>
          </div>
          <span
            class="bp3-p1-tag"
            :class="{
              'is-complete':
                task.instance?.status === 'completed' ||
                task.instance?.status === 'claimed',
            }"
          >
            {{
              task.instance?.status === 'claimed'
                ? '已领取'
                : task.instance?.status === 'completed'
                  ? '待领取'
                  : task.instance
                    ? '进行中'
                    : '未领取'
            }}
          </span>
        </div>

        <div class="bp3-p1-progress">
          <span :style="{ width: `${progressPercent(task)}%` }" />
        </div>
        <div class="bp3-p1-task-meta">
          <span>
            {{ itemName(task.targetItemId) }}
            {{ task.instance?.progress || 0 }}/{{ task.targetQuantity }}
          </span>
          <span>奖励：{{ rewardText(task) }}</span>
        </div>

        <button
          v-if="!task.instance"
          type="button"
          class="bp3-p1-button is-primary"
          :disabled="busy"
          @click="emit('accept', task)"
        >
          领取任务
        </button>
        <button
          v-else-if="task.instance.status === 'completed'"
          type="button"
          class="bp3-p1-button is-primary"
          :disabled="busy"
          @click="emit('claim', task)"
        >
          领取奖励
        </button>
      </li>
      <li v-if="!tasks.length" class="bp3-p1-empty">暂无世界任务</li>
    </ul>
  </section>
</template>
