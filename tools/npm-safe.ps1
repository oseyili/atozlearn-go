param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
if (-not $Args -or $Args.Count -eq 0) { & npm --version; exit $LASTEXITCODE }
& npm @Args
exit $LASTEXITCODE
