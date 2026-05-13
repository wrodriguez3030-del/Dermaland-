# Estado actual — DermaLand

> Snapshot de qué está hecho. Actualizar al cerrar cada cambio
> importante. Léelo después de `CLAUDE.md` y `PROJECT_MEMORY.md`.

**Última actualización:** 2026-05-13

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
