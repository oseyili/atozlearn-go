$ErrorActionPreference = 'SilentlyContinue'
Set-StrictMode -Off

if ($env:ATOZ_AUTODOCTOR -eq '0') { exit 0 }

try {
  New-Item -ItemType Directory -Force -Path 'C:\Users\oseyi\Documents\atozlearngo\ops\doctor','C:\Users\oseyi\Documents\atozlearngo\ops\doctor\logs' | Out-Null

  # Heartbeat
  (Get-Date).ToString('o') | Set-Content 'C:\Users\oseyi\Documents\atozlearngo\ops\doctor\heartbeat.txt'

  # Git health + auto-rebase
  if (Test-Path 'C:\Users\oseyi\Documents\atozlearngo\.git' -and (Get-Command git -ErrorAction SilentlyContinue)) {
    Push-Location 'C:\Users\oseyi\Documents\atozlearngo'
    $sb = git status -sb 2>&1
    if ($sb -match 'ahead' -and $sb -match 'behind') {
      git pull --rebase origin main 2>&1 | Out-Null
    }
    Pop-Location
  }

  # Backend self-test (silent)
  try {
    $url = (Get-Content 'C:\Users\oseyi\Documents\atozlearngo\.env' | Where-Object { $_ -like 'VITE_SUPABASE_URL*' }) -replace 'VITE_SUPABASE_URL=',''
    if ($url) {
      Invoke-RestMethod -Uri "$url/functions/v1/self-test" -TimeoutSec 5 |
        ConvertTo-Json -Depth 5 |
        Set-Content 'C:\Users\oseyi\Documents\atozlearngo\ops\doctor\backend-health.json'
    }
  } catch {}

} catch {}

exit 0
