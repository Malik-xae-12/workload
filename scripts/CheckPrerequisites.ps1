#################################################################
# Microsoft Fabric Solution Accelerator - Prerequisites Checker
#################################################################

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   Fabric Solution Accelerator - System Pre-Flight Check" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$allPassed = $true

# 1. PowerShell 7+ Check
Write-Host -NoNewline "[1/6] Checking PowerShell 7+ (pwsh)... "
if ($PSVersionTable.PSEdition -eq "Core" -and $PSVersionTable.PSVersion.Major -ge 7) {
    Write-Host "OK ($($PSVersionTable.PSVersion))" -ForegroundColor Green
} else {
    Write-Host "WARNING ($($PSVersionTable.PSVersion))" -ForegroundColor Yellow
    Write-Host "      Recommended: Install PowerShell 7 (winget install Microsoft.PowerShell)" -ForegroundColor DarkGray
}

# 2. Node.js Check
Write-Host -NoNewline "[2/6] Checking Node.js (v18+ or v20 LTS)... "
try {
    $nodeVer = node -v 2>$null
    if ($nodeVer) {
        Write-Host "OK ($nodeVer)" -ForegroundColor Green
    } else {
        Write-Host "MISSING" -ForegroundColor Red
        Write-Host "      Install via: winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
        $allPassed = $false
    }
} catch {
    Write-Host "MISSING" -ForegroundColor Red
    $allPassed = $false
}

# 3. npm Check
Write-Host -NoNewline "[3/6] Checking npm... "
try {
    $npmVer = npm -v 2>$null
    if ($npmVer) {
        Write-Host "OK (v$npmVer)" -ForegroundColor Green
    } else {
        Write-Host "MISSING" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "MISSING" -ForegroundColor Red
    $allPassed = $false
}

# 4. Python 3.10+ Check
Write-Host -NoNewline "[4/6] Checking Python (v3.10 - v3.12)... "
try {
    $pythonVer = python --version 2>$null
    if ($pythonVer) {
        Write-Host "OK ($pythonVer)" -ForegroundColor Green
    } else {
        Write-Host "MISSING" -ForegroundColor Red
        Write-Host "      Install via: winget install Python.Python.3.11" -ForegroundColor Yellow
        $allPassed = $false
    }
} catch {
    Write-Host "MISSING" -ForegroundColor Red
    $allPassed = $false
}

# 5. Git Check
Write-Host -NoNewline "[5/6] Checking Git... "
try {
    $gitVer = git --version 2>$null
    if ($gitVer) {
        Write-Host "OK ($gitVer)" -ForegroundColor Green
    } else {
        Write-Host "MISSING" -ForegroundColor Red
        Write-Host "      Install via: winget install Git.Git" -ForegroundColor Yellow
        $allPassed = $false
    }
} catch {
    Write-Host "MISSING" -ForegroundColor Red
    $allPassed = $false
}

# 6. Environment Files Check
Write-Host -NoNewline "[6/6] Checking Environment Configuration Files... "
$root = (Get-Item $PSScriptRoot).Parent.FullName
$backendEnv = Join-Path $root "backend\.env"
$frontendEnv = Join-Path $root "frontend\.env"
$workloadEnv = Join-Path $root "workload\.env.dev"

$envMissing = $false
if (-not (Test-Path $backendEnv)) { Write-Host "`n      Missing backend\.env"; $envMissing = $true }
if (-not (Test-Path $frontendEnv)) { Write-Host "`n      Missing frontend\.env"; $envMissing = $true }
if (-not (Test-Path $workloadEnv)) { Write-Host "`n      Missing workload\.env.dev"; $envMissing = $true }

if (-not $envMissing) {
    Write-Host "OK (all .env files present)" -ForegroundColor Green
} else {
    Write-Host "WARNING (one or more .env files missing)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host " ALL ESSENTIAL TOOLS ARE READY!" -ForegroundColor Green
} else {
    Write-Host " SOME TOOLS ARE MISSING. Please install them above." -ForegroundColor Red
}
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
