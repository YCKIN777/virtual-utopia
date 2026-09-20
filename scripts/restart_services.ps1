# 虚拟乌托邦 phase5 + phase6 统一重启脚本（访客名额模块验收环境）
# 用法：powershell -ExecutionPolicy Bypass -File H:\BP2\scripts\restart_services.ps1
$ErrorActionPreference = 'Stop'

$node = 'C:\Program Files\nodejs\node.exe'
$root = 'H:\BP2'

# ---- 统一凭证（本次重启起生效，与 backend/.env 同步） ----
$env:PHASE5_AUTH_SECRET = 'vu-phase5-auth-secret-2026'
$env:PHASE5_SERVICE_TOKEN = 'vu-phase5-service-token-2026'
$env:PHASE5_BOOTSTRAP_ADMIN_PASSWORD = 'admin2026pass'
$env:PHASE5_DB_PATH = 'H:\tmp\ma-v101-check\phase5.sqlite'
$env:PHASE6_AUDIT_DB_PATH = 'H:\tmp\ma-v101-check\phase6_audit.sqlite'
$env:PHASE6_QUOTA_DB_PATH = 'H:\BP2\data\phase6_visitor_quota.sqlite'
$env:GUARD_RATE_MAX = '300'
$env:NODE_ENV = 'development'

# ---- 停止旧进程 ----
Write-Output 'Stopping existing phase5/phase6...'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'backend/src/phase5/server\.js|backend/src/phase6/server\.js' } |
  ForEach-Object {
    Write-Output ("  stop pid={0} {1}" -f $_.ProcessId, $_.CommandLine)
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
Start-Sleep -Seconds 2

# ---- 启动 phase5 ----
Write-Output 'Starting phase5 on :3300 ...'
$p5 = Start-Process -FilePath $node -ArgumentList 'backend/src/phase5/server.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput 'H:\tmp\ma-v101-check\phase5.log' -RedirectStandardError 'H:\tmp\ma-v101-check\phase5.err.log'
Write-Output ("  phase5 pid={0}" -f $p5.Id)

# ---- 启动 phase6 ----
Write-Output 'Starting phase6 on :3400 ...'
$p6 = Start-Process -FilePath $node -ArgumentList 'backend/src/phase6/server.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput 'H:\tmp\ma-v101-check\phase6.log' -RedirectStandardError 'H:\tmp\ma-v101-check\phase6.err.log'
Write-Output ("  phase6 pid={0}" -f $p6.Id)

Start-Sleep -Seconds 3
Write-Output 'Done. Checking health...'
