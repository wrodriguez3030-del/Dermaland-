# Genera una PREVIEW_ADMIN_PASSWORD fuerte (cumple la política), la guarda en
# apps/web/.env.local, y la MUESTRA UNA VEZ en TU terminal para que la copies
# (es la contraseña de login del admin Preview). NO se manda al chat ni a logs.
#
# Uso (en tu terminal de Windows):
#   powershell -ExecutionPolicy Bypass -File C:\dev\dermaland\scripts\gen-preview-password.ps1
#
# Política garantizada: 16 chars · mayúscula · minúscula · número · símbolo.

$ErrorActionPreference = 'Stop'

$envPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\apps\web\.env.local'))
if (-not (Test-Path -LiteralPath $envPath)) { Write-Host "[error] no existe $envPath" -ForegroundColor Red; exit 1 }

# Conjuntos sin caracteres ambiguos (0/O/1/l/I) ni problemáticos para .env.
$upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
$lower = 'abcdefghijkmnpqrstuvwxyz'
$digit = '23456789'
$symbol = '!@%*-_+?'
$all = $upper + $lower + $digit + $symbol

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
function Pick([string]$set) {
  $b = [byte[]]::new(1); $rng.GetBytes($b); $set[$b[0] % $set.Length]
}

# 1 de cada clase + 12 aleatorios = 16, luego mezclar.
$chars = @( (Pick $upper), (Pick $lower), (Pick $digit), (Pick $symbol) )
for ($i = 0; $i -lt 12; $i++) { $chars += (Pick $all) }
$pw = -join ($chars | Sort-Object { Get-Random })

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
Write-Host "[ok] PREVIEW_ADMIN_PASSWORD generada y guardada en apps/web/.env.local." -ForegroundColor Green
Write-Host ""
Write-Host "GUARDALA — es tu contrasena de login del admin Preview:" -ForegroundColor Yellow
Write-Host "    $pw" -ForegroundColor Cyan
Write-Host ""
Write-Host "(Tambien la veras al iniciar sesion en el Preview con el email PREVIEW_ADMIN_EMAIL.)"
Write-Host "Volve al chat de Claude y deci: password lista"
