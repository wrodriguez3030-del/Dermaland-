# Estado actual — DermaLand

> Snapshot de qué está hecho. Actualizar al cerrar cada cambio
> importante. Léelo después de `CLAUDE.md` y `PROJECT_MEMORY.md`.

**Última actualización:** 2026-05-19

## 2026-05-19 (tarde) · Fase C — migraciones DGII aplicadas en Supabase

- Tres migraciones aplicadas manualmente desde Supabase Dashboard
  SQL Editor (`.scratch-fase-c-combined.sql`, una sola transacción):
  - `0003_dgii_pos.sql` — 19 tablas DGII/POS + función
    `reserve_ecf_sequence_number` + RLS por tenant
    (`business_id = auth_business_id()`).
  - `0004_dgii_permissions_seed.sql` — 18 permisos DGII/cash.
  - `0005_dgii_role_permissions_seed.sql` — 7 roles + 59 pares
    rol→permiso (super_admin 18, admin 18, manager 12, cashier 4,
    inventory 0, supervisor 3, auditor 4).
- Validador in-transaction confirmó los counts exactos antes del
  `COMMIT`; el usuario reportó "aplicado, counts OK".
- **Repo:** working tree limpio en commit `12d7963`. No se generaron
  cambios de código en este paso. `pg` (intentado para apply
  automatizado) y `scripts/apply-fase-c-migrations.mjs` fueron
  removidos al cierre — la ruta automatizada vía Node falló por
  placeholders en `.env.local`.
- **`DATA_SOURCE=mock` intacto** local y en Vercel (project
  `dermaland` sigue con **cero environment variables**).
- **`database.types.ts` NO regenerado** — `SUPABASE_PROJECT_REF` es
  placeholder; pendiente para cuando el usuario llene credenciales
  reales.
- Pendientes documentados para completar Fase C: real
  `SUPABASE_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN` + ejecutar
  `supabase gen types` + commit `"Aplicar tipos Supabase para DGII"`.
- **No se tocó** DGII real, no se usó cert real, no se desplegó a
  producción. Fases G/H siguen bloqueadas.

## 2026-05-19 · Asistente de habilitación DGII (mock)

- Nueva ruta `/dgii/habilitacion` — wizard/checklist vertical con 6
  pasos (postulación, pruebas e-CF, representaciones impresas, URLs de
  servicios, declaración jurada, asignación roles + NCF).
- Cada paso tiene checklist propio, 7 estados (`pending`,
  `in_progress`, `completed`, `blocked`, `requires_user_action`,
  `requires_accountant_validation`, `requires_dgii_validation`),
  estado configurable por el usuario, link a módulo relacionado.
- Persistencia en `localStorage` vía
  `apps/web/src/features/dgii/enablement-store.ts`. Producción: migrar
  a tabla `dgii_enablement_progress` con RLS por business.
- Catálogo declarativo en
  `apps/web/src/lib/mock-data/dgii-enablement.ts` (6 pasos + URLs de
  servicios planificadas + permisos relevantes).
- Componentes nuevos en `apps/web/src/components/dgii/`:
  `enablement-step-card.tsx`, `enablement-status-badge.tsx`.
- Sidebar nav DGII ahora muestra "Habilitación" como primer item.
- 31 tests nuevos (382 totales). Pasos con `requiresDgii=true` quedan
  marcados `blocked` hasta Fase G/H.
- NO toca Supabase real, NO envía a DGII, NO firma con cert real.

## 2026-05-13 · Restauración a versión completa + deploy prod

- Versión completa copiada de `C:\Users\Admin\OneDrive\Escritorio\dermaland\`
  hacia ruta canónica `C:\dev\dermaland\` (228 archivos, 0 secretos).
  Origen intacto.
- Next.js bump 15.1.6 → **15.5.18** (Vercel bloqueaba 15.1.6 por CVE).
- Rama `feature/restore-complete-project` creada y pushada a
  `https://github.com/wrodriguez3030-del/Dermaland-`.
- `main` fast-forward (no `--force`) usando merge `-s ours
  --allow-unrelated-histories` para preservar la Fase 0 como segundo padre.
- Deploy producción en Vercel ✅: `https://dermaland.vercel.app` —
  13/13 rutas devuelven 200, `/` ya no es la landing de Fase 0.
- Detalle del proceso: `docs/deploy-vercel.md`,
  `docs/comparacion-versiones.md`.

**Anterior última actualización:** 2026-05-07

## Fases completadas

| Fase | Descripción | Resultado |
|---|---|---|
| 0 | Scaffold del monorepo pnpm + Next.js 15 + Tailwind 4 | ✅ |
| 1-8 | MVP navegable — 75 rutas con mock data | ✅ |
| P1 | Backend prep — repos + Supabase clients + tipos de dominio | ✅ |
| P2 | Auth prep — server actions + middleware + página `/login` | ✅ |
| P3 | RLS — 2 migraciones + `docs/rls-policy.md` | ✅ |
| P4 | Scanner real — BarcodeDetector + ZXing + Bluetooth | ✅ |
| P5 | Offline PWA — IndexedDB queue + sync + sw.js | ✅ |
| P6 | DGII service stubs + service.ts | ✅ stubs |
| P7 | WhatsApp service stubs + webhook handler | ✅ stubs |
| P8 | IA service — tools registry + bloqueo de agendamiento | ✅ stubs |
| P9 | Tests — vitest unit + Playwright smoke | ✅ |
| P10 | CI/CD — `.github/workflows/ci.yml` | ✅ |
| P11 | Documentación — 8 docs técnicas en `docs/` | ✅ |
| (extra) | Hydration fix de impresión de proformas | ✅ 2026-05-07 |
| (extra) | Sistema de agentes (10 agentes + workflow) | ✅ 2026-05-07 |
| (extra) | Rediseño POS + reglas documentales + selector de pago | ✅ 2026-05-07 |
| (extra) | Memoria persistente del proyecto | ✅ 2026-05-07 |

## Módulos creados

### Tenancy

- `Business` (RNC, plan, estado)
- `Branch` (sucursal con dirección)
- `Warehouse` (almacén dentro de sucursal)

### Usuarios / roles

- `User` con `role`: `super_admin · admin · manager · cashier ·
  inventory · supervisor · auditor`.
- `RoleDefinition`, `Permission`, `AuditLog`.
- Super-Admin shell separada en `(super-admin)/`.

### Catálogo

- `Brand`, `Laboratory`, `Category`.
- `Product` con foto, registro sanitario, ITBIS por producto, forma
  farmacéutica, presentación, ingrediente activo.
- `ProductLot` con vencimiento, cantidad, status.

### Inventario

- `InventoryStockByLot`, `InventoryMovement`.
- Conteo físico: `InventoryCount`, `InventoryCountScan`,
  `InventoryCountItem`.
- FEFO en `selectFefoLot`.
- Lotes vencidos bloqueados en POS.

### CRM

- `Customer` con `defaultBillingType`, `skinType`, `consents`.
- `CustomerNote`.
- Detección de duplicados por documento.

### Ventas

- `Proforma` (con `documentKind`, `ecfType`, `sequenceType`).
- `SaleItem`, `Payment`.
- `CashRegisterSession`.
- `resolveDocumentToIssue` (función pura testeada).

### Recomendaciones

- `SkinType`, `SkinCondition`, `RoutineTemplate`, `Recommendation`.

### SaaS

- `Plan`, `PlanLimits`, `Subscription`, `UsageCounter`.

### Servicios

- `WhatsappTemplate`, `WhatsappConversation`, `WhatsappMessage`.
- `AIAgent`, `AIActionLog`, registry de tools, bloqueo de agendamiento.
- `ApiKey`, `Webhook` (esqueleto API V3).
- `DgiiSequence`, `ElectronicInvoice` (stubs).

## Rutas existentes (78 páginas en build)

### Públicas / auth

- `/login`

### App shell `(app)`

- `/` (dashboard)
- `/admin/auditoria · /admin/configuracion · /admin/empresa ·
   /admin/permisos · /admin/roles · /admin/sucursales · /admin/usuarios`
- `/api-v3 · /api-v3/keys`
- `/caja · /caja/historial`
- `/clientes · /clientes/[id] · /clientes/[id]/editar · /clientes/nuevo`
- `/conteo-fisico · /conteo-fisico/[id] · /conteo-fisico/[id]/movil ·
   /conteo-fisico/nuevo`
- `/devoluciones`
- `/dgii · /dgii/certificado · /dgii/configuracion · /dgii/envios ·
   /dgii/facturas · /dgii/secuencias`
- `/ia · /ia/agentes · /ia/conversaciones · /ia/logs`
- `/inventario · /inventario/almacenes · /inventario/bajo-stock ·
   /inventario/cuarentena · /inventario/movimientos · /inventario/por-lote ·
   /inventario/recall · /inventario/vencimientos`
- `/notas-credito`
- `/pagos`
- `/pos`
- `/productos · /productos/[id] · /productos/[id]/editar ·
   /productos/categorias · /productos/laboratorios · /productos/marcas ·
   /productos/nuevo`
- `/proformas · /proformas/[id]/print`
- `/recomendaciones · /recomendaciones/[id] ·
   /recomendaciones/condiciones · /recomendaciones/nueva ·
   /recomendaciones/rutinas · /recomendaciones/tipos-piel`
- `/reportes · /reportes/caja · /reportes/clientes · /reportes/conteos ·
   /reportes/inventario · /reportes/productos · /reportes/ventas`
- `/ventas`
- `/whatsapp · /whatsapp/conversaciones · /whatsapp/enviados ·
   /whatsapp/plantillas`

### Super-Admin shell `(super-admin)`

- `/super-admin · /super-admin/branding · /super-admin/modulos ·
   /super-admin/negocios · /super-admin/pagos · /super-admin/planes ·
   /super-admin/suscripciones · /super-admin/uso`

### API

- `/api/health`
- `/api/whatsapp/webhook`
- `/api/inventory-counts/sync`

## Componentes importantes

### UI primitives (`apps/web/src/components/ui/`)

- `button`, `card`, `input`, `badge`, `table`, `tabs`,
  `confirm-dialog`, `empty-state`, `filter-bar`, `row-actions`,
  `search-input`, `sortable-table-header`, `stat-card`, `toast`,
  `bar-chart`, `use-local-soft-delete`.

### Layout (`apps/web/src/components/layout/`)

- `AppShell`, `Sidebar`, `Header`, `OfflineStatusPill`, `PageHeader`.

### Features

- `pos/pos-terminal.tsx` — terminal completo, rediseñado.
- `sales/document-resolver.ts` — función pura de reglas documentales.
- `sales/proforma-store.ts` — store en `localStorage`.
- `sales/components/receipt-80mm.tsx` — ticket térmico.
- `customers/customer-store.ts` + `customer-search-select.tsx` +
  `new-customer-form.tsx` + `billing.ts` + `utils/duplicate-detection.ts`
  + `utils/search-clients.ts`.
- `products/product-store.ts` + `components/product-image.tsx`.
- `inventory/lot-badges.tsx`.
- `inventory-counts/mobile-scanner` + hooks + `offline` + `sync`.

### Server

- `server/auth/` — context, actions (`signIn`, `signOut`, MFA), middleware.
- `server/repositories/` — types · mock · supabase · factory.
- `server/services/dgii/` · `whatsapp/` · `ai/` (con tools registry).

### Tipos

- `apps/web/src/types/index.ts` — todos los tipos del dominio.

## Tests existentes

| Archivo | Cubre |
|---|---|
| `apps/web/src/features/customers/customer-store.test.ts` | Persistencia y operaciones del store |
| `apps/web/src/features/customers/utils/duplicate-detection.test.ts` | Detección de duplicados por documento |
| `apps/web/src/features/customers/utils/search-clients.test.ts` | Búsqueda de clientes |
| `apps/web/src/features/sales/document-resolver.test.ts` | Reglas documentales (consumo · crédito fiscal · todos los métodos) |
| (otros) | Hooks, helpers, utilidades — total **111 tests** en 9 archivos |

Smoke browser:

- `apps/web/tests/hydration-proforma-print.mjs` — Playwright headless,
  detecta hydration mismatch en `/proformas/[id]/print`.
- `apps/web/tests/pos-flow-smoke.mjs` — Playwright headless, valida
  selector de pago, indicador de documento, botón dinámico, aviso CF
  sin RNC.

E2E (Playwright `tests/e2e/`):

- Smoke principal pasando en CI.

## Qué funciona en local

```
typecheck  ✅  pnpm --filter web typecheck
build      ✅  pnpm --filter web build  → 78/78 páginas
test       ✅  pnpm --filter web test   → 111 tests pasando
dev        ✅  pnpm --filter web dev    → http://localhost:3031
```

Smoke HTTP a las rutas críticas (todas en 200):

- `/`, `/clientes`, `/clientes/nuevo`, `/productos`, `/productos/nuevo`,
  `/inventario`, `/conteo-fisico`, `/pos`, `/proformas`, `/ventas`,
  `/super-admin`, `/api/health`.

Smoke browser:

- `/proformas/[id]/print` — 0 hydration issues.
- `/pos` — 11/11 checks (sin método pre-seleccionado, indicador
  documento dinámico, botón dinámico, aviso CF sin RNC, 0 hidratación).

## Qué falta para producción

Ver `docs/proximos-pasos.md` para la lista priorizada. Resumen:

1. Conectar Supabase real.
2. Migrar mocks a repositorios Supabase.
3. DGII real (secuencias, certificado, envío).
4. WhatsApp Cloud API real.
5. IA real (OpenAI / Claude).
6. CI/CD verde end-to-end.
7. Cerrar `docs/production-checklist.md`.
