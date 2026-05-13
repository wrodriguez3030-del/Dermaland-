# DermaLand · Testing

Estructura de tests, cómo correrlos y qué validamos.

## Stack

- **Vitest** — unit tests (lógica pura, repos, services, utils).
- **Playwright** — E2E (rutas críticas, flujos completos).
- **Testing Library + jsdom** — componentes React aislados (cuando aplique).

## Comandos

```powershell
# Unit tests (rápidos)
pnpm --filter web test
pnpm --filter web test:watch         # modo watch durante desarrollo

# E2E (más lentos — arrancan dev server)
pnpm --filter web test:e2e:install   # primera vez
pnpm --filter web test:e2e
```

## Tests obligatorios (no negociables)

Cada release a producción debe pasar todos.

### Multi-tenant isolation (R-SEC-01)

`src/server/repositories/repositories.test.ts` — verifica que repos rechazan
queries cross-business.

```ts
const ctxA = { businessId: "biz_dermaland" };
const ctxB = { businessId: "biz_otro" };
// productos de A, byId con ctxB → null
```

En Fase 1+ con Supabase real, ampliar a un test E2E que crea dos tenants,
hace login con el de A y prueba TODAS las tablas. CI bloquea merge si falla.

### FEFO (R-INV-03)

`src/lib/mock-data/catalog.test.ts` — `selectFefoLot()` devuelve siempre el
lote disponible más próximo a vencer.

Edge cases cubiertos:
- 2 lotes disponibles → más próximo a vencer.
- Lote vencido + lote disponible → ignora vencido.
- Lote en cuarentena → ignora cuarentena.
- Lote en recall → ignora recall.

### Lotes vencidos / cuarentena bloqueados (R-INV-02)

Mismo archivo. Verifica `status === "available"` antes de exponer lotes
para venta.

### Conteo físico — acumulación + idempotencia (R-INV-01)

- Cada scan suma +1 sobre el mismo (producto, lote).
- Mismo `(device_id, offline_scan_id)` no duplica al sincronizar.
- Test E2E en `tests/e2e/mobile-scanner.spec.ts`.

En Fase 2 ampliar a:
- 2 dispositivos sincronizando el mismo conteo simultáneamente → no race condition.
- Lote vencido escaneado → marcado pero no permite venta posterior.

### IA bloquea agendamiento (R-AI-01)

`src/server/services/ai/tools.test.ts` — 16 tests verifican que:
- `validateToolName()` rechaza 9+ variantes de tools de agendamiento.
- `ALLOWED_TOOLS` no contiene ninguna prohibida.
- Bulk `validateToolSet()` falla si hay intrusos.

E2E adicional pendiente: enviar al agente "agéndame una cita" y verificar
respuesta correcta sin ejecutar tool.

### Approval gating en conteo físico

Pendiente E2E (Fase 2 con Supabase): un scan registrado no debe afectar
inventario hasta que un supervisor con permiso `inventory_count:approve`
firme.

## Coverage target

| Área | Mínimo |
|------|--------|
| Repos / services backend | 80% líneas |
| Hooks críticos (`useBarcodeScanner`, sync) | 70% |
| Components UI puros | 50% (snapshot/visual mejor que coverage) |

## Datos de prueba

- Mock data en `src/lib/mock-data/*.ts` es la fuente única.
- E2E asumen `DATA_SOURCE=mock` (sin Supabase requerido).
- Para E2E con Supabase real (cross-tenant isolation), preparar
  `tests/e2e/seed.ts` que crea 2 businesses y 2 usuarios via service-role
  antes del test, y los limpia después.

## CI

`.github/workflows/ci.yml` corre:
1. `typecheck`
2. `vitest run` (unit)
3. `next build`
4. `playwright test` (job separado, `continue-on-error` hasta Fase 11)
