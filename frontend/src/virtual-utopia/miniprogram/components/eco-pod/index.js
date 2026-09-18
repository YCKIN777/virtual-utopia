const STATUS_LABELS = {
  free: '空闲',
  booked: '已预约',
  active: '活动中',
};

Component({
  properties: {
    item: {
      type: Object,
      value: {},
    },
  },
  data: {
    active: false,
    statusLabel: '',
  },
  observers: {
    'item.status': function (status) {
      this.setData({
        statusLabel: STATUS_LABELS[status] || '未知',
      });
    },
  },
  lifetimes: {
    attached() {
      this.setData({
        statusLabel: STATUS_LABELS[this.data.item.status] || '未知',
      });
    },
  },
  methods: {
    handleTap() {
      this.triggerEvent('select', this.data.item);
    },
    handleTouchStart() {
      this.setData({
        active: true,
      });
      this.triggerEvent('highlight', {
        id: this.data.item.id,
        active: true,
      });
    },
    handleTouchEnd() {
      setTimeout(() => {
        this.setData({
          active: false,
        });
        this.triggerEvent('highlight', {
          id: this.data.item.id,
          active: false,
        });
      }, 600);
    },
    handleLongPress() {
      this.setData({
        active: true,
      });
      wx.vibrateShort({
        type: 'light',
      });
    },
  },
});
