<script setup>
import ScenePageShell from '../../components/scene/ScenePageShell.vue';
import SceneConversationPanel from '../../components/scene/SceneConversationPanel.vue';
</script>

<template>
  <ScenePageShell title="小屋" scene-key="cabin">
    <template #primary>
      <SceneConversationPanel scene-id="cabin" />
    </template>
    <template #aside>
      <div class="h-full min-h-[280px]" aria-label="小屋侧内容插槽" />
    </template>
  </ScenePageShell>
</template>
