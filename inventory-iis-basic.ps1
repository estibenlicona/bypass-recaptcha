
# Requires the WebAdministration module for IIS management
Import-Module WebAdministration

# Resolves a physical path, expanding environment variables and handling relative paths
function Resolve-PhysicalPath([string]$Path) {
  if (-not $Path) { return $null }
  $expanded = [Environment]::ExpandEnvironmentVariables($Path)
  if ($expanded -notmatch '^[A-Za-z]:\\' -and $expanded -notmatch '^\\\\') {
    return (Join-Path (Get-Location) $expanded)
  }
  return $expanded
}

# Maps .NET Framework release DWORD to human-readable version
function Get-FrameworkVersionFromRelease([int]$release) {
  if     ($release -ge 533320) { return "4.8.1" }
  elseif ($release -ge 528049) { return "4.8" }
  elseif ($release -ge 528040) { return "4.8" }
  elseif ($release -ge 461814) { return "4.7.2" }
  elseif ($release -ge 461808) { return "4.7.2" }
  elseif ($release -ge 461310) { return "4.7.1" }
  elseif ($release -ge 461308) { return "4.7.1" }
  elseif ($release -ge 460805) { return "4.7" }
  elseif ($release -ge 460798) { return "4.7" }
  elseif ($release -ge 394806) { return "4.6.2" }
  elseif ($release -ge 394802) { return "4.6.2" }
  elseif ($release -ge 394271) { return "4.6.1" }
  elseif ($release -ge 394254) { return "4.6.1" }
  elseif ($release -ge 393297) { return "4.6" }
  elseif ($release -ge 393295) { return "4.6" }
  elseif ($release -ge 379893) { return "4.5.2" }
  elseif ($release -ge 378758) { return "4.5.1" }
  elseif ($release -ge 378675) { return "4.5.1" }
  elseif ($release -ge 378389) { return "4.5" }
  else                         { return "4.0 or earlier" }
}

# Gets the highest .NET Framework 4.x version installed on the machine
function Get-MachineFramework4x {
  $rel = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -ErrorAction SilentlyContinue).Release
  if ($rel) { return Get-FrameworkVersionFromRelease $rel }
  return $null
}

# Reads the targetFramework from web.config for .NET Framework 4.x sites
function Get-FrameworkTargetFromWebConfig([string]$root) {
  $webConfig = Join-Path $root 'web.config'
  if (-not (Test-Path $webConfig)) { return $null }
  try {
    [xml]$xml = Get-Content $webConfig -ErrorAction Stop
    if ($xml.configuration.'system.web'.compilation) {
      return $xml.configuration.'system.web'.compilation.targetFramework
    }
  } catch {}
  return $null
}

# Detects .NET Core / .NET 5+ from runtimeconfig.json in the site folder
function Get-CoreInfoFromFolder([string]$root) {
  $webConfig = Join-Path $root 'web.config'
  $hasAspNetCore = $false
  if (Test-Path $webConfig) {
    try {
      [xml]$xml = Get-Content $webConfig -ErrorAction Stop
      $hasAspNetCore = [bool]$xml.configuration.'system.webServer'.aspNetCore
    } catch {}
  }
  $runtimeConfig = $null
  if ($hasAspNetCore -and (Test-Path $webConfig)) {
    try {
      [xml]$xml2 = Get-Content $webConfig -ErrorAction Stop
      $node = $xml2.configuration.'system.webServer'.aspNetCore
      if ($node -and $node.arguments -match '\.dll') {
        $dll = $node.arguments.Split(' ')[0]
        $runtimeConfig = [IO.Path]::ChangeExtension((Join-Path $root $dll), '.runtimeconfig.json')
      }
    } catch {}
  }
  if (-not $runtimeConfig -or -not (Test-Path $runtimeConfig)) {
    $first = Get-ChildItem -Path $root -Filter *.runtimeconfig.json -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($first) { $runtimeConfig = $first.FullName }
  }
  if (-not $runtimeConfig -or -not (Test-Path $runtimeConfig)) { return $null }

  $json = Get-Content $runtimeConfig -Raw | ConvertFrom-Json
  $tfm  = $json.runtimeOptions.tfm
  $runtimeVersion  = $json.runtimeOptions.framework.version
  if (-not $runtimeVersion -and $json.runtimeOptions.frameworks) {
    $runtimeVersion = ($json.runtimeOptions.frameworks | Where-Object {$_.name -eq 'Microsoft.NETCore.App'} | Select-Object -First 1).version
  }
  $family = ".NET (Core/5+)"
  $label  = $tfm
  if ($tfm -like 'netcoreapp*') {
    $label = $tfm -replace '^netcoreapp','Core '
    $family = ".NET Core"
  } elseif ($tfm -like 'net[5-9].*') {
    $label = $tfm -replace '^net',''
    $label = ".NET $label"
  }
  $versionString = $label
  if ($runtimeVersion) {
    $versionString += " (runtime $runtimeVersion)"
  }
  $obj = [PSCustomObject]@{
    Platform = $family
    Version  = $versionString
  }
  return $obj
}

# Main script logic: collects IIS site inventory and exports to CSV
$machineFramework = Get-MachineFramework4x
$inventoryRows = @()

foreach ($site in Get-Website) {
  # Only root application is considered
  $physicalPath = Resolve-PhysicalPath $site.physicalPath
  $appPool = Get-Item ("IIS:\AppPools\$($site.applicationPool)") -ErrorAction SilentlyContinue
  $clrVersion = if ($appPool) { $appPool.managedRuntimeVersion } else { $null }

  # Detect .NET Core / 5+ or .NET Framework
  $coreInfo = if ($physicalPath) { Get-CoreInfoFromFolder $physicalPath } else { $null }
  if ($coreInfo) {
    $platform = $coreInfo.Platform
    $version  = $coreInfo.Version
  } else {
    $platform = ".NET Framework"
    $targetFramework = if ($physicalPath) { Get-FrameworkTargetFromWebConfig $physicalPath } else { $null }
    if ($targetFramework) {
      $version = $targetFramework
    } elseif ($clrVersion -eq 'v4.0') {
      $version = if ($machineFramework) { "$machineFramework (installed on server)" } else { "4.x (undetermined)" }
    } elseif ($clrVersion -eq 'v2.0') {
      $version = "2.0/3.5"
    } else {
      $version = "undetermined"
    }
  }

  $inventoryRows += [PSCustomObject]@{
    Application = $site.name
    AppPool     = $site.applicationPool
    Platform    = $platform
    Version     = $version
    Path        = $physicalPath
  }
}

# Prepare output file path
$server    = $env:COMPUTERNAME
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir    = "C:\IIS_Reports"
$outFile   = "IISInventory-$server-$timestamp.csv"
$outPath   = Join-Path $outDir $outFile

# Ensure output directory exists
if (-not (Test-Path $outDir)) {
  New-Item -Path $outDir -ItemType Directory -Force | Out-Null
}

# Export inventory to CSV
$inventoryRows | Sort-Object Application | Export-Csv -Path $outPath -NoTypeInformation -Encoding UTF8

# Print only the location of the saved inventory
Write-Host "Inventario guardado en: $outPath"