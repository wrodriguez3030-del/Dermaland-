# Estado actual — DermaLand

Snapshot a 2026-05-13.

## En producción

- **URL pública:** <https://dermaland.vercel.app>
- **Fase activa:** 0 (bootstrap mínimo Next.js)
- **Rutas servidas:** `/` (200), `/api/health` (200 JSON)
- **Build:** Next.js 15.5.18 + React 19 + pnpm workspaces, desplegado en
  Vercel (Node 24.x).

## Local

- **Ruta canónica:** `C:\dev\dermaland`
- **Repo:** <https://github.com/wrodriguez3030-del/Dermaland->
- **Dev server:** `pnpm --filter @dermaland/web dev` → <http://localhost:3031>
- **Branch:** `main` (única)

## Listo y configurado

- ✅ Despliegue manual por CLI funcionando (`vercel deploy --prod`).
- ✅ GitHub conectado al proyecto Vercel — auto-deploy por push a partir
  del 2026-05-13.
- ✅ `vercel.json` con paths correctos para monorepo con Root Directory
  `apps/web`.
- ✅ `.gitignore` cubre `.env*`, `.vercel/`, `.scratch-*`, certificados,
  build artifacts.
- ✅ Documentación operativa en `docs/deploy-vercel.md`, `PROJECT_MEMORY.md`,
  `CLAUDE.md`, `README.md`.
- ✅ Archivos scratch con tokens locales eliminados.

## Pendientes — accionables sin decisión humana

(Ninguno en este momento — todo lo automatizable ya se ejecutó.)

## Pendientes — requieren decisión humana o credenciales

1. **Revocar formalmente** el token Vercel personal en
   <https://vercel.com/account/tokens>. Requiere navegador.
2. **Cargar variables reales** (Supabase, DGII, WhatsApp, OpenAI, Resend,
   Upstash, PayPal, Cardnet, Sentry) en Vercel — ver lista completa en
   `docs/deploy-vercel.md`. Hoy el deploy corre sin ellas porque fase 0 no
   las consume.
3. **Dominio final** y DNS — decisión de marca/negocio.
4. **Protección de previews** — decidir si la demo será pública o protegida
   por SSO/password.
5. **Implementar fase 1** (POS, customers, productos, conteo móvil, etc.)
   según spec en Drive.
