@echo off
set MSG=%*

if "%MSG%"=="" (
  echo Please enter a commit message.
  echo Example: REUP version1
  exit /b 1
)

cd /d C:\SGF

git add .
git commit -m "%MSG%"

cd /d C:\SGF\frontend
call npm run build

cd /d C:\SGF\backend
pm2 restart sgfcentral
pm2 status

cd /d C:\SGF