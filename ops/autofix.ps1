Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$PROJECT_REF="aueekqupqooeauvmeszh"
$SUPABASE_URL="https://aueekqupqooeauvmeszh.supabase.co"
$COURSE_ID="016819da-cd59-4801-b70b-bb6c7ae84e10"

function Say($m){ Write-Host $m -ForegroundColor Cyan }
function Ok($m){ Write-Host $m -ForegroundColor Green }
function Warn($m){ Write-Host $m -ForegroundColor Yellow }
function Fail($m){ Write-Host $m -ForegroundColor Red; throw $m }

Say "0) Precheck: repo + git"
if (-not (Test-Path .git)) { Fail "Not a git repo. Run from your project root." }

Say "1) Ensure required schema exists (stripe columns)"
New-Item -Force -ItemType Directory .\supabase\migrations | Out-Null
$ts = Get-Date -Format "yyyyMMddHHmmss"
$mig = ".\supabase\migrations\${ts}_ensure_courses_stripe_columns.sql"
@"
alter table if exists public.courses
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text;

alter table if exists public.courses
  add column if not exists price_cents integer not null default 0,
  add column if not exists currency text not null default 'gbp';
"@ | Set-Content -Encoding ASCII $mig

Say "2) Push DB migration (idempotent)"
npx supabase db push | Out-Host

Say "3) Verify secrets names exist (no values shown)"
$secrets = npx supabase secrets list --project-ref $PROJECT_REF
$need = @("STRIPE_SECRET_KEY","SUPABASE_URL","SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY","HOOK_SECRET","SITE_URL")
foreach($n in $need){
  if ($secrets -notmatch "(?m)^\s*$n\s") { Warn "Missing secret name in Supabase: $n (set it in Supabase Secrets)" }
}

Say "4) Redeploy functions (reload secrets + schema)"
npx supabase functions deploy sync-course-stripe --project-ref $PROJECT_REF --no-verify-jwt | Out-Host
npx supabase functions deploy stripe-webhook     --project-ref $PROJECT_REF --no-verify-jwt | Out-Host
npx supabase functions deploy create-checkout    --project-ref $PROJECT_REF | Out-Host

Say "5) Auto-patch frontend to send USER JWT (fix Invalid JWT)"
$files = Get-ChildItem -Recurse -File .\src -Include *.js,*.jsx,*.ts,*.tsx |
  Where-Object { Select-String -Path $_.FullName -Pattern "create-checkout" -Quiet }

if (-not $files) { Warn "No frontend files referencing 'create-checkout' found under .\src. Skipping frontend patch." }
else {
  $changed = 0
  foreach($f in $files){
    $p=$f.FullName
    $c=Get-Content $p -Raw

    # Only patch files that already reference supabase (we won't guess imports)
    if ($c -notmatch "\bsupabase\b") { continue }

    # If already uses session access_token, skip
    if ($c -match "Authorization:\s*`?Bearer\s*`?\$\{?\s*session\.access_token") { continue }

    # Insert session fetch immediately before fetch(create-checkout...) (first occurrence)
    $c2 = [regex]::Replace(
      $c,
      '(?s)(\n[ \t]*)(await\s+fetch\([^\)]*create-checkout[^\)]*,\s*\{)',
      "`$1const { data: { session } } = await supabase.auth.getSession();`r`n`$1`$2",
      1
    )

    # Ensure Authorization header exists in headers block
    if ($c2 -match '(?s)create-checkout[\s\S]*headers\s*:\s*\{') {
      $c2 = [regex]::Replace(
        $c2,
        '(?s)(headers\s*:\s*\{)',
        "`$1`r`n      Authorization: `Bearer `${session?.access_token || ''}`,",
        1
      )
    }

    if ($c2 -ne $c){
      Set-Content -Encoding UTF8 -Path $p -Value $c2
      $changed++
      Ok "UPDATED: $p"
    }
  }

  if ($changed -gt 0){
    Say "6) Commit + push so Render redeploys"
    git add . | Out-Null
    git commit -m "Auto-fix: send Supabase user JWT to create-checkout" | Out-Host
    git push | Out-Host
    Ok "Frontend patch shipped."
  } else {
    Warn "No frontend changes applied (either already patched or patterns didn't match)."
  }
}

Ok "AUTO-FIX COMPLETE."
Write-Host ""
Write-Host "NEXT (only remaining human step): open the app, sign in, click Checkout once." -ForegroundColor Yellow
Write-Host "If it still fails, open Network -> create-checkout -> Response JSON and paste ONLY that JSON." -ForegroundColor Yellow
