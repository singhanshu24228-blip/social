@echo off
setlocal

REM Proxy used to work around environments where Node cannot spawn .exe directly.
REM esbuild's JS API spawns ESBUILD_BINARY_PATH; pointing it at a .cmd makes Node
REM execute via cmd.exe, which is typically permitted.

"%~dp0node_modules\\@esbuild\\win32-x64\\esbuild.exe" %*
exit /b %errorlevel%
