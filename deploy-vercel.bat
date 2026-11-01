@echo off
REM ============================================================
REM  ATUL Speed Watch - Vercel deploy helper (no GitHub needed)
REM  Usage: double-click this file, or run: deploy-vercel.bat
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo ==========================================
echo   ATUL Speed Watch  -  Vercel Deploy
echo ==========================================
echo.

REM 1. Check node is available
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js nahi mila. Pehle https://nodejs.org se install karo.
  pause
  exit /b 1
)

REM 2. Build the app
echo [1/3] App build ho raha hai...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build fail ho gaya.
  pause
  exit /b 1
)
echo [OK] Build complete. dist/ folder ready hai.
echo.

REM 3. Deploy via npx vercel (no global install needed — auto-downloads)
echo [2/3] Deploy ho raha hai (pehli baar login poochega)...
echo   - Pehli baar: browser khulega, Vercel account/login banao.
echo   - Prompts me: build command = "npm run build", output dir = "dist"
echo.
call npx vercel --prod
echo.
echo ==========================================
echo   Ho gaya! Link upar dikhega:
echo   https://<project>.vercel.app
echo ==========================================
echo.
pause
