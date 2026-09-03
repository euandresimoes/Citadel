param(
  [string]$Version = "0.5.11"
)

$ErrorActionPreference = "Stop"
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if ($architecture -ne "x64") {
  throw "Citadela native Windows installer currently supports x64 only; detected $architecture."
}

$packageUrl = "https://registry.npmjs.org/@citadela/cli/-/cli-$Version.tgz"
$installRoot = Join-Path $env:LOCALAPPDATA "Citadela\$Version"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("citadela-install-" + [guid]::NewGuid().ToString())
$archive = Join-Path $tempRoot "citadela.tgz"
$extractRoot = Join-Path $tempRoot "package"

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
try {
  Write-Host "Downloading Citadela CLI $Version for win32-x64..."
  & curl.exe --fail --location --proto '=https' --tlsv1.2 --silent --show-error $packageUrl --output $archive
  if ($LASTEXITCODE -ne 0) { throw "Unable to download Citadela CLI." }
  tar.exe -xzf $archive -C $tempRoot
  if ($LASTEXITCODE -ne 0) { throw "Unable to extract Citadela CLI." }

  $sourceRoot = Join-Path $extractRoot "dist\bin"
  if (-not (Test-Path (Join-Path $sourceRoot "citadela-win32-x64.exe"))) { throw "The published package has no Windows x64 native binary." }
  if (-not (Test-Path (Join-Path $sourceRoot "opentui.dll"))) { throw "The published package has no OpenTUI Windows runtime." }

  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
  Copy-Item (Join-Path $sourceRoot "citadela-win32-x64.exe") (Join-Path $installRoot "citadela.exe") -Force
  Copy-Item (Join-Path $sourceRoot "opentui.dll") (Join-Path $installRoot "opentui.dll") -Force

  $shim = Join-Path $installRoot "citadela.cmd"
  Set-Content -Path $shim -Encoding ascii -Value "@echo off`r`n`"%~dp0citadela.exe`" %*`r`n"
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $entries = @($userPath -split ';' | Where-Object { $_ })
  if ($entries -notcontains $installRoot) {
    [Environment]::SetEnvironmentVariable("Path", (($entries + $installRoot) -join ';'), "User")
  }
  Write-Host "Citadela CLI $Version installed at $installRoot"
  Write-Host "Open a new terminal before running: citadela"
}
finally {
  if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
