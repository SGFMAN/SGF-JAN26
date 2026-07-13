@echo off
set MSG=%*

if "%MSG%"=="" (
    echo.
    echo Usage:
    echo.
    echo    deploy Your commit message here
    echo.
    echo Example:
    echo    deploy Fixed client portal login
    echo.
    pause
    exit /b 1
)

cd /d C:\SGF

echo.
echo ============================================
echo STAGING CHANGES...
echo ============================================

git add .

echo.
echo ============================================
echo COMMITTING...
echo ============================================

git commit -m "%MSG%"

if errorlevel 1 (
    echo.
    echo Commit failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo PUSHING TO GITHUB...
echo ============================================

git push origin main

if errorlevel 1 (
    echo.
    echo Git push failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo BUILDING FRONTEND...
echo ============================================

cd /d C:\SGF\frontend
call npm run build

if errorlevel 1 (
    echo.
    echo Frontend build failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo RESTARTING SERVER...
echo ============================================

cd /d C:\SGF\backend
pm2 restart sgfcentral

echo.
echo ============================================
echo SERVER STATUS
echo ============================================

pm2 status

echo.
echo ============================================
echo DEPLOYMENT COMPLETE!
echo ============================================

cd /d C:\SGF

pause