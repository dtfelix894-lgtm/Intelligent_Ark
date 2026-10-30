# 智伴方舟
#
# 作用：一键启动后端（FastAPI）和前端（Next.js），就绪后用系统默认浏览器打开页面。
#
# 用法（不需要先 cd 到项目目录）：
#   1. 双击同目录的「智伴方舟.bat」
#   2. 或在任意目录执行：
#        powershell -NoProfile -ExecutionPolicy Bypass -File "本文件的完整路径"
#
# 默认端口：后端 8001，前端 3000。
# 端口冲突：若占用者是本项目上次留下的 uvicorn / next，则结束该进程并复用端口；
#           若被其他程序占用，则从默认端口往上找下一个空闲端口（最多再试 20 个）。
#           后端改端口时，前端会通过 API_UPSTREAM 连到新端口。
# 停止服务：关掉标题为「智伴方舟-后端」「智伴方舟-前端」的两个窗口。
#           本脚本在浏览器打开后就会退出，关掉它不会停服务。

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# 无论从哪里调用，都切到脚本所在的项目根目录
$Root = $PSScriptRoot
if (-not $Root) {
    $Root = Split-Path -Parent $MyInvocation.MyCommand.Path
}
Set-Location -LiteralPath $Root

$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$PreferredBackendPort = 8001
$PreferredFrontendPort = 3000

function Get-ListenPids {
    param([int]$Port)
    @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -gt 4 })
}

function Get-ProcessCommandLine {
    param([int]$ProcessId)
    if ($ProcessId -le 4) { return "" }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if (-not $proc) { return "" }
    return [string]$proc.CommandLine
}

function Test-ProjectProcess {
    param([int]$ProcessId)
    $current = $ProcessId
    for ($i = 0; $i -lt 8 -and $current -gt 4; $i++) {
        $cmd = Get-ProcessCommandLine $current
        if ($cmd -match [regex]::Escape($Root) -and $cmd -match "uvicorn|next(\.js)?|npm") {
            return $true
        }
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
        if (-not $proc) { break }
        $current = [int]$proc.ParentProcessId
    }
    return $false
}

function Stop-ProjectListener {
    param([int]$Port)
    $pids = @(Get-ListenPids $Port)
    if ($pids.Count -eq 0) { return $true }
    foreach ($procId in $pids) {
        if (-not (Test-ProjectProcess $procId)) {
            return $false
        }
        $killId = $procId
        $current = $procId
        for ($i = 0; $i -lt 8; $i++) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
            if (-not $proc) { break }
            $parent = [int]$proc.ParentProcessId
            $parentCmd = Get-ProcessCommandLine $parent
            if ($parent -gt 4 -and $parentCmd -match "Intelligent_Ark|uvicorn|next|npm") {
                $killId = $parent
                $current = $parent
            } else {
                break
            }
        }
        Write-Host "端口 $Port 被本项目进程 $killId 占用，正在结束并复用。"
        & taskkill.exe /F /T /PID $killId | Out-Null
    }
    Start-Sleep -Seconds 1
    return ((@(Get-ListenPids $Port)).Count -eq 0)
}

function Resolve-Port {
    param(
        [int]$Preferred,
        [int]$Attempts = 21
    )
    for ($offset = 0; $offset -lt $Attempts; $offset++) {
        $port = $Preferred + $offset
        $listeners = @(Get-ListenPids $port)
        if ($listeners.Count -eq 0) {
            if ($offset -gt 0) {
                Write-Host "端口 $Preferred 被其他程序占用，改用 $port。"
            }
            return $port
        }
        if (Stop-ProjectListener $port) {
            if ((@(Get-ListenPids $port)).Count -eq 0) {
                return $port
            }
        }
    }
    throw "从 $Preferred 起连续 $Attempts 个端口都无法使用。"
}

function Wait-HttpOk {
    param(
        [string]$Url,
        [int]$TimeoutSec
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        } catch {
            $code = $null
            if ($_.Exception.Response) {
                $code = [int]$_.Exception.Response.StatusCode
            }
            if ($code -ge 200 -and $code -lt 500) {
                return $true
            }
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Start-Console {
    param(
        [string]$Title,
        [string]$WorkDir,
        [string]$Command
    )
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.Arguments = "/k title $Title & $Command"
    $psi.WorkingDirectory = $WorkDir
    $psi.UseShellExecute = $true
    [void][System.Diagnostics.Process]::Start($psi)
}

if (-not (Test-Path -LiteralPath (Join-Path $BackendDir "main.py"))) {
    throw "未找到 backend\main.py。请把本脚本放在智伴方舟项目根目录。"
}
if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "package.json"))) {
    throw "未找到 frontend\package.json。请把本脚本放在智伴方舟项目根目录。"
}

$python = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
if (-not $python) {
    throw "未找到 python.exe。请先安装 Python 3.12 并加入 PATH。"
}
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) {
    throw "未找到 npm.cmd。请先安装 Node.js 并加入 PATH。"
}

Write-Host "项目目录：$Root"
& $python -c "import uvicorn" 
if ($LASTEXITCODE -ne 0) {
    throw "当前 Python 没有 uvicorn。请在 backend 目录执行：python -m pip install -r requirements.txt"
}
if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "node_modules"))) {
    throw "frontend\node_modules 不存在。请先在 frontend 目录执行：npm install"
}

$backendPort = Resolve-Port $PreferredBackendPort
$frontendPort = Resolve-Port $PreferredFrontendPort
$backendUrl = "http://127.0.0.1:$backendPort"
$frontendUrl = "http://127.0.0.1:$frontendPort"

Write-Host "启动后端 $backendUrl"
Start-Console "智伴方舟-后端" $BackendDir "`"$python`" -m uvicorn main:app --reload --host 0.0.0.0 --port $backendPort"

Write-Host "启动前端 $frontendUrl （API_UPSTREAM=$backendUrl）"
$frontendCmd = "set API_UPSTREAM=$backendUrl&& call `"$npm`" run dev -- -H 0.0.0.0 -p $frontendPort"
Start-Console "智伴方舟-前端" $FrontendDir $frontendCmd

Write-Host "等待后端就绪..."
if (-not (Wait-HttpOk "$backendUrl/health" 60)) {
    throw "后端在 60 秒内没有响应 $backendUrl/health 。请查看「智伴方舟-后端」窗口里的报错。"
}
Write-Host "等待前端就绪..."
if (-not (Wait-HttpOk $frontendUrl 150)) {
    throw "前端在 150 秒内没有响应 $frontendUrl 。请查看「智伴方舟-前端」窗口里的报错。"
}

Start-Process $frontendUrl
Write-Host "已打开浏览器：$frontendUrl"
Write-Host "后端健康检查：$backendUrl/health"
Write-Host "停止服务请关闭「智伴方舟-后端」和「智伴方舟-前端」窗口。"
exit 0
