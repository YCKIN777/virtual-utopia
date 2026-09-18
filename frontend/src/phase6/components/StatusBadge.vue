<script setup>
import { computed } from 'vue';

const props = defineProps({
  value: {
    type: String,
    default: '',
  },
  kind: {
    type: String,
    default: 'document',
  },
});

const label = computed(() => {
  const labels = {
    pending: '待处理',
    indexed: '已入库',
    failed: '失败',
    deleted: '已删除',
    active: '活跃',
    expired: '已过期',
    success: '成功',
    error: '错误',
  };

  return labels[props.value] || props.value || '未知';
});

const tone = computed(() => {
  if (['indexed', 'active', 'success'].includes(props.value)) {
    return 'success';
  }

  if (['failed', 'error', 'deleted'].includes(props.value)) {
    return 'danger';
  }

  if (props.value === 'expired') {
    return 'warning';
  }

  return 'neutral';
});
</script>

<template>
  <span class="phase6-status" :class="`phase6-status--${tone}`">
    {{ label }}
  </span>
</template>
