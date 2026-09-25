@echo off
setlocal
cd /d "%~dp0"
title Vocal - Commit and Push
call :push_changes
set "PUSH_EXIT=%ERRORLEVEL%"
echo.
if not "%PUSH_EXIT%"=="0" echo FAILED: Review the error above. No further actions were taken.
echo Closing in 3 seconds...
powershell -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 3"
exit /b %PUSH_EXIT%

:push_changes
echo Vocal push started: %DATE% %TIME%
if not exist ".git" (
  echo This folder is not a Git repository.
  exit /b 1
)
git rev-parse --is-inside-work-tree
if errorlevel 1 exit /b 1
git remote get-url origin
if errorlevel 1 exit /b 1
git symbolic-ref --quiet --short HEAD
if errorlevel 1 exit /b 1
echo.
echo ===== Changed files =====
git status --short
echo.
git diff --stat
echo.
git diff --name-only --diff-filter=U > ".git\push-unmerged.tmp"
for %%F in (".git\push-unmerged.tmp") do if not %%~zF==0 (
  echo Unresolved merge conflicts. Resolve them before pushing.
  exit /b 1
)
git add --all
if errorlevel 1 exit /b 1
echo ===== Staged changes =====
git diff --cached --stat
echo.
git diff --cached --quiet
if errorlevel 2 exit /b 1
if errorlevel 1 (
  git commit -m "Update %DATE% %TIME%"
  if errorlevel 1 exit /b 1
)
echo ===== Pushing to GitHub =====
git push -u origin HEAD
if errorlevel 1 (
  echo Push failed. Check authentication or sync remote changes manually.
  exit /b 1
)
echo Push completed successfully: %DATE% %TIME%
exit /b 0
