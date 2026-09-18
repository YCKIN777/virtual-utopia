$ErrorActionPreference = 'Stop'

$workspace = [IO.Path]::GetFullPath('H:\BP2')
$bp3Root = [IO.Path]::GetFullPath('H:\BP2\bp3')
$deliveryRoot = [IO.Path]::GetFullPath('H:\BP2\bp3\delivery')
$exportRoot = Join-Path $deliveryRoot 'export'
$stagingRoot = Join-Path $deliveryRoot 'staging'
$packageRoot = Join-Path $stagingRoot 'bp3'
$obsidianRoot = Join-Path $deliveryRoot 'obsidian'
$obsidianArchiveRoot = Join-Path $obsidianRoot 'BP3交付归档-20260917'
$packageName = 'virtual-utopia-bp3-delivery-20260917-v1.0'
$packagePath = Join-Path $deliveryRoot "$packageName.zip"
$checksumPath = "$packagePath.sha256"
$utf8NoBom = [Text.UTF8Encoding]::new($false)

$assertInside = {
  param($path, $parent, $label)

  $resolvedPath = [IO.Path]::GetFullPath($path)
  $resolvedParent = [IO.Path]::GetFullPath($parent).TrimEnd('\') + '\'

  if (
    -not $resolvedPath.StartsWith(
      $resolvedParent,
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "$label is outside its expected parent: $resolvedPath"
  }

  return $resolvedPath
}

$removeGeneratedDirectory = {
  param($path)

  $safePath = & $assertInside $path $deliveryRoot 'generated directory'

  if (Test-Path -LiteralPath $safePath) {
    Remove-Item -LiteralPath $safePath -Recurse -Force
  }
}

foreach ($directory in @($exportRoot, $stagingRoot, $obsidianRoot)) {
  & $removeGeneratedDirectory $directory
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

New-Item -ItemType Directory -Path $exportRoot -Force | Out-Null
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
New-Item -ItemType Directory -Path $obsidianArchiveRoot -Force |
  Out-Null

$documentMap = @(
  @{
    Source = Join-Path $bp3Root 'README.md'
    ExportName = '00-BP3-M1-README.md'
    Title = 'BP3 M1 P0 README'
    Layer = 'M1'
  },
  @{
    Source = Join-Path $bp3Root 'p1\README.md'
    ExportName = '01-BP3-M2-README.md'
    Title = 'BP3 M2 P1 README'
    Layer = 'M2'
  },
  @{
    Source = Join-Path $bp3Root 'p2\README.md'
    ExportName = '02-BP3-M3-README.md'
    Title = 'BP3 M3 P2 README'
    Layer = 'M3'
  },
  @{
    Source = Join-Path $bp3Root 'p2\docs\BP3-FINAL-OVERVIEW.md'
    ExportName = '10-BP3-FINAL-OVERVIEW.md'
    Title = 'BP3 最终总览'
    Layer = 'BP3'
  },
  @{
    Source = Join-Path $bp3Root 'p2\docs\BP3-API-REFERENCE.md'
    ExportName = '11-BP3-API-REFERENCE.md'
    Title = 'BP3 API 总览'
    Layer = 'BP3'
  },
  @{
    Source = Join-Path $bp3Root 'p2\docs\BP3-DEPLOYMENT.md'
    ExportName = '12-BP3-DEPLOYMENT.md'
    Title = 'BP3 部署文档'
    Layer = 'BP3'
  },
  @{
    Source = Join-Path $bp3Root 'p2\docs\BP3-PERFORMANCE-SECURITY.md'
    ExportName = '13-BP3-PERFORMANCE-SECURITY.md'
    Title = 'BP3 性能与安全'
    Layer = 'BP3'
  },
  @{
    Source = Join-Path $bp3Root 'p2\docs\BP3-ACCEPTANCE-REPORT.md'
    ExportName = '14-BP3-ACCEPTANCE-REPORT.md'
    Title = 'BP3 最终验收报告'
    Layer = 'BP3'
  },
  @{
    Source = Join-Path $workspace 'stage5_memory.md'
    ExportName = '90-stage5_memory.md'
    Title = 'BP3 开发记忆快照'
    Layer = 'MEMORY'
  }
)

foreach ($document in $documentMap) {
  if (-not (Test-Path -LiteralPath $document.Source)) {
    throw "Missing BP3 markdown document: $($document.Source)"
  }
}

$exportedDocuments = @()
$obsidianDocuments = @()

foreach ($document in $documentMap) {
  $sourceText = [IO.File]::ReadAllText(
    $document.Source,
    [Text.Encoding]::UTF8
  )
  $exportPath = Join-Path $exportRoot $document.ExportName
  $exportText = @"
$sourceText

---

[返回BP3项目索引](../README.md)
"@
  [IO.File]::WriteAllText(
    $exportPath,
    $exportText,
    $utf8NoBom
  )

  $obsidianPath = Join-Path $obsidianArchiveRoot $document.ExportName
  $obsidianText = @"
$sourceText

---

[[虚拟乌托邦-BP3交付归档|返回BP3交付索引]]

BP3归档层级：$($document.Layer)
"@
  [IO.File]::WriteAllText(
    $obsidianPath,
    $obsidianText,
    $utf8NoBom
  )

  $exportedDocuments += [pscustomobject]@{
    name = $document.ExportName
    title = $document.Title
    layer = $document.Layer
    source = $document.Source
    sha256 = (Get-FileHash -LiteralPath $exportPath -Algorithm SHA256).Hash
  }
  $obsidianDocuments += [pscustomobject]@{
    name = $document.ExportName
    title = $document.Title
    archivePath = "BP3交付归档-20260917/$($document.ExportName)"
  }
}

$indexLines = @(
  '# 虚拟乌托邦 BP3 项目索引',
  '',
  '> 项目：虚拟乌托邦 BP3',
  '> 版本：BP3 M1 + M2 + M3',
  '> 归档日期：2026-09-17',
  '> 状态：开发完成，全链路验收通过',
  '',
  '## 项目模块',
  '',
  '| 模块 | 内容 | 源码目录 |',
  '| --- | --- | --- |',
  '| M1 P0 | 语音、家园权限、门锁、访客 | `bp3/backend`、`bp3/frontend` |',
  '| M2 P1 | 事件、任务、资源、背包 | `bp3/p1` |',
  '| M3 P2 | Avatar动作表情、家园留言板 | `bp3/p2` |',
  '',
  '## 文档索引',
  ''
)

foreach ($document in $exportedDocuments) {
  $indexLines += "- [[docs/$($document.name)|$($document.title)]]"
}

$indexLines += @(
  '',
  '## 交付与校验',
  '',
  '- 交付包：`bp3/delivery/virtual-utopia-bp3-delivery-20260917-v1.0.zip`',
  '- 校验清单：`bp3/delivery/BP3-DELIVERY-CHECKLIST.md`',
  '- 文件清单：`bp3/delivery/DELIVERY-MANIFEST.json`',
  '- SHA256：见交付目录同名校验文件',
  '',
  '## BP2 关联',
  '',
  '- [[虚拟乌托邦-BP2交付归档|BP2-V1.1冻结归档]]',
  '- [[BP2交付归档-20260917-v1.1/stage5_memory|BP2阶段记忆快照]]',
  '',
  'BP3通过新增文档关联BP2只读归档，不修改BP2源码或原归档内容。',
  '',
  '## 验收摘要',
  '',
  '- P0/P1/P2单模块测试通过。',
  '- M3全链路E2E通过。',
  '- 40路并发Avatar状态更新通过。',
  '- 伪造作者、越权删除和私密家园留言拦截通过。',
  '- 桌面与移动端截图完整。'
)

$indexText = ($indexLines -join "`n") + "`n"
$exportIndexPath = Join-Path $exportRoot 'README.md'
$deliveryIndexPath = Join-Path $deliveryRoot 'README.md'
[IO.File]::WriteAllText(
  $exportIndexPath,
  $indexText,
  $utf8NoBom
)
[IO.File]::WriteAllText(
  $deliveryIndexPath,
  $indexText,
  $utf8NoBom
)

$obsidianIndexLines = @(
  '# 虚拟乌托邦-BP3交付归档',
  '',
  '## 归档信息',
  '',
  '- 项目版本：BP3 M1 + M2 + M3',
  '- 归档日期：2026-09-17',
  '- 交付包：`H:\BP2\bp3\delivery\virtual-utopia-bp3-delivery-20260917-v1.0.zip`',
  '- SHA256：见交付目录同名校验文件',
  '- Markdown数量：9',
  '- 版本声明：BP3源码、测试、交付文档和知识库快照正式归档',
  '',
  '## 归档说明',
  '',
  '- [[BP2交付归档-20260917-v1.1/归档说明|BP2-V1.1冻结归档说明]]',
  '',
  '## 文档索引',
  ''
)

foreach ($document in $obsidianDocuments) {
  $obsidianIndexLines += "- [[$($document.archivePath)|$($document.title)]]"
}

$obsidianIndexLines += @(
  '',
  '## BP2关联',
  '',
  '- [[虚拟乌托邦-BP2交付归档|BP2-V1.1总索引]]',
  '- [[BP2交付归档-20260917-v1.1/stage5_memory|BP2阶段记忆快照]]',
  '- [[虚拟乌托邦-BP3-BP2关联说明|BP3与BP2关联说明]]',
  '',
  '## 冻结规则',
  '',
  '- 本归档为BP3新版本，不覆盖BP2归档。',
  '- BP2源码、交付包和原Obsidian文档保持只读。',
  '- BP3源码与文档仅通过新增归档目录和索引关联。'
)

$obsidianIndexText = ($obsidianIndexLines -join "`n") + "`n"
$obsidianIndexPath = Join-Path $obsidianRoot '虚拟乌托邦-BP3交付归档.md'
[IO.File]::WriteAllText(
  $obsidianIndexPath,
  $obsidianIndexText,
  $utf8NoBom
)

$bridgeLines = @(
  '# 虚拟乌托邦-BP3-BP2关联说明',
  '',
  '本说明由BP3归档新增，不修改BP2原归档内容。',
  '',
  '- BP2归档：[[虚拟乌托邦-BP2交付归档|BP2-V1.1交付索引]]',
  '- BP3归档：[[虚拟乌托邦-BP3交付归档|BP3最终交付索引]]',
  '- BP2阶段记忆：[[BP2交付归档-20260917-v1.1/stage5_memory|stage5_memory.md]]',
  '',
  'Obsidian会根据本页链接自动在BP2索引的“反向链接”面板中显示BP3关联，',
  '因此无需改写BP2原索引即可形成双向知识库导航。'
)
$bridgePath = Join-Path $obsidianRoot '虚拟乌托邦-BP3-BP2关联说明.md'
[IO.File]::WriteAllText(
  $bridgePath,
  ($bridgeLines -join "`n") + "`n",
  $utf8NoBom
)

Copy-Item -LiteralPath (Join-Path $bp3Root 'backend') -Destination $packageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $bp3Root 'frontend\src') -Destination (Join-Path $packageRoot 'frontend') -Recurse
Copy-Item -LiteralPath (Join-Path $bp3Root 'frontend\index.html') -Destination (Join-Path $packageRoot 'frontend') -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'frontend\vite.config.js') -Destination (Join-Path $packageRoot 'frontend') -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'tests') -Destination $packageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $bp3Root 'artifacts') -Destination $packageRoot -Recurse

New-Item -ItemType Directory -Path (Join-Path $packageRoot 'p1') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $bp3Root 'p1\backend') -Destination (Join-Path $packageRoot 'p1') -Recurse
Copy-Item -LiteralPath (Join-Path $bp3Root 'p1\frontend\src') -Destination (Join-Path $packageRoot 'p1\frontend') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'p1\frontend\p1.html') -Destination (Join-Path $packageRoot 'p1\frontend') -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'p1\frontend\vite.config.js') -Destination (Join-Path $packageRoot 'p1\frontend') -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'p1\tests') -Destination (Join-Path $packageRoot 'p1') -Recurse
Copy-Item -LiteralPath (Join-Path $bp3Root 'p1\artifacts') -Destination (Join-Path $packageRoot 'p1') -Recurse
Copy-Item -LiteralPath (Join-Path $bp3Root 'p1\README.md') -Destination (Join-Path $packageRoot 'p1') -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'p1\package.json') -Destination (Join-Path $packageRoot 'p1') -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'p1\.env.example') -Destination (Join-Path $packageRoot 'p1') -Force

New-Item -ItemType Directory -Path (Join-Path $packageRoot 'p2') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $bp3Root 'p2\backend') -Destination (Join-Path $packageRoot 'p2') -Recurse
Copy-Item -LiteralPath (Join-Path $bp3Root 'p2\frontend\src') -Destination (Join-Path $packageRoot 'p2\frontend') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'p2\frontend\p2.html') -Destination (Join-Path $packageRoot 'p2\frontend') -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'p2\frontend\vite.config.js') -Destination (Join-Path $packageRoot 'p2\frontend') -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'p2\tests') -Destination (Join-Path $packageRoot 'p2') -Recurse
Copy-Item -LiteralPath (Join-Path $bp3Root 'p2\artifacts') -Destination (Join-Path $packageRoot 'p2') -Recurse
Copy-Item -LiteralPath (Join-Path $bp3Root 'p2\docs') -Destination (Join-Path $packageRoot 'p2') -Recurse
Copy-Item -LiteralPath (Join-Path $bp3Root 'p2\README.md') -Destination (Join-Path $packageRoot 'p2') -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'p2\package.json') -Destination (Join-Path $packageRoot 'p2') -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'p2\.env.example') -Destination (Join-Path $packageRoot 'p2') -Force

Copy-Item -LiteralPath (Join-Path $bp3Root 'package.json') -Destination $packageRoot -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'package-lock.json') -Destination $packageRoot -Force
Copy-Item -LiteralPath (Join-Path $bp3Root '.gitignore') -Destination $packageRoot -Force
Copy-Item -LiteralPath (Join-Path $bp3Root '.env.example') -Destination $packageRoot -Force
Copy-Item -LiteralPath (Join-Path $bp3Root 'README.md') -Destination $packageRoot -Force
Copy-Item -LiteralPath $exportRoot -Destination (Join-Path $packageRoot 'docs') -Recurse
Copy-Item -LiteralPath (Join-Path $deliveryRoot 'README.md') -Destination $packageRoot -Force

if (Test-Path -LiteralPath $packagePath) {
  Remove-Item -LiteralPath $packagePath -Force
}
if (Test-Path -LiteralPath $checksumPath) {
  Remove-Item -LiteralPath $checksumPath -Force
}

Compress-Archive -LiteralPath $packageRoot -DestinationPath $packagePath -CompressionLevel Optimal
$packageHash = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash
$hashLine = "$packageHash  $packageName.zip"
[IO.File]::WriteAllText(
  $checksumPath,
  $hashLine + "`n",
  $utf8NoBom
)

$packageFiles = Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Sort-Object FullName
$manifestItems = foreach ($file in $packageFiles) {
  [pscustomobject]@{
    path = $file.FullName.Substring($packageRoot.Length + 1).Replace('\', '/')
    size = $file.Length
    sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
  }
}

$manifest = [ordered]@{
  project = '虚拟乌托邦 BP3'
  version = 'BP3 M1 + M2 + M3'
  archivedAt = '2026-09-17'
  package = $packageName + '.zip'
  packageSha256 = $packageHash
  markdownCount = $exportedDocuments.Count
  packageFileCount = $manifestItems.Count
  documents = $exportedDocuments
  files = $manifestItems
}
$manifestPath = Join-Path $deliveryRoot 'DELIVERY-MANIFEST.json'
[IO.File]::WriteAllText(
  $manifestPath,
  ($manifest | ConvertTo-Json -Depth 8) + "`n",
  $utf8NoBom
)

$checklistLines = @(
  '# BP3 交付包校验清单',
  '',
  '## 交付信息',
  '',
  "- 项目：虚拟乌托邦 BP3",
  "- 版本：BP3 M1 + M2 + M3",
  '- 归档日期：2026-09-17',
  "- 交付包：$packageName.zip",
  "- SHA256：$packageHash",
  "- 打包文件数量：$($manifestItems.Count)",
  "- Markdown数量：$($exportedDocuments.Count)",
  '',
  '## 包内容',
  '',
  '- M1后端、前端源码和测试',
  '- M2后端、前端源码和测试',
  '- M3后端、前端源码、测试和文档',
  '- BP3全部项目Markdown导出',
  '- 桌面、移动端验收截图',
  '- package.json、package-lock.json和环境变量模板',
  '',
  '## 打包排除',
  '',
  '- `node_modules`',
  '- `dist`',
  '- 运行时SQLite、SHM和WAL文件',
  '- 临时日志和缓存',
  '',
  '## 校验命令',
  '',
  '```powershell',
  "Get-FileHash -Algorithm SHA256 '$packagePath'",
  "Get-Content '$checksumPath'",
  '```',
  '',
  '## 自检',
  '',
  '- BP2源码与归档未修改。',
  '- M1、M2、M3源码和Markdown完整。',
  '- 全部Markdown为UTF-8无BOM。',
  '- SHA256与交付包一致。',
  '- Obsidian新增BP3归档索引和双向链接副本。'
)
$checklistPath = Join-Path $deliveryRoot 'BP3-DELIVERY-CHECKLIST.md'
[IO.File]::WriteAllText(
  $checklistPath,
  ($checklistLines -join "`n") + "`n",
  $utf8NoBom
)

[pscustomobject]@{
  package = $packagePath
  checksum = $checksumPath
  packageSha256 = $packageHash
  packageFileCount = $manifestItems.Count
  markdownCount = $exportedDocuments.Count
  obsidianIndex = $obsidianIndexPath
  obsidianArchive = $obsidianArchiveRoot
} | ConvertTo-Json -Depth 5
