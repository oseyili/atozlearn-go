# ops/doctor/runtime.ps1
Set-StrictMode -Off

function global:_AtoZDoctorEnabled {
  $v = $env:ATOZ_AUTODOCTOR
  if ([string]::IsNullOrWhiteSpace($v)) { $v = [Environment]::GetEnvironmentVariable("ATOZ_AUTODOCTOR","User") }
  return ($v -ne "0")
}
function global:_AtoZWrapEnabled {
  $v = $env:ATOZ_AUTOWRAP
  if ([string]::IsNullOrWhiteSpace($v)) { $v = [Environment]::GetEnvironmentVariable("ATOZ_AUTOWRAP","User") }
  return ($v -ne "0")
}
function global:_AtoZLogPath([string]$name) {
  $repo = "C:\Users\oseyi\Documents\atozlearngo"
  $dir = Join-Path $repo "ops\doctor\logs"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $ts = (Get-Date).ToString("yyyyMMdd-HHmmss")
  return (Join-Path $dir ("{0}-{1}.log" -f $name,$ts))
}
function global:_AtoZFilterNoise([object[]]$lines) {
  $noise = @("readableAddChunkPushByteMode","node:internal/streams","node:internal/stream_base_commons")
  return $lines | Where-Object {
    $line = "$_"
    -not ($noise | Where-Object { $line -match $_ })
  }
}

# Core: intercept native stderr BEFORE PS promotes it; never throw; log always.
function global:_AtoZRunNative([string]$name, [scriptblock]$invoke, [int]$tail = 60) {
  $log = _AtoZLogPath $name
  $prevEAP = $global:ErrorActionPreference
  try {
    $global:ErrorActionPreference = "SilentlyContinue"
    $Error.Clear()
    $out = & $invoke 2>&1
    $code = $LASTEXITCODE
    $out = _AtoZFilterNoise $out

    @("$name EXIT=$code","----- OUTPUT -----",$out) | Set-Content -Encoding UTF8 $log
    return @{ ok = ($code -eq 0); code=$code; out=$out; log=$log; tail=$tail }
  } catch {
    try { @("$name wrapper exception", "$($_)") | Add-Content -Encoding UTF8 $log } catch {}
    return @{ ok=$false; code=1; out=@("$name wrapper exception"); log=$log; tail=$tail }
  } finally {
    $global:ErrorActionPreference = $prevEAP
  }
}

function global:_AtoZReturnClean([hashtable]$r, [string]$headline) {
  if ($r.ok) {
    $LASTEXITCODE = 0
    return
  }
  Write-Host $headline -ForegroundColor Yellow
  Write-Host ("[AutoDoctor] log: ops\doctor\logs\" + (Split-Path -Leaf $r.log)) -ForegroundColor DarkYellow
  ($r.out | Select-Object -Last $r.tail)
  $LASTEXITCODE = 0
}

function global:Get-AtoZDoctorStatus {
  [pscustomobject]@{
    Enabled        = (_AtoZDoctorEnabled)
    WrapEnabled    = (_AtoZWrapEnabled)
    Repo           = "C:\Users\oseyi\Documents\atozlearngo"
    Profile        = $PROFILE
    KillSwitchEnv  = "ATOZ_AUTODOCTOR=0"
    WrapSwitchEnv  = "ATOZ_AUTOWRAP=0"
  }
}
function global:Enable-AtoZDoctor {
  [Environment]::SetEnvironmentVariable("ATOZ_AUTODOCTOR","1","User")
  [Environment]::SetEnvironmentVariable("ATOZ_AUTOWRAP","1","User")
  $env:ATOZ_AUTODOCTOR="1"; $env:ATOZ_AUTOWRAP="1"
  Write-Host "✅ AutoDoctor ENABLED" -ForegroundColor Green
}
function global:Disable-AtoZDoctor {
  [Environment]::SetEnvironmentVariable("ATOZ_AUTODOCTOR","0","User")
  $env:ATOZ_AUTODOCTOR="0"
  Write-Host "🛑 AutoDoctor DISABLED" -ForegroundColor Yellow
}
