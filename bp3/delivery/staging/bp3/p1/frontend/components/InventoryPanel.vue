<script setup>
import { computed } from 'vue';

const props = defineProps({
  inventory: {
    type: Object,
    default: null,
  },
  transactions: {
    type: Array,
    default: () => [],
  },
  busy: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits(['consume', 'close']);

const items = computed(() => props.inventory?.items || []);
</script>

<template>
  <section class="bp3-p1-panel bp3-p1-inventory-panel">
    <header class="bp3-p1-panel__header">
      <div>
        <span class="bp3-p1-kicker">BACKPACK</span>
        <h2>背包与库存</h2>
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

    <div class="bp3-p1-capacity">
      <span>
        容量 {{ inventory?.usedSlots || 0 }}/{{ inventory?.capacity || 0 }}
      </span>
    </div>

    <ul class="bp3-p1-inventory-grid">
      <li v-for="item in items" :key="item.itemId">
        <span
          class="bp3-p1-item-swatch"
          :style="{ background: item.iconColor }"
        />
        <div>
          <strong>{{ item.name }}</strong>
          <span>{{ item.category }} · {{ item.quantity }}</span>
        </div>
        <button
          type="button"
          :disabled="busy || item.quantity < 1"
          @click="emit('consume', item)"
        >
          使用
        </button>
      </li>
      <li v-if="!items.length" class="bp3-p1-empty">背包为空</li>
    </ul>

    <div class="bp3-p1-subsection">
      <span class="bp3-p1-label">最近事务</span>
      <ul class="bp3-p1-transaction-list">
        <li
          v-for="transaction in transactions.slice(0, 8)"
          :key="transaction.id"
        >
          <span>{{ transaction.itemId }}</span>
          <span>
            {{ transaction.delta > 0 ? '+' : '' }}{{ transaction.delta }}
          </span>
          <span>{{ transaction.reason }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
