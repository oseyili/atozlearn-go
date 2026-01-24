# run-self-test.ps1 (Windows PowerShell 5.1)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repo = "C:\Users\oseyi\Documents\atozlearngo"
Set-Location $repo

$envText = Get-Content -Raw ".\.env"
function EnvVal([string]$k){
  $m = [regex]::Match($envText, "(?m)^\s*$([regex]::Escape($k))\s*=\s*(.+)\s*$")
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return $null
}

$viteUrl = (EnvVal "VITE_SUPABASE_URL").Trim().TrimEnd("/")
$anon    = (EnvVal "VITE_SUPABASE_ANON_KEY").Trim()
if (!$viteUrl) { throw "VITE_SUPABASE_URL missing" }
if (!$anon)    { throw "VITE_SUPABASE_ANON_KEY missing" }

$testUrl = $viteUrl + "/functions/v1/self-test"

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = ".\ops\monitor"
$logDir = ".\ops\monitor\logs"
New-Item -ItemType Directory -Force -Path $outDir,$logDir | Out-Null

$logPath = Join-Path $logDir ("self-test-" + $ts + ".log")
$statusPath = Join-Path $outDir "latest.json"

$raw = & "$env:SystemRoot\System32\curl.exe" -sS -i -X GET $testUrl -H "apikey: $anon"

$lines = $raw -split "`r?`n"
$httpLine = ($lines | Where-Object { $_ -match '^HTTP/' } | Select-Object -First 1)
$bodyIndex = [Array]::IndexOf($lines, "")
$body = ""
if ($bodyIndex -ge 0 -and $bodyIndex -lt ($lines.Length - 1)) {
  $body = ($lines[($bodyIndex+1)..($lines.Length-1)] -join "`n").Trim()
}

$obj = $null
try { $obj = $body | ConvertFrom-Json -ErrorAction Stop } catch { $obj = $null }

$result = [ordered]@{
  ts = (Get-Date).ToString("o")
  url = $testUrl
  http = $httpLine
  ok = $false
  marker = $null
  stripe_ok = $null
  supabase_ok = $null
  error = $null
}

if ($obj) {
  $result.ok = [bool]$obj.ok
  $result.marker = $obj.marker
  $result.stripe_ok = $obj.stripe.ok
  $result.supabase_ok = $obj.supabase.ok
  if (-not $obj.ok) {
    $result.error = ($obj.stripe.error ?? $obj.supabase.error ?? $obj.error)
  }
} else {
  $result.error = "Could not parse JSON response"
}

($result | ConvertTo-Json -Depth 8) | Set-Content -Encoding UTF8 $statusPath

@(
  "TS: $($result.ts)"
  "URL: $($result.url)"
  "HTTP: $($result.http)"
  "OK: $($result.ok)"
  "Marker: $($result.marker)"
  "SupabaseOK: $($result.supabase_ok)"
  "StripeOK: $($result.stripe_ok)"
  ("Error: " + ($result.error ?? ""))
  "---- BODY ----"
  $body
) | Set-Content -Encoding UTF8 $logPath

if ($result.ok) { exit 0 } else { exit 2 }
