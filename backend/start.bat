@echo off
echo ========================================
echo Starting Renlink backend server
echo ========================================
echo.
echo Server will start at http://localhost:8080
echo Supabase PostgreSQL configuration will be loaded from the repo-root .env file
echo Press Ctrl+C to stop the server
echo.
mvn spring-boot:run
