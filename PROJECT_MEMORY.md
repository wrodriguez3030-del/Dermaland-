# PROJECT_MEMORY.md — Memoria operativa de DermaLand

> Archivo vivo. Actualizar al cerrar cualquier cambio importante.
> Léelo después de `CLAUDE.md` antes de empezar a trabajar.

**Última actualización:** 2026-05-19

---

## 0.0a · Sesión 2026-05-19 (noche) — Regen tipos Supabase + fix 0002 + 0002a_clients

**Resultado:** `database.types.ts` regenerado contra el proyecto real
(`sntcvyozbhrgicwmtcoh`) vía MCP Supabase. Bug FK descubierto y
resuelto: 0003 dependía de una tabla `clients` que no existía en
ningún archivo del repo — se agregó `0002a_clients.sql`. Bug
secundario en 0002 corregido (referencia a columna inexistente).

**Qué se hizo:**

1. **MCP Supabase autenticado** (OAuth) y verificado con
   `mcp__supabase__get_project_url` → URL coincide con el ref
   `sntcvyozbhrgicwmtcoh`.
2. **Sanity check:** `mcp__supabase__list_tables` + SQL directo
   confirmó que `public` estaba **vacío** (0 tablas, 0 migrations).
   La Fase C documentada en §0.0 no estaba realmente presente en
   este proyecto — posible reset previo o aplicación originalmente
   en otro proyecto.
3. **Re-aplicación autorizada del set completo** vía
   `mcp__supabase__apply_migration` en orden:
   - `0001_phase1_core` ✅
   - `0002_phase2_inventory` ✅ (ajustado para quitar
     `where deleted_at is null` de `inventory_stock_by_lot` —
     `product_lots` no tiene esa columna; el descarte lógico vive
     en `status`)
   - `0002a_clients` ✅ — **nueva migración del repo** creada en
     esta sesión. Define `clients` (CRM mínimo + RLS por
     business_id) que `proformas.customer_id` y
     `electronic_invoices.customer_id` referencian. Espejo del
     modelo TS `Customer` en `src/types/index.ts`
     (defaultBillingType, skinType estructurado, sin duplicados por
     documento por business).
   - `0003_dgii_pos` ✅
   - `0004_dgii_permissions_seed` ✅
   - `0005_dgii_role_permissions_seed` ✅
4. **Counts post-aplicación:** 43 tablas en `public`, 19
   tablas DGII/POS, 18 permisos, 7 roles, 59 role_permissions —
   coincide con la matriz esperada de Fase C.
5. **Regen de tipos:** `mcp__supabase__generate_typescript_types`
   produjo 3.372 líneas / 103 KB con las 43 tablas. Reemplaza el
   esqueleto manual previo (sólo `businesses`).
6. **Validaciones:** `typecheck` ✅, `build` ✅ (78 páginas,
   middleware 89.4 kB), `vitest` ✅ 382/382.
7. **Fix archivo `0002_phase2_inventory.sql`** del repo — se
   sincroniza con lo aplicado (sin `where deleted_at is null`),
   para que un fresh-apply 0001 → 0002 → 0002a → 0003 → 0004 →
   0005 ya funcione en cualquier proyecto vacío.
8. **`.mcp.json` queda en `.gitignore`** (decisión §7 del handoff
   confirmada — no se publica config MCP a GitHub).
9. **`.claude/` agregado a `.gitignore`** — config local del
   harness fuera del repo.

**Commits creados:**

- `0cad04b` — Aplicar tipos Supabase para DGII (regen + 0002a).
- (pendiente al cierre) Corregir migraciones base para Fase C
  Supabase (fix 0002 + `.gitignore`).

**Restricciones respetadas:**

- `DATA_SOURCE=mock` intacto (local + Vercel).
- Variables Vercel project siguen vacías.
- No se llamó DGII real ni `testecf`.
- Certificado `.p12` no usado.
- Sin deploy producción / DNS.
- Migraciones aplicadas únicamente en `sntcvyozbhrgicwmtcoh`.
- Sin borrado de datos (todas las migraciones son aditivas con
  `if not exists` / `on conflict do nothing`).

**Pendientes próximos (orden y bajo autorización del usuario):**

1. Smoke test local con `DATA_SOURCE=supabase` (cambiar en
   `.env.local`, validar `/dgii/configuracion`, `/dgii/secuencias`,
   `/dgii/facturas`, volver a `mock`).
2. Llenar env vars del proyecto Vercel + preview deploy con
   `DATA_SOURCE=supabase`.
3. Subir certificado real (Fase F real).
4. Fase G (envío real a `testecf`).
5. Fase H (consulta status / TrackId).

---

## 0.0 · Sesión 2026-05-19 (tarde) — Fase C DB aplicada en Supabase

**Resultado:** migraciones DGII/POS aplicadas en el proyecto Supabase
remoto desde Dashboard SQL Editor. Repo y `DATA_SOURCE=mock` intactos.

**Qué se hizo:**

1. **Migraciones aplicadas manualmente** en Dashboard SQL Editor (un
   solo `BEGIN; … COMMIT;` con `.scratch-fase-c-combined.sql`):
   - `0003_dgii_pos.sql` — 19 tablas DGII/POS + función
     `reserve_ecf_sequence_number`.
   - `0004_dgii_permissions_seed.sql` — tabla `permissions` + 18 seeds.
   - `0005_dgii_role_permissions_seed.sql` — tablas `roles` +
     `role_permissions` + 7 roles + 59 pares rol→permiso.
2. Validador in-transaction confirmó `19 tablas / 18 permisos /
   7 roles / 59 role_permissions` antes del `COMMIT`.
3. Intento previo de aplicación vía script Node + `pg` falló porque
   `.env.local` tiene placeholders en `SUPABASE_DB_URL` y
   `SUPABASE_PROJECT_REF`. Se eligió Ruta B (Dashboard manual).
4. **Limpieza posterior:** `pg` removido del workspace,
   `scripts/apply-fase-c-migrations.mjs` borrado, `package.json` +
   `pnpm-lock.yaml` restaurados. Working tree limpio en commit
   `12d7963`.
5. `database.types.ts` **NO regenerado** — placeholder en
   `SUPABASE_PROJECT_REF`. Los repos Supabase castean cliente como
   `any`, typecheck (382/382 tests) sigue verde.

**Pendientes para completar Fase C:**

- Llenar valores reales en `apps/web/.env.local`:
  `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`
  (token personal del Dashboard, requerido por
  `supabase gen types`).
- Ejecutar `npx supabase gen types typescript --project-id <ref> >
  apps/web/src/server/db/database.types.ts`.
- Commit `"Aplicar tipos Supabase para DGII"`.

**Restricciones aún vigentes (NO autorizado):**

- `DATA_SOURCE=supabase` (sigue en `mock` local + Vercel vacío).
- Variables Vercel project (siguen en cero).
- Fase G (envío real DGII testecf) / Fase H (status / TrackId).
- Subida real de certificado `.p12`.
- Deploy producción / DNS.

---

## 0.1 · Sesión 2026-05-19 — Asistente de habilitación DGII (mock)

**Resultado:** Nueva pantalla `/dgii/habilitacion` — wizard con 6 pasos
para guiar la habilitación e-CF ante DGII. 100% mock, 0% DGII real, 0%
Supabase real.

**Qué se hizo:**

1. Mock store `apps/web/src/features/dgii/enablement-store.ts` con
   API CRUD + `localStorage` (`dermaland.dgii-enablement-progress`).
2. Catálogo declarativo en
   `apps/web/src/lib/mock-data/dgii-enablement.ts` (6 pasos, checklist
   por paso, URLs servicios planificadas, permisos relevantes).
3. Componentes `enablement-status-badge.tsx` (7 estados visuales) y
   `enablement-step-card.tsx` (acordeón con checklist, select de
   estado, link al módulo).
4. Página `/dgii/habilitacion` con barra de progreso global,
   próximo paso recomendado, leyenda de estados, panel URLs servicios
   y panel permisos relevantes.
5. Sidebar DGII actualizado: "Habilitación" como primer item.
6. Docs actualizados: `plan-integracion-dgii.md`,
   `matriz-requisitos-dgii.md` (R-14), `estado-actual.md`.
7. 31 tests nuevos (`enablement-store.test.ts` +
   `dgii-enablement.test.ts`). Total suite: 382 tests verdes.

**Restricciones:** No `supabase db push`, no `DATA_SOURCE=supabase`, no
llamadas DGII reales, no certificado real, no XML real enviado.
Pasos con `requiresDgii=true` muestran `blockedReason` hasta
autorización Fase G/H.

---

## 0 · Sesión 2026-05-13 — Restauración a versión completa + prod

**Resultado:** `https://dermaland.vercel.app` sirve la versión completa
(no la Fase 0). 13/13 rutas críticas devuelven 200.

**Qué se hizo:**

1. Se encontraron dos carpetas con nombre "dermaland" en la PC. La completa
   estaba en `C:\Users\Admin\OneDrive\Escritorio\dermaland\` (228 archivos
   sin `node_modules`, 78 rutas en build). La de Drive
   (`H:\Mi unidad\PROYECTO DERMALAND\`) sólo tenía docs/SPEC/CSV.
2. `robocopy` de OneDrive → `C:\dev\dermaland\` con exclusiones
   (`node_modules`, `.next`, `.turbo`, `.git`, `.vercel`, `.scratch-*`,
   `.env*`, `*.p12`, `*.pfx`, `*.key`, `*.pem`, `*.crt`). 228 archivos
   copiados, **0 secretos**. Origen intacto (no movido, no borrado).
3. `.gitignore` endurecido (`.env.production`, `.vercel`, `.scratch-*`,
   certificados).
4. `pnpm install` ✓ (182 paquetes).
5. `pnpm --filter web typecheck` ✓.
6. `pnpm --filter web build` ✓ (78+ rutas).
7. `git init` en `C:\dev\dermaland`, remote `https://github.com/wrodriguez3030-del/Dermaland-`,
   rama `feature/restore-complete-project`, commit `0061779`.
8. Push de la rama feature ✓ (sin `--force`).
9. `vercel link --yes --project dermaland` ✓.
10. `vercel pull --yes --environment=preview` + `vercel deploy --yes` →
    **rechazado** por Vercel: `Vulnerable version of Next.js detected`
    (CVE en 15.1.6). Bump `next` a **15.5.18`, commit `e7c4915`,
    reinstall, typecheck, build, push, redeploy preview ✓.
11. Smoke en preview con `vercel curl -sI` (autenticado, deployment
    protection on): 13/13 rutas → 200.
12. Merge `origin/main` (Fase 0) en feature con `--strategy=ours
    --allow-unrelated-histories` → preserva Fase 0 como 2º padre del
    merge commit `ef94e18`, árbol = feature.
13. `git push origin HEAD:main` ✓ — **fast-forward**, no `--force`.
14. `vercel deploy --prod --yes` ✓ → `https://dermaland.vercel.app` READY.
15. Smoke anónimo en prod: 13/13 rutas → 200. `/` ya no es Fase 0.

**Detalle:** `docs/comparacion-versiones.md` + `docs/deploy-vercel.md`.

**Pendientes inmediatos para próxima sesión:**

- Conectar Supabase real (`DATA_SOURCE=supabase`), variables ya en el
  dashboard de Vercel.
- Probar producción desde un navegador real (no sólo HEAD).
- Revisar si Vercel Deployment Protection debería seguir en previews.
- Cuando esté Supabase Auth, validar que las rutas detrás de `/login`
  realmente exigen sesión (hoy en mock se sirven públicamente).

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
