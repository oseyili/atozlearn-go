Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"



function LoadDotEnv {
  $candidates = @(".\ops\.secrets.env", ".env.local",
    ".env",
    ".env.production",
    ".env.production.local",
    ".env.development",
    ".env.development.local"
  )

  foreach ($f in $candidates) {
    if (Test-Path $f) {
      foreach ($line0 in (Get-Content $f)) {
        $line = ($line0).Trim()
        if (-not $line) { continue }
        if ($line.StartsWith("#")) { continue }
        if ($line -notmatch "=") { continue }

        $parts = $line.Split("=", 2)
        $k = ($parts[0]).Trim()
        $v = ($parts[1]).Trim().Trim("'").Trim('"')

        if ($k -eq "VITE_SUPABASE_ANON_KEY" -and -not $env:SUPABASE_ANON_KEY) { $env:SUPABASE_ANON_KEY = $v }
        if ($k -eq "SUPABASE_ANON_KEY" -and -not $env:SUPABASE_ANON_KEY) { $env:SUPABASE_ANON_KEY = $v }
        if ($k -eq "VITE_SITE_URL" -and -not $env:SITE_URL) { $env:SITE_URL = $v }
        if ($k -eq "SITE_URL" -and -not $env:SITE_URL) { $env:SITE_URL = $v }
      }
    }
  }
}
LoadDotEnv
$PROJECT_REF = "aueekqupqooeauvmeszh"
$SUPABASE_URL = "https://aueekqupqooeauvmeszh.supabase.co"
$COURSE_ID = $env:COURSE_ID
if (-not $COURSE_ID) { $COURSE_ID = "016819da-cd59-4801-b70b-bb6c7ae84e10" }

function MustEnv($n) {
  $v = [Environment]::GetEnvironmentVariable($n)
  if ([string]::IsNullOrWhiteSpace($v)) { throw "Missing env var $n" }
}
MustEnv "SUPABASE_ANON_KEY"
MustEnv "STRIPE_SECRET_KEY"
MustEnv "SUPABASE_SERVICE_ROLE_KEY"
if (-not $env:SITE_URL) { throw "Missing env var SITE_URL (your Render URL)" }

Write-Host "== HEAL: Sync secrets -> deploy functions -> smoke test ==" -ForegroundColor Cyan

# 1) Always sync secrets (idempotent)
npx supabase secrets set STRIPE_SECRET_KEY=$env:STRIPE_SECRET_KEY --project-ref $PROJECT_REF | Out-Host
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=$env:SUPABASE_SERVICE_ROLE_KEY --project-ref $PROJECT_REF | Out-Host
npx supabase secrets set SITE_URL=$env:SITE_URL --project-ref $PROJECT_REF | Out-Host
if ($env:HOOK_SECRET) {
  npx supabase secrets set HOOK_SECRET=$env:HOOK_SECRET --project-ref $PROJECT_REF | Out-Host
}

# 2) Deploy functions (checkout with JWT on; sync with shared-secret)
npx supabase functions deploy create-checkout --project-ref $PROJECT_REF | Out-Host
npx supabase functions deploy sync-course-stripe --project-ref $PROJECT_REF --no-verify-jwt | Out-Host

# 3) Smoke test using curl.exe (reliable on Windows PowerShell)
$payload = "{`"course_id`":`"$COURSE_ID`",`"successUrl`":`"$($env:SITE_URL)/success?session_id={CHECKOUT_SESSION_ID}`",`"cancelUrl`":`"$($env:SITE_URL)/cancel`"}"
$test = curl.exe -sS -i -X POST "$SUPABASE_URL/functions/v1/create-checkout" `
  -H "Content-Type: application/json" `
  -H "apikey: $env:SUPABASE_ANON_KEY" `
  -H "Authorization: Bearer $env:SUPABASE_ANON_KEY" `
  --data "$payload"

$test | Out-Host

# 4) Auto-fix: if Missing STRIPE_SECRET_KEY shows up, redeploy again (sometimes needed)
if ($test -match "Missing STRIPE_SECRET_KEY") {
  Write-Host "Detected missing STRIPE_SECRET_KEY at runtime -> redeploying create-checkout once more..." -ForegroundColor Yellow
  npx supabase functions deploy create-checkout --project-ref $PROJECT_REF | Out-Host
  $test2 = curl.exe -sS -i -X POST "$SUPABASE_URL/functions/v1/create-checkout" `
    -H "Content-Type: application/json" `
    -H "apikey: $env:SUPABASE_ANON_KEY" `
    -H "Authorization: Bearer $env:SUPABASE_ANON_KEY" `
    --data "$payload"
  $test2 | Out-Host
}

Write-Host "HEAL COMPLETE." -ForegroundColor Green
Read-Host "Press Enter to close"






