<script setup>
import ScenePageShell from '../../components/scene/ScenePageShell.vue';
import SceneConversationPanel from '../../components/scene/SceneConversationPanel.vue';
</script>

<template>
  <ScenePageShell title="大院" scene-key="yard">
    <template #primary>
      <SceneConversationPanel scene-id="yard" />
    </template>
    <template #aside>
      <div class="h-full min-h-[280px]" aria-label="大院侧内容插槽" />
    </template>
  </ScenePageShell>
</template>
