#requires -Modules WebAdministration
Import-Module WebAdministration

function Resolve-PhysicalPath([string]$Path) {
  if (-not $Path) { return $null }
  $expanded = [Environment]::ExpandEnvironmentVariables($Path)
  if ($expanded -notmatch '^[A-Za-z]:\\' -and $expanded -notmatch '^\\\\') {
    return (Join-Path (Get-Location) $expanded)
  }
  return $expanded
}

# --- MAPEOS COMPLETOS .NET FRAMEWORK (Release DWORD -> versión) ---
function Get-FrameworkVersionFromRelease([int]$release) {
  if     ($release -ge 533320) { return "4.8.1" }
  elseif ($release -ge 528049) { return "4.8"    } # Win10
  elseif ($release -ge 528040) { return "4.8"    } # Otros
  elseif ($release -ge 461814) { return "4.7.2"  } # Win10
  elseif ($release -ge 461808) { return "4.7.2"  }
  elseif ($release -ge 461310) { return "4.7.1"  } # Win10
  elseif ($release -ge 461308) { return "4.7.1"  }
  elseif ($release -ge 460805) { return "4.7"    } # Win10
  elseif ($release -ge 460798) { return "4.7"    }
  elseif ($release -ge 394806) { return "4.6.2"  } # Win10
  elseif ($release -ge 394802) { return "4.6.2"  }
  elseif ($release -ge 394271) { return "4.6.1"  } # Win10
  elseif ($release -ge 394254) { return "4.6.1"  }
  elseif ($release -ge 393297) { return "4.6"    } # Otros
  elseif ($release -ge 393295) { return "4.6"    } # Win10
  elseif ($release -ge 379893) { return "4.5.2"  }
  elseif ($release -ge 378758) { return "4.5.1"  } # Otros
  elseif ($release -ge 378675) { return "4.5.1"  } # Win8.1/2012R2
  elseif ($release -ge 378389) { return "4.5"    }
  else                         { return "4.0 o anterior" }
}

function Get-MachineFramework4x {
  $rel = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -ErrorAction SilentlyContinue).Release
  if ($rel) { return Get-FrameworkVersionFromRelease $rel }
  return $null
}

# --- LECTURA DE targetFramework EN Web.config (.NET Framework 4.x) ---
function Get-FrameworkTargetFromWebConfig([string]$root) {
  $web = Join-Path $root 'web.config'
  if (-not (Test-Path $web)) { return $null }
  try {
    [xml]$xml = Get-Content $web -ErrorAction Stop
    if ($xml.configuration.'system.web'.compilation) {
      return $xml.configuration.'system.web'.compilation.targetFramework
    }
  } catch {}
  return $null
}

# --- DETECCIÓN .NET Core / .NET 5+ DESDE runtimeconfig.json ---
function Get-CoreInfoFromFolder([string]$root) {
  $web = Join-Path $root 'web.config'
  $hasAspNetCore = $false
  if (Test-Path $web) {
    try {
      [xml]$xml = Get-Content $web -ErrorAction Stop
      $hasAspNetCore = [bool]$xml.configuration.'system.webServer'.aspNetCore
    } catch {}
  }
  # localizar *.runtimeconfig.json
  $rc = $null
  if ($hasAspNetCore -and (Test-Path $web)) {
    try {
      [xml]$xml2 = Get-Content $web -ErrorAction Stop
      $node = $xml2.configuration.'system.webServer'.aspNetCore
      if ($node -and $node.arguments -match '\.dll') {
        $rel = $node.arguments.Split(' ')[0]
        $rc  = [IO.Path]::ChangeExtension((Join-Path $root $rel),'.runtimeconfig.json')
      }
    } catch {}
  }
  if (-not $rc -or -not (Test-Path $rc)) {
    $first = Get-ChildItem -Path $root -Filter *.runtimeconfig.json -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($first) { $rc = $first.FullName }
  }
  if (-not $rc -or -not (Test-Path $rc)) { return $null }

  $json = Get-Content $rc -Raw | ConvertFrom-Json
  $tfm  = $json.runtimeOptions.tfm
  $run  = $json.runtimeOptions.framework.version
  if (-not $run -and $json.runtimeOptions.frameworks) {
    $run = ($json.runtimeOptions.frameworks | Where-Object {$_.name -eq 'Microsoft.NETCore.App'} | Select-Object -First 1).version
  }
  # Mapeo legible de TFM -> familia/versión
  $family = ".NET (Core/5+)"
  $label  = $tfm
  if ($tfm -like 'netcoreapp*') {
    $label = $tfm -replace '^netcoreapp','Core '
    $family = ".NET Core"
  } elseif ($tfm -like 'net[5-9].*') {
    $label = $tfm -replace '^net',''
    $label = ".NET $label"
  }
  $obj = New-Object psobject
  $obj | Add-Member NoteProperty Platform $family
  $obj | Add-Member NoteProperty Version  (($label) + ($(if($run){" (runtime $run)"} else {""})))
  return $obj
}

$machineFx = Get-MachineFramework4x
$rows = @()

Get-Website | ForEach-Object {
  $site = $_
  # tomamos solo la app raíz por tu requerimiento
  $phys = Resolve-PhysicalPath $site.physicalPath
  $pool = Get-Item ("IIS:\AppPools\" + $site.applicationPool) -ErrorAction SilentlyContinue
  $clr  = if ($pool) { $pool.managedRuntimeVersion } else { $null }

  # ¿Es Core/5+?
  $coreInfo = if ($phys) { Get-CoreInfoFromFolder $phys } else { $null }

  $platform = $null; $version = $null

  if ($coreInfo) {
    $platform = $coreInfo.Platform
    $version  = $coreInfo.Version
  } else {
    # Framework 4.x
    $platform = ".NET Framework"
    $tf = if ($phys) { Get-FrameworkTargetFromWebConfig $phys } else { $null }
    if ($tf) {
      $version = $tf
    } elseif ($clr -eq 'v4.0') {
      $version = if ($machineFx) { $machineFx + " (instalada en el servidor)" } else { "4.x (indeterminada)" }
    } elseif ($clr -eq 'v2.0') {
      $version = "2.0/3.5"
    } else {
      $version = "indeterminada"
    }
  }

  $rows += [pscustomobject]@{
    Application         = $site.name
    AppPool      = $site.applicationPool
    Platform     = $platform
    Version      = $version
    Path = $phys
  }
}

$rows | Sort-Object Site | Format-Table -AutoSize
