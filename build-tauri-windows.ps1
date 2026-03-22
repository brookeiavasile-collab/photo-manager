param(
  [ValidateSet('nsis', 'msi')]
  [string]$Bundle = 'nsis'
)

$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot

function Add-ToPathIfExists([string]$pathToAdd) {
  if ([string]::IsNullOrWhiteSpace($pathToAdd)) { return }
  if ((Test-Path $pathToAdd) -and -not (($env:PATH -split ';') -contains $pathToAdd)) {
    $env:PATH = "$pathToAdd;$env:PATH"
  }
}

function Refresh-CommonPaths {
  Add-ToPathIfExists (Join-Path $env:ProgramFiles 'nodejs')
  Add-ToPathIfExists (Join-Path ${env:ProgramFiles(x86)} 'nodejs')
  Add-ToPathIfExists (Join-Path $env:APPDATA 'npm')
  Add-ToPathIfExists (Join-Path $env:USERPROFILE '.cargo\bin')
}

function Ensure-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'winget not found. Please install App Installer from Microsoft Store first.'
  }
}

function Install-WingetPackage([string]$id, [string]$name) {
  Ensure-Winget
  $listed = & winget list --id $id --exact --accept-source-agreements 2>$null
  if ($LASTEXITCODE -eq 0 -and $listed) {
    Write-Host "$name is already installed."
    Refresh-CommonPaths
    return
  }

  Write-Host "Installing $name ..."
  & winget install --id $id --exact --accept-source-agreements --accept-package-agreements --silent
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install $name with winget."
  }
  Refresh-CommonPaths
}

function Get-VSWherePath {
  return (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe')
}

function Get-VSInstallerPath {
  $installerDir = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer'
  $setup = Join-Path $installerDir 'setup.exe'
  $vsInstaller = Join-Path $installerDir 'vs_installer.exe'

  if (Test-Path $setup) { return $setup }
  if (Test-Path $vsInstaller) { return $vsInstaller }
  return $null
}

function Get-BuildToolsInstallPath {
  $vswhere = Get-VSWherePath
  if (-not (Test-Path $vswhere)) { return $null }

  $result = & $vswhere -latest -products * -requiresAny -requires Microsoft.VisualStudio.Product.BuildTools -property installationPath 2>$null
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($result)) {
    return $result.Trim()
  }

  $result = & $vswhere -latest -products * -property installationPath 2>$null
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($result)) {
    return $result.Trim()
  }

  return $null
}

function Has-VCToolsWorkload {
  $vswhere = Get-VSWherePath
  if (-not (Test-Path $vswhere)) { return $false }

  $result = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
  return ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($result))
}

function Install-Or-Modify-BuildTools {
  $installer = Get-VSInstallerPath
  if ($installer) {
    $installPath = Get-BuildToolsInstallPath
    if (-not [string]::IsNullOrWhiteSpace($installPath)) {
      Write-Host 'Adding C++ workload to existing Visual Studio Build Tools...'
      & $installer modify --installPath $installPath --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --norestart --wait
      if ($LASTEXITCODE -eq 0) { return }
      Write-Host "Modify failed with exit code $LASTEXITCODE, will try fresh winget install..."
    }
  }

  Ensure-Winget
  Write-Host 'Installing Visual Studio Build Tools 2022 with C++ workload...'
  & winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --accept-source-agreements --accept-package-agreements --override '--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended' --silent
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install Visual Studio Build Tools 2022 with C++ workload. Exit code: $LASTEXITCODE"
  }
}

function Ensure-Node {
  Refresh-CommonPaths
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Install-WingetPackage 'OpenJS.NodeJS.LTS' 'Node.js LTS'
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm still not found after installation.'
  }
}

function Ensure-Rust {
  Refresh-CommonPaths
  if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Install-WingetPackage 'Rustlang.Rustup' 'Rustup'
  }
  if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw 'cargo still not found after installation.'
  }
}

function Ensure-WebView2 {
  $edgeWebView = 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  $edgeWebViewWow6432 = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  if (-not (Test-Path $edgeWebView) -and -not (Test-Path $edgeWebViewWow6432)) {
    Install-WingetPackage 'Microsoft.EdgeWebView2Runtime' 'WebView2 Runtime'
  }
}

function Ensure-BuildTools {
  if (-not (Has-VCToolsWorkload)) {
    Install-Or-Modify-BuildTools
    if (-not (Has-VCToolsWorkload)) {
      throw 'Visual Studio Build Tools was installed, but C++ workload is still missing. Open Visual Studio Installer and add Desktop development with C++.'
    }
  }
}

function Ensure-WixIfNeeded {
  if ($Bundle -ne 'msi') {
    return
  }

  Write-Host 'MSI bundle selected, WiX may still be required by Tauri.'
  Write-Host 'If WiX is already downloaded locally, make sure it is available in the location expected by Tauri or preinstalled on the machine.'
}

Write-Host '[1/7] Ensuring Node.js...'
Ensure-Node

Write-Host '[2/7] Ensuring Rust...'
Ensure-Rust

Write-Host '[3/7] Ensuring WebView2 Runtime...'
Ensure-WebView2

Write-Host '[4/7] Ensuring Visual Studio Build Tools...'
Ensure-BuildTools
Ensure-WixIfNeeded

Write-Host '[5/7] Installing root dependencies...'
& npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[6/7] Installing frontend dependencies...'
Push-Location frontend
try {
  & npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}

Write-Host '[6.5/7] Building frontend...'
& npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[7/7] Building Windows package ($Bundle)..."
& npm run tauri:build -- --bundles $Bundle
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Build completed. Output is usually under:'
Write-Host 'src-tauri\target\release\bundle\'
