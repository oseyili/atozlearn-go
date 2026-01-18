$ErrorActionPreference = "Stop"

function Info($m){ Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[ OK ] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }

Info "Running in: $PWD"

# 1) Sanity checks
if (-not (Test-Path ".\package.json")) { throw "Run this from the project root (where package.json exists)." }
if (-not (Test-Path ".\src")) { throw "src folder not found. Are you in the right repo?" }

# 2) Ensure src/supabaseClient.js exists (canonical)
$scPath = ".\src\supabaseClient.js"
if (-not (Test-Path $scPath)) {
  Info "Creating missing $scPath"
@"
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
"@ | Set-Content -Path $scPath -Encoding UTF8
  Ok "Created src/supabaseClient.js"
} else {
  Ok "src/supabaseClient.js already exists"
}

# 3) Fix src/main.jsx import path to match ./supabaseClient
$mainPath = ".\src\main.jsx"
if (-not (Test-Path $mainPath)) { throw "src/main.jsx not found." }

Info "Ensuring src/main.jsx imports ./supabaseClient"
$main = Get-Content $mainPath -Raw

$main2 = $main
$main2 = $main2 -replace "from\s+['""](\.\/|\.\/lib\/|\.\/utils\/|\.\/services\/|\.\/config\/)?supabaseClient(\.js|\.jsx|\.ts|\.tsx)?['""]", "from `"./supabaseClient`""

if ($main2 -ne $main) {
  Set-Content -Path $mainPath -Value $main2 -Encoding UTF8
  Ok "Updated import in src/main.jsx"
} else {
  Warn "No supabaseClient import string changed in src/main.jsx (may already be correct, or file doesn't import it)."
}

# 4) Ensure Vite env vars exist (create .env.local if missing and user can fill)
$envFile = ".\.env.local"
if (-not (Test-Path $envFile)) {
  Info "Creating .env.local with placeholders"
@"
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
"@ | Set-Content -Path $envFile -Encoding UTF8
  Warn ".env.local created with empty values. If you already set these in Render, that's fine for deployment; for local build, fill them in."
} else {
  Ok ".env.local already exists"
}

# 5) Install deps
Info "Running npm ci..."
npm ci | Out-Host
Ok "npm ci complete"

# 6) Build
Info "Running npm run build..."
npm run build | Out-Host
Ok "Build succeeded"

# 7) Optional: Deploy Supabase Edge Function create-checkout (only if CLI exists + function folder exists)
$fnName = "create-checkout"
$fnDir = ".\supabase\functions\$fnName"
$supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue

if ($supabaseCmd -and (Test-Path $fnDir)) {
  Info "Supabase CLI found and function folder exists. Attempting deploy for $fnName..."

  try {
    supabase functions deploy $fnName | Out-Host
    Ok "Supabase function deployed: $fnName"
  } catch {
    Warn "Supabase deploy failed (project may not be linked/logged in). This does NOT affect the successful frontend build."
    Warn $_.Exception.Message
  }
} else {
  Warn "Skipping Supabase function deploy: CLI not found or function folder missing."
}

# 8) Final summary
Ok "ALL DONE."
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Host "- src/supabaseClient.js ensured" -ForegroundColor White
Write-Host "- src/main.jsx import normalized (best-effort)" -ForegroundColor White
Write-Host "- .env.local ensured (placeholders if needed)" -ForegroundColor White
Write-Host "- npm ci completed" -ForegroundColor White
Write-Host "- npm run build succeeded" -ForegroundColor White
Write-Host "- supabase functions deploy attempted (if available)" -ForegroundColor White
