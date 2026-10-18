#requires -Version 5.1
<#
  爱芮余额挂件 · 一键安装脚本（DSH 桌面端 desktop profile）

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install-airui.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install-airui.ps1 -DryRun

  参数：
    -DryRun      只打印将要做的事，不改任何文件
    -NoStart     装完不自动启动 DSH
    -NoKill      检测到 DSH 正在运行时不自动结束，直接退出
    -NoVoice     不自动下载语音（默认会从公开数据集拉取 13 条，约 173MB）
    -ProfileDir  指定 profile 目录（默认 %USERPROFILE%\.dsh\profiles\desktop，测试用）
    -Tgz         指定安装包路径（默认脚本旁的 dist\dsh-whale-widget-airui-0.4.2-airui.6.tgz；
                 找不到时会自动从 GitHub 下载仓库并现场打包，方便别人一键安装）
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$NoStart,
  [switch]$NoKill,
  [switch]$NoVoice,
  [string]$ProfileDir,
  [string]$Tgz,
  [string]$PluginsDir
)

$ErrorActionPreference = 'Stop'
$PkgName = 'dsh-whale-widget-airui'
$RepoUrl = 'https://github.com/Yoimiya-lover/zzz-airui-whale-widget'
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$profile = if ($ProfileDir) { $ProfileDir } else { Join-Path $env:USERPROFILE '.dsh\profiles\desktop' }
$tgz = if ($Tgz) { $Tgz } else { Join-Path $scriptDir 'dist\dsh-whale-widget-airui-0.4.2-airui.6.tgz' }
$pluginsDir = if ($PluginsDir) { $PluginsDir } else { Join-Path $env:USERPROFILE '.dsh\plugins\dsh-whale-widget-airui' }

function Write-Step($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[X] $msg" -ForegroundColor Red }

function Find-Node {
  $c = @(
    (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'),
    (Join-Path ${env:ProgramFiles} 'nodejs\node.exe')
  )
  foreach ($p in $c) { if (Test-Path $p) { return $p } }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Find-Pnpm {
  $c = @(
    (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs')
  )
  foreach ($p in $c) { if (Test-Path $p) { return $p } }
  return $null
}

function Find-DshExe {
  $c = @(
    'D:\Deepseek_harness\DeepSeek Harness.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'),
    (Join-Path ${env:ProgramFiles} 'DeepSeek Harness\DeepSeek Harness.exe')
  )
  foreach ($p in $c) { if (Test-Path $p) { return $p } }
  $keys = @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($k in $keys) {
    try {
      $hit = Get-ItemProperty $k -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like '*DeepSeek Harness*' -and $_.InstallLocation } |
        Select-Object -First 1
      if ($hit) {
        $p = Join-Path $hit.InstallLocation 'DeepSeek Harness.exe'
        if (Test-Path $p) { return $p }
      }
    } catch {}
  }
  return $null
}

function Restore-Backup($pkgBak, $lockBak) {
  try {
    if ($pkgBak -and (Test-Path $pkgBak)) { Copy-Item $pkgBak (Join-Path $profile 'package.json') -Force }
    if ($lockBak -and (Test-Path $lockBak)) { Copy-Item $lockBak (Join-Path $profile 'pnpm-lock.yaml') -Force }
    Write-Warn2 '已还原安装前的 package.json / pnpm-lock.yaml。'
  } catch {
    Write-Err ('还原备份失败：' + $_.Exception.Message)
  }
}

# 前端是否真的跑起来了：Chromium 的 localStorage（leveldb）里会出现 dshw-pos
function Test-FrontendRan {
  $dir = Join-Path $env:APPDATA '@deepseek-ai\dsh-desktop\Local Storage\leveldb'
  if (-not (Test-Path $dir)) { return $null }
  try {
    foreach ($f in Get-ChildItem $dir -File -ErrorAction SilentlyContinue) {
      if ($f.Length -gt 20MB) { continue }
      $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
      if ([System.Text.Encoding]::ASCII.GetString($bytes).Contains('dshw-pos')) { return $true }
      if ([System.Text.Encoding]::Unicode.GetString($bytes).Contains('dshw-pos')) { return $true }
    }
  } catch {}
  return $false
}

# ---------- 1. 预检 ----------
Write-Host ''
Write-Host '=== 爱芮余额挂件 · 安装 ===' -ForegroundColor White
Write-Step ('profile: ' + $profile)
Write-Step ('安装包:  ' + $tgz)

if (-not (Test-Path $profile)) { Write-Err ('找不到 profile 目录：' + $profile); exit 1 }
$localManifest = Join-Path $scriptDir 'package.json'
$isLocalRepo = $false
if (Test-Path $localManifest) {
  try { if ((Get-Content $localManifest -Raw -Encoding UTF8 | ConvertFrom-Json).name -eq $PkgName) { $isLocalRepo = $true } } catch {}
}
$voiceScript = Join-Path $scriptDir 'scripts\fetch-voice.ps1'
if (-not (Test-Path $tgz)) {
  if ($DryRun) {
    Write-Step ('本地没有安装包：实际执行时会' + $(if ($isLocalRepo) { '用当前仓库现场打包' } else { '从 GitHub 下载仓库并现场打包' }) + '（不含语音）。')
  } else {
    $work = Join-Path $env:TEMP ('airui-build-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force $work | Out-Null
    if ($isLocalRepo) {
      $src = $scriptDir
      Write-Step '用当前仓库现场打包（不含语音）…'
    } else {
      Write-Step '从 GitHub 下载仓库并现场打包（不含语音）…'
      $zip = Join-Path $work 'repo.zip'
      $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
      if ($curl) {
        & curl.exe -L --fail --retry 2 -o $zip ($RepoUrl + '/archive/refs/heads/main.zip')
        if ($LASTEXITCODE -ne 0) { Write-Err '下载仓库失败（网络或代理）'; exit 1 }
      } else {
        Invoke-WebRequest -Uri ($RepoUrl + '/archive/refs/heads/main.zip') -OutFile $zip -UseBasicParsing
      }
      Expand-Archive -Path $zip -DestinationPath $work -Force
      $src = (Get-ChildItem $work -Directory | Where-Object { $_.Name -ne 'package' } | Select-Object -First 1).FullName
    }
    $stage = Join-Path $work 'package'
    New-Item -ItemType Directory -Force $stage | Out-Null
    foreach ($f in 'package.json', 'cordis.patch.yml', 'icon.png', 'README.md', 'PROVENANCE.md', 'LICENSE') {
      Copy-Item (Join-Path $src $f) $stage -Force
    }
    Copy-Item (Join-Path $src 'lib') (Join-Path $stage 'lib') -Recurse
    Copy-Item (Join-Path $src 'assets') (Join-Path $stage 'assets') -Recurse
    # 公开安装包不带语音，装完再从数据集拉取
    Remove-Item (Join-Path $stage 'assets\zzz\voice') -Recurse -Force -ErrorAction SilentlyContinue
    $tgz = Join-Path $work 'dsh-whale-widget-airui.tgz'
    & tar.exe -czf $tgz -C $work package
    if ($LASTEXITCODE -ne 0) { Write-Err '打包失败'; exit 1 }
    Write-Ok ('已现场打包：' + $tgz)
    $candidate = Join-Path $src 'scripts\fetch-voice.ps1'
    if (Test-Path $candidate) { $voiceScript = $candidate }
  }
}
if (-not $DryRun -and -not (Test-Path $tgz)) { Write-Err ('找不到安装包：' + $tgz); exit 1 }

$node = Find-Node
$pnpm = Find-Pnpm
if (-not $node) { Write-Err '找不到 node（DSH 运行时缺失？）'; exit 1 }
if (-not $pnpm) { Write-Err '找不到 DSH 自带的 pnpm'; exit 1 }

$pkgJson = Join-Path $profile 'package.json'
$lockJson = Join-Path $profile 'pnpm-lock.yaml'
if (-not (Test-Path $pkgJson)) { Write-Err ('profile 里没有 package.json：' + $pkgJson); exit 1 }

# ---------- 2. 退出 DSH ----------
$running = @(Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue)
# 指定 -ProfileDir 属于隔离测试：不碰正在运行的 DSH，也不结束它。
if ($running.Count -gt 0 -and -not $ProfileDir) {
  if ($DryRun) {
    Write-Warn2 ('检测到 DSH 正在运行（' + $running.Count + ' 个进程）；实际执行时会先退出它。')
  } elseif ($NoKill) {
    Write-Err 'DSH 还在运行。请先从托盘完全退出，再重新运行本脚本。'
    exit 1
  } else {
    Write-Step '正在退出 DSH（先请求关闭窗口，5 秒后强制结束）…'
    foreach ($p in $running) { try { $p.CloseMainWindow() | Out-Null } catch {} }
    Start-Sleep -Seconds 5
    $left = @(Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue)
    foreach ($p in $left) { try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {} }
    Start-Sleep -Seconds 2
    if (@(Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue).Count -gt 0) {
      Write-Err 'DSH 仍在运行，无法安全替换文件。请在任务管理器里结束后重试。'
      exit 1
    }
    Write-Ok 'DSH 已退出。'
  }
}

# ---------- 3. 备份 ----------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$pkgBak = "$pkgJson.bak-$stamp"
$lockBak = "$lockJson.bak-$stamp"
if ($DryRun) {
  Write-Step "会备份 package.json -> $pkgBak"
} else {
  Copy-Item $pkgJson $pkgBak -Force
  if (Test-Path $lockJson) { Copy-Item $lockJson $lockBak -Force }
  Write-Ok "已备份原配置（$stamp）"
}

# ---------- 4. 放包 + 安装 ----------
if ($DryRun) {
  Write-Step "会复制安装包到 $pluginsDir"
  Write-Step "会执行: node pnpm.mjs add `"file:$pluginsDir\<tgz>`" --dir `"$profile`""
  Write-Step '会把 dsh-whale-widget-airui 追加进 dsh.profile.bundles'
  Write-Step '会启动 DSH 并检查 /dsh-whale/zzz/pet.js 是否注册'
  Write-Host ''
  Write-Ok '（DryRun，未修改任何东西）'
  exit 0
}

New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null
$destTgz = Join-Path $pluginsDir (Split-Path $tgz -Leaf)
Copy-Item $tgz $destTgz -Force
Write-Ok ('安装包已放到 ' + $destTgz)

$env:CI = '1'
$destSpec = 'file:' + ($destTgz -replace '\\', '/')
Write-Step '正在用 DSH 自带 pnpm 安装…'
& $node $pnpm add $destSpec --dir $profile --reporter=append-only
if ($LASTEXITCODE -ne 0) {
  Write-Err 'pnpm 安装失败。'
  Restore-Backup $pkgBak $lockBak
  exit 1
}
Write-Ok 'pnpm 安装完成。'

# ---------- 5. 登记 bundle ----------
$enableScript = @'
const fs = require('fs')
const [pkgPath, name] = process.argv.slice(2)
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
pkg.dsh = pkg.dsh || {}
pkg.dsh.profile = pkg.dsh.profile || {}
const list = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : (pkg.dsh.profile.bundles ? [pkg.dsh.profile.bundles] : [])
if (!list.includes(name)) list.push(name)
pkg.dsh.profile.bundles = list
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log(list.join(', '))
'@
$enableJs = Join-Path $env:TEMP 'airui-enable-bundle.cjs'
Set-Content -Path $enableJs -Value $enableScript -Encoding UTF8
& $node $enableJs $pkgJson $PkgName
if ($LASTEXITCODE -ne 0) {
  Write-Err '写入 bundle 登记失败。'
  Restore-Backup $pkgBak $lockBak
  exit 1
}
Write-Ok '已在 dsh.profile.bundles 里登记。'

# ---------- 6. 校验安装结果 ----------
$installed = Join-Path $profile "node_modules\$PkgName"
$checks = @(
  (Join-Path $installed 'package.json'),
  (Join-Path $installed 'lib\index.js'),
  (Join-Path $installed 'assets\zzz\pet.js'),
  (Join-Path $installed 'assets\zzz\airui\airui.json'),
  (Join-Path $installed 'assets\zzz\airui-idle.png')
)
$missing = @($checks | Where-Object { -not (Test-Path $_) })
if ($missing.Count -gt 0) {
  Write-Err ('安装后缺少文件：' + ($missing -join '; '))
  Restore-Backup $pkgBak $lockBak
  exit 1
}
try {
  $null = Get-Content $pkgJson -Raw -Encoding UTF8 | ConvertFrom-Json
  Write-Ok 'profile/package.json 是合法 JSON。'
} catch {
  Write-Err 'profile/package.json 解析失败，正在还原。'
  Restore-Backup $pkgBak $lockBak
  exit 1
}

# ---------- 6.5 语音（公开数据集自动获取，可 -NoVoice 跳过） ----------
if (-not $NoVoice) {
  $voiceDir = Join-Path $installed 'assets\zzz\voice'
  $voiceCount = @(Get-ChildItem $voiceDir -Filter *.wav -ErrorAction SilentlyContinue).Count
  if ($voiceCount -lt 13) {
    $fetch = $voiceScript
    if (-not (Test-Path $fetch)) { $fetch = Join-Path $scriptDir 'scripts\fetch-voice.ps1' }
    if (Test-Path $fetch) {
      Write-Step '正在获取爱芮语音（约 173MB，来自公开数据集，仅个人使用）…'
      & powershell -NoProfile -ExecutionPolicy Bypass -File $fetch -TargetDir $voiceDir
      if ($LASTEXITCODE -ne 0) {
        Write-Warn2 '语音获取失败，插件会静音运行；之后可手动重跑 scripts\fetch-voice.ps1。'
      }
    } else {
      Write-Warn2 '找不到 fetch-voice.ps1，跳过语音。'
    }
  } else {
    Write-Ok ('语音已存在（' + $voiceCount + ' 条），跳过下载。')
  }
}

# ---------- 7. 启动并验证 ----------
if ($NoStart) {
  Write-Ok '安装完成（-NoStart：未启动 DSH）。现在手动打开 DSH 即可。'
  exit 0
}

$exe = Find-DshExe
if (-not $exe) {
  Write-Warn2 '没找到 DSH 可执行文件，请手动打开 DSH。安装已完成。'
  exit 0
}

Write-Step '正在启动 DSH…'
Start-Process -FilePath $exe | Out-Null

Write-Step '等待 DSH 启动并检查挂件路由（最多 120 秒）…'
$deadline = (Get-Date).AddSeconds(120)
$okPort = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  $pids = @(Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  if ($pids.Count -eq 0) { continue }
  $ports = @()
  try {
    $ports = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $pids -contains $_.OwningProcess } |
      Select-Object -ExpandProperty LocalPort -Unique)
  } catch {}
  foreach ($port in $ports) {
    $url = "http://127.0.0.1:$port/dsh-whale/zzz/pet.js"
    try {
      $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
      if ($resp.StatusCode -eq 200) { $okPort = $port; break }
    } catch {
      $code = $null
      try { $code = [int]$_.Exception.Response.StatusCode } catch {}
      if ($code -eq 401 -or $code -eq 403) { $okPort = $port; break }
    }
  }
  if ($okPort) { break }
}

Write-Host ''
if ($okPort) {
  Write-Ok ('挂件宿主已加载（端口 ' + $okPort + '，路由 /dsh-whale/zzz/pet.js 已注册）。')
  Start-Sleep -Seconds 4
  $fe = Test-FrontendRan
  if ($fe -eq $true) {
    Write-Ok '前端也已经跑起来了（localStorage 里出现 dshw-pos）。'
  } elseif ($fe -eq $false) {
    Write-Warn2 '还没在 localStorage 里看到 dshw-pos：页面可能没加载完，按一次 Ctrl+F5。'
  }
  Write-Host '现在看 DSH 右下角：应当出现爱芮。' -ForegroundColor White
  exit 0
}

Write-Err 'DSH 起来了，但挂件路由没有注册 —— 说明这个 bundle 被跳过了。'
Write-Host '请把下面这行输出发给我，我据此继续排查：' -ForegroundColor Yellow
Write-Host ('  profile = ' + $profile)
Write-Host ('  bundles = ' + ((Get-Content $pkgJson -Raw -Encoding UTF8 | ConvertFrom-Json).dsh.profile.bundles -join ', '))
Write-Host ''
Write-Host '回滚（可选）：' -ForegroundColor Yellow
Write-Host ('  Copy-Item "' + $pkgBak + '" "' + $pkgJson + '" -Force')
if (Test-Path $lockBak) { Write-Host ('  Copy-Item "' + $lockBak + '" "' + $lockJson + '" -Force') }
exit 2






