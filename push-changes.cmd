@echo off
setlocal
cd /d "%~dp0"
set "PUSH_EXIT=1"
if not exist ".git" exit /b 1
call :push_changes > ".git\push-changes.log" 2>&1
set "PUSH_EXIT=%ERRORLEVEL%"
exit /b %PUSH_EXIT%

:push_changes
echo Vocal push started: %DATE% %TIME%
git rev-parse --is-inside-work-tree
if errorlevel 1 exit /b 1
git remote get-url origin
if errorlevel 1 exit /b 1
git symbolic-ref --quiet --short HEAD
if errorlevel 1 exit /b 1
git diff --name-only --diff-filter=U > ".git\push-unmerged.tmp"
for %%F in (".git\push-unmerged.tmp") do if not %%~zF==0 (
  echo Unresolved merge conflicts. Resolve them before pushing.
  exit /b 1
)
git add --all
if errorlevel 1 exit /b 1
git diff --cached --quiet
if errorlevel 2 exit /b 1
if errorlevel 1 (
  git commit -m "Update %DATE% %TIME%"
  if errorlevel 1 exit /b 1
)
git push origin HEAD
if errorlevel 1 (
  echo Push failed. Check authentication or sync remote changes manually.
  exit /b 1
)
echo Push completed successfully: %DATE% %TIME%
exit /b 0
