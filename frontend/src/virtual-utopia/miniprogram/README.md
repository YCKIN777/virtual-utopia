# 微信小程序地图模块

该目录是独立的小程序地图展示模块，不修改现有后端、数据库或预约业务代码。

宿主小程序在启动时将原有业务方法注入 `app.globalData.legacyModules`：

```js
App({
  globalData: {
    legacyModules: {
      openCenterActivity(payload) {
        // 调用原有中心广场活动/社群/发布逻辑
      },
      openVenueDetail({ siteId }) {
        // 调用原有场地详情、预约、相册、评价弹窗
      },
    },
  },
});
```

地图页面固定使用 50 个 `plot-*` 场地 ID。中心节点通过
`openCenterActivity` 打开，栖息舱通过 `openVenueDetail` 打开。

如果宿主已有页面路径，也可以配置：

```js
globalData: {
  legacyPages: {
    center: '/pages/activity/index',
    siteDetail: '/pages/site/detail'
  }
}
```

日间、夜间、地形和木构连廊图片位于 `assets/`，采用 WebP 压缩。
