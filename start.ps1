# Script de démarrage StockApp
# Prérequis : Docker Desktop installé

Write-Host "=== StockApp - Démarrage ===" -ForegroundColor Cyan

# Vérifier Docker
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
    Write-Host ""
    Write-Host "Docker n'est pas installé ou pas dans le PATH." -ForegroundColor Red
    Write-Host ""
    Write-Host "Pour installer Docker Desktop :" -ForegroundColor Yellow
    Write-Host "  https://www.docker.com/products/docker-desktop/"
    Write-Host ""
    Write-Host "Une fois installé, relancez ce script." -ForegroundColor Green
    Read-Host "Appuyez sur Entrée pour quitter"
    exit 1
}

Write-Host "Docker trouvé." -ForegroundColor Green

# Vérifier que Docker est en cours d'exécution
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop n'est pas démarré. Veuillez le démarrer puis relancer ce script." -ForegroundColor Red
    Read-Host "Appuyez sur Entrée pour quitter"
    exit 1
}

Write-Host "Docker est en cours d'exécution." -ForegroundColor Green
Write-Host ""
Write-Host "Démarrage des services (postgres + backend + frontend)..." -ForegroundColor Yellow
Write-Host ""

docker-compose up --build

