@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Crear usuario ADMIN de DermaLand
echo ============================================
echo.
echo Correo: wrodriguez3030@gmail.com
echo.
set /p PW=Escribe una contrasena (minimo 8 caracteres) y presiona Enter:
echo.
set "ADMIN_EMAIL=wrodriguez3030@gmail.com"
set "NEW_ADMIN_PASSWORD=%PW%"
node scripts\reset-admin-password.mjs
echo.
echo --------------------------------------------
echo Si arriba viste el check verde, ya puedes entrar en:
echo   https://dermaland.vercel.app/login
echo   Email:    wrodriguez3030@gmail.com
echo   Password: la que acabas de escribir
echo --------------------------------------------
echo.
pause
