# Generate self-signed HTTPS certificate for SmartLogistics
# Needed so the phone browser allows camera access (getUserMedia is blocked on plain HTTP).
# Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File generate-https-cert.ps1

$ErrorActionPreference = "Stop"

# Locate openssl (Git for Windows usually provides it here)
$gitOpenSsl = "C:\Program Files\Git\usr\bin\openssl.exe"
if (Test-Path $gitOpenSsl) {
    $openssl = $gitOpenSsl
} elseif (Get-Command openssl -ErrorAction SilentlyContinue) {
    $openssl = (Get-Command openssl).Source
} else {
    Write-Host "openssl not found - install Git for Windows or add openssl to PATH"
    exit 1
}

# Find the machine LAN IP (skip loopback / APIPA)
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Sort-Object InterfaceMetric | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "127.0.0.1" }

New-Item -ItemType Directory -Force -Path "certs" | Out-Null

Write-Host "Creating certificate for IP: $ip ..."
& $openssl req -x509 -newkey rsa:2048 -keyout certs\key.pem -out certs\cert.pem -days 825 -nodes -subj "/CN=$ip" -addext "subjectAltName=IP:$ip,DNS:localhost"
if ($LASTEXITCODE -ne 0) {
    # Older openssl without -addext support -> fall back to a config file
    Write-Host "addext not supported - using config file..."
    $conf = "certs\openssl-san.cnf"
    @"
[req]
distinguished_name = dn
x509_extensions = v3_req
prompt = no
[dn]
CN = $ip
[v3_req]
subjectAltName = IP:$ip, DNS:localhost
"@ | Set-Content -Path $conf -Encoding ASCII
    & $openssl req -x509 -newkey rsa:2048 -keyout certs\key.pem -out certs\cert.pem -days 825 -nodes -config $conf
}

if (-not (Test-Path "certs\key.pem") -or -not (Test-Path "certs\cert.pem")) {
    Write-Host "Certificate creation failed"
    exit 1
}

Write-Host ""
Write-Host "Done: certs\key.pem + certs\cert.pem (for $ip)"
Write-Host "Restart Start-SmartLogistics.cmd - the server will now run as HTTPS."
Write-Host "Open on your phone: https://$ip`:3000/mobile"
Write-Host "First visit shows a certificate warning -> tap Advanced / Details, then proceed (one time only)."
