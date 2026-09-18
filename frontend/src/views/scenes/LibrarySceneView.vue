<script setup>
import ScenePageShell from '../../components/scene/ScenePageShell.vue';
import SceneConversationPanel from '../../components/scene/SceneConversationPanel.vue';
</script>

<template>
  <ScenePageShell title="书屋" scene-key="library">
    <template #primary>
      <SceneConversationPanel scene-id="library" />
    </template>
    <template #aside>
      <div class="h-full min-h-[280px]" aria-label="书屋侧内容插槽" />
    </template>
  </ScenePageShell>
</template>
