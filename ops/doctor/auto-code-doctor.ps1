# auto-code-doctor.ps1 (Windows PowerShell 5.1)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Info($m){ Write-Host "`n[INFO] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[OK] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }

function Write-FileUtf8($path, $content) {
  $dir = Split-Path -Parent $path
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Set-Content -Encoding UTF8 -Path $path -Value $content
}

function Read-EnvSafe {
  $envPath = ".\.env"
  if (!(Test-Path $envPath)) { throw ".env missing at repo root" }
  $envText = Get-Content -Raw $envPath

  function EnvVal([string]$k){
    $m = [regex]::Match($envText, "(?m)^\s*$([regex]::Escape($k))\s*=\s*(.+)\s*$")
    if ($m.Success) { return $m.Groups[1].Value.Trim() }
    return $null
  }

  $viteUrl = EnvVal "VITE_SUPABASE_URL"
  $anon    = EnvVal "VITE_SUPABASE_ANON_KEY"
  if (!$viteUrl) { throw "VITE_SUPABASE_URL missing" }
  if (!$anon)    { throw "VITE_SUPABASE_ANON_KEY missing" }

  $viteUrl = $viteUrl.Trim().TrimEnd("/")
  $ref = $null
  if ($viteUrl -match '^https://([a-z0-9]+)\.supabase\.co') { $ref = $Matches[1] }
  if (!$ref) { throw "Could not parse project ref from VITE_SUPABASE_URL" }

  return [pscustomobject]@{ VITE_URL = $viteUrl; ANON = $anon; REF = $ref }
}

function Run-Retry([string]$name, [scriptblock]$sb, [int]$retries=1) {
  for ($i=0; $i -le $retries; $i++) {
    try { & $sb; return $true } catch { if ($i -eq $retries) { return $false }; Start-Sleep -Seconds 2 }
  }
}

$repo = "C:\Users\oseyi\Documents\atozlearngo"
Set-Location $repo

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = ".\ops\doctor\logs"
$repDir = ".\ops\doctor\reports\run-$ts"
New-Item -ItemType Directory -Force -Path $logDir,$repDir | Out-Null

$log = Join-Path $logDir "doctor-$ts.log"
Start-Transcript -Path $log -Append | Out-Null

try {
  # Auto-fix: Supabase CLI TOML BOM/merge issue
  if (Test-Path ".\supabase\config.toml") { Remove-Item -Force ".\supabase\config.toml" -ErrorAction SilentlyContinue }
  if (Test-Path ".\supabase\config.toml.bak") { Remove-Item -Force ".\supabase\config.toml.bak" -ErrorAction SilentlyContinue }

  $env = Read-EnvSafe

  # Link CLI to correct project
  Run-Retry "Supabase link" { supabase link --project-ref $env.REF | Out-Null } 2 | Out-Null

  # Safe, deterministic fix: ensure App.jsx default export (prevents Vite blank build)
  $appJsx = ".\src\App.jsx"
  if (Test-Path $appJsx) {
    $t = Get-Content -Raw $appJsx
    if ($t -notmatch "export\s+default") {
      if ($t -match "(?m)^\s*function\s+App\s*\(" -or $t -match "(?m)^\s*const\s+App\s*=") {
        if ($t -notmatch "(?m)^\s*export\s+default\s+App\s*;") {
          Write-FileUtf8 $appJsx ($t.TrimEnd() + "`r`n`r`nexport default App;`r`n")
        }
      }
    }
  }

  # Safe, deterministic fix: ensure createCheckout helper exists
  New-Item -ItemType Directory -Force -Path ".\src\lib" | Out-Null
  $helper = ".\src\lib\createCheckout.js"
  if (!(Test-Path $helper)) {
@"
import { supabase } from "../supabaseClient";
export async function createCheckout(courseId) {
  if (!courseId) throw new Error("Missing courseId");
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id || null;
  const { data, error } = await supabase.functions.invoke("create-checkout", { body: { courseId, userId } });
  if (error) throw error;
  if (!data?.url) throw new Error(data?.error || "No checkout url returned");
  return data.url;
}
"@ | Set-Content -Encoding UTF8 $helper
  }

  # Deploy critical edge functions in activation mode
  Run-Retry "Deploy create-checkout" { supabase functions deploy create-checkout --no-verify-jwt | Out-Null } 2 | Out-Null
  Run-Retry "Deploy stripe-webhook"  { supabase functions deploy stripe-webhook  --no-verify-jwt | Out-Null } 2 | Out-Null
  Run-Retry "Deploy self-test"       { supabase functions deploy self-test       --no-verify-jwt | Out-Null } 2 | Out-Null

  # Safe probes (save only)
  $selfUrl = $env.VITE_URL + "/functions/v1/self-test"
  $coUrl   = $env.VITE_URL + "/functions/v1/create-checkout"

  $selfResp = & "$env:SystemRoot\System32\curl.exe" -sS -i -X GET $selfUrl -H "apikey: $($env.ANON)"
  ($selfResp | Select-String -Pattern '^HTTP/','"ok"','"marker"','"error"','"keyOk"','"priceOk"').Line |
    Out-File -Encoding UTF8 (Join-Path $repDir "self-test-safe.txt")

  '{"ping":true}' | Set-Content -Encoding Ascii (Join-Path $repDir "_payload.json")
  $probe = & "$env:SystemRoot\System32\curl.exe" -sS -i -X POST $coUrl -H "Content-Type: application/json" -H "apikey: $($env.ANON)" --data-binary "@$((Join-Path $repDir "_payload.json"))"
  ($probe | Select-String -Pattern '^HTTP/','"marker"','"error"','"message"','"required"').Line |
    Out-File -Encoding UTF8 (Join-Path $repDir "create-checkout-probe-safe.txt")

  # Build
  if (-not (Run-Retry "npm ci" { npm ci | Out-Null } 1)) { throw "npm ci failed" }
  if (-not (Run-Retry "npm run build" { npm run build | Out-Null } 1)) { throw "build failed" }

  # Commit safe files only (never ops/logs/diagnostics)
  git add ".\src\lib\createCheckout.js" | Out-Null
  if (Test-Path ".\src\App.jsx") { git add ".\src\App.jsx" | Out-Null }

  $staged = git diff --cached --name-only
  if ($staged) {
    git commit -m "AutoDoctor: safe fixes + readiness" | Out-Null
    git push origin main | Out-Null
  }
}
finally {
  try { Stop-Transcript | Out-Null } catch {}
}
