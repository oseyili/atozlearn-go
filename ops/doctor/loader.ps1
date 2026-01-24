# loader.ps1 (self-healing)
$repo = "C:\Users\oseyi\Documents\atozlearngo"
$hook = Join-Path $repo "ops\doctor\ps-prompt-hook.ps1"

if (!(Test-Path $hook)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $hook) | Out-Null
  Set-Content -Encoding ASCII -Path $hook -Value "function global:prompt { 'AUTO[MISSING-HOOK] PS ' + (Get-Location) + '> ' }"
}
. $hook
