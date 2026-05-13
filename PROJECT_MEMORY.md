# PROJECT_MEMORY.md — Memoria operativa de DermaLand

> Archivo vivo. Actualizar al cerrar cualquier cambio importante.
> Léelo después de `CLAUDE.md` antes de empezar a trabajar.

**Última actualización:** 2026-05-07

---

## 1 · Resumen del proyecto

**DermaLand** es un SaaS multi-empresa para farmacia, dermocosmética y
cuidado dermatológico en República Dominicana. Vive en
`C:\dev\dermaland` (monorepo pnpm). La app web Next.js 15 corre en
`localhost:3031`. Producción usará Supabase (Postgres + Auth + Storage +
RLS), DGII para e-CF, WhatsApp Cloud API y OpenAI/Claude para el agente
IA. Hoy está en MVP navegable con datos mock (`DATA_SOURCE=mock`).

## 2 · Estado actual

| Fase | Estado |
|---|---|
| 0 · Scaffold | ✅ |
| 1-8 · MVP navegable (75 rutas mock) | ✅ |
| P1 · Backend prep (repos + Supabase clients + tipos) | ✅ |
| P2 · Auth prep (server actions + middleware + login) | ✅ |
| P3 · RLS (2 migraciones + `docs/rls-policy.md`) | ✅ |
| P4 · Scanner real (BarcodeDetector + ZXing + BT) | ✅ |
| P5 · Offline PWA (IndexedDB + sync + sw.js) | ✅ |
| P6 · DGII service (stubs + service.ts) | ✅ stubs |
| P7 · WhatsApp service (stubs + webhook handler) | ✅ stubs |
| P8 · IA service (tools registry, bloqueo de agendamiento) | ✅ stubs |
| P9 · Tests (vitest unit + Playwright smoke) | ✅ |
| P10 · CI/CD (`.github/workflows/ci.yml`) | ✅ |
| P11 · Documentación + agentes | ✅ (este sistema) |
| P12 · Conectar Supabase real | ⏳ |
| P13 · DGII real | ⏳ |
| P14 · WhatsApp real | ⏳ |
| P15 · OpenAI/Claude real | ⏳ |
| P16 · Deploy a producción | ⏳ |

Pendiente para go-live: ver `docs/production-checklist.md` y
`docs/proximos-pasos.md`.

## 3 · Qué ya está funcionando

- **Build limpio:** `pnpm --filter web build` ✓ 78 páginas generadas.
- **Typecheck limpio:** `tsc --noEmit` ✓.
- **Tests:** 111 unit tests pasando (9 archivos).
- **POS** (`/pos`):
  - Layout responsivo (`lg:1.5fr/1fr`, `xl:2fr/1fr`).
  - Grid productos `sm:2 md:3 lg:3 xl:4 2xl:5`.
  - Selector de método de pago **explícito** (default `null`,
    `role="radio"`).
  - **Indicador "Documento a emitir"** dinámico.
  - Botón final dinámico ("Cobrar y emitir proforma" / "...factura").
  - Aviso de crédito fiscal sin RNC visible.
  - 0 hydration issues.
- **Reglas documentales** (`document-resolver.ts`):
  - Pura, testeada, conectada al POS y al Receipt80mm.
- **Impresión 80mm** (`/proformas/[id]/print`):
  - Patrón `mounted` aplicado, 0 hydration mismatch.
  - Auto-print con `?auto=1`.
  - "Generar PDF" via `window.print()`.
  - Recibo refleja `documentKind` / `ecfType` (FACTURA e-CF 31/32 vs.
    PROFORMA).
- **Clientes / CRM:** alta, edición, perfil, búsqueda en POS, default
  billing type por cliente.
- **Inventario:** productos con foto, lotes, vencimientos, FEFO en
  despacho, conteo físico móvil con cola IndexedDB.
- **Sistema de agentes** documentado: 10 agentes en `docs/agents/`,
  workflow en `docs/agents/workflow.md`.
- **Smoke browser tests:**
  - `node apps/web/tests/pos-flow-smoke.mjs` (11/11 ✓).
  - `node apps/web/tests/hydration-proforma-print.mjs` (0 issues ✓).

## 4 · Qué está pendiente

Lista priorizada en `docs/proximos-pasos.md`. Resumen:

1. Validar manualmente POS + impresión en Chrome real.
2. Mejorar fotos de productos faltantes (agente
   `imagenes-productos`).
3. Conectar Supabase real (migrar de `DATA_SOURCE=mock` a `supabase`).
4. Reemplazar mocks por repositorios reales en `server/repositories/supabase/`.
5. DGII real: secuencias e-CF, certificado, envío.
6. WhatsApp Cloud API real (webhook + plantillas).
7. Conectar agentes IA reales (OpenAI / Claude).
8. CI/CD verde end-to-end (lint + typecheck + test + build + e2e).
9. Pasar al `docs/production-checklist.md`.

## 5 · Decisiones importantes (resumen)

Detalle con fecha en `docs/decisiones.md`:

- **2026-05-07** · POS: layout responsivo + reglas documentales
  (`resolveDocumentToIssue`) + selector de pago explícito sin default.
- **2026-05-07** · Página de impresión de proformas con render diferido
  (patrón `mounted` mientras los datos vivan en `localStorage`).
- **Repositorios detrás de factory** · `DATA_SOURCE` decide
  `mock|supabase`. Páginas no cambian al hacer el switch.
- **Sin agendamiento** · DermaLand es farmacia/dermocosmética, no
  clínica. Bloquear cualquier intento de añadir citas/bookings.
- **Multi-empresa con `business_id`** · todas las tablas y queries.
- **Sistema de agentes de desarrollo** · 10 agentes documentados en
  `docs/agents/` para organizar revisiones, ejecución, validación,
  corrección y documentación.

## 6 · Reglas de negocio (resumen)

Detalle en `CLAUDE.md` § "Modelo de negocio del MVP" y
`docs/contexto-general.md`.

- **Documento a emitir** desde POS:
  - `consumo` + (cash | transfer | paypal | manual | other) → **Proforma**
  - `consumo` + (card | azul | cardnet | visanet) → **Factura e-CF 32**
  - `credito_fiscal` + cualquiera → **Factura e-CF 31** (exige RNC)
- **Lotes vencidos bloqueados** para venta.
- **FEFO automático** al despachar.
- **Conteo físico** offline-first (cola IndexedDB).
- **Cliente único** por `documentNumber`.
- **Descuento global** en % sobre subtotal pre-ITBIS.

## 7 · Rutas importantes (smoke críticas)

| URL | Estado |
|---|---|
| `/` | 200 |
| `/pos` | 200 · POS rediseñado |
| `/proformas` | 200 |
| `/proformas/[id]/print` | 200 · `mounted` pattern, 0 hidratación |
| `/proformas/[id]/print?auto=1` | 200 · auto-print |
| `/clientes` | 200 |
| `/clientes/nuevo` | 200 |
| `/productos` | 200 |
| `/productos/nuevo` | 200 |
| `/inventario` | 200 |
| `/conteo-fisico` | 200 |
| `/ventas` | 200 |
| `/super-admin` | 200 |
| `/api/health` | 200 |

Lista completa de rutas en `docs/comandos-locales.md`.

## 8 · Comandos para correr

Ver `docs/comandos-locales.md`. Mínimos:

```powershell
cd C:\dev\dermaland
pnpm --filter web dev          # dev server :3031
pnpm --filter web typecheck    # tsc --noEmit
pnpm --filter web build        # build de producción
pnpm --filter web test         # vitest unit
```

Smoke browser:

```powershell
node apps/web/tests/pos-flow-smoke.mjs
node apps/web/tests/hydration-proforma-print.mjs
```

## 9 · Errores conocidos y soluciones

| Síntoma | Causa | Solución |
|---|---|---|
| `Cannot find module './NNNN.js'` o `'./vendor-chunks/X.js'` desde `.next/server/...` al cargar cualquier ruta | Caché `.next` corrupta (mezcla dev/build, o pnpm reorganizó vendor chunks) | Detener dev (`Stop-Process -Id <PID> -Force`), `Remove-Item -Recurse -Force C:\dev\dermaland\apps\web\.next`, volver a `pnpm --filter web dev`. |
| `EADDRINUSE :::3031` al levantar dev | Otro proceso ya escuchando | `Get-NetTCPConnection -LocalPort 3031 -State Listen` → `Stop-Process -Id <OwningProcess> -Force`. |
| `Hydration failed because the server rendered HTML didn't match the client` en `/proformas/[id]/print` | El componente leía `localStorage` durante el primer render | Aplicar patrón `mounted` (ver `apps/web/src/app/(app)/proformas/[id]/print/page.tsx`). |
| Ejecutar `pnpm --filter web build` deja al dev server roto | `build` y `dev` comparten `.next` con artefactos incompatibles | Tras un `build`, si vas a usar `dev`, primero borrar `.next` y reiniciar `dev`. |
| `npx skills add ...` queda bloqueado en prompt interactivo | El CLI de "skills" pide elegir scope sin flag | No instalar herramientas externas innecesarias; en su lugar, usar el sistema de agentes manual de DermaLand (`AGENTS.md` + `docs/agents/`). |
| Botón de método de pago se ve "preseleccionado" sin haberlo tocado | Estado inicial era `"cash"` por default | Mantener `paymentMethod = null` hasta que el cajero haga clic; ningún `aria-checked=true` antes del primer click. |

## 10 · Última actualización

- **Fecha:** 2026-05-07
- **Cambios principales del día:**
  1. Fix de hydration mismatch en `/proformas/[id]/print` (patrón
     `mounted`).
  2. Sistema de agentes de desarrollo (`AGENTS.md` + 10 docs en
     `docs/agents/` + workflow + checklist + prompt).
  3. Rediseño del POS: layout fluido, reglas documentales con
     `resolveDocumentToIssue`, selector de pago explícito, indicador de
     documento, botón dinámico, aviso de crédito fiscal sin RNC.
  4. Memoria persistente del proyecto: `CLAUDE.md`, `PROJECT_MEMORY.md`
     y los 4 docs en `docs/`.
- **Validación:** typecheck ✓ · build ✓ (78/78) · 111 tests ✓ · smoke
  HTTP 12/12 en 200 · POS browser smoke 11/11 ✓ · hidratación 0 issues.

---

> Si vienes de una sesión nueva: empieza por `CLAUDE.md`, luego este
> archivo, luego `docs/decisiones.md`, `docs/riesgos.md`,
> `docs/estado-actual.md` y `docs/proximos-pasos.md`. Después puedes
> empezar a trabajar.
