@echo off
echo ========================================
echo 启动 Renlink 前端服务
echo ========================================
echo.
echo 正在启动本地服务器...
echo 服务器将在 http://localhost:3000/frontend/index.html 启动
echo 按 Ctrl+C 可以停止服务器
echo.
cd /d "%~dp0.."
python -m http.server 3000
