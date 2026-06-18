# Pone la SUPABASE_SERVICE_ROLE_KEY real en apps/web/.env.local de forma SEGURA.
#
# La key se ingresa OCULTA (no se muestra en pantalla, no queda en el historial
# del terminal, NUNCA se imprime ni se manda al chat). Solo se escribe en el
# archivo .env.local (que está gitignored).
#
# Uso (en tu terminal de Windows, NO en el chat):
#   powershell -ExecutionPolicy Bypass -File C:\dev\dermaland\scripts\set-service-role-key.ps1
#
# De dónde sacar la key (IMPORTANTE — la que bypassa RLS, NO la publica):
#   https://supabase.com/dashboard/project/sntcvyozbhrgicwmtcoh/settings/api-keys
#   → Sección "Secret keys" → una key que empieza con  sb_secret_...
#     (o, en "Legacy API keys / JWT", la  service_role  que empieza con  eyJ...)
#   NO uses la "Publishable key" (sb_publishable_...) ni la "anon" — esas
#   respetan RLS y NO sirven para sembrar/verificar (dan 0 filas / error RLS).

$ErrorActionPreference = 'Stop'

$envPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\apps\web\.env.local'))
if (-not (Test-Path -LiteralPath $envPath)) {
  Write-Host "[error] no existe $envPath" -ForegroundColor Red
  exit 1
}

Write-Host "Pega la SUPABASE_SERVICE_ROLE_KEY (service_role / secret)."
Write-Host "No se mostrara mientras la pegas. Enter para confirmar:" -ForegroundColor Yellow
$sec = Read-Host -AsSecureString
$key = [System.Net.NetworkCredential]::new('', $sec).Password

if ([string]::IsNullOrWhiteSpace($key)) { Write-Host "[error] key vacia." -ForegroundColor Red; exit 1 }
if ($key -match 'replace')              { Write-Host "[error] eso parece el placeholder, no la key real." -ForegroundColor Red; exit 1 }
if ($key.Length -lt 40)                 { Write-Host "[error] la key parece demasiado corta." -ForegroundColor Red; exit 1 }

# Rechazar las keys que respetan RLS (publishable / anon) — no sirven para esto.
if ($key.StartsWith('sb_publishable_')) {
  Write-Host "[error] esa es la PUBLISHABLE key (sb_publishable_), respeta RLS." -ForegroundColor Red
  Write-Host "        Necesitas la SECRET key (sb_secret_...) o la service_role (eyJ...)." -ForegroundColor Yellow
  exit 1
}
if ($key.StartsWith('eyJ')) {
  try {
    $parts = $key.Split('.')
    $p = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($p.Length % 4) { 2 { $p += '==' } 3 { $p += '=' } }
    $payload = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) | ConvertFrom-Json
    if ($payload.role -and $payload.role -ne 'service_role') {
      Write-Host "[error] ese JWT tiene role '$($payload.role)', no 'service_role'." -ForegroundColor Red
      Write-Host "        Usa la service_role (o una sb_secret_...)." -ForegroundColor Yellow
      exit 1
    }
  } catch { } # si no se puede decodificar, seguimos (no bloqueamos por eso)
}

$content = Get-Content -LiteralPath $envPath -Raw
$pattern = '(?m)^SUPABASE_SERVICE_ROLE_KEY=.*$'
if ($content -match $pattern) {
  # Usamos un evaluador para no interpretar caracteres especiales de la key.
  $content = [regex]::Replace($content, $pattern, { "SUPABASE_SERVICE_ROLE_KEY=$key" })
} else {
  if (-not $content.EndsWith("`n")) { $content += "`n" }
  $content += "SUPABASE_SERVICE_ROLE_KEY=$key`n"
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, $content, $utf8NoBom)

Write-Host ""
Write-Host "[ok] SUPABASE_SERVICE_ROLE_KEY actualizada en apps/web/.env.local (no se imprimio)." -ForegroundColor Green
Write-Host "Ahora volve al chat de Claude y deci: key lista"
