# Windows PowerShell script: portal-diagnose.ps1
# Purpose: pinpoint whether "portal not the same" is due to:
# - Wrong/cached build (bundle markers)
# - Supabase RLS/auth/schema (REST table probes)
# - Edge Function auth (create-checkout probe)
#
# Output: creates diagnostics\portal-diagnose-<timestamp>\ with report files.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Write-Section($title) {
  $line = ("=" * 80)
  Write-Host ""
  Write-Host $line
  Write-Host $title
  Write-Host $line
}

function Save-Text($path, $text) {
  $text | Out-File -FilePath $path -Encoding UTF8
}

function Try-InvokeWeb($url, $headers = $null, $method = "GET", $body = $null) {
  try {
    $params = @{
      Uri             = $url
      Method          = $method
      UseBasicParsing = $true
    }
    if ($headers) { $params.Headers = $headers }
    if ($body) {
      $params.ContentType = "application/json"
      $params.Body = $body
    }
    return Invoke-WebRequest @params
  } catch {
    return $_
  }
}

function Read-ViteEnv($repoRoot) {
  # Reads VITE_ vars from common env files if present.
  $envFiles = @(
    Join-Path $repoRoot ".env",
    Join-Path $repoRoot ".env.local",
    Join-Path $repoRoot ".env.production",
    Join-Path $repoRoot ".env.production.local"
  )

  $kv = @{}
  foreach ($f in $envFiles) {
    if (Test-Path $f) {
      $lines = Get-Content $f -ErrorAction SilentlyContinue
      foreach ($line in $lines) {
        if ($null -eq $line) { continue }
        $trim = $line.Trim()
        if ($trim.Length -eq 0) { continue }
        if ($trim.StartsWith("#")) { continue }

        if ($line -match "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$") {
          $k = $Matches[1]
          $v = $Matches[2]

          # Strip surrounding quotes if present
          if ($v.StartsWith('"') -and $v.EndsWith('"') -and $v.Length -ge 2) { $v = $v.Substring(1, $v.Length-2) }
          if ($v.StartsWith("'") -and $v.EndsWith("'") -and $v.Length -ge 2) { $v = $v.Substring(1, $v.Length-2) }

          if (-not $kv.ContainsKey($k)) {
            $kv[$k] = $v
          }
        }
      }
    }
  }
  return $kv
}

# -------------------- Setup report folder --------------------
$repoRoot = (Get-Location).Path
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$reportDir = Join-Path $repoRoot ("diagnostics\portal-diagnose-" + $ts)
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

Write-Section "A) Local Git State"
$gitOut = @()
$gitOut += ("Repo: " + $repoRoot)
$gitOut += (git rev-parse --abbrev-ref HEAD 2>&1)
$gitOut += (git log -1 --oneline 2>&1)
$gitOut += (git status -sb 2>&1)
$gitOutText = $gitOut -join "`r`n"
Write-Host $gitOutText
Save-Text (Join-Path $reportDir "git.txt") $gitOutText

Write-Section "B) Read Vite Env Values (local .env files only)"
$kv = Read-ViteEnv $repoRoot
$viteSupabaseUrl = $null
$viteAnon = $null

if ($kv.ContainsKey("VITE_SUPABASE_URL")) { $viteSupabaseUrl = $kv["VITE_SUPABASE_URL"] }
if ($kv.ContainsKey("VITE_SUPABASE_ANON_KEY")) { $viteAnon = $kv["VITE_SUPABASE_ANON_KEY"] }

$envSummary = @()
$envSummary += "Found in local env files:"
$envSummary += ("VITE_SUPABASE_URL      = " + ($(if ($viteSupabaseUrl) { $viteSupabaseUrl } else { "<NOT FOUND>" })))
$envSummary += ("VITE_SUPABASE_ANON_KEY = " + ($(if ($viteAnon) { "<FOUND (length " + $viteAnon.Length + ")>" } else { "<NOT FOUND>" })))
$envSummaryText = $envSummary -join "`r`n"
Write-Host $envSummaryText
Save-Text (Join-Path $reportDir "env-summary.txt") $envSummaryText

Write-Section "C) Portal URL Fetch + Bundle Integrity"
$portalUrl = Read-Host "PORTAL_URL (example: https://xxxx.onrender.com)"
if (-not $portalUrl.StartsWith("http")) { throw "Portal URL must start with http/https" }

# Fetch HTML
$htmlRes = Try-InvokeWeb $portalUrl $null "GET" $null
if ($htmlRes -is [System.Management.Automation.ErrorRecord]) {
  $err = $htmlRes.ToString()
  Write-Host "FAILED to fetch portal HTML:"
  Write-Host $err
  Save-Text (Join-Path $reportDir "portal-html-error.txt") $err
} else {
  $htmlHeaders = ($htmlRes.Headers.GetEnumerator() | ForEach-Object { "$($_.Key): $($_.Value)" }) -join "`r`n"
  Save-Text (Join-Path $reportDir "portal-html-headers.txt") $htmlHeaders
  Save-Text (Join-Path $reportDir "portal.html") $htmlRes.Content

  Write-Host ("HTML fetched OK. Status: " + $htmlRes.StatusCode)

  # Extract first JS module (Vite typical)
  $scriptSrc = $null
  if ($htmlRes.Content -match 'src="([^"]+assets/[^"]+\.js)"') {
    $scriptSrc = $Matches[1]
  } elseif ($htmlRes.Content -match 'src="([^"]+\.js)"') {
    $scriptSrc = $Matches[1]
  }

  if ($scriptSrc) {
    # Build absolute JS URL
    if ($scriptSrc.StartsWith("http")) {
      $jsUrl = $scriptSrc
    } else {
      $base = $portalUrl.TrimEnd("/")
      if ($scriptSrc.StartsWith("/")) { $jsUrl = $base + $scriptSrc } else { $jsUrl = $base + "/" + $scriptSrc }
    }

    Write-Host ("Detected main bundle: " + $jsUrl)
    $jsRes = Try-InvokeWeb $jsUrl $null "GET" $null
    if ($jsRes -is [System.Management.Automation.ErrorRecord]) {
      $err = $jsRes.ToString()
      Write-Host "FAILED to fetch JS bundle:"
      Write-Host $err
      Save-Text (Join-Path $reportDir "bundle-error.txt") $err
    } else {
      Save-Text (Join-Path $reportDir "bundle.js") $jsRes.Content
      Write-Host "Bundle fetched OK. Saved: bundle.js"

      # Look for markers that indicate the right build/features
      $markers = @("a76fbce","create-checkout","Admin","portal","RPC","enroll","courses","subjects","payments","audit")
      $found = @()
      foreach ($m in $markers) {
        if ($jsRes.Content -match [Regex]::Escape($m)) { $found += $m }
      }
      $markerText = "Markers found in bundle: " + ($(if ($found.Count) { ($found -join ", ") } else { "<NONE>" }))
      Write-Host $markerText
      Save-Text (Join-Path $reportDir "bundle-markers.txt") $markerText
    }
  } else {
    $msg = "No bundle src detected in HTML (unexpected for Vite)."
    Write-Host $msg
    Save-Text (Join-Path $reportDir "bundle-markers.txt") $msg
  }
}

Write-Section "D) Supabase REST Diagnostics (detect RLS/schema/auth)"
if (-not $viteSupabaseUrl) { $viteSupabaseUrl = Read-Host "SUPABASE_URL (https://xxxxx.supabase.co)" }
if (-not $viteAnon) { $viteAnon = Read-Host "SUPABASE_ANON_KEY" }

$restBase = $viteSupabaseUrl.TrimEnd("/") + "/rest/v1"
$headers = @{
  "apikey"        = $viteAnon
  "Authorization" = ("Bearer " + $viteAnon)
}

# Probe likely tables. These are safe reads; results will show 401/403 (RLS/auth) or schema errors.
$tablesToTry = @("courses","subjects","materials","enrollments")
$tableResults = @()

foreach ($t in $tablesToTry) {
  $u = "$restBase/$t?select=*&limit=1"
  $r = Try-InvokeWeb $u $headers "GET" $null
  if ($r -is [System.Management.Automation.ErrorRecord]) {
    $tableResults += ("$t => ERROR: " + $r.ToString())
  } else {
    $snippet = $r.Content
    if ($null -eq $snippet) { $snippet = "" }
    if ($snippet.Length -gt 200) { $snippet = $snippet.Substring(0,200) }
    $snippet = $snippet.Replace("`r","").Replace("`n"," ")
    $tableResults += ("$t => " + $r.StatusCode + " | " + $snippet)
  }
}

$tableResultsText = $tableResults -join "`r`n"
Write-Host $tableResultsText
Save-Text (Join-Path $reportDir "supabase-table-probes.txt") $tableResultsText

Write-Section "E) Edge Function Quick Probe (create-checkout)"
$fnUrl = $viteSupabaseUrl.TrimEnd("/") + "/functions/v1/create-checkout"
$fnBody = '{"ping":true}'
$fnRes = Try-InvokeWeb $fnUrl $headers "POST" $fnBody

if ($fnRes -is [System.Management.Automation.ErrorRecord]) {
  $err = $fnRes.ToString()
  Write-Host "Edge function probe FAILED:"
  Write-Host $err
  Save-Text (Join-Path $reportDir "edge-create-checkout-probe.txt") $err
} else {
  $out = @("URL: $fnUrl", "Status: $($fnRes.StatusCode)", "Body:", $fnRes.Content) -join "`r`n"
  Write-Host $out
  Save-Text (Join-Path $reportDir "edge-create-checkout-probe.txt") $out
}

Write-Section "DONE"
Write-Host ("Report folder: " + $reportDir)
Save-Text (Join-Path $reportDir "REPORT_FOLDER.txt") $reportDir
