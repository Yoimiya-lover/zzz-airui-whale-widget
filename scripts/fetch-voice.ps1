#requires -Version 5.1
<#
  爱芮语音获取脚本
  从公开数据集 Zenless Voice 下载中文说话人 Ariaidol 的语音包（约 173MB），
  只解压出插件需要的 13 条，放进 assets\zzz\voice\。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\fetch-voice.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\fetch-voice.ps1 -TargetDir "D:\...\assets\zzz\voice"
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\fetch-voice.ps1 -LocalZip "D:\Ariaidol.zip"

  说明：语音版权归米哈游 / COGNOSPHERE，仅供个人使用，不要再分发。
#>
[CmdletBinding()]
param(
  [string]$TargetDir,
  [string]$LocalZip,
  [switch]$Force,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$RepoRoot = Split-Path $PSScriptRoot -Parent
if (-not $TargetDir) { $TargetDir = Join-Path $RepoRoot 'assets\zzz\voice' }

# 哈希文件名 -> 语义文件名（与 assets/zzz/voice 下的文件名一致）
$Map = [ordered]@{
  'd27bc9c861b76291' = 'click_hey'
  'b5792e21b8a51928' = 'click_mhm'
  '2c202e149e4f9921' = 'click_manager'
  'ebed48ab244a96be' = 'idle_what'
  'ed284c251f722291' = 'idle_rest'
  'bada02212aac8f51' = 'idle_stop'
  '115fded610d2f20b' = 'idle_tired'
  'f32a4376abc01d3e' = 'angry_no'
  '234ef43a4c9e5e62' = 'angry_trouble'
  '26518fae131b2ccd' = 'cost_again'
  '0e59a00e9a6972bc' = 'happy_great'
  '6894ae16c8fcac67' = 'happy_again'
  '4a54798fda633667' = 'recharge_income'
}

function Say($msg) { if (-not $Quiet) { Write-Host $msg } }
function Fail($msg) { if (-not $Quiet) { Write-Host "[X] $msg" -ForegroundColor Red } }

$need = 0
foreach ($name in $Map.Values) {
  if (-not (Test-Path (Join-Path $TargetDir ($name + '.wav')))) { $need++ }
}
if ($need -eq 0 -and -not $Force) {
  Say '[OK] 语音已经齐全（13 条），跳过下载。'
  exit 0
}

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

$tempZip = Join-Path $env:TEMP ('airui-voice-' + [guid]::NewGuid().ToString('N') + '.zip')
$zipPath = $LocalZip
$downloaded = $false

if (-not $zipPath) {
  $urls = @(
    'https://hf-mirror.com/datasets/simon3000/zenless-voice/resolve/main/speaker-archives/Chinese/501-plus/Ariaidol.zip',
    'https://modelscope.cn/api/v1/datasets/simono/zenless-voice/repo?Revision=master&FilePath=speaker-archives%2FChinese%2F501-plus%2FAriaidol.zip'
  )
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  foreach ($u in $urls) {
    try {
      Say ('[*] 正在下载语音包（约 173MB）：' + $u)
      if ($curl) {
        & curl.exe -L --fail --retry 2 --connect-timeout 20 -o $tempZip $u
        if ($LASTEXITCODE -ne 0) { throw ('curl exit ' + $LASTEXITCODE) }
      } else {
        Invoke-WebRequest -Uri $u -OutFile $tempZip -UseBasicParsing
      }
      if ((Get-Item $tempZip).Length -lt 50MB) { throw '下载文件过小，可能不是完整压缩包' }
      $zipPath = $tempZip
      $downloaded = $true
      break
    } catch {
      Say ('[!] 这个源失败了：' + $_.Exception.Message)
      if (Test-Path $tempZip) { Remove-Item $tempZip -Force -ErrorAction SilentlyContinue }
    }
  }
  if (-not $zipPath) {
    Fail '语音包下载失败（网络或镜像不可用）。可以先跳过语音，插件会静音运行。'
    exit 1
  }
}

try {
  Say ('[*] 解压需要的 13 条到：' + $TargetDir)
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $ok = 0
    foreach ($hash in $Map.Keys) {
      $name = $Map[$hash]
      $entry = $zip.GetEntry($hash + '.wav')
      if (-not $entry) { Say ('[!] 压缩包里找不到 ' + $hash + '.wav'); continue }
      $out = Join-Path $TargetDir ($name + '.wav')
      $in = $entry.Open()
      $fs = [System.IO.File]::Create($out)
      $in.CopyTo($fs)
      $fs.Dispose()
      $in.Dispose()
      if ((Get-Item $out).Length -lt 20KB) { throw ('解压出来的文件太小：' + $out) }
      $ok++
    }
    if ($ok -lt $Map.Count) { throw ('只解压出 ' + $ok + '/' + $Map.Count + ' 条，数据源可能变了') }
  } finally {
    $zip.Dispose()
  }
  Say ('[OK] 语音已就绪：' + $ok + ' 条')
  exit 0
} catch {
  Fail ('语音解压失败：' + $_.Exception.Message)
  exit 1
} finally {
  if ($downloaded -and (Test-Path $tempZip)) { Remove-Item $tempZip -Force -ErrorAction SilentlyContinue }
}

