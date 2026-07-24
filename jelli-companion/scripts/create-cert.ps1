# create-cert.ps1
# Run once on YOUR machine to generate a self-signed code-signing certificate.
# Output: jelli-cert.pfx (kept by you, NEVER distribute this)
#         jelli-cert.cer (public cert — safe to distribute, included next to installer)
#
# Usage: .\scripts\create-cert.ps1

$ErrorActionPreference = "Stop"

$certName  = "Jelli Companion Beta"
$pfxPath   = "$PSScriptRoot\..\jelli-cert.pfx"
$cerPath   = "$PSScriptRoot\..\jelli-cert.cer"
$pfxPass   = Read-Host -AsSecureString "Enter a password to protect the PFX file"

Write-Host "`n[1/3] Creating self-signed code-signing certificate..." -ForegroundColor Cyan

$cert = New-SelfSignedCertificate `
    -Type CodeSigning `
    -Subject "CN=$certName" `
    -KeyUsage DigitalSignature `
    -FriendlyName $certName `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @(
        "2.5.29.37={text}1.3.6.1.5.5.7.3.3",  # Extended Key Usage: Code Signing
        "2.5.29.19={text}"                       # Basic Constraints: not a CA
    ) `
    -NotAfter (Get-Date).AddYears(3)

Write-Host "[2/3] Exporting PFX (private key + cert) to: $pfxPath" -ForegroundColor Cyan
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pfxPass | Out-Null

Write-Host "[3/3] Exporting public CER (distribute alongside installer) to: $cerPath" -ForegroundColor Cyan
Export-Certificate -Cert $cert -FilePath $cerPath -Type CERT | Out-Null

# Remove from personal store (the PFX is enough for signing)
Remove-Item -Path "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force

Write-Host "`n✅ Done!" -ForegroundColor Green
Write-Host "  PFX (keep secret):  $pfxPath"
Write-Host "  CER (distribute):   $cerPath"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Convert PFX to base64 for Tauri signing:"
Write-Host "     [Convert]::ToBase64String([IO.File]::ReadAllBytes('$pfxPath')) | Set-Content jelli-cert-b64.txt"
Write-Host "  2. Set env vars before building:"
Write-Host "     `$env:TAURI_CERTIFICATE = Get-Content jelli-cert-b64.txt"
Write-Host "  3. Set `$env:TAURI_CERTIFICATE_PASSWORD = '<your pfx password>'"
Write-Host "  4. Run: npm run tauri build"
