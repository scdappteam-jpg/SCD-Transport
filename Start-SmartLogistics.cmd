@echo off
setlocal
cd /d "%~dp0"
echo Starting S.C.D. Transport services
echo Next.js: http://localhost:3000
echo Field app: http://localhost:3000/field
echo Python API: http://localhost:5000/docs
echo.
if exist "%~dp0python-server\.venv\Scripts\python.exe" (
  start "SCD Image Processor" /min cmd /k "cd /d %~dp0python-server && .venv\Scripts\python.exe app.py"
) else if exist "%~dp0python-server\venv\Scripts\python.exe" (
  start "SCD Image Processor" /min cmd /k "cd /d %~dp0python-server && venv\Scripts\python.exe app.py"
) else (
  start "SCD Image Processor" /min cmd /k "cd /d %~dp0python-server && python app.py"
)
cd /d "%~dp0nextjs-app"
if not exist "node_modules" call pnpm install --frozen-lockfile
call pnpm dev
