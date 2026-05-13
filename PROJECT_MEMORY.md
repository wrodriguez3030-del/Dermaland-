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

## Token expuesto en archivos scratch (incidente y cierre)

Estado del incidente: **cerrado** (2026-05-13).

- **Archivos afectados:** `.scratch-update-project.ps1`,
  `.scratch-verify-project.ps1`, `.scratch-find-vercel-auth.ps1`.
- **Estado del filesystem:** archivos eliminados el 2026-05-13.
- **Estado del repo (forensic):** `git log --all -S 'vca_'` no devuelve
  ningún commit en ninguna rama; `git log --diff-filter=A` no muestra que
  ningún `.scratch-*` haya sido staged ni pusheado jamás. El historial
  remoto está limpio.
- **Estado del token:** respondió `invalidToken` al PATCH antes de borrar
  los scratch — ya no funcional.
- **Revisión manual por el usuario (2026-05-13):** revisó
  <https://vercel.com/account/tokens>; todos los tokens activos son
  legítimos, no había token sospechoso para revocar.

> Higiene futura: cualquier script auxiliar va con prefijo `.scratch-*`
> (gitignored). Si alguna vez se necesita un token de API para automatizar,
> usar variable de entorno `VERCEL_TOKEN=… vercel …` en una sola sesión,
> nunca embebido en archivos.

## Pendientes

- **Variables reales de Supabase y otras** (DGII, WhatsApp, OpenAI, Resend,
  Upstash, PayPal, Cardnet, Sentry) — lista completa en
  `docs/deploy-vercel.md`. Hoy el deploy corre sin ellas porque la fase 0 solo
  sirve `/` y `/api/health`. Cargarlas vía Vercel Dashboard o `vercel env add`
  antes de empezar fase 1.
- **Dominio final** y DNS — decisión de negocio.
- **Protección de previews** — decidir si la demo será pública o protegida
  por SSO/password.
