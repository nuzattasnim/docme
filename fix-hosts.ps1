# One-time: un-comment the dmqhre.slsblx.com line in the Windows hosts file.
# MUST be run as Administrator (right-click PowerShell -> "Run as administrator").

$ErrorActionPreference = 'Stop'
$path = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$line = '127.0.0.1 dmqhre.slsblx.com'

if (-not (Test-Path $path)) {
  throw "hosts file not found at $path"
}

$content = Get-Content $path -Raw

if ($content -match '(?m)^\s*127\.0\.0\.1\s+dmqhre\.slsblx\.com\s*$') {
  Write-Host "Already uncommented. Nothing to do."
  exit 0
}

$newContent = $content -replace '(?m)^\s*#\s*127\.0\.0\.1\s+dmqhre\.slsblx\.com\s*$', $line

if ($newContent -eq $content) {
  throw "Couldn't find the dmqhre.slsblx.com line to uncomment."
}

Set-Content -Path $path -Value $newContent -Force -Encoding UTF8
Write-Host "Uncommented. hosts file now contains:"
Select-String -Path $path -Pattern 'dmqhre\.slsblx\.com' | ForEach-Object { Write-Host "  $_" }
