@echo off
title StockApp - Demarrage
echo ========================================
echo   StockApp - Demarrage du serveur
echo ========================================
echo.

:: Verify PM2 is running the app
pm2 resurrect >nul 2>&1
pm2 status >nul 2>&1

:: Check if stockapp is already running
pm2 describe stockapp >nul 2>&1
if %errorlevel% neq 0 (
    echo Lancement de StockApp...
    cd /d "c:\Users\Wad-PC\Desktop\StockApp"
    pm2 start ecosystem.config.js
) else (
    echo StockApp est deja en cours d'execution.
)

echo.
echo StockApp est pret sur http://localhost:3000
echo.
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
