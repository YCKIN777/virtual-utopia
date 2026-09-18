<script setup>
import ScenePageShell from '../../components/scene/ScenePageShell.vue';
import SceneConversationPanel from '../../components/scene/SceneConversationPanel.vue';
</script>

<template>
  <ScenePageShell title="远林" scene-key="far-forest">
    <template #primary>
      <SceneConversationPanel scene-id="far-forest" />
    </template>
    <template #aside>
      <div class="h-full min-h-[280px]" aria-label="远林侧内容插槽" />
    </template>
  </ScenePageShell>
</template>
