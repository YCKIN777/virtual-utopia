<script setup>
import ScenePageShell from '../../components/scene/ScenePageShell.vue';
import SceneConversationPanel from '../../components/scene/SceneConversationPanel.vue';
</script>

<template>
  <ScenePageShell title="资源墙" scene-key="resource-wall">
    <template #primary>
      <SceneConversationPanel scene-id="resource-wall" />
    </template>
    <template #aside>
      <div class="h-full min-h-[280px]" aria-label="资源墙侧内容插槽" />
    </template>
  </ScenePageShell>
</template>
