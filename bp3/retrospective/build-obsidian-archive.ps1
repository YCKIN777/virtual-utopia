$ErrorActionPreference = 'Stop'

$sourceRoot = [IO.Path]::GetFullPath('H:\BP2\bp3\retrospective')
$obsidianRoot = Join-Path $sourceRoot 'obsidian'
$archiveRoot = Join-Path $obsidianRoot 'BP1-BP3全项目复盘-20260917'
$utf8NoBom = [Text.UTF8Encoding]::new($false)

if (Test-Path -LiteralPath $obsidianRoot) {
  $resolved = [IO.Path]::GetFullPath($obsidianRoot)

  if (
    -not $resolved.StartsWith(
      $sourceRoot.TrimEnd('\') + '\',
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "Obsidian staging path is outside retrospective root: $resolved"
  }

  Remove-Item -LiteralPath $resolved -Recurse -Force
}

New-Item -ItemType Directory -Path $archiveRoot -Force |
  Out-Null

$documents = @(
  @{
    Source = Join-Path $sourceRoot 'README.md'
    ExportName = '00-BP1-BP3-复盘索引.md'
    Title = '复盘索引'
  },
  @{
    Source = Join-Path $sourceRoot 'BP1-BP3-PROJECT-OVERVIEW.md'
    ExportName = '10-BP1-BP3-项目全景总览.md'
    Title = '项目全景总览'
  },
  @{
    Source = Join-Path $sourceRoot 'BP1-BP3-RETROSPECTIVE.md'
    ExportName = '11-BP1-BP3-全周期复盘.md'
    Title = '全周期复盘'
  }
)

foreach ($document in $documents) {
  $sourceText = [IO.File]::ReadAllText(
    $document.Source,
    [Text.Encoding]::UTF8
  )
  $obsidianText = @"
$sourceText

---

[[虚拟乌托邦-BP1-BP3全项目复盘|返回全项目复盘索引]]
"@
  [IO.File]::WriteAllText(
    (Join-Path $archiveRoot $document.ExportName),
    $obsidianText,
    $utf8NoBom
  )
}

$indexLines = @(
  '# 虚拟乌托邦-BP1-BP3全项目复盘',
  '',
  '## 复盘范围',
  '',
  '- BP1：基础工程、HIG组件、等轴测地图和六场景。',
  '- BP2：分支Agent、RAG、Phase5持久化、Phase6网关和3D家园。',
  '- BP3：语音权限、事件任务背包、Avatar动作与留言板。',
  '',
  '## 复盘文档',
  '',
  '- [[BP1-BP3全项目复盘-20260917/00-BP1-BP3-复盘索引|复盘索引]]',
  '- [[BP1-BP3全项目复盘-20260917/10-BP1-BP3-项目全景总览|项目全景总览]]',
  '- [[BP1-BP3全项目复盘-20260917/11-BP1-BP3-全周期复盘|全周期复盘]]',
  '',
  '## 历史版本关联',
  '',
  '- [[00-项目总览|BP1项目总览]]',
  '- [[ACCEPTANCE_REPORT|BP1阶段一验收报告]]',
  '- [[stage2_memory|阶段二Agent与会话记忆]]',
  '- [[stage3_memory|阶段三RAG知识库]]',
  '- [[stage4_memory|阶段四RAG增强Agent]]',
  '- [[stage5_memory|阶段五至BP3全链路记忆]]',
  '- [[虚拟乌托邦-BP2交付归档|BP2-V1.1交付归档]]',
  '- [[虚拟乌托邦-BP3交付归档|BP3最终交付归档]]',
  '- [[虚拟乌托邦-BP3-BP2关联说明|BP3与BP2归档关联说明]]',
  '',
  '## 冻结说明',
  '',
  '- 本复盘为新增知识文档，不修改BP1、BP2、BP3源码与交付物。',
  '- 复盘只记录成果、经验、技术债和后续建议。'
)

[IO.File]::WriteAllText(
  (Join-Path $obsidianRoot '虚拟乌托邦-BP1-BP3全项目复盘.md'),
  ($indexLines -join "`n") + "`n",
  $utf8NoBom
)

[pscustomobject]@{
  index = Join-Path $obsidianRoot '虚拟乌托邦-BP1-BP3全项目复盘.md'
  archive = $archiveRoot
  documentCount = $documents.Count
} | ConvertTo-Json -Depth 4
