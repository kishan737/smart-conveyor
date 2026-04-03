@echo off
echo Starting Smart Conveyor System...

REM Start Backend
start cmd /k "cd backend && uvicorn main:app --reload"

REM Wait a bit so backend starts first
timeout /t 3

REM Start Frontend
start cmd /k "cd frontend && npm start"

echo All services started!