const {
  sceneWidth,
  sceneHeight,
  centerHub,
  pods,
} = require('../../utils/pod-layout');
const legacyBridge = require('../../services/legacyBridge');

Page({
  data: {
    sceneWidth,
    sceneHeight,
    centerHub,
    pods,
    dayMode: true,
    scale: 0.88,
    translateX: 0,
    translateY: 0,
    sceneTransform: '',
    activePodId: '',
  },
  onLoad() {
    this.updateTransform();
  },
  updateTransform() {
    this.setData({
      sceneTransform:
        `translate3d(${this.data.translateX}px, ${this.data.translateY}px, 0) ` +
        `scale(${this.data.scale})`,
    });
  },
  handleTouchStart(event) {
    const touches = event.touches || [];
    this.gesture = this.gesture || {};
    this.gesture.startTouches = touches.map((touch) => ({
      x: touch.clientX,
      y: touch.clientY,
    }));
    this.gesture.startTranslateX = this.data.translateX;
    this.gesture.startTranslateY = this.data.translateY;
    this.gesture.startScale = this.data.scale;
    this.gesture.moved = false;

    if (touches.length >= 2) {
      this.gesture.startDistance = Math.hypot(
        touches[1].clientX - touches[0].clientX,
        touches[1].clientY - touches[0].clientY,
      );
    }
  },
  handleTouchMove(event) {
    const touches = event.touches || [];
    const gesture = this.gesture;

    if (!gesture?.startTouches?.length) {
      return;
    }

    if (touches.length >= 2 && gesture.startDistance) {
      const distance = Math.hypot(
        touches[1].clientX - touches[0].clientX,
        touches[1].clientY - touches[0].clientY,
      );
      const scale = Math.min(
        1.8,
        Math.max(0.56, gesture.startScale * (distance / gesture.startDistance)),
      );
      this.setData({
        scale,
      });
      gesture.moved = true;
      this.updateTransform();
      return;
    }

    const start = gesture.startTouches[0];
    const current = touches[0];
    const deltaX = current.clientX - start.x;
    const deltaY = current.clientY - start.y;

    if (Math.abs(deltaX) + Math.abs(deltaY) > 8) {
      gesture.moved = true;
    }

    this.setData({
      translateX: gesture.startTranslateX + deltaX,
      translateY: gesture.startTranslateY + deltaY,
    });
    this.updateTransform();
  },
  handleTouchEnd() {
    setTimeout(() => {
      this.gesture = null;
    }, 0);
  },
  handlePodSelect(event) {
    if (this.gesture?.moved) {
      return;
    }

    const pod = event.detail;
    this.setData({
      activePodId: pod.id,
    });
    legacyBridge.openPod(pod);
  },
  handlePodHighlight(event) {
    if (!event.detail.active && this.data.activePodId !== event.detail.id) {
      return;
    }
    this.setData({
      activePodId: event.detail.active ? event.detail.id : '',
    });
  },
  handleCenterSelect() {
    legacyBridge.openCenter(centerHub);
  },
  toggleDayMode() {
    this.setData({
      dayMode: !this.data.dayMode,
    });
  },
  zoomIn() {
    this.setData({
      scale: Math.min(1.8, this.data.scale + 0.12),
    });
    this.updateTransform();
  },
  zoomOut() {
    this.setData({
      scale: Math.max(0.56, this.data.scale - 0.12),
    });
    this.updateTransform();
  },
  resetView() {
    this.setData({
      scale: 0.88,
      translateX: 0,
      translateY: 0,
    });
    this.updateTransform();
  },
});
