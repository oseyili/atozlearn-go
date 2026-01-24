# ops/doctor/ps-prompt-hook.ps1
. "C:\Users\oseyi\Documents\atozlearngo\ops\doctor\runtime.ps1"

function global:Invoke-AtoZDoctor {
  if (-not (_AtoZDoctorEnabled)) { return }

  $repo = "C:\Users\oseyi\Documents\atozlearngo"
  $log = _AtoZLogPath "autodoctor"
  try {
    Push-Location $repo

    # 1) Ensure git knows about remote (no errors shown)
    & git.exe fetch origin 2>$null | Out-Null

    # 2) If local behind remote main, self-heal rebase
    $behind = (& git.exe rev-list --count HEAD..origin/main 2>$null)
    if ($behind -and [int]$behind -gt 0) {
      & git.exe pull --rebase origin main 2>$null | Out-Null
    }

    # 3) Ensure node_modules exists for builds
    if (!(Test-Path (Join-Path $repo "node_modules"))) {
      & npm.cmd install 2>$null | Out-Null
    }

    # 4) Portal sanity: ensure PortalPage exists (do NOT rewrite here)
    if (!(Test-Path (Join-Path $repo "src\pages\PortalPage.jsx"))) {
      "Missing src\pages\PortalPage.jsx" | Add-Content -Encoding UTF8 $log
    }
  } catch {
    # Never throw
    try { "autodoctor exception: $($_)" | Add-Content -Encoding UTF8 $log } catch {}
  } finally {
    try { Pop-Location } catch {}
  }
}

# Prompt that ALWAYS runs autoscan before displaying
function global:prompt {
  Invoke-AtoZDoctor
  $ts = (Get-Date).ToString("HH:mm:ss")
  "AUTO[$ts] PS $($PWD)> "
}
