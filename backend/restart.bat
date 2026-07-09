@echo off
echo ========================================
echo Renlink Backend - Restart
echo ========================================
echo.

echo [1/3] Stopping existing backend...
taskkill /F /IM java.exe 2>nul
timeout /t 2 /nobreak >nul

echo [2/3] Cleaning and compiling...
call mvn clean compile -q

echo [3/3] Starting backend...
start "Renlink Backend" cmd /k "mvn spring-boot:run"

echo.
echo ========================================
echo Backend restarted successfully!
echo Backend is running on http://localhost:8080
echo ========================================
pause
