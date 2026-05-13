# CLAUDE.md — Guía para Claude trabajando en DermaLand

Este archivo es leído automáticamente por Claude Code al entrar al repo. Sigue
estas reglas SIEMPRE.

## Rutas

- **Repo oficial:** `C:\dev\dermaland`. NO uses OneDrive ni rutas anteriores.
- Documentos largos (`SPEC.md`, `decisiones.md`, etc.) viven en
  `G:\Mi unidad\PROYECTO DERMALAND\` — no se sincronizan por git.

## Puerto dev local

`3031` → <http://localhost:3031> (definido en `apps/web/package.json` y en
`C:\dev\PROJECT_PORTS.md`).

## Stack y workspace

- pnpm workspaces, paquetes internos: `@dermaland/web`, `@dermaland/db`,
  `@dermaland/shared`, `@dermaland/ui`.
- Next.js 15 + React 19. App Router.
- Supabase para auth/DB/storage.

## Comandos canónicos

```powershell
pnpm install
pnpm --filter @dermaland/web typecheck
pnpm --filter @dermaland/web build
pnpm --filter @dermaland/web dev      # localhost:3031
```

## Despliegue Vercel

Detalle completo en [`docs/deploy-vercel.md`](docs/deploy-vercel.md). TL;DR:

```powershell
cd C:\dev\dermaland
vercel pull --yes --environment=preview
vercel deploy --yes                   # preview
vercel deploy --prod --yes            # producción → dermaland.vercel.app
```

**No** uses `vercel build` local en Windows (falla por symlink EPERM). Deja
que Vercel construya remoto.

## Reglas duras

1. Nada de agendamiento/citas/bookings/calendarios. Prohibido en este SaaS.
2. Todo dato lleva `business_id` con RLS por tenant.
3. Inventario por producto + lote + vencimiento + sucursal + almacén.
4. Conteo móvil por acumulación de escaneos.
5. Toda acción sensible auditada.

## Higiene operacional

- **Nunca** commitear `.env*.local`, `.vercel/`, `.scratch-*`, `auth.json`,
  certificados (`*.p12`, `*.pfx`, `*.key`, `*.pem`) ni tokens.
- **Nunca** imprimir tokens en la conversación.
- Cualquier script auxiliar va con prefijo `.scratch-*` (gitignored).
