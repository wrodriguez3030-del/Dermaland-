# Auditoría: fuente de datos por módulo (Supabase vs localStorage)

> Fecha: 2026-06-18 · Proyecto Supabase objetivo: **`sntcvyozbhrgicwmtcoh`**
> Regla operativa: **Supabase es la única fuente de verdad** para datos reales.
> Mock/localStorage solo se permite para modo demo controlado.

## Resumen ejecutivo

El sistema tiene **dos capas de datos**:

1. **Capa servidor** — `getRepositories()` (`src/server/repositories/index.ts`),
   que conmuta entre `mock` y `supabase` según `DATA_SOURCE`. La implementación
   Supabase ya existe para la mayoría de los módulos.
2. **Capa cliente/UI** — stores `features/**/*-store.ts` que persisten en
   **`localStorage`** por navegador/PC.

**El problema raíz de "cada PC ve datos distintos":** casi todas las pantallas
operativas consumen los **stores de `localStorage`**, no la capa servidor. Por
eso los datos no se comparten entre equipos. Además `DATA_SOURCE` está **sin
definir → `mock`**, así que aunque una pantalla usara la capa servidor, leería
mock y no Supabase.

Hoy **la única ruta UI → Supabase activa** es **DGII → Configuración** (server
action `dgii/configuracion/actions.ts`), y solo si `DATA_SOURCE=supabase`.

## Estado del MCP Supabase

- `.mcp.json` del proyecto apunta correctamente a
  `https://mcp.supabase.com/mcp?project_ref=sntcvyozbhrgicwmtcoh` (scope proyecto).
- `claude mcp list` (desde `C:\dev\dermaland`) lo lista como
  **`supabase … project_ref=sntcvyozbhrgicwmtcoh — Needs authentication`**.
- **Pendiente manual (interactivo, no automatizable):** `claude /mcp` → `supabase`
  → `Authenticate`. Debe hacerse desde una terminal normal, no desde la
  extensión del IDE.
- ⚠️ La `SUPABASE_SERVICE_ROLE_KEY` en `apps/web/.env.local` es un **placeholder**
  (`replace...`), no una llave real. Sin ella no se puede sembrar/verificar datos
  con privilegios ni escribir saltando RLS donde aplica.

## Matriz por módulo

Leyenda: ✅ implementado · ⚠️ parcial / gated · ❌ no usa Supabase (localStorage/mock) · — n/a

| Módulo | Repo servidor Supabase | API route | UI hoy | Veredicto |
|---|---|---|---|---|
| **Administración** |||||
| Empresa (business) | ✅ `business.ts` | — | server action DGII usa repos | ⚠️ repo listo; UI admin no migrada |
| Sucursales (branches) | ✅ `branch.ts` | ✅ `/api/branches` + `/[id]` (409 si no `supabase`) | ✅ hooks fetch al servidor + mutaciones API (gated) | ✅ **migrada 2026-06-18** (read+write vía API; fallback local) |
| Usuarios | ✅ `user.ts` | — | ❌ mock | ⚠️ repo listo; UI no migrada |
| Roles / permisos | parcial (seed migraciones 0004/0005) | — | mock | ⚠️ datos seed en DB; gestión UI no migrada |
| Auditoría | ✅ `audit.ts` | — | ❌ | ⚠️ repo listo; UI no migrada |
| **Productos** |||||
| Productos | ✅ `product.ts` | — | ❌ `product-store` (localStorage) | ❌ UI en localStorage |
| Categorías | ✅ `catalog.ts` | — | ❌ | ❌ UI en localStorage |
| Marcas | ✅ `catalog.ts` | — | ❌ | ❌ UI en localStorage |
| Laboratorios | ✅ `catalog.ts` | — | ❌ | ❌ UI en localStorage |
| **Inventario** |||||
| Stock por sucursal | ✅ `inventory.ts` / `warehouse.ts` | — | ❌ | ❌ UI en localStorage |
| Lotes / vencimientos | ✅ `product.ts` (productLot) | — | ❌ `lot-store` | ❌ UI en localStorage |
| Movimientos | ✅ `inventory.ts` | — | ❌ | ❌ UI en localStorage |
| Bajo stock | ✅ (derivado) | — | ❌ | ❌ UI en localStorage |
| Transferencias | migración 0010 | — | ❌ `transfer-store` | ❌ UI en localStorage |
| Ajustes | — | — | ❌ | ❌ UI en localStorage |
| Conteo físico | ❌ **stub** | ✅ `/api/inventory-counts/sync` | ❌ offline-first local | ❌ stub servidor + offline local |
| **Ventas** |||||
| POS / ventas | parcial (`sales.ts`) | — | ❌ | ❌ UI en localStorage |
| Proformas | ✅ `sales.ts` (proforma) | — | ❌ `proforma-store` | ❌ UI en localStorage |
| Pagos | parcial | — | ❌ | ❌ UI en localStorage |
| Devoluciones / N. crédito | parcial (DGII) | ✅ `/api/dgii/notas-credito` | ❌ `credit-note-store` | ❌ UI en localStorage |
| Caja | ✅ `sales.ts` (cashRegister) | — | ❌ `cash-closing-store` | ❌ UI en localStorage |
| **Compras** |||||
| Facturas proveedores | migración 0012 (**no aplicada**) | — | ❌ `compras-store` | ❌ tabla falta en cloud + UI local |
| Gastos / gastos menores | migración 0012 (**no aplicada**) | — | ❌ `compras-store` | ❌ tabla falta en cloud + UI local |
| Pagos recurrentes | migración 0012 (**no aplicada**) | — | ❌ `compras-store` | ❌ tabla falta en cloud + UI local |
| **DGII** |||||
| Configuración fiscal | ✅ `dgii.ts` (settings) | — | ✅ server action (gated) | ✅ **única ruta UI→Supabase activa** |
| Certificado | ✅ (gated por `isCertificateUploadEnabled`) | ✅ `/api/dgii/certificate/*` | ⚠️ simulado si falta env | ⚠️ gated por env |
| Secuencias e-NCF | migración 0011 (**no aplicada**) | — | ❌ `numbering-store` | ❌ tabla falta en cloud + UI local |
| Habilitación | — | — | ❌ `enablement-store` | ❌ UI en localStorage |
| Certificación | — | ✅ `/api/dgii/certificacion/run-test` | ❌ `certification-store` | ❌ UI en localStorage |
| Facturas electrónicas (demo) | ✅ `dgii.ts` (invoices) | ✅ `/api/dgii/facturas/*` | ⚠️ | ⚠️ flujo demo |
| Auditoría DGII | ✅ `audit.ts` | — | ❌ | ⚠️ repo listo; UI no migrada |

## Tablas verificadas en Supabase cloud (`sntcvyozbhrgicwmtcoh`)

Sondeo REST con anon key (RLS oculta filas, pero confirma existencia de tabla;
una tabla inexistente devuelve `404 PGRST205`):

| Tabla | Estado |
|---|---|
| `branches` | ✅ existe |
| `businesses` | ✅ existe |
| `products` | ✅ existe |
| `clients` | ✅ existe |
| `inventory_movements` | ✅ existe |
| `warehouses` | ✅ existe |
| `invoice_numberings` (migración 0011) | ❌ **NO existe en cloud** |
| `purchases` (migración 0012) | ❌ **NO existe en cloud** |

> Conclusión migraciones: en cloud están aplicadas ~`0001`–`0010`; **faltan
> `0011_invoice_numberings` y `0012_purchases`**. No verificable el conteo de
> filas/seed por falta de service_role key real.

## Causa raíz de divergencia entre PCs y remediación

**Causa:** los datos operativos viven en `localStorage` por navegador. Cada PC
tiene su propia copia; no hay fuente compartida. Contribuyen también: caché del
navegador, PWA/service worker, y `DATA_SOURCE` sin fijar.

**Remediación (orden):**
1. Autenticar MCP + cargar `SUPABASE_SERVICE_ROLE_KEY` real en `.env.local`.
2. Fijar `DATA_SOURCE=supabase` (servidor) y `NEXT_PUBLIC_DATA_SOURCE=supabase`
   (cliente) — primero en Preview, **nunca** Production sin autorización.
3. Migrar cada pantalla de su `*-store` (localStorage) a fetch contra API/server
   repo (patrón ya montado en `branches`: API route + `fetchBranchesFromServer`).
4. Tras migrar, los stores locales quedan solo para modo demo; limpiar
   `localStorage` viejo en cada PC (o versionar la key del store para invalidar).
5. Verificar que dos PCs distintas ven exactamente los mismos datos.

## Plan de migración UI → Supabase (pendiente, por prioridad)

Cada módulo replica el patrón de `branches` (API route con RLS por JWT +
hook cliente que hace fetch cuando el backend es `supabase`, con fallback local):

1. ~~**Sucursales** — backend 100% listo; solo falta el wiring final de
   `useBranches`/`useActiveBranches` a `fetchBranchesFromServer`.~~
   ✅ **HECHO 2026-06-18.** Lecturas: `useBranches` (y por derivación
   `useActiveBranches`/`useCurrentBranch`/`useBranch`) hacen `fetch` a
   `/api/branches?scope=admin` cuando `BRANCH_BACKEND==="supabase"`, con
   fallback a `localStorage` si la API falla. Escrituras: wrappers
   `saveBranch`/`setBranchActiveAnywhere`/`deleteBranchAnywhere` despachan a
   la API (`POST` / `PATCH` / `DELETE /api/branches[/:id]`) en modo supabase y
   al store local en modo demo. Banner/botón "Restablecer (este equipo)" solo
   se muestran en modo local. Todo gated por `NEXT_PUBLIC_DATA_SOURCE=supabase`:
   producción (`mock`) intacta. Validado: typecheck ✅ · vitest 609/609 ✅ ·
   build ✅. Pendiente verificación end-to-end real (requiere MCP autenticado +
   `NEXT_PUBLIC_DATA_SOURCE=supabase` en Preview).
2. **Productos + catálogos** (categorías/marcas/laboratorios) — repo listo;
   faltan API routes + hooks.
3. **Clientes** — repo listo; faltan API routes + hooks.
4. **Inventario** (stock, lotes, movimientos, vencimientos) — repo listo; faltan
   API routes + hooks.
5. **Proformas + Caja** — repo listo; faltan API routes + hooks.
6. **Secuencias e-NCF** — aplicar migración `0011` + repo + wiring.
7. **Compras** (facturas, gastos, recurrentes) — aplicar migración `0012` +
   repo (hoy no hay repo Supabase de compras) + wiring.
8. **Transferencias / Ajustes / Conteo físico** — implementar repos Supabase
   (hoy stub/parcial) + wiring.

## Bloqueadores que requieren acción del usuario

- **Autenticar MCP Supabase** (`claude /mcp` → supabase → Authenticate) — interactivo.
- **Cargar `SUPABASE_SERVICE_ROLE_KEY` real** en `apps/web/.env.local`.
- Confirmar si se aplican migraciones `0011`/`0012` a cloud (no destructivas) o
  si se usa el self-hosted `db-cls` por política.

## Validaciones ejecutadas (baseline)

- `pnpm --filter web typecheck` → ✅ sin errores.
- `pnpm --filter web exec vitest run` → ✅ **609/609** (50 archivos).
- `pnpm --filter web build` → ✅ build de producción OK.
