param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
if (-not $Args -or $Args.Count -eq 0) { & git status; exit $LASTEXITCODE }
& git @Args
exit $LASTEXITCODE
