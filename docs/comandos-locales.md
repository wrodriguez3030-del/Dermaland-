# Comandos locales — DermaLand

> Comandos útiles para trabajar el proyecto. Ruta de trabajo:
> `C:\dev\dermaland`. Puerto local: `3031`.

## Setup inicial

```powershell
cd C:\dev\dermaland
pnpm install
Copy-Item .env.example .env       # primera vez
```

## Desarrollo

```powershell
cd C:\dev\dermaland

# Levantar el dev server (Next.js en :3031)
pnpm --filter web dev

# Atajo equivalente desde la raíz
pnpm dev
```

## Validación

```powershell
# TypeScript estricto, sin emitir
pnpm --filter web typecheck

# Build de producción (genera .next/ optimizada)
pnpm --filter web build

# Tests unitarios con vitest
pnpm --filter web test

# Watch mode
pnpm --filter web test:watch

# Tests Playwright E2E
pnpm --filter web test:e2e

# Instalar binarios de Playwright (primera vez)
pnpm --filter web test:e2e:install
```

## Smoke tests browser

Requieren dev server corriendo + chromium instalado:

```powershell
# Hidratación de la página de impresión de proformas
node apps/web/tests/hydration-proforma-print.mjs

# Flujo de POS: selector de pago, indicador de documento, botón dinámico
node apps/web/tests/pos-flow-smoke.mjs
```

## Smoke HTTP rápido

Bash (Git Bash / WSL):

```bash
for u in / /clientes /clientes/nuevo /productos /productos/nuevo \
         /inventario /conteo-fisico /pos /proformas /ventas \
         /super-admin /api/health; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3031$u")
  echo "$code  $u"
done
```

PowerShell:

```powershell
$urls = @(
  "/", "/clientes", "/clientes/nuevo", "/productos", "/productos/nuevo",
  "/inventario", "/conteo-fisico", "/pos", "/proformas", "/ventas",
  "/super-admin", "/api/health"
)
foreach ($u in $urls) {
  $code = (Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3031$u" -SkipHttpErrorCheck).StatusCode
  "$code  $u"
}
```

## Limpieza / recuperación

```powershell
# Detener dev server por puerto
$pid = (Get-NetTCPConnection -LocalPort 3031 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { Stop-Process -Id $pid -Force }

# Limpiar caché de Next (resuelve "Cannot find module './XXX.js'" tras
# alternar entre `dev` y `build`)
Remove-Item -Recurse -Force C:\dev\dermaland\apps\web\.next

# Reinstalar dependencias del workspace
pnpm install --frozen-lockfile
```

## Inspección de procesos / puertos

```powershell
# Quién escucha el puerto 3031
Get-NetTCPConnection -LocalPort 3031 -State Listen | Select-Object OwningProcess

# Qué proceso es ese PID
Get-CimInstance Win32_Process -Filter "ProcessId=<PID>" | Select-Object ProcessId, Name, CommandLine

# Procesos node.exe relevantes a DermaLand
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'dermaland|next dev|--filter web' } |
  Select-Object ProcessId, CommandLine | Format-List
```

## Rutas para probar (smoke crítico)

### App principal

```
http://localhost:3031
http://localhost:3031/pos
http://localhost:3031/clientes
http://localhost:3031/clientes/nuevo
http://localhost:3031/productos
http://localhost:3031/productos/nuevo
http://localhost:3031/inventario
http://localhost:3031/conteo-fisico
http://localhost:3031/proformas
http://localhost:3031/ventas
http://localhost:3031/super-admin
http://localhost:3031/api/health
```

### Impresión 80mm (proforma seed)

```
http://localhost:3031/proformas/prof_2026_00185/print
http://localhost:3031/proformas/prof_2026_00185/print?auto=1
```

### Otras útiles para QA

```
http://localhost:3031/dgii
http://localhost:3031/dgii/secuencias
http://localhost:3031/whatsapp
http://localhost:3031/ia
http://localhost:3031/ia/agentes
http://localhost:3031/inventario/por-lote
http://localhost:3031/inventario/vencimientos
http://localhost:3031/recomendaciones
http://localhost:3031/admin/usuarios
http://localhost:3031/admin/sucursales
```

## Flujo recomendado al empezar una sesión

```powershell
cd C:\dev\dermaland

# 1. Verificar que las dependencias estén OK
pnpm install --frozen-lockfile

# 2. Levantar dev
pnpm --filter web dev
# (en otra terminal o tab)

# 3. Smoke rápido HTTP
$urls = @("/", "/pos", "/proformas", "/api/health")
foreach ($u in $urls) {
  $code = (Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3031$u" -SkipHttpErrorCheck).StatusCode
  "$code  $u"
}

# 4. Si algo falla con "Cannot find module './XXX.js'":
#    detener dev, borrar .next, reiniciar dev.
```

## Checklist al cerrar un cambio

```powershell
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter web test
node apps/web/tests/pos-flow-smoke.mjs           # si tocaste POS
node apps/web/tests/hydration-proforma-print.mjs # si tocaste cliente / impresión
```

Y revisar el [checklist completo](agents/checklist-validacion-rapida.md).

## Llaves que SOLO viven en el servidor

Van en `apps/web/.env.local` **y** en Vercel (production, preview y
development). Sin ellas la función que las usa no falla al arrancar: falla
cuando alguien la usa, y el aviso solo lo ve quien está en esa pantalla.

| Variable | Para qué | Si falta |
|---|---|---|
| `USER_PASSWORD_VAULT_KEY` | Sella la clave que el admin asigna a cada usuario (AES-256-GCM) | «Asignar clave» **no hace nada**: no crea la cuenta de acceso ni guarda la clave. La persona no puede entrar («Invalid login credentials») y el ojo no enseña nada |
| `DGII_CERT_ENCRYPTION_KEY` | Certificado fiscal `.p12` | No se puede subir ni usar el certificado |
| `AI_CREDENTIALS_ENCRYPTION_KEY` | Claves de los proveedores de IA | El módulo de IA no guarda credenciales |

Las tres son **32 bytes en base64** y se generan igual:

```bash
openssl rand -base64 32
```

🔴 **No se rotan a la ligera.** Lo ya sellado con una llave solo se abre con
esa llave: cambiarla deja las claves guardadas ilegibles («¿cambió la llave del
servidor?») y hay que reasignarlas una por una.

🔴 **Al ponerla en Vercel, pásala por la ENTRADA ESTÁNDAR**, nunca como
argumento — y hace falta un **despliegue nuevo** para que el runtime la vea:

```bash
printf '%s' "$(openssl rand -base64 32)" | \
  npx vercel env add USER_PASSWORD_VAULT_KEY production \
  --project dermaland --scope wrodriguez3030-4801s-projects
```

`vercel env pull` de production devuelve `"[SENSITIVE]"`, no el valor: para
comprobar que quedó bien, la prueba es usar la función, no leer la variable.

## Deploy en Vercel (preview y producción)

```powershell
cd C:\dev\dermaland

# Asegurar que el repo local esté linkeado al proyecto en Vercel
vercel link --yes --project dermaland

# Tirar las env vars del entorno deseado (genera .vercel/.env.*.local — secreto, gitignorado)
vercel pull --yes --environment=preview
vercel pull --yes --environment=production

# Deploy de preview (URL ephemeral, protegida por Vercel Auth)
vercel deploy --yes

# Probar rutas de preview (autenticado)
vercel curl https://<preview-url>/api/health
vercel curl -sI https://<preview-url>/clientes

# Deploy de producción → https://dermaland.vercel.app
vercel deploy --prod --yes

# Smoke anónimo en producción (es pública)
$urls = @("/", "/clientes", "/clientes/nuevo", "/productos", "/productos/nuevo",
          "/inventario", "/conteo-fisico", "/pos", "/proformas", "/ventas",
          "/dgii", "/super-admin", "/api/health")
foreach ($u in $urls) {
  $code = (Invoke-WebRequest -UseBasicParsing -Uri "https://dermaland.vercel.app$u" -SkipHttpErrorCheck).StatusCode
  "$code  $u"
}
```

Detalle: [`deploy-vercel.md`](deploy-vercel.md).

---

**Última revisión:** 2026-05-13
