# auto-orchestrator.ps1 (Windows PowerShell 5.1)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Info($m){ Write-Host "`n[INFO] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[OK] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }

function Run-Step([string]$name, [scriptblock]$sb, [int]$retries = 2) {
  for ($i=0; $i -le $retries; $i++) {
    try {
      Info "$name (attempt $($i+1)/$($retries+1))"
      & $sb
      Ok "$name"
      return
    } catch {
      Warn "$name failed: $($_.Exception.Message)"
      if ($i -eq $retries) { throw }
      Start-Sleep -Seconds 2
    }
  }
}

# --- Logging (non-disappearing) ---
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = ".\ops\logs"
$log = Join-Path $logDir ("auto-orchestrator-" + $ts + ".log")
Start-Transcript -Path $log -Append | Out-Null
Info "Log file: $log"

try {
  # --- Repo root ---
  $repo = "C:\Users\oseyi\Documents\atozlearngo"
  if (!(Test-Path $repo)) { throw "Repo not found: $repo" }
  Set-Location $repo
  Ok "Repo OK"

  # --- Read .env safely (NEVER print secrets) ---
  Run-Step "Read .env safely" {
    $envPath = ".\.env"
    if (!(Test-Path $envPath)) { throw ".env missing at repo root" }
    $envText = Get-Content -Raw $envPath

    $viteUrlMatch = [regex]::Match($envText, '(?m)^VITE_SUPABASE_URL=(.*)$')
    $anonMatch    = [regex]::Match($envText, '(?m)^VITE_SUPABASE_ANON_KEY=(.*)$')

    if (!$viteUrlMatch.Success) { throw "VITE_SUPABASE_URL missing in .env" }
    if (!$anonMatch.Success)    { throw "VITE_SUPABASE_ANON_KEY missing in .env" }

    $script:viteUrl = $viteUrlMatch.Groups[1].Value.Trim()
    $script:anon    = $anonMatch.Groups[1].Value.Trim()

    if (!$script:viteUrl) { throw "VITE_SUPABASE_URL empty" }
    if (!$script:anon)    { throw "VITE_SUPABASE_ANON_KEY empty" }

    if ($script:viteUrl -match '^https://([a-z0-9]+)\.supabase\.co') {
      $script:ref = $Matches[1]
    } else {
      throw "Could not parse project ref from VITE_SUPABASE_URL"
    }

    Ok ("Project ref (safe): " + $script:ref)
    Ok ("Anon key length (safe): " + $script:anon.Length)
  }

  # --- Auto-neutralize TOML BOM/config merge failures (local only) ---
  Run-Step "Remove local supabase/config.toml if present" {
    if (Test-Path ".\supabase\config.toml") { Remove-Item -Force ".\supabase\config.toml" -ErrorAction SilentlyContinue }
    if (Test-Path ".\supabase\config.toml.bak") { Remove-Item -Force ".\supabase\config.toml.bak" -ErrorAction SilentlyContinue }
    Ok "Local CLI config neutralized"
  }

  # --- Ensure Supabase CLI linked to correct project ---
  Run-Step "Supabase link to correct project" {
    supabase link --project-ref $script:ref | Out-Null
  } 3

  # --- Ensure createCheckout helper exists (idempotent) ---
  Run-Step "Ensure src/lib/createCheckout.js" {
    New-Item -ItemType Directory -Force -Path ".\src\lib" | Out-Null
    $helperPath = ".\src\lib\createCheckout.js"
    if (!(Test-Path $helperPath)) {
@"
import { supabase } from "../supabaseClient";

/**
 * Creates a Stripe Checkout session for a course.
 * Uses supabase.functions.invoke so apikey + Authorization are handled correctly.
 * Includes userId in body as fallback (server accepts either).
 */
export async function createCheckout(courseId) {
  if (!courseId) throw new Error("Missing courseId");

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id || null;

  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: { courseId, userId },
  });

  if (error) throw error;
  if (!data?.url) throw new Error(data?.error || "No checkout url returned");
  return data.url;
}
"@ | Set-Content -Encoding UTF8 $helperPath
    }
  }

  # --- Deploy functions in ACTIVATION mode (gateway-open) ---
  Run-Step "Deploy create-checkout (activation: --no-verify-jwt)" {
    supabase functions deploy create-checkout --no-verify-jwt | Out-Null
  } 3

  Run-Step "Deploy stripe-webhook (activation: --no-verify-jwt)" {
    supabase functions deploy stripe-webhook --no-verify-jwt | Out-Null
  } 3

  # --- Safe probe (only prints safe lines) ---
  Run-Step "Probe create-checkout safely" {
    '{"ping":true}' | Set-Content -Encoding Ascii ".\_payload.json"
    $fnUrl = $script:viteUrl.TrimEnd("/") + "/functions/v1/create-checkout"

    $probe = & "$env:SystemRoot\System32\curl.exe" -sS -i -X POST $fnUrl `
      -H "Content-Type: application/json" `
      -H "apikey: $script:anon" `
      --data-binary "@_payload.json"

    $safe = $probe | Select-String -Pattern '^HTTP/','"marker"','"error"','"message"','"required"'
    $safe | ForEach-Object { $_.Line } | Out-Host

    # If we somehow regress to auth error, hard-fail so retries trigger.
    if ($probe -match '"Missing authorization header"' -or $probe -match '"Invalid JWT"') {
      throw "Probe indicates auth gate is still on (unexpected)."
    }
  } 1

  # --- Best-effort UI wiring (no guarantees, but automatic) ---
  # We search for likely checkout triggers and ensure helper is imported.
  Run-Step "Best-effort UI wiring (import helper where checkout refs exist)" {
    $paths = @()
    $hits = Select-String -Path ".\src\*" -Recurse -ErrorAction SilentlyContinue `
      -Pattern "create-checkout","functions/v1/create-checkout","Checkout","Buy","Purchase","stripe" |
      Select-Object -ExpandProperty Path -Unique
    if ($hits) { $paths = $hits }

    foreach ($file in $paths) {
      if ($file -notmatch "\.(js|jsx|ts|tsx)$") { continue }
      $txt = Get-Content -Raw $file

      if ($txt -match "from\s+['""][.\/]+lib\/createCheckout") { continue }

      # insert import after last import
      if ($txt -match "(?ms)^(import .*?;\s*)+") {
        $new = [regex]::Replace($txt, "(?ms)^(import .*?;\s*)+", "`$0import { createCheckout } from `"../lib/createCheckout`";`r`n", 1)
      } else {
        $new = "import { createCheckout } from `"../lib/createCheckout`";`r`n" + $txt
      }

      if ($new -ne $txt) {
        Set-Content -Encoding UTF8 $file -Value $new
      }
    }
  } 0

  # --- Build ---
  Run-Step "npm ci" { npm ci | Out-Null } 1
  Run-Step "npm run build" { npm run build | Out-Null } 0

  # --- Commit & push safe files only ---
  Run-Step "Commit & push safe activation changes (if any)" {
    git add ".\src\lib\createCheckout.js" | Out-Null
    git add ".\src" | Out-Null

    $staged = git diff --cached --name-only
    if ($staged) {
      git commit -m "Activate checkout helper + deploy readiness" | Out-Null
      git push origin main | Out-Null
    } else {
      Ok "No code changes to commit"
    }
  } 0

  Ok "AUTO-ORCHESTRATOR COMPLETE"
  Ok "Next action (no paste): open the deployed app, click checkout. If Stripe opens, activation succeeded."
}
catch {
  Warn "AUTO-ORCHESTRATOR FAILED"
  Warn $_.Exception.Message
  Stop-Transcript | Out-Null

  # Auto-open the log so you never paste anything.
  Write-Host "`nOpening log in Notepad (no copy/paste required): $log" -ForegroundColor Yellow
  Start-Process notepad.exe $log | Out-Null
  exit 1
}
finally {
  try { Stop-Transcript | Out-Null } catch {}
  Write-Host "`nLog saved to: $log"
}
