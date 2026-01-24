# self-heal.ps1 (Windows PowerShell 5.1)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Info($m){ Write-Host "`n[INFO] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[OK] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }

$repo = "C:\Users\oseyi\Documents\atozlearngo"
Set-Location $repo

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = ".\ops\heal\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("self-heal-" + $ts + ".log")
Start-Transcript -Path $log -Append | Out-Null
Info "Self-heal log: $log"

try {
  $envText = Get-Content -Raw ".\.env"
  function EnvVal([string]$k){
    $m = [regex]::Match($envText, "(?m)^\s*$([regex]::Escape($k))\s*=\s*(.+)\s*$")
    if ($m.Success) { return $m.Groups[1].Value.Trim() }
    return $null
  }

  $viteUrl = (EnvVal "VITE_SUPABASE_URL").Trim().TrimEnd("/")
  if (!$viteUrl) { throw "VITE_SUPABASE_URL missing" }

  $ref = $null
  if ($viteUrl -match '^https://([a-z0-9]+)\.supabase\.co') { $ref = $Matches[1] }
  if (!$ref) { throw "Could not parse project ref from VITE_SUPABASE_URL" }

  Ok ("Project ref parsed (safe): " + $ref)

  # Fix known local CLI TOML BOM/merge failures
  Info "Neutralizing local supabase/config.toml"
  if (Test-Path ".\supabase\config.toml") { Remove-Item -Force ".\supabase\config.toml" -ErrorAction SilentlyContinue }
  if (Test-Path ".\supabase\config.toml.bak") { Remove-Item -Force ".\supabase\config.toml.bak" -ErrorAction SilentlyContinue }

  Info "Linking Supabase CLI"
  supabase link --project-ref $ref | Out-Null
  Ok "Supabase linked"

  Info "Redeploying functions (activation)"
  supabase functions deploy create-checkout --no-verify-jwt | Out-Null
  supabase functions deploy stripe-webhook --no-verify-jwt | Out-Null
  supabase functions deploy self-test --no-verify-jwt | Out-Null
  Ok "Functions redeployed"

  Info "Ensuring checkout helper exists"
  New-Item -ItemType Directory -Force -Path ".\src\lib" | Out-Null
  $helperPath = ".\src\lib\createCheckout.js"
  if (!(Test-Path $helperPath)) {
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
"@ | Set-Content -Encoding UTF8 $helperPath
    Ok "Helper created"
  } else { Ok "Helper present" }

  Info "Build"
  npm ci | Out-Null
  npm run build | Out-Null
  Ok "Build ok"

  Info "Commit & push safe changes if any"
  git add .\src\lib\createCheckout.js | Out-Null
  git add .\src | Out-Null
  $staged = git diff --cached --name-only
  if ($staged) {
    git commit -m "Self-heal: redeploy + ensure helper" | Out-Null
    git push origin main | Out-Null
    Ok "Pushed main"
  } else { Ok "No changes to push" }

  Ok "SELF-HEAL COMPLETE"
}
catch {
  Warn "SELF-HEAL FAILED: $($_.Exception.Message)"
  Stop-Transcript | Out-Null
  Start-Process notepad.exe $log | Out-Null
  exit 2
}
finally {
  try { Stop-Transcript | Out-Null } catch {}
}
