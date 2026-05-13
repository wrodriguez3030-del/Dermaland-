# DermaLand — código

Monorepo pnpm de la plataforma DermaLand. SaaS multiempresa para farmacia,
dermocosmética y cuidado dermatológico — República Dominicana.

> **Documentación, especificaciones y datos editables por el cliente** viven en
> Google Drive: `H:\Mi unidad\PROYECTO DERMALAND\` (`SPEC.md`, `decisiones.md`,
> `plan-maestro.md`, `riesgos.md`, `data/import/`).
> El **código** vive aquí, fuera de Drive, para evitar conflictos de
> sincronización con `node_modules` (riesgo R-INF-01 documentado).

## Memoria del proyecto

DermaLand mantiene su propio contexto en archivos del repo para que
cualquier asistente IA (Claude / Codex / Cursor / Copilot) pueda
continuar el trabajo sin perder estado entre sesiones. **Antes de
modificar código, leer estos archivos**:

| Archivo | Para qué sirve |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Contexto principal: identidad, reglas duras, modelo de negocio, comandos |
| [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) | Memoria operativa: estado, qué funciona, qué falta, errores conocidos |
| [`docs/decisiones.md`](docs/decisiones.md) | Decisiones técnicas y de negocio con fecha |
| [`docs/riesgos.md`](docs/riesgos.md) | Riesgos abiertos y mitigaciones |
| [`docs/estado-actual.md`](docs/estado-actual.md) | Snapshot de fases / módulos / rutas / tests |
| [`docs/proximos-pasos.md`](docs/proximos-pasos.md) | Lista priorizada de pendientes |
| [`docs/contexto-general.md`](docs/contexto-general.md) | Alcance MVP / producción y reglas de negocio |
| [`docs/comandos-locales.md`](docs/comandos-locales.md) | Comandos útiles + rutas de smoke |

> Claude debe leer **`CLAUDE.md` y `PROJECT_MEMORY.md`** (al menos)
> antes de continuar trabajando en DermaLand. Al cerrar un cambio
> importante, actualizar `PROJECT_MEMORY.md`, `decisiones.md`,
> `riesgos.md` y `estado-actual.md` según corresponda.

## Flujo de agentes de desarrollo

DermaLand usa un sistema de **agentes de trabajo** (no usuarios del sistema)
para que la revisión, ejecución, validación y corrección sean rápidas y
con menos errores. Diez agentes especializados (Arquitecto, Frontend/UI,
POS y Ventas, Inventario, Clientes/CRM, QA/Testing, Seguridad/SaaS,
Documentación, Imágenes de Productos, Corrector de Errores) cubren todo
el ciclo: cada uno con alcance, archivos, checklist y prompt de uso.

- **Roster y reglas globales:** [`AGENTS.md`](AGENTS.md)
- **Workflow de 7 pasos:** [`docs/agents/workflow.md`](docs/agents/workflow.md)
- **Prompt para activar el flujo:** [`docs/agents/prompt-usar-agentes.md`](docs/agents/prompt-usar-agentes.md)
- **Checklist de validación rápida:** [`docs/agents/checklist-validacion-rapida.md`](docs/agents/checklist-validacion-rapida.md)
- **Per-agente:** [`docs/agents/`](docs/agents/)

Flujo canónico:

```
1. Arquitecto         revisa alcance y elige módulo
2. Agente del módulo  ejecuta el cambio
3. QA                 typecheck + build + test + smoke + hydration
4. Corrector          fix mínimo si QA encuentra fallos
5. Documentación      actualiza decisiones / riesgos / README
6. QA                 vuelve a validar
7. Resumen            qué cambió · cómo probar · pendientes
```

## Multi-PC — leer primero

Setup completo en una PC nueva (Node, pnpm, clone, env, install, run):
**`H:\Mi unidad\PROYECTO DERMALAND\SETUP-PC.md`**.

## Quick start

```powershell
cd C:\dev\dermaland
Copy-Item .env.example .env       # primera vez
pnpm install
pnpm dev                          # http://localhost:3031
```

## Comandos

```powershell
pnpm --filter web dev               # dev server :3031
pnpm --filter web build             # build de producción
pnpm --filter web typecheck         # tsc --noEmit
pnpm --filter web test              # vitest unit tests
pnpm --filter web test:e2e          # Playwright E2E
pnpm --filter web test:e2e:install  # primera vez (chromium)
```

## Estructura

```
C:\dev\dermaland\
├── apps/
│   └── web/
│       ├── public/                 manifest, sw.js, brand assets
│       ├── src/
│       │   ├── app/                rutas Next.js (App Router)
│       │   │   ├── (app)/          shell del business
│       │   │   ├── (super-admin)/  shell elevado
│       │   │   ├── api/            health, whatsapp/webhook, inventory-counts/sync
│       │   │   └── login/
│       │   ├── components/
│       │   │   ├── layout/         AppShell, Sidebar, Header, OfflineStatusPill
│       │   │   └── ui/             primitivas reutilizables
│       │   ├── features/
│       │   │   ├── inventory-counts/   mobile-scanner, hooks, offline, sync
│       │   │   ├── inventory/          lot-badges
│       │   │   └── pos/                pos-terminal
│       │   ├── lib/
│       │   │   ├── env.ts          validación zod de process.env
│       │   │   ├── mock-data/      datos por defecto cuando DATA_SOURCE=mock
│       │   │   ├── supabase/       clients (browser + server)
│       │   │   └── utils/          cn, format
│       │   ├── server/
│       │   │   ├── auth/           context, actions (signIn, signOut, mfa)
│       │   │   ├── db/             database.types.ts
│       │   │   ├── repositories/   types · mock · supabase · factory
│       │   │   └── services/       dgii · whatsapp · ai (tools registry)
│       │   ├── types/              dominio (Product, Proforma, etc.)
│       │   └── middleware.ts       auth + super-admin gating
│       ├── tests/e2e/              Playwright specs
│       ├── playwright.config.ts
│       └── vitest.config.ts
├── supabase/
│   └── migrations/                 0001_phase1_core.sql · 0002_phase2_inventory.sql
├── docs/
│   ├── env-vars.md
│   ├── rls-policy.md
│   ├── supabase-setup.md
│   ├── dgii-setup.md
│   ├── whatsapp-setup.md
│   ├── ai-setup.md
│   ├── testing.md
│   └── production-checklist.md
├── .github/workflows/ci.yml
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
└── .gitignore
```

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Lenguaje | TypeScript estricto (`noUncheckedIndexedAccess`) |
| Estilos | Tailwind CSS 4 |
| UI primitives | manuales en `src/components/ui/` |
| Forms / validación | Zod en bordes (server actions, API routes) |
| Backend (futuro) | Supabase (Postgres + Auth + Storage + RLS) |
| ORM | Drizzle / Prisma (decisión final en Fase 1) |
| Mock backend (actual) | `src/lib/mock-data/*.ts` + `src/server/repositories/mock/` |
| Testing | Vitest + Playwright + Testing Library |
| Offline scanner | BarcodeDetector API + @zxing/browser fallback + IndexedDB queue |
| CI/CD | GitHub Actions |

## DATA_SOURCE switch

`DATA_SOURCE` en `.env` decide el backing store:

```
DATA_SOURCE=mock        # default · datos en memoria · sin Supabase
DATA_SOURCE=supabase    # producción · requiere keys configuradas
```

La capa `src/server/repositories/` abstrae ambas implementaciones bajo una
interfaz común — las páginas no cambian al hacer el switch. Ver
`docs/supabase-setup.md`.

## Flujo entre PCs

| Pieza | Dónde | Cómo se sincroniza |
|-------|-------|--------------------|
| Código | `C:\dev\dermaland\` | git push/pull (GitHub privado) |
| Docs y CSV | `H:\Mi unidad\PROYECTO DERMALAND\` | Drive Desktop automático |
| `.env` (secretos) | `C:\dev\dermaland\.env` | 1Password / Bitwarden |
| `node_modules/` | local | NO se sincroniza — `pnpm install` por PC |
| Base de datos | Supabase cloud (Fase 1+) | Misma para todas las PCs |

**Regla dura:** nunca corras `pnpm install`, `npm install`, ni levantes el dev
server dentro de `H:\Mi unidad\PROYECTO DERMALAND\` (Drive). Solo desde
`C:\dev\dermaland\`.

## Estado actual

| Fase | Estado |
|---|---|
| 0 Scaffold | ✅ Completa |
| 1-8 MVP navegable | ✅ 75 rutas con mock data |
| P1 Backend prep | ✅ Repos + Supabase clients + types |
| P2 Auth prep | ✅ Server actions + middleware + login |
| P3 RLS | ✅ 2 migrations + docs/rls-policy.md |
| P4 Scanner real | ✅ BarcodeDetector + ZXing fallback + BT |
| P5 Offline PWA | ✅ IndexedDB queue + sync + service worker |
| P6 DGII service | ✅ Stubs + service.ts |
| P7 WhatsApp service | ✅ Stubs + webhook handler |
| P8 IA service | ✅ Tools registry + bloqueo de agendamiento |
| P9 Tests | ✅ 34 unit · E2E smoke |
| P10 CI/CD | ✅ `.github/workflows/ci.yml` |
| P11 Documentación | ✅ 8 docs en `docs/` |

Pendiente para go-live: ver `docs/production-checklist.md`.
