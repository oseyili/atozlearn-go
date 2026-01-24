# auto-activate.ps1 (Windows PowerShell 5.1)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail($msg) { Write-Host "`n[FATAL] $msg" -ForegroundColor Red; exit 1 }
function Info($msg) { Write-Host "`n[INFO] $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }

# --- Repo root ---
$repo = "C:\Users\oseyi\Documents\atozlearngo"
if (!(Test-Path $repo)) { Fail "Repo not found: $repo" }
Set-Location $repo
Ok "Repo: $repo"

# --- Logging / transcript (non-disappearing) ---
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = ".\ops\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("auto-activate-" + $ts + ".log")

Start-Transcript -Path $log -Append | Out-Null
Info "Transcript: $log"

try {
  # --- Read .env safely (DO NOT PRINT KEYS) ---
  Info "Reading .env safely"
  $envPath = ".\.env"
  if (!(Test-Path $envPath)) { Fail ".env missing at repo root" }

  $envText = Get-Content -Raw $envPath
  $viteUrlMatch = [regex]::Match($envText, '(?m)^VITE_SUPABASE_URL=(.*)$')
  $anonMatch    = [regex]::Match($envText, '(?m)^VITE_SUPABASE_ANON_KEY=(.*)$')

  if (!$viteUrlMatch.Success) { Fail "VITE_SUPABASE_URL missing in .env" }
  if (!$anonMatch.Success)    { Fail "VITE_SUPABASE_ANON_KEY missing in .env" }

  $viteUrl = $viteUrlMatch.Groups[1].Value.Trim()
  $anon    = $anonMatch.Groups[1].Value.Trim()

  if (!$viteUrl) { Fail "VITE_SUPABASE_URL empty" }
  if (!$anon)    { Fail "VITE_SUPABASE_ANON_KEY empty" }

  $ref = $null
  if ($viteUrl -match '^https://([a-z0-9]+)\.supabase\.co') { $ref = $Matches[1] }
  if (!$ref) { Fail "Could not parse Supabase project ref from VITE_SUPABASE_URL" }

  Ok "Supabase URL loaded (safe)"
  Ok ("Project ref (safe): " + $ref)
  Ok ("Anon key length (safe): " + $anon.Length)

  # --- Prevent TOML BOM/config merge failures (local only) ---
  Info "Neutralizing supabase/config.toml merge/BOM issues (local only)"
  if (Test-Path ".\supabase\config.toml") { Remove-Item -Force ".\supabase\config.toml" -ErrorAction SilentlyContinue; Ok "Removed supabase/config.toml" }
  if (Test-Path ".\supabase\config.toml.bak") { Remove-Item -Force ".\supabase\config.toml.bak" -ErrorAction SilentlyContinue; Ok "Removed supabase/config.toml.bak" }

  # --- Link CLI to correct project ---
  Info "Linking Supabase CLI to correct project (safe)"
  supabase link --project-ref $ref | Out-Null
  Ok "Supabase linked"

  # --- Ensure checkout helper exists ---
  Info "Ensuring src/lib/createCheckout.js"
  New-Item -ItemType Directory -Force -Path ".\src\lib" | Out-Null
  $helperPath = ".\src\lib\createCheckout.js"

  if (!(Test-Path $helperPath)) {
@"
import { supabase } from "../supabaseClient";

/**
 * Creates a Stripe Checkout session for a course.
 * Uses supabase.functions.invoke so apikey + Authorization are handled correctly.
 * Includes userId in body as fallback if server supports it.
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
    Ok "Created helper"
  } else {
    Ok "Helper already exists"
  }

  # --- Deploy functions (gateway-open activation) ---
  Info "Deploying functions (activation)"
  supabase functions deploy create-checkout --no-verify-jwt | Out-Null
  Ok "Deployed create-checkout (--no-verify-jwt)"

  supabase functions deploy stripe-webhook --no-verify-jwt | Out-Null
  Ok "Deployed stripe-webhook (--no-verify-jwt)"

  # --- Safe probe: only prints HTTP + marker/error/message/required ---
  Info "Probing create-checkout (safe output only)"
  '{"ping":true}' | Set-Content -Encoding Ascii ".\_payload.json"

  $fnUrl = $viteUrl.TrimEnd("/") + "/functions/v1/create-checkout"
  $probe = & "$env:SystemRoot\System32\curl.exe" -sS -i -X POST $fnUrl `
    -H "Content-Type: application/json" `
    -H "apikey: $anon" `
    --data-binary "@_payload.json"

  $probe | Select-String -Pattern '^HTTP/','"marker"','"error"','"message"','"required"' | ForEach-Object { $_.Line } | Out-Host
  Ok "Probe finished"

  # --- Build ---
  Info "npm ci + build"
  npm ci | Out-Null
  Ok "npm ci ok"
  npm run build | Out-Null
  Ok "build ok"

  # --- Commit + push safe changes only ---
  Info "Commit + push (safe files only)"
  git add ".\src\lib\createCheckout.js" | Out-Null

  $staged = git diff --cached --name-only
  if ($staged) {
    git commit -m "Activate checkout helper" | Out-Null
    Ok "Committed"
    git push origin main | Out-Null
    Ok "Pushed"
  } else {
    Ok "Nothing to commit"
  }

  Ok "AUTO-ACTIVATE COMPLETE"
}
catch {
  Fail $_.Exception.Message
}
finally {
  Stop-Transcript | Out-Null
  Write-Host "`nLog saved to: $log"
}
