# BP3 交付包校验清单

## 交付信息

- 项目：虚拟乌托邦 BP3
- 版本：BP3 M1 + M2 + M3
- 归档日期：2026-09-17
- 交付包：virtual-utopia-bp3-delivery-20260917-v1.0.zip
- SHA256：1237DFC822BE7DC50F94F333AB1F6B308224907E37501AA544C64FED7656CA9C
- 打包文件数量：101
- Markdown数量：9

## 包内容

- M1后端、前端源码和测试
- M2后端、前端源码和测试
- M3后端、前端源码、测试和文档
- BP3全部项目Markdown导出
- 桌面、移动端验收截图
- package.json、package-lock.json和环境变量模板

## 打包排除

- `node_modules`
- `dist`
- 运行时SQLite、SHM和WAL文件
- 临时日志和缓存

## Obsidian归档

- 索引：`虚拟乌托邦-BP3交付归档.md`
- 文档目录：`BP3交付归档-20260917/`
- BP2关联说明：`虚拟乌托邦-BP3-BP2关联说明.md`
- 归档Markdown数量：9
- 每份归档文档均包含返回BP3索引的内部链接。

## 校验命令

```powershell
Get-FileHash -Algorithm SHA256 'H:\BP2\bp3\delivery\virtual-utopia-bp3-delivery-20260917-v1.0.zip'
Get-Content 'H:\BP2\bp3\delivery\virtual-utopia-bp3-delivery-20260917-v1.0.zip.sha256'
```

## 自检

- BP2源码与归档未修改。
- M1、M2、M3源码和Markdown完整。
- 全部Markdown为UTF-8无BOM。
- SHA256与交付包一致。
- Obsidian新增BP3归档索引和双向链接副本。
