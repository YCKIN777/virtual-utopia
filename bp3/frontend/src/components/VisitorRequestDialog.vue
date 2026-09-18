<script setup>
import { reactive, ref } from 'vue';

const props = defineProps({
  api: {
    type: Object,
    required: true,
  },
  open: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits(['close']);

const plotId = ref('');
const message = ref('');
const inviteToken = ref('');
const state = reactive({
  busy: false,
  error: '',
  result: '',
});

const submitRequest = async () => {
  state.busy = true;
  state.error = '';
  state.result = '';

  try {
    const payload = await props.api.createAccessRequest(
      plotId.value.trim(),
      message.value.trim(),
    );

    state.result = `申请已提交：${payload.request.id}`;
  } catch (error) {
    state.error = error.message || '访问申请提交失败';
  } finally {
    state.busy = false;
  }
};

const redeem = async () => {
  state.busy = true;
  state.error = '';
  state.result = '';

  try {
    const payload = await props.api.redeemInvite(inviteToken.value.trim());

    state.result = `邀请已兑换：${payload.plotId}`;
    inviteToken.value = '';
  } catch (error) {
    state.error = error.message || '邀请兑换失败';
  } finally {
    state.busy = false;
  }
};

const close = () => {
  state.error = '';
  state.result = '';
  emit('close');
};
</script>

<template>
  <section v-if="open" class="bp3-dialog-backdrop" @click.self="close">
    <div
      class="bp3-panel bp3-request-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="访客申请"
    >
      <header class="bp3-panel__header">
        <div>
          <span class="bp3-kicker">VISITOR ACCESS</span>
          <h2>访客申请</h2>
        </div>
        <button
          type="button"
          class="bp3-close"
          aria-label="关闭"
          @click="close"
        >
          ×
        </button>
      </header>

      <p v-if="state.error" class="bp3-error">
        {{ state.error }}
      </p>
      <p v-if="state.result" class="bp3-success">
        {{ state.result }}
      </p>

      <div class="bp3-form-block">
        <label>
          <span class="bp3-label">目标地块</span>
          <input v-model="plotId" placeholder="plot-12" />
        </label>
        <label>
          <span class="bp3-label">申请说明</span>
          <textarea
            v-model="message"
            rows="3"
            maxlength="200"
            placeholder="希望访问您的家园"
          />
        </label>
        <button
          type="button"
          class="bp3-button is-primary"
          :disabled="state.busy || !plotId.trim()"
          @click="submitRequest"
        >
          提交申请
        </button>
      </div>

      <div class="bp3-divider" />

      <div class="bp3-form-block">
        <label>
          <span class="bp3-label">临时邀请码</span>
          <input v-model="inviteToken" placeholder="输入邀请码" />
        </label>
        <button
          type="button"
          class="bp3-button"
          :disabled="state.busy || !inviteToken.trim()"
          @click="redeem"
        >
          兑换邀请
        </button>
      </div>
    </div>
  </section>
</template>
