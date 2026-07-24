# trust-jelli-cert.ps1
# Beta tester script — run this ONCE before installing Jelli Companion.
# It installs the Jelli developer certificate so Windows trusts the installer
# and SmartScreen stays silent.
#
# Must be run as Administrator (the script will self-elevate if needed).

param([string]$CertPath = "$PSScriptRoot\jelli-cert.cer")

# Self-elevate if not admin
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltinRole]::Administrator)) {
    Write-Host "Requesting administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`" -CertPath `"$CertPath`""
    exit
}

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CertPath)) {
    Write-Error "Certificate not found at: $CertPath`nMake sure jelli-cert.cer is in the same folder as this script."
    exit 1
}

Write-Host "`n🪼 Jelli Companion — Beta Certificate Installer" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Installing developer certificate to:"
Write-Host "  • Trusted Root Certification Authorities"
Write-Host "  • Trusted Publishers"
Write-Host ""

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertPath)

# Install to Trusted Root CA (system-wide, requires admin)
$rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store(
    [System.Security.Cryptography.X509Certificates.StoreName]::Root,
    [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
)
$rootStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
$rootStore.Add($cert)
$rootStore.Close()

# Install to Trusted Publishers (system-wide, requires admin)
$pubStore = New-Object System.Security.Cryptography.X509Certificates.X509Store(
    [System.Security.Cryptography.X509Certificates.StoreName]::TrustedPublisher,
    [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
)
$pubStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
$pubStore.Add($cert)
$pubStore.Close()

Write-Host "✅ Certificate installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now run the Jelli installer without any SmartScreen warning." -ForegroundColor Green
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
