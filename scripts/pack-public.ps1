#requires -Version 5.1
<#
  打一个“公开安装包”：不含 assets/zzz/voice（游戏语音），
  供 GitHub Release / 网盘分发。语音由安装脚本从公开数据集获取。
#>
[CmdletBinding()]
param(
  [string]$OutDir
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$pkg = Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $pkg.version
if (-not $OutDir) { $OutDir = Join-Path $root 'dist' }
New-Item -ItemType Directory -Force $OutDir | Out-Null

$work = Join-Path $env:TEMP ('airui-public-' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $work 'package'
New-Item -ItemType Directory -Force $stage | Out-Null
foreach ($f in 'package.json', 'cordis.patch.yml', 'icon.png', 'README.md', 'PROVENANCE.md', 'LICENSE') {
  Copy-Item (Join-Path $root $f) $stage -Force
}
Copy-Item (Join-Path $root 'lib') (Join-Path $stage 'lib') -Recurse
Copy-Item (Join-Path $root 'assets') (Join-Path $stage 'assets') -Recurse
Remove-Item (Join-Path $stage 'assets\zzz\voice') -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $stage 'assets\zzz\voice') | Out-Null
Set-Content -Path (Join-Path $stage 'assets\zzz\voice\README.txt') -Value '语音不随安装包分发。安装脚本会从公开数据集获取（见仓库 README）。' -Encoding UTF8

$out = Join-Path $OutDir ("dsh-whale-widget-airui-$version-public.tgz")
if (Test-Path $out) { Remove-Item $out -Force }
& tar.exe -czf $out -C $work package
if ($LASTEXITCODE -ne 0) { throw 'tar 打包失败' }
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ('[OK] 公开包：' + $out) -ForegroundColor Green
Write-Host ('     大小：' + [math]::Round((Get-Item $out).Length / 1MB, 2) + ' MB（不含语音）')
