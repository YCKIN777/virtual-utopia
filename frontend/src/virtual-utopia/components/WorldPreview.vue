<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ThreeWorld } from '../webgl/ThreeWorld.js';

/**
 * 访客预览模式：仅渲染地形/山水/田园/小屋/雾气植被，无 Avatar、无交互。
 * 复用主世界 ThreeWorld 引擎，不加载 Avatar，不启用任何需要鉴权的业务。
 */
const containerRef = ref(null);
const failed = ref(false);
let world = null;

onMounted(async () => {
  if (!containerRef.value) {
    failed.value = true;
    return;
  }

  try {
    world = new ThreeWorld(containerRef.value, {
      onProgress: () => {},
      onSelect: () => {},
      onStats: () => {},
    });

    // 访客预览：固定白天、关闭自动昼夜/天气（避免随机降雨与时间漂移）
    world.autoDayCycle = false;
    world.autoWeather = false;
    world.setTimePeriod('day');

    await world.init();

    // 固定远景俯瞰全景相机 + 禁用一切交互
    world.camera.position.set(0, 180, 176);
    world.controls.target.set(0, 0, 0);
    world.controls.enableRotate = false;
    world.controls.enableZoom = false;
    world.controls.enablePan = false;
    world.controls.enableDamping = false;
    world.controls.update();

    // 移除键盘监听，防止在登录输入框输入 w/a/s/d 时相机漂移
    window.removeEventListener('keydown', world.handleKeyDown);
    window.removeEventListener('keyup', world.handleKeyUp);
    world.renderer.domElement.removeEventListener(
      'pointerdown',
      world.handlePointerDown,
    );
    world.renderer.domElement.removeEventListener(
      'pointerup',
      world.handlePointerUp,
    );
    world.renderer.domElement.removeEventListener(
      'pointermove',
      world.handlePointerMove,
    );
  } catch (error) {
    console.error('[WorldPreview] 3D 场景初始化失败，回退静态背景', error);
    failed.value = true;
  }
});

onBeforeUnmount(() => {
  world?.dispose();
  world = null;
});
</script>

<template>
  <div ref="containerRef" class="vu-world-preview">
    <div v-if="failed" class="vu-world-preview__fallback" aria-hidden="true" />
  </div>
</template>

<style scoped>
.vu-world-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.vu-world-preview :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.vu-world-preview__fallback {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #cfe4df 0%, #8fb3a4 100%);
}
</style>
