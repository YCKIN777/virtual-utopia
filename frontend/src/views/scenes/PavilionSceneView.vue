<script setup>
import ScenePageShell from '../../components/scene/ScenePageShell.vue';
import SceneConversationPanel from '../../components/scene/SceneConversationPanel.vue';
</script>

<template>
  <ScenePageShell title="议事亭" scene-key="pavilion">
    <template #primary>
      <SceneConversationPanel scene-id="pavilion" />
    </template>
    <template #aside>
      <div class="h-full min-h-[280px]" aria-label="议事亭侧内容插槽" />
    </template>
  </ScenePageShell>
</template>
