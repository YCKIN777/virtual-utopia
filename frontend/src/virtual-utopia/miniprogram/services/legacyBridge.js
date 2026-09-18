const invokeLegacy = (methodName, payload) => {
  const app = getApp();
  const module = app?.globalData?.legacyModules?.[methodName];

  if (typeof module === 'function') {
    return module(payload);
  }

  const page =
    methodName === 'openCenterActivity'
      ? app?.globalData?.legacyPages?.center
      : app?.globalData?.legacyPages?.siteDetail;

  if (page) {
    const query = payload.siteId
      ? `?siteId=${encodeURIComponent(payload.siteId)}`
      : '';
    wx.navigateTo({
      url: `${page}${query}`,
    });
    return true;
  }

  wx.showModal({
    title: '业务模块未注入',
    content: '请在 app.globalData.legacyModules 中挂载原有活动或场地详情方法。',
    showCancel: false,
  });
  return false;
};

module.exports = {
  openCenter(payload) {
    return invokeLegacy('openCenterActivity', payload);
  },
  openPod(pod) {
    return invokeLegacy('openVenueDetail', {
      siteId: pod.id,
      siteNumber: pod.number,
      status: pod.status,
    });
  },
};
