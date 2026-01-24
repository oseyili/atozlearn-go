# ops/doctor/wrappers.ps1
. "C:\Users\oseyi\Documents\atozlearngo\ops\doctor\runtime.ps1"

function global:npm {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
  if (-not (_AtoZWrapEnabled)) { & npm.cmd @Args; return }

  Push-Location "C:\Users\oseyi\Documents\atozlearngo"
  try {
    $r = _AtoZRunNative "npm" { npm.cmd @Args } 60
    if ($r.ok) { $LASTEXITCODE=0; ($r.out|Select-Object -Last 15); return }

    # auto-fix: install then retry for common scenarios
    $txt = ($r.out -join "`n")
    $isBuild = ($Args.Count -ge 2 -and $Args[0] -eq "run" -and $Args[1] -eq "build")
    $needInstall = $isBuild -or ($txt -match "node_modules|MODULE_NOT_FOUND|Cannot find module|ENOENT|lockfile")

    if ($needInstall) {
      Write-Host "[AutoDoctor] npm failed → auto-fix: npm install" -ForegroundColor Yellow
      $ri = _AtoZRunNative "npm-install" { npm.cmd install } 80
      if ($ri.ok) {
        Write-Host "[AutoDoctor] retrying: npm $($Args -join ' ')" -ForegroundColor Yellow
        $r2 = _AtoZRunNative "npm-retry" { npm.cmd @Args } 120
        if ($r2.ok) { Write-Host "[AutoDoctor] fixed ✅" -ForegroundColor Green; $LASTEXITCODE=0; return }
        _AtoZReturnClean $r2 "[AutoDoctor] npm still failing after auto-fix (showing error):"
        return
      }
      _AtoZReturnClean $ri "[AutoDoctor] npm install failed during auto-fix (showing error):"
      return
    }

    _AtoZReturnClean $r "[AutoDoctor] npm failed (showing error):"
  } finally { Pop-Location }
}

function global:git {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
  if (-not (_AtoZWrapEnabled)) { & git.exe @Args; return }

  Push-Location "C:\Users\oseyi\Documents\atozlearngo"
  try {
    if ($Args.Count -gt 0 -and $Args[0] -eq "push") {
      $r = _AtoZRunNative "git-push" { git.exe @Args } 120
      if ($r.ok) { $LASTEXITCODE=0; return }

      $txt = ($r.out -join "`n")
      if ($txt -match "fetch first|rejected|non-fast-forward|Updates were rejected") {
        Write-Host "[AutoDoctor] git push rejected → auto-fix: pull --rebase origin main" -ForegroundColor Yellow
        $pr = _AtoZRunNative "git-pull-rebase" { git.exe pull --rebase origin main } 180
        if ($pr.ok) {
          Write-Host "[AutoDoctor] retrying git push..." -ForegroundColor Yellow
          $r2 = _AtoZRunNative "git-push-retry" { git.exe @Args } 180
          if ($r2.ok) { Write-Host "[AutoDoctor] fixed ✅" -ForegroundColor Green; $LASTEXITCODE=0; return }
          _AtoZReturnClean $r2 "[AutoDoctor] git push still failing after auto-fix (showing error):"
          return
        }
        _AtoZReturnClean $pr "[AutoDoctor] git pull --rebase failed during auto-fix (showing error):"
        return
      }

      _AtoZReturnClean $r "[AutoDoctor] git push failed (showing error):"
      return
    }

    $r = _AtoZRunNative "git" { git.exe @Args } 120
    if ($r.ok) { $LASTEXITCODE=0; ($r.out|Select-Object -Last 60); return }
    _AtoZReturnClean $r "[AutoDoctor] git failed (showing error):"
  } finally { Pop-Location }
}

function global:node   { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args) if (-not (_AtoZWrapEnabled)) { & node.exe @Args; return } $r=_AtoZRunNative "node" { node.exe @Args } 120; if($r.ok){$LASTEXITCODE=0; ($r.out|Select-Object -Last 60)} else {_AtoZReturnClean $r "[AutoDoctor] node failed (showing error):"} }
function global:python { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args) if (-not (_AtoZWrapEnabled)) { & python.exe @Args; return } $r=_AtoZRunNative "python" { python.exe @Args } 120; if($r.ok){$LASTEXITCODE=0; ($r.out|Select-Object -Last 60)} else {_AtoZReturnClean $r "[AutoDoctor] python failed (showing error):"} }
function global:deno   { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args) if (-not (_AtoZWrapEnabled)) { & deno.exe @Args; return } $r=_AtoZRunNative "deno" { deno.exe @Args } 120; if($r.ok){$LASTEXITCODE=0; ($r.out|Select-Object -Last 60)} else {_AtoZReturnClean $r "[AutoDoctor] deno failed (showing error):"} }

function global:supabase {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
  if (-not (_AtoZWrapEnabled)) { & supabase.exe @Args; return }
  Push-Location "C:\Users\oseyi\Documents\atozlearngo"
  try {
    $r=_AtoZRunNative "supabase" { supabase.exe @Args } 200
    # sanitize obvious bearer headers if any (belt & suspenders)
    $r.out = $r.out | ForEach-Object { "$_" -replace '(?i)(authorization:)\s*bearer\s+\S+','$1 Bearer REDACTED' }
    if($r.ok){$LASTEXITCODE=0; ($r.out|Select-Object -Last 80); return}
    _AtoZReturnClean $r "[AutoDoctor] supabase failed (showing error):"
  } finally { Pop-Location }
}

function global:curl {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
  if (-not (_AtoZWrapEnabled)) { & "$env:SystemRoot\System32\curl.exe" @Args; return }
  $r=_AtoZRunNative "curl" { & "$env:SystemRoot\System32\curl.exe" @Args } 200
  $r.out = $r.out | ForEach-Object { "$_" -replace '(?i)(authorization:)\s*bearer\s+\S+','$1 Bearer REDACTED' }
  if($r.ok){$LASTEXITCODE=0; ($r.out|Select-Object -Last 80); return}
  _AtoZReturnClean $r "[AutoDoctor] curl failed (showing error):"
}
