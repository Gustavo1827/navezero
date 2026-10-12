@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 ou superior nao foi encontrado.
  echo Instale Node.js e execute este arquivo novamente.
  pause
  exit /b 1
)
echo Iniciando o servidor Nave Zero em http://localhost:8080
echo Deixe esta janela aberta enquanto estiver jogando.
start "" cmd /c "timeout /t 2 /nobreak ^>nul ^& start http://localhost:8080"
node server.js
echo O servidor foi encerrado.
pause
