param (
    [string]$GitHubOrg = "",
    [string]$GitHubToken = ""
)

# Ensure environment variables for Python awscli and LocalStack
if (-not $env:USERPROFILE) {
    $env:USERPROFILE = "C:\Users\ansuj"
}
if (-not $env:HOME) {
    $env:HOME = $env:USERPROFILE
}
$env:AWS_ACCESS_KEY_ID = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"
$env:AWS_DEFAULT_REGION = "us-east-1"

# Ensure we operate from the project root
Set-Location (Join-Path $PSScriptRoot "..")
$nodeBin = Join-Path (Get-Location) "node_modules\.bin"
$env:PATH = "$nodeBin;$env:PATH"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Sentinel LocalStack and GitHub Setup" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Check Docker
Write-Host "`n[1/6] Checking Docker status..." -ForegroundColor Yellow
$dockerOk = $false
try {
    $null = docker ps 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dockerOk = $true
    }
} catch {
    $dockerOk = $false
}

if (-not $dockerOk) {
    Write-Host "[ERROR] Docker Desktop is not running or unreachable!" -ForegroundColor Red
    Write-Host "Please launch Docker Desktop, wait for it to start, and run this script again." -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Docker is running." -ForegroundColor Green

# 2. Check GitHub Org & Token
if (-not $GitHubOrg) {
    try {
        $detectedUser = (gh api user --jq ".login" 2>$null)
        if ($detectedUser) {
            $GitHubOrg = $detectedUser
            Write-Host "Detected GitHub user/org from gh CLI: $GitHubOrg" -ForegroundColor Green
        }
    } catch {}
}

if (-not $GitHubOrg) {
    $GitHubOrg = Read-Host "Enter your GitHub username or organization name"
}

if (-not $GitHubToken) {
    if ($env:SENTINEL_GITHUB_TOKEN) {
        $GitHubToken = $env:SENTINEL_GITHUB_TOKEN
    } else {
        try {
            $ghToken = (gh auth token 2>$null)
            if ($ghToken) {
                $GitHubToken = $ghToken.Trim()
                Write-Host "Using authenticated GitHub token from gh CLI." -ForegroundColor Green
            }
        } catch {}
    }
}

if (-not $GitHubToken) {
    Write-Host "[WARN] No GitHub token found. Using 'dummy_token_local' (PRs will be simulated)." -ForegroundColor Yellow
    $GitHubToken = "dummy_token_local"
}

# 3. Start LocalStack
Write-Host "`n[2/6] Starting LocalStack container via docker-compose..." -ForegroundColor Yellow
docker-compose up -d

Write-Host "Waiting for LocalStack to become healthy..." -ForegroundColor Gray
$retries = 20
$healthy = $false
while ($retries -gt 0) {
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:4566/_localstack/health" -Method Get -TimeoutSec 2 2>$null
        if ($res) {
            $healthy = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 2
    $retries--
}

if (-not $healthy) {
    Write-Host "[WARN] LocalStack health check did not respond yet. Continuing deployment..." -ForegroundColor Yellow
} else {
    Write-Host "[OK] LocalStack is online." -ForegroundColor Green
}

# 4. Set SSM Parameter
Write-Host "`n[3/6] Storing GitHub token in LocalStack SSM (/sentinel/github-token)..." -ForegroundColor Yellow
awslocal ssm put-parameter --name "/sentinel/github-token" --value "$GitHubToken" --type "SecureString" --overwrite

# 5. Build and Deploy SAM Stack
Write-Host "`n[4/6] Building SAM application..." -ForegroundColor Yellow
samlocal build --parallel

Write-Host "`n[5/6] Deploying Sentinel stack to LocalStack..." -ForegroundColor Yellow
samlocal deploy --stack-name sentinel-local --resolve-s3 --parameter-overrides GitHubOrg=$GitHubOrg Stage=local

# 6. Resolve API Gateway URL
Write-Host "`n[6/6] Resolving LocalStack API Gateway URL..." -ForegroundColor Yellow
$ApiId = (awslocal apigatewayv2 get-apis --query "Items[?Name=='sentinel-local'].ApiId" --output text)
if ($ApiId) {
    $ApiId = $ApiId.Trim()
}

if (-not $ApiId -or $ApiId -eq "None") {
    Write-Host "[ERROR] Could not find API Gateway ID for sentinel-local." -ForegroundColor Red
    exit 1
}

$ApiUrl = "http://${ApiId}.execute-api.localhost.localstack.cloud:4566/local"
Write-Host "[OK] LocalStack API Gateway deployed at: $ApiUrl" -ForegroundColor Green

# Update .env file
$envContent = "VITE_API_URL=$ApiUrl`n"
Set-Content -Path ".env" -Value $envContent
Write-Host "[OK] Updated .env with VITE_API_URL=$ApiUrl" -ForegroundColor Green

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Sentinel is now connected to LocalStack!" -ForegroundColor Green
Write-Host "API Gateway: $ApiUrl" -ForegroundColor Gray
Write-Host "Target Org:  $GitHubOrg" -ForegroundColor Gray
Write-Host "Dashboard:   http://localhost:5173/" -ForegroundColor Gray
Write-Host "=========================================" -ForegroundColor Cyan
