# DermaLand

> SaaS multiempresa/multisucursal para farmacia y dermocosmética en República Dominicana.
> **Marca:** DermaLand (siempre con `L` mayúscula).

[![Producción](https://img.shields.io/badge/prod-dermaland.vercel.app-000?logo=vercel)](https://dermaland.vercel.app)

- **Producción:** <https://dermaland.vercel.app>
- **Dev local:** <http://localhost:3031> (`pnpm --filter @dermaland/web dev`)
- **Guía de despliegue:** [`docs/deploy-vercel.md`](docs/deploy-vercel.md)

## Estructura del proyecto en disco

| Ubicación | Contenido |
|-----------|-----------|
| `C:\dev\dermaland\` (este repo) | Todo el código: `apps/`, `packages/`, `supabase/`, configs y scripts |
| `G:\Mi unidad\PROYECTO DERMALAND\` (Drive) | Documentos: `SPEC.md`, `decisiones.md`, `plan-maestro.md`, `riesgos.md`, `docs/` |
| `G:\Mi unidad\PROYECTO DERMALAND\data\import\` | Catálogo de productos editable en Excel (sincronizado entre máquinas vía Drive) |

**Por qué split:** OneDrive/Drive y Node.js no se llevan bien (locks, `os error 426`, builds rotos). Código en local (clon), docs en Drive.

## Multi-máquina

Trabajas oficina + casa. Sincronización vía git/GitHub:

```powershell
# Una vez por máquina
gh auth login                                  # o git config credentials
git clone <repo-url> C:\dev\dermaland
cd C:\dev\dermaland
pnpm install

# En cada sesión
git pull
# ... trabajas ...
git add -A
git commit -m "..."
git push
```

Los documentos en `G:\Mi unidad\PROYECTO DERMALAND\` los sincroniza Drive Desktop automáticamente.

## Stack

Next.js 15 + React 19 + Tailwind + shadcn/ui · Supabase (Auth/DB/Storage/Edge Functions/Realtime) · Drizzle ORM · pnpm workspaces · Vercel · GitHub Actions.

Detalle completo en `G:\Mi unidad\PROYECTO DERMALAND\decisiones.md`.

## Estructura del repo

```
dermaland/
├── apps/
│   ├── web/                Next.js — admin, POS, súper admin, sitio público
│   └── mobile/             Next.js PWA — conteo físico móvil
├── packages/
│   ├── db/                 Drizzle ORM + schema + migraciones
│   ├── shared/             Constantes, validadores Zod, tipos
│   └── ui/                 Componentes UI compartidos
├── supabase/
│   ├── config.toml
│   ├── migrations/         SQL versionado (0001_phase1_core.sql)
│   └── functions/          Edge Functions
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Empezar

```powershell
# Pre-requisitos
node --version              # >= 20
npm install -g pnpm

# Instalar dependencias del workspace
pnpm install

# Configurar entorno
copy .env.example .env.local
# Editar .env.local con credenciales reales del proyecto Supabase

# Aplicar migraciones a la DB
pnpm db:migrate

# Arrancar el web
pnpm --filter @dermaland/web dev   # http://localhost:3031

# Arrancar la PWA móvil (en otra terminal, cuando exista)
pnpm dev:mobile                    # http://localhost:3001
```

## Reglas duras del proyecto

1. **NO** agendamiento, citas, bookings, calendarios. Prohibido.
2. Todo dato lleva `business_id` con RLS por tenant.
3. Inventario por **producto + lote + vencimiento + sucursal + almacén**.
4. Conteo móvil por **acumulación de escaneos**, no por entrada manual de cantidad.
5. Toda acción sensible auditada.

## Documentación

| Doc | Ubicación |
|-----|-----------|
| Spec maestra completa | `G:\Mi unidad\PROYECTO DERMALAND\SPEC.md` |
| Decisiones técnicas | `G:\Mi unidad\PROYECTO DERMALAND\decisiones.md` |
| Plan maestro 11 fases | `G:\Mi unidad\PROYECTO DERMALAND\plan-maestro.md` |
| Riesgos | `G:\Mi unidad\PROYECTO DERMALAND\riesgos.md` |
| Contrato import productos | `G:\Mi unidad\PROYECTO DERMALAND\docs\import-productos.md` |
| Resumen catálogo inicial | `G:\Mi unidad\PROYECTO DERMALAND\data\import\README.md` |
