# One-time setup: generate a self-signed cert for dmqhre.slsblx.com and trust it.
# Run this once per machine from PowerShell. Safe to re-run.

$ErrorActionPreference = 'Stop'

$DOMAIN = 'dmqhre.slsblx.com'
$CERT_DIR = Join-Path $PSScriptRoot '.cert'
$CERT_PATH = Join-Path $CERT_DIR 'dev-cert.pem'
$KEY_PATH = Join-Path $CERT_DIR 'dev-key.pem'

# 1. Create the certificate (RSA 2048, SAN included, key exportable).
Write-Host "Creating self-signed cert for $DOMAIN ..."
$cert = New-SelfSignedCertificate `
  -Subject "CN=$DOMAIN" `
  -DnsName $DOMAIN `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -NotAfter (Get-Date).AddDays(365) `
  -KeyUsage DigitalSignature, KeyEncipherment `
  -KeyExportPolicy Exportable

# 2. Export public cert as PEM.
New-Item -ItemType Directory -Force -Path $CERT_DIR | Out-Null
$certDer = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$certB64 = [Convert]::ToBase64String($certDer, [System.Base64FormattingOptions]::InsertLineBreaks)
$certPem = @"
-----BEGIN CERTIFICATE-----
$certB64
-----END CERTIFICATE-----
"@
[System.IO.File]::WriteAllText($CERT_PATH, $certPem, [System.Text.Encoding]::ASCII)

# 3. Export private key as PKCS#8 PEM.
$keyDer = $cert.GetRSAPrivateKey().ExportPkcs8PrivateKey()
$keyB64 = [Convert]::ToBase64String($keyDer, [System.Base64FormattingOptions]::InsertLineBreaks)
$keyPem = @"
-----BEGIN PRIVATE KEY-----
$keyB64
-----END PRIVATE KEY-----
"@
[System.IO.File]::WriteAllText($KEY_PATH, $keyPem, [System.Text.Encoding]::ASCII)

# 4. Import to the user Root store so the browser trusts it.
$rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
$rootStore.Open('ReadWrite')
$rootStore.Add($cert)
$rootStore.Close()

Write-Host "Wrote $CERT_PATH"
Write-Host "Wrote $KEY_PATH"
Write-Host "Imported to Cert:\CurrentUser\Root (thumbprint $($cert.Thumbprint))"
Write-Host ""
Write-Host "Done. Restart any browser for the trust to take effect."
