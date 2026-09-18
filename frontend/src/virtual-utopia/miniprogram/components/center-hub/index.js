Component({
  properties: {
    hub: {
      type: Object,
      value: {},
    },
  },
  data: {
    active: false,
  },
  methods: {
    handleTap() {
      this.triggerEvent('select', this.data.hub);
    },
    handleTouchStart() {
      this.setData({
        active: true,
      });
    },
    handleTouchEnd() {
      setTimeout(() => {
        this.setData({
          active: false,
        });
      }, 420);
    },
  },
});
