# 虚拟乌托邦 -> Obsidian 一键同步脚本
# 用法：powershell -ExecutionPolicy Bypass -File H:\BP2\scripts\sync-obsidian.ps1
# 作用：把项目最新记忆/设计文档复制到 Obsidian 库 F:\2026\KIN\虚拟乌托邦，供 MOC 索引链接

$ErrorActionPreference = 'Stop'
$src = 'H:\BP2'
$dst = 'F:\2026\KIN\虚拟乌托邦'

# 源文件(相对 H:\BP2) -> Obsidian 文件名
$map = [ordered]@{
  'memory-core.md'        = '项目记忆·核心.md'
  'memory-log.md'         = '项目记忆·迭代日志.md'
  'memory-modules.md'     = '项目记忆·模块.md'
  'DESIGN.md'             = '设计文档.md'
  'README.md'             = 'README（仓库门面）.md'
  'docs\ARCHITECTURE.md'  = '架构文档.md'
  'docs\API_REFERENCE.md' = 'API参考.md'
}

if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Force -Path $dst | Out-Null }

$ok = 0; $miss = @()
foreach ($k in $map.Keys) {
  $f = Join-Path $src $k
  if (Test-Path $f) {
    Copy-Item -LiteralPath $f -Destination (Join-Path $dst $map[$k]) -Force
    $ok++
  } else {
    $miss += $k
  }
}

Write-Host "[OK] 同步完成 $ok 个文档 -> $dst ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
if ($miss.Count -gt 0) { Write-Host "[WARN] 缺失源文件: $($miss -join ', ')" }