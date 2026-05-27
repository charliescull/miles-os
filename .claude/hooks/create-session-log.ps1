$d = 'c:\Users\charl\OneDrive\Documents\OS System\docs\vault\sessions'
if (!(Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
$f = "$d\$(Get-Date -Format 'yyyy-MM-dd').md"
if (!(Test-Path $f)) {
    $content = @"
# Session Log — $(Get-Date -Format 'yyyy-MM-dd')

_Claude will write a summary at session end._

## Summary

## Changes Made

## Next Steps
"@
    $content | Out-File -FilePath $f -Encoding utf8
}
