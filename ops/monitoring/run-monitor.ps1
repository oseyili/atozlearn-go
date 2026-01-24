# ops/monitoring/run-monitor.ps1
$ErrorActionPreference = "SilentlyContinue"
Set-StrictMode -Off

try {
  $repo = "C:\Users\oseyi\Documents\atozlearngo"
  $doctorDir = Join-Path $repo "ops\doctor"
  $logs = Join-Path $doctorDir "logs"
  New-Item -ItemType Directory -Force -Path $doctorDir,$logs | Out-Null

  # Kill switch
  $v = $env:ATOZ_MONITOR
  if ([string]::IsNullOrWhiteSpace($v)) { $v = [Environment]::GetEnvironmentVariable("ATOZ_MONITOR","User") }
  if ($v -eq "0") { exit 0 }

  # Resolve Supabase URL from .env without printing it
  $envPath = Join-Path $repo ".env"
  if (!(Test-Path $envPath)) { exit 0 }

  $line = (Get-Content $envPath | Where-Object { $_ -like "VITE_SUPABASE_URL=*" } | Select-Object -First 1)
  if (!$line) { exit 0 }
  $base = $line.Split("=",2)[1].Trim().TrimEnd("/")

  $selfUrl = "$base/functions/v1/self-test"
  $intUrl  = "$base/functions/v1/integrity-check"

  $ts = (Get-Date).ToString("yyyyMMdd-HHmmss")
  $outFile = Join-Path $doctorDir "monitor-latest.json"

  $result = @{
    time = (Get-Date).ToString("o")
    ok = $true
    self_test = $null
    integrity = $null
    notes = @()
  }

  # Call self-test
  try {
    $r = Invoke-RestMethod -Uri $selfUrl -TimeoutSec 8
    $result.self_test = $r
    if ($r.ok -ne $true) { $result.ok = $false; $result.notes += "self-test not ok" }
  } catch {
    $result.ok = $false
    $result.self_test = @{ ok = $false; error = "self-test request failed" }
    $result.notes += "self-test request failed"
  }

  # Call integrity-check
  try {
    $r2 = Invoke-RestMethod -Uri $intUrl -TimeoutSec 10
    $result.integrity = $r2
    if ($r2.ok -ne $true) { $result.ok = $false; $result.notes += "integrity-check not ok" }
  } catch {
    $result.ok = $false
    $result.integrity = @{ ok = $false; error = "integrity-check request failed" }
    $result.notes += "integrity-check request failed"
  }

  # Persist latest
  ($result | ConvertTo-Json -Depth 9) | Set-Content -Encoding UTF8 $outFile

  # Failure alerting via Windows Event Log (local alert channel)
  if (-not $result.ok) {
    $src = "AtoZlearn-AutoDoctor"
    try {
      if (-not [System.Diagnostics.EventLog]::SourceExists($src)) {
        New-EventLog -LogName Application -Source $src
      }
      Write-EventLog -LogName Application -Source $src -EventId 1001 -EntryType Error -Message "AtoZ monitor failed. See ops\doctor\monitor-latest.json"
    } catch {}
  }

} catch {}

exit 0
