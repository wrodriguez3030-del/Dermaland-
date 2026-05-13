# Despliegue de DermaLand en Vercel

Origen oficial: `C:\dev\dermaland` (jamás OneDrive).
Repo: <https://github.com/wrodriguez3030-del/Dermaland->
Puerto dev local: `3031` → <http://localhost:3031>

## Estado actual

| Entorno    | URL                                                                                  | Estado |
|------------|--------------------------------------------------------------------------------------|--------|
| Producción | <https://dermaland.vercel.app>                                                       | READY  |
| Preview    | <https://dermaland-aityyju67-wrodriguez3030-4801s-projects.vercel.app>                | READY (auth-gated) |

Las URLs preview muestran `401` desde curl porque la cuenta tiene **Vercel Deployment Protection**
activada para previews. La protección no afecta a la URL de producción aliased
(`dermaland.vercel.app`).

## Proyecto Vercel

- Team: `wrodriguez3030-4801s-projects`
- Project: `dermaland` (`prj_33cYNYkz0FU14PEX0YIS2iXiiIlf`)
- Node version: `24.x`
- Framework: Next.js (15.5.x)
- **Root Directory:** `apps/web`
- Install Command (proyecto): `cd ../.. && pnpm install --frozen-lockfile`
- **Git conectado:** sí, a `https://github.com/wrodriguez3030-del/Dermaland-` (vía `vercel git connect`, 2026-05-13). Vercel desplegará automáticamente con cada push a `main` (preview en otras ramas).

## `vercel.json` (root del repo)

Importante: aunque el Root Directory del proyecto es `apps/web`, Vercel recoge
el `vercel.json` del root del repo durante `vercel deploy` desde CLI. Por eso
los paths se resuelven relativos a `apps/web`:

```jsonc
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "pnpm --filter @dermaland/web build",
  "installCommand": "pnpm install --frozen-lockfile",
  "devCommand": "pnpm --filter @dermaland/web dev",
  "outputDirectory": ".next",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD ./apps/web ./packages ./pnpm-lock.yaml ./package.json ./vercel.json"
}
```

> Antes era `"outputDirectory": "apps/web/.next"`, lo que producía
> `apps/web/apps/web/.next` (path doblado) y rompía el deploy con
> `routes-manifest not found`. Se corrigió a `.next` (relativo al
> Root Directory `apps/web`).

## Flujo de despliegue desde Windows

```powershell
cd C:\dev\dermaland
vercel pull --yes --environment=preview
pnpm install
pnpm --filter @dermaland/web typecheck
pnpm --filter @dermaland/web build      # build local opcional

# Saltarse vercel build local (falla en Windows por EPERM symlink _not-found.rsc.func)
vercel deploy --yes                     # preview
vercel deploy --prod --yes              # producción → alias dermaland.vercel.app
```

A partir del 2026-05-13 con GitHub conectado, basta con `git push` para que
Vercel construya y despliegue.

### Por qué no usamos `vercel build` local en Windows

`vercel build` intenta crear un symlink
`_not-found.rsc.func -> index.rsc.func` que requiere Developer Mode o ejecutar
como Administrador. El builder remoto de Vercel (Linux) lo maneja sin problema,
así que se usa `vercel deploy` directo (sin `--prebuilt`).

## Rutas verificadas en producción (2026-05-13)

| Ruta            | Status | Notas                                |
|-----------------|--------|--------------------------------------|
| `/`             | 200    | Página inicial Next.js               |
| `/api/health`   | 200    | `{"status":"ok","service":"dermaland-web",…}` |
| `/_not-found`   | 404    | Página 404 generada                  |
| `/unknown-path` | 404    | Fallback de App Router               |

## Variables de entorno

Hoy (fase 0) el deploy corre sin variables reales — la página `/` y `/api/health`
no las consumen, y `apps/web/.env.local` queda solo en local con placeholders.

Cuando arranque la **fase con datos** hay que cargar en Vercel
(Project Settings → Environment Variables) lo siguiente. Origen de la lista:
`.env.example` en el root del repo.

### Núcleo Supabase (fase 1)

| Variable                       | Scope sugerido       | Notas                                   |
|--------------------------------|----------------------|-----------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`     | Production+Preview   | URL pública del proyecto Supabase       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Production+Preview   | anon key (pública por diseño)           |
| `SUPABASE_SERVICE_ROLE_KEY`    | Production+Preview   | **Secret** — solo backend               |
| `SUPABASE_PROJECT_REF`         | Production+Preview   | ref del proyecto                        |
| `SUPABASE_DB_URL`              | Production+Preview   | **Secret** — connection string Postgres |
| `JWT_SECRET`                   | Production+Preview   | **Secret** — debe coincidir con Supabase Auth |
| `NEXT_PUBLIC_APP_URL`          | Production+Preview   | URL pública del app                     |
| `NEXT_PUBLIC_PWA_URL`          | Production+Preview   | URL pública de la PWA móvil             |
| `LOG_LEVEL`                    | Production+Preview   | `info` en prod, `debug` en preview      |

### DGII (fase 5 — pendiente certificado)

`DGII_ENVIRONMENT`, `DGII_BASE_URL_CERT`, `DGII_BASE_URL_PROD`,
`DGII_CERT_BUCKET`, `DGII_CERT_ENCRYPTION_KEY` (Secret),
`DGII_RNC_RD`.

### WhatsApp Cloud API (fase 6)

`META_WA_PHONE_NUMBER_ID`, `META_WA_BUSINESS_ACCOUNT_ID`,
`META_WA_ACCESS_TOKEN` (Secret), `META_WA_VERIFY_TOKEN`,
`META_WA_APP_SECRET` (Secret).

### Agentes IA (fase 7)

`OPENAI_API_KEY` (Secret), `OPENAI_MODEL_TOOLS`, `OPENAI_MODEL_CHAT`,
`OPENAI_PROJECT_ID`, `ANTHROPIC_API_KEY` (Secret, opcional).

### Email / colas / billing

`RESEND_API_KEY` (Secret), `EMAIL_FROM`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (Secret),
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (Secret), `PAYPAL_ENVIRONMENT`,
`CARDNET_MERCHANT_ID`, `CARDNET_TERMINAL_ID`, `CARDNET_API_KEY` (Secret),
`CARDNET_ENVIRONMENT`.

### Observabilidad

`SENTRY_DSN_WEB`, `SENTRY_DSN_API`, `SENTRY_ENVIRONMENT`.

> **Estado real hoy:** ninguna de las anteriores está cargada en Vercel. El
> deploy actual funciona porque la fase 0 solo sirve `/` y `/api/health`
> estáticos. Cargarlas es prerrequisito antes de la fase 1.
>
> Nunca pegar secretos en `vercel.json`, en código, ni en `.env.example`. Solo
> en Vercel (dashboard o `vercel env add`) y en `.env.local` local (gitignored).

## Higiene de secretos

- `.env`, `.env.local`, `.env.production`, `.env.development`, `.env.*.local` en `.gitignore`.
- `.vercel/` en `.gitignore` (contiene `.env.preview.local` con `VERCEL_OIDC_TOKEN`).
- `.scratch-*` en `.gitignore`. Los scripts `.scratch-*.ps1` fueron eliminados
  el 2026-05-13.
- Certificados (`*.p12`, `*.pfx`, `*.key`, `*.pem`, `*.crt`, `*.cer`, `*.der`, `certificates/`) en `.gitignore`.
- Nunca commitear `auth.json` ni tokens de la CLI.

## Token expuesto en archivos scratch — acción manual pendiente

Los archivos `.scratch-update-project.ps1` y `.scratch-verify-project.ps1`
contenían un token personal de la API de Vercel. Estado actual:

- **Archivos eliminados** del filesystem el 2026-05-13.
- **`.scratch-*` está en `.gitignore`** — los archivos nunca fueron staged ni
  pusheados.
- **Token ya inválido** según la API (`{"error":{"code":"forbidden","invalidToken":true}}`),
  probablemente expirado o revocado por uso indebido.

> **Acción manual pendiente del usuario:** entrar a
> <https://vercel.com/account/tokens>, identificar cualquier token personal que
> hubiera sido creado para automatizar el proyecto DermaLand, y eliminarlo
> formalmente para cerrar el ciclo de exposición.

Esta tarea **requiere autenticación en navegador y no puede ejecutarla Claude**.

## Pendientes que requieren decisión humana

- **Dominio final** y configuración DNS (cuando se decida la marca pública).
- **Protección de previews:** decidir si la demo va a ser pública o protegida
  por SSO/password. Hoy está protegida (401 sin auth en previews); producción
  aliased es pública.
- **Variables reales** de Supabase / DGII / WhatsApp / OpenAI / etc. listadas
  arriba — pendientes hasta que arranque la fase con datos reales.
- **Revocación formal del token** en `vercel.com/account/tokens` (ver sección
  anterior).
