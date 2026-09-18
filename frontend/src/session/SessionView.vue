<script>
import ConversationSidebar from './ConversationSidebar.vue';
import ChatPanel from './ChatPanel.vue';

export default {
  name: 'SessionView',
  components: { ConversationSidebar, ChatPanel },
};
</script>

<template>
  <div class="session-view">
    <ConversationSidebar />
    <ChatPanel />
  </div>
</template>

<style scoped>
.session-view {
  display: flex;
  height: 100vh;
  width: 100%;
}
</style>
