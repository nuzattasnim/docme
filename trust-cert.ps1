# One-time: import the regenerated cert into Cert:\CurrentUser\Root so the browser
# trusts it without warnings. Also removes any prior dmqhre.slsblx.com certs left
# behind by earlier aborted attempts.

$DOMAIN = 'dmqhre.slsblx.com'
$CERT_PATH = Join-Path $PSScriptRoot '.cert/dev-cert.pem'

if (-not (Test-Path $CERT_PATH)) {
  throw "Cert not found at $CERT_PATH. Run 'node generate-cert.cjs' first."
}

# 1. Remove any certs in the user Root store with this CN (cleanup).
$root = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
$root.Open('ReadWrite')
try {
  $existing = $root.Certificates | Where-Object { $_.Subject -like "CN=$DOMAIN" }
  foreach ($c in $existing) {
    Write-Host "Removing old cert: $($c.Thumbprint)"
    $root.Remove($c)
  }
} finally {
  $root.Close()
}

# 2. Import the new cert.
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CERT_PATH)
$root = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
$root.Open('ReadWrite')
try {
  $root.Add($cert)
} finally {
  $root.Close()
}

Write-Host "Imported $($cert.Thumbprint) to Cert:\CurrentUser\Root"
Write-Host "Restart any browser for the trust to take effect."
