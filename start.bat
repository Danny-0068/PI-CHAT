@echo off
title Relay - Launching Services
echo ===================================================
echo   Relay - Internal Team Chat (Acme Labs Demo)
echo ===================================================
echo.
echo [*] Starting Backend API (FastAPI + Socket.IO) on port 8000...
start "Relay Backend (FastAPI)" cmd /k "cd /d "%~dp0apps\api" && uv run uvicorn app.main:app --reload --port 8000"

echo [*] Starting Frontend Web App (Vite React) on port 5173...
start "Relay Frontend (Vite)" cmd /k "cd /d "%~dp0apps\web" && npm run dev"

echo.
echo [*] Waiting 3 seconds for servers to start...
timeout /t 3 /nobreak >nul

echo [*] Opening Relay in your default browser...
start http://localhost:5173

echo.
echo ===================================================
echo   Services are now active!
echo   - Frontend: http://localhost:5173
echo   - Backend:  http://localhost:8000
echo   - API Docs: http://localhost:8000/docs
echo.
echo   One-Click Demo Logins:
echo   - "Try as Admin"    (Alex Morgan)
echo   - "Try as Employee" (Sam Rivera)
echo ===================================================
echo.
echo You can close this launcher window anytime.
echo (The backend and frontend will keep running in their own windows).
pause
