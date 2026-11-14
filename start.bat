@echo off
REM Inicia o FFd20 Utils e abre o navegador (Windows). Requer Node.js 18+.
cd /d "%~dp0"
node server.js --open
pause
