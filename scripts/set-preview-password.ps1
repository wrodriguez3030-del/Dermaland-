# Pone PREVIEW_ADMIN_PASSWORD en apps/web/.env.local de forma SEGURA.
#
# La contraseña se ingresa OCULTA (no se muestra, no queda en el historial del
# terminal, NUNCA se imprime ni se manda al chat). Valida la política fuerte
# (R-SEC-01) antes de guardar. Solo escribe en .env.local (gitignored).
#
# Uso (en tu terminal de Windows, NO en el chat):
#   powershell -ExecutionPolicy Bypass -File C:\dev\dermaland\scripts\set-preview-password.ps1
#
# Política: >=12 chars, mayúscula, minúscula, número, símbolo, no común.

$ErrorActionPreference = 'Stop'

$envPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\apps\web\.env.local'))
if (-not (Test-Path -LiteralPath $envPath)) { Write-Host "[error] no existe $envPath" -ForegroundColor Red; exit 1 }

$blocked = @('password','password123','123456','12345678','123456789','admin123',
             'dermaland123','qwerty123','qwerty','111111','abc123','iloveyou','letmein',
             'contraseña','contrasena')

Write-Host "Escribe la PREVIEW_ADMIN_PASSWORD (no se mostrara). Enter para confirmar:" -ForegroundColor Yellow
$sec = Read-Host -AsSecureString
$pw  = [System.Net.NetworkCredential]::new('', $sec).Password

$problems = @()
if ($pw.Length -lt 12)            { $problems += 'minimo 12 caracteres' }
if ($pw -cnotmatch '[A-ZÁÉÍÓÚÑ]') { $problems += 'una mayuscula' }
if ($pw -cnotmatch '[a-záéíóúñ]') { $problems += 'una minuscula' }
if ($pw -notmatch '[0-9]')        { $problems += 'un numero' }
if ($pw -notmatch '[^A-Za-z0-9]') { $problems += 'un simbolo' }
if ($blocked -contains $pw.Trim().ToLower()) { $problems += 'no usar contrasenas comunes' }

if ($problems.Count -gt 0) {
  Write-Host "[error] la contrasena no cumple la politica: falta $([string]::Join(', ', $problems))." -ForegroundColor Red
  exit 1
}

$content = Get-Content -LiteralPath $envPath -Raw
$pattern = '(?m)^PREVIEW_ADMIN_PASSWORD=.*$'
if ($content -match $pattern) {
  $content = [regex]::Replace($content, $pattern, { "PREVIEW_ADMIN_PASSWORD=$pw" })
} else {
  if (-not $content.EndsWith("`n")) { $content += "`n" }
  $content += "PREVIEW_ADMIN_PASSWORD=$pw`n"
}
[System.IO.File]::WriteAllText($envPath, $content, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "[ok] PREVIEW_ADMIN_PASSWORD actualizada (cumple la politica, no se imprimio)." -ForegroundColor Green
Write-Host "Volve al chat de Claude y deci: password lista"
