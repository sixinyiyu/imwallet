<#
.SYNOPSIS
  imwallet 本地开发环境管理工具

.DESCRIPTION
  一键启动/停止本地开发环境（Server + Mobile Web）
  自动使用 .env 本地配置，连接本地 PostgreSQL

.EXAMPLE
  .\scripts\local.ps1          # 启动全部（server + mobile）
  .\scripts\local.ps1 start    # 同上
  .\scripts\local.ps1 server   # 仅启动 server
  .\scripts\local.ps1 mobile   # 仅启动 mobile web
  .\scripts\local.ps1 stop     # 停止全部
  .\scripts\local.ps1 status   # 查看运行状态
#>

param(
  [ValidateSet("start", "server", "mobile", "stop", "status", "")]
  [string]$Action = "start"
)

$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = $PSScriptRoot | Split-Path -Parent
$PidDir = Join-Path $ProjectRoot ".pids"

function Ensure-PidDir {
  if (!(Test-Path $PidDir)) { New-Item -ItemType Directory -Path $PidDir -Force | Out-Null }
}

function Get-ServerPid {
  $f = Join-Path $PidDir "server.pid"
  if (Test-Path $f) { return (Get-Content $f -Raw).Trim() }
  return $null
}

function Get-MobilePid {
  $f = Join-Path $PidDir "mobile.pid"
  if (Test-Path $f) { return (Get-Content $f -Raw).Trim() }
  return $null
}

function Is-ProcessRunning {
  param([string]$Pid)
  if (!$Pid) { return $false }
  try { Get-Process -Id $Pid -ErrorAction Stop | Out-Null; return $true } catch { return $false }
}

function Kill-ByPort {
  param([int]$Port)
  $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  if ($conns) {
    $pids = $conns.OwningProcess | Select-Object -Unique
    foreach ($p in $pids) {
      try {
        Stop-Process -Id $p -Force -ErrorAction Stop
        Write-Host "  ✋ 已终止端口 $Port 上的进程 PID=$p" -ForegroundColor Yellow
      } catch {}
    }
  }
}

function Wait-ForPort {
  param([int]$Port, [int]$TimeoutMs = 10000)
  $start = Get-Date
  while (((Get-Date) - $start).TotalMilliseconds -lt $TimeoutMs) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) { return $true }
    Start-Sleep -Milliseconds 300
  }
  return $false
}

# ─── START SERVER ───
function Start-Server {
  $existingPid = Get-ServerPid
  if ($existingPid -and (Is-ProcessRunning $existingPid)) {
    Write-Host "  ⏭  Server 已在运行 (PID=$existingPid, http://localhost:3000)" -ForegroundColor Cyan
    return
  }

  # Kill any leftover process on port 3000
  Kill-ByPort 3000
  Start-Sleep -Seconds 1

  Write-Host "  🚀 启动 Server (http://localhost:3000) ..." -ForegroundColor Green

  $envFile = Join-Path $ProjectRoot "apps\server\.env"
  if (!(Test-Path $envFile)) {
    Write-Host "  ❌ 缺少 apps/server/.env，请先创建" -ForegroundColor Red
    return
  }

  # Start server in background
  $proc = Start-Process -FilePath "pwsh" `
    -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot\apps\server'; npm run dev" `
    -WindowStyle Hidden `
    -PassThru

  Ensure-PidDir
  $proc.Id | Set-Content (Join-Path $PidDir "server.pid")

  # Wait for server to be ready
  if (Wait-ForPort 3000) {
    Write-Host "  ✅ Server 已就绪 (PID=$($proc.Id))" -ForegroundColor Green
  } else {
    Write-Host "  ⚠️  Server 启动超时，请检查日志" -ForegroundColor Yellow
  }
}

# ─── START MOBILE ───
function Start-Mobile {
  $existingPid = Get-MobilePid
  if ($existingPid -and (Is-ProcessRunning $existingPid)) {
    Write-Host "  ⏭  Mobile Web 已在运行 (PID=$existingPid, http://localhost:8081)" -ForegroundColor Cyan
    return
  }

  # Kill any leftover process on port 8081
  Kill-ByPort 8081
  Start-Sleep -Seconds 1

  Write-Host "  📱 启动 Mobile Web (http://localhost:8081) ..." -ForegroundColor Green

  $envFile = Join-Path $ProjectRoot "apps\mobile\.env"
  if (!(Test-Path $envFile)) {
    Write-Host "  ⚠️  缺少 apps/mobile/.env，将使用 app.json 中的默认 API URL" -ForegroundColor Yellow
  }

  # Start mobile in background
  $proc = Start-Process -FilePath "pwsh" `
    -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot\apps\mobile'; npx expo start --clear" `
    -WindowStyle Hidden `
    -PassThru

  Ensure-PidDir
  $proc.Id | Set-Content (Join-Path $PidDir "mobile.pid")

  # Wait for Metro to be ready
  if (Wait-ForPort 8081 30000) {
    Write-Host "  ✅ Mobile Web 已就绪 (PID=$($proc.Id))" -ForegroundColor Green
  } else {
    Write-Host "  ⚠️  Mobile Web 启动超时，请检查日志" -ForegroundColor Yellow
  }
}

# ─── STOP ALL ───
function Stop-All {
  Write-Host "  🛑 停止所有服务 ..." -ForegroundColor Yellow

  # Stop by PID files
  $serverPid = Get-ServerPid
  $mobilePid = Get-MobilePid

  if ($serverPid -and (Is-ProcessRunning $serverPid)) {
    Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
    Write-Host "  ✋ Server 已停止 (PID=$serverPid)" -ForegroundColor Yellow
  }
  if ($mobilePid -and (Is-ProcessRunning $mobilePid)) {
    Stop-Process -Id $mobilePid -Force -ErrorAction SilentlyContinue
    Write-Host "  ✋ Mobile 已停止 (PID=$mobilePid)" -ForegroundColor Yellow
  }

  # Also kill by port as fallback
  Kill-ByPort 3000
  Kill-ByPort 8081

  # Clean PID files
  Remove-Item (Join-Path $PidDir "*.pid") -Force -ErrorAction SilentlyContinue
  Write-Host "  ✅ 所有服务已停止" -ForegroundColor Green
}

# ─── STATUS ───
function Show-Status {
  Write-Host ""
  Write-Host "  imwallet 本地环境状态" -ForegroundColor White
  Write-Host "  ─────────────────────" -ForegroundColor Gray

  # Server
  $serverPid = Get-ServerPid
  $serverRunning = $serverPid -and (Is-ProcessRunning $serverPid)
  $serverPort = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($serverRunning -or $serverPort) {
    $pid = if ($serverRunning) { $serverPid } else { $serverPort.OwningProcess | Select-Object -First 1 }
    Write-Host "  Server:  ✅ 运行中  PID=$pid  http://localhost:3000" -ForegroundColor Green
  } else {
    Write-Host "  Server:  ❌ 未运行" -ForegroundColor Red
  }

  # Mobile
  $mobilePid = Get-MobilePid
  $mobileRunning = $mobilePid -and (Is-ProcessRunning $mobilePid)
  $mobilePort = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
  if ($mobileRunning -or $mobilePort) {
    $pid = if ($mobileRunning) { $mobilePid } else { $mobilePort.OwningProcess | Select-Object -First 1 }
    Write-Host "  Mobile:  ✅ 运行中  PID=$pid  http://localhost:8081" -ForegroundColor Green
  } else {
    Write-Host "  Mobile:  ❌ 未运行" -ForegroundColor Red
  }

  # Database
  $pg = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' }
  if ($pg) {
    Write-Host "  DB:      ✅ PostgreSQL 运行中" -ForegroundColor Green
  } else {
    Write-Host "  DB:      ❌ PostgreSQL 未运行" -ForegroundColor Red
  }

  # Config
  $mobileEnv = Join-Path $ProjectRoot "apps\mobile\.env"
  $serverEnv = Join-Path $ProjectRoot "apps\server\.env"
  Write-Host ""
  Write-Host "  配置文件:" -ForegroundColor Gray
  Write-Host "    Server .env:  $(if (Test-Path $serverEnv) { '✅ 存在' } else { '❌ 缺失' })" -ForegroundColor $(if (Test-Path $serverEnv) { 'Green' } else { 'Red' })
  Write-Host "    Mobile .env:  $(if (Test-Path $mobileEnv) { '✅ 存在' } else { '❌ 缺失' })" -ForegroundColor $(if (Test-Path $mobileEnv) { 'Green' } else { 'Red' })

  if (Test-Path $mobileEnv) {
    $apiUrl = (Get-Content $mobileEnv | Where-Object { $_ -match 'EXPO_PUBLIC_API_URL' }) -replace '.*=', ''
    Write-Host "    API URL:      $apiUrl" -ForegroundColor Cyan
  }
  Write-Host ""
}

# ─── MAIN ───
Write-Host ""
Write-Host "  ╔══════════════════════════════╗" -ForegroundColor Blue
Write-Host "  ║   imwallet 本地开发环境      ║" -ForegroundColor Blue
Write-Host "  ╚══════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

switch ($Action) {
  { $_ -in "start", "" } {
    Start-Server
    Start-Mobile
    Write-Host ""
    Write-Host "  🎉 本地环境已启动！浏览器访问 http://localhost:8081" -ForegroundColor Green
    Write-Host ""
  }
  "server" {
    Start-Server
    Write-Host ""
  }
  "mobile" {
    Start-Mobile
    Write-Host ""
  }
  "stop" {
    Stop-All
    Write-Host ""
  }
  "status" {
    Show-Status
  }
}