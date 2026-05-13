# PROJECT_MEMORY — DermaLand

Notas operativas que no se deducen del código. Última edición: 2026-05-13.

## Ubicación canónica

- **Repo local:** `C:\dev\dermaland` (NO usar OneDrive ni rutas anteriores).
- **Repo remoto:** <https://github.com/wrodriguez3030-del/Dermaland->
- **Puerto dev local:** `3031` → <http://localhost:3031>
- **Producción Vercel:** <https://dermaland.vercel.app>

## Vercel

- Team: `wrodriguez3030-4801s-projects`
- Project: `dermaland` (`prj_33cYNYkz0FU14PEX0YIS2iXiiIlf`)
- Root Directory: `apps/web`
- Install command (proyecto): `cd ../.. && pnpm install --frozen-lockfile`
- `vercel.json` (root del repo) define `buildCommand` / `outputDirectory`
  relativo al Root Directory (`.next`, no `apps/web/.next`).
- **GitHub conectado** al proyecto Vercel desde 2026-05-13 — push a `main`
  hace deploy de producción; push a otras ramas hace preview.

## Lecciones del primer despliegue (2026-05-13)

1. **`vercel build` local falla en Windows** con `EPERM symlink
   _not-found.rsc.func`. Solución: omitirlo y usar `vercel deploy` directo
   (Vercel construye en el builder remoto Linux).
2. **`outputDirectory` debe ser relativo al Root Directory.** Si el proyecto
   tiene Root Directory `apps/web`, usar `"outputDirectory": ".next"`. Antes
   estaba `"apps/web/.next"` y Vercel resolvía `apps/web/apps/web/.next` ⇒
   `routes-manifest not found`.
3. Vercel CLI **sí recoge `vercel.json` del repo root** aunque Root Directory
   sea `apps/web` (al menos vía `vercel deploy` desde CLI). Pero los paths de
   `outputDirectory` siguen el Root Directory.
4. Previews quedan tras **Deployment Protection** (401 sin auth) — no es un
   bug, es la config de la cuenta. Producción aliased en `dermaland.vercel.app`
   sí es pública.

## Higiene de secretos

- `.scratch-*` excluido en `.gitignore` (puede contener tokens locales).
- `.vercel/` excluido en `.gitignore`.
- `.env`, `.env.local`, `.env.production`, `.env.development`, `.env.*.local`
  excluidos en `.gitignore`.
- Certificados (`*.p12`, `*.pfx`, `*.key`, `*.pem`, `*.crt`, `*.cer`, `*.der`,
  `certificates/`) excluidos en `.gitignore`.

## Token expuesto en archivos scratch (incidente y mitigación)

Token Vercel expuesto en archivos scratch temporales. Los archivos fueron
eliminados y están ignorados por git. **El usuario debe revocar manualmente
cualquier token relacionado en <https://vercel.com/account/tokens>.**

Detalle:

- Archivos afectados: `.scratch-update-project.ps1`, `.scratch-verify-project.ps1`, `.scratch-find-vercel-auth.ps1`.
- Estado de los archivos: eliminados del filesystem el 2026-05-13.
- Estado del repo: nunca fueron staged ni pusheados (estaban en `.gitignore`
  desde la edición previa al primer deploy).
- Estado del token: respondió `invalidToken` al PATCH antes de borrar — ya no
  es funcional para la API. Aun así, revocar formalmente es buena higiene.

## Pendientes

- **Revocar manualmente** el token Vercel expuesto (acción del usuario,
  requiere login en navegador).
- **Variables reales de Supabase y otras** (DGII, WhatsApp, OpenAI, Resend,
  Upstash, PayPal, Cardnet, Sentry) — lista completa en
  `docs/deploy-vercel.md`. Hoy el deploy corre sin ellas porque la fase 0 solo
  sirve `/` y `/api/health`. Cargarlas vía Vercel Dashboard o `vercel env add`
  antes de empezar fase 1.
- **Dominio final** y DNS — decisión de negocio.
- **Protección de previews** — decidir si la demo será pública o protegida
  por SSO/password.
