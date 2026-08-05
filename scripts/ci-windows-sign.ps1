param(
    [Parameter(Mandatory = $true)]
    [string]$Binary
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $Binary -PathType Leaf)) {
    throw "Windows signing binary not found: $Binary"
}
if ([string]::IsNullOrWhiteSpace($env:WINDOWS_SIGNING_PFX_BASE64)) {
    throw "WINDOWS_SIGNING_PFX_BASE64 is required"
}
if ([string]::IsNullOrWhiteSpace($env:WINDOWS_SIGNING_PFX_PASSWORD)) {
    throw "WINDOWS_SIGNING_PFX_PASSWORD is required"
}

$timestampUrl = if ([string]::IsNullOrWhiteSpace($env:WINDOWS_SIGNING_TIMESTAMP_URL)) {
    "http://timestamp.digicert.com"
} else {
    $env:WINDOWS_SIGNING_TIMESTAMP_URL
}
$workDir = Join-Path $env:RUNNER_TEMP ("pocketai-omp-sign-" + [guid]::NewGuid().ToString("N"))
$pfxPath = Join-Path $workDir "certificate.pfx"
$importedCertificate = $null
$importedCertificates = @()

try {
    New-Item -ItemType Directory -Path $workDir | Out-Null
    [IO.File]::WriteAllBytes($pfxPath, [Convert]::FromBase64String($env:WINDOWS_SIGNING_PFX_BASE64))
    $securePassword = ConvertTo-SecureString $env:WINDOWS_SIGNING_PFX_PASSWORD -AsPlainText -Force
    $importedCertificates = @(Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation "Cert:\CurrentUser\My" -Password $securePassword)
    $importedCertificate = $importedCertificates |
        Where-Object { $_.HasPrivateKey -and ($_.EnhancedKeyUsageList.ObjectId -contains "1.3.6.1.5.5.7.3.3") } |
        Select-Object -First 1
    if ($null -eq $importedCertificate) {
        throw "The PFX did not contain a code-signing certificate with a private key"
    }

    $kitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
    $signTool = Get-ChildItem -Path $kitsRoot -Filter signtool.exe -File -Recurse |
        Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($null -eq $signTool) {
        throw "signtool.exe was not found in the Windows SDK"
    }

    & $signTool.FullName sign /fd SHA256 /td SHA256 /tr $timestampUrl /sha1 $importedCertificate.Thumbprint /v $Binary
    if ($LASTEXITCODE -ne 0) {
        throw "signtool sign failed with exit code $LASTEXITCODE"
    }
    & $signTool.FullName verify /pa /all /v $Binary
    if ($LASTEXITCODE -ne 0) {
        throw "signtool verify failed with exit code $LASTEXITCODE"
    }

    $signature = Get-AuthenticodeSignature -FilePath $Binary
    if ($signature.Status -ne "Valid") {
        throw "Authenticode verification failed: $($signature.Status) $($signature.StatusMessage)"
    }
    Write-Host "Signed and verified $Binary as $($signature.SignerCertificate.Subject)"
} finally {
    foreach ($certificate in $importedCertificates) {
        Remove-Item -LiteralPath ("Cert:\CurrentUser\My\" + $certificate.Thumbprint) -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
}
