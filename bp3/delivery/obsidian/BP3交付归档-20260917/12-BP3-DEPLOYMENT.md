# 虚拟乌托邦 BP3 本地部署

## 依赖

- Node.js 22或更高版本
- 已安装BP3父工作区依赖：`H:\BP2\bp3\node_modules`
- Phase5身份服务：`http://localhost:3300`
- 可用的UDP/TCP端口范围供mediasoup使用

## 启动顺序

1. Phase5身份服务
2. M1后端`3500`
3. M1前端`5176`
4. M2后端`3511`
5. M2前端`5177`
6. M3后端`3521`
7. M3前端`5187`

## M1

```powershell
cd H:\BP2\bp3
node backend/src/server.js
node node_modules\vite\bin\vite.js --config frontend\vite.config.js
```

## M2

```powershell
cd H:\BP2\bp3\p1
node backend/src/server.js
node ..\node_modules\vite\bin\vite.js --config frontend\vite.config.js
```

## M3

```powershell
cd H:\BP2\bp3\p2
node backend/src/server.js
node ..\node_modules\vite\bin\vite.js --config frontend\vite.config.js
```

## 生产注意事项

- 使用正式Phase5密钥和Bearer Token签名配置。
- mediasoup必须配置公网`announcedAddress`和可访问的RTC端口范围。
- 生产环境建议增加TURN中继、HTTPS和反向代理。
- SQLite适合单机验收；高并发部署应评估PostgreSQL。
- 不把真实密钥和Token写入仓库。

---

[[虚拟乌托邦-BP3交付归档|返回BP3交付索引]]

BP3归档层级：BP3
