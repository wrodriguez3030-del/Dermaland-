# Unificación Incentivos ↔ Comisión de ventas (fuente única)

> Estado: **DISEÑO APROBADO — implementación por etapas.** Modelo canónico
> elegido: **Híbrido** (snapshot `sales_incentives` como fuente de líneas,
> reutilizando la maquinaria madura de Comisión: Excel/PDF/lotes/auditoría).
> No toca DGII real. No borra ni recalcula histórico sin auditoría.

## 1. Auditoría previa (dry-run, solo lectura)

Script: `scripts/audit-incentives-commissions.mjs` → `data/incentives-commissions-audit.json`.

Resultado en **producción** (Supabase DermaLand) al 2026-07-10:

| Tabla | Filas |
|---|---|
| `sales_incentive_rules` | **0** |
| `sales_incentives` (snapshots) | **0** |
| `sales_commission_rules` | **2** (activas, 3% / 1%) |
| `commission_exclusions` / `payouts` / `payment_batches` / `audit` | 0 / 0 / 0 / 0 |
| `proformas` | 16 (16 pagadas · **4 con vendedor**, 12 sin vendedor) |

**Conclusiones:** el módulo Incentivos está **vacío** (0 reglas, 0 snapshots);
Comisión es el que está vivo (cálculo dinámico, 2 reglas). **No hay histórico de
incentivos que migrar ni duplicados** → la unificación es de bajo riesgo de datos,
pero **cambia los números** del reporte de Comisión (pasa de dinámico a snapshots).

## 2. Los dos sistemas hoy (qué se duplica)

| | Incentivos (`0020`) | Comisión ventas (`0023`, EN PROD) |
|---|---|---|
| Motor | `features/incentives/incentive-engine.ts` (snapshot) | `features/reports/commission/commission-engine.ts` (dinámico) |
| Reglas | `sales_incentive_rules` (6 tipos) | `sales_commission_rules` (% método/sucursal/vendedor + prioridad) |
| Líneas | `sales_incentives` (persistidas) | `CommissionLine` (efímeras, por comprobante) |
| Base | Σ `SaleItem.subtotal` (por línea) | `subtotal − descuento` (venta) |
| Pago | `status` + `payment_batch_id` en la línea | `commission_payouts` por comprobante + `commission_payment_batches` |
| Exclusiones / Auditoría | — | `commission_exclusions` / `commission_audit` |
| Export | `incentive-export.ts` | `commission-report-excel.ts` (10 hojas) + `commission-report-pdf.ts` |
| API | `/api/incentives/*` | `/api/commission/*` |
| Página | `/ventas/incentivos` | `/reportes/comision-ventas` |

## 3. Modelo canónico (Híbrido)

**Fuente única de líneas:** `sales_incentives` (snapshot inmutable por
`(sale_id, rule_id, product_id)` — ya tiene `unique` = idempotencia §22).

**Fuente única de reglas:** `sales_incentive_rules`. Se **extiende** para cubrir
lo que hoy hace la regla de comisión (filtro por grupo de método de pago,
sucursal, vendedor, prioridad) sin perder los 6 tipos actuales. Las 2 reglas de
`sales_commission_rules` se **convierten** a reglas de incentivo
`percent_on_sale` con `payment_groups`.

**Lotes de pago:** `commission_payment_batches` (se conserva) + **nueva**
`commission_payment_batch_items(batch_id, incentive_id)` que enlaza el lote con
las líneas `sales_incentives` pagadas (reemplaza el modelo por-comprobante).

**Auditoría:** `commission_audit` (se conserva) como bitácora única de:
generado / aprobado / pagado / ajustado / anulado / lote creado / lote pagado /
regla creada-editada-activada.

**Estados únicos** (§10): `pending · approved · paid · adjusted · voided`
(UI: Pendiente · Aprobada · Pagada · Ajustada · Anulada). Se amplía el `check`
de `sales_incentives.status` (hoy `pending/approved/paid/void`) a estos cinco.

## 4. Base comisionable canónica (§9) — reconciliación

Definición única: **base = neto antes de ITBIS, después de descuento**.

- Comisión hoy: `p.subtotal − (p.discount || p.discountAmount)`.
- Incentivos hoy: Σ `SaleItem.subtotal` (ya pre-ITBIS, post-descuento de línea).

**Regla de oro:** para reglas de venta completa (`percent_on_sale`), la base del
snapshot debe ser `subtotal − descuento global` (igual que Comisión) — se ajusta
`computeRuleForSale` para restar el descuento global cuando no está distribuido en
líneas, de modo que **ambos módulos muestren el mismo importe** (ej. base 9.000 →
3% = 270).

## 5. Capa central `commissionRepository` (§6)

Nuevo módulo `features/commission/central.ts` (puro + hook) que ambos módulos
consumen. Lee SIEMPRE de `sales_incentives` (+ reglas + lotes + auditoría):

```
getCommissionSummary(filters)      // KPIs (base, 3%, 1%, otras, total, pend, pag)
getCommissionItems(filters)        // líneas (= snapshots enriquecidos)
getCommissionBySeller(filters)     // ranking (fuente única del "Vendedor top")
getCommissionByPaymentMethod(f)    // requiere método → enriquecer snapshot/GET
getCommissionByBranch(filters)
getCommissionRules()               // sales_incentive_rules
getCommissionPaymentBatches(f)
approveCommission(ids) / createPaymentBatch(ids) / markBatchPaid(batchId)
adjustCommission(id, reason, amount)
```

El reporte de Comisión (`buildCommissionReport`) se **repunta**: en vez de
recomputar desde `Proforma[]`, agrega sobre `IncentiveRecord[]`. El método de
pago (para "por método") se añade al enriquecimiento del GET `/api/incentives`
(`proformas(..., payments)` o columna materializada) — hoy el snapshot no lo trae.

## 6. Responsabilidades (§2)

- **Ventas > Incentivos** = configura reglas, ve incentivos, aprueba, crea lotes,
  paga, ajusta, gestiona devoluciones, Vendedor top. Botón **“Ver reporte
  completo”** → `/reportes/comision-ventas?seller=&period=&status=`.
- **Reportes > Comisión ventas** = consulta/filtra/analiza/audita/exporta
  (Excel/PDF). Acciones fila: Ver incentivo / Ver factura / Ver vendedor / Ver
  regla / Ver lote. Botones: **Gestionar reglas** → `/ventas/incentivos`,
  **Pagar seleccionadas** (abre flujo de lote de Incentivos), Ver pendientes /
  pagadas / ajustes. **No edita cálculos** desde el reporte.

## 7. Flujo único (§objetivo)

VENTA pagada → vendedor asignado → regla activa → `computeIncentivesForSale`
(snapshot en `sales_incentives`, estado `pending`) → aparece **igual** en
Incentivos y en Comisión ventas → aprobar → lote de pago → pagar (`paid`) →
auditoría → Excel/PDF. El cálculo ocurre **una sola vez** (al cobrar); Reportes
**no recalcula** (§8).

## 8. Devoluciones (§12)

- Incentivo **pending/approved** de venta devuelta → `voided` (no se borra).
- Incentivo **paid** → **ajuste negativo** (`adjusted` + fila de ajuste), nunca se
  borra el original; se refleja saldo de recuperación en ambos módulos.

## 9. Migración `0024_commission_unify.sql` (aditiva)

1. Ampliar `sales_incentives.status` check → `pending/approved/paid/adjusted/voided`.
2. Añadir a `sales_incentives`: `adjustment_amount numeric`, `approved_at`,
   `payment_method_group text` (materializado al generar, para "por método").
3. Ampliar `sales_incentive_rules`: `payment_groups text[]`, `seller_id`,
   `branch_id`, `priority int`.
4. Nueva `commission_payment_batch_items(id, business_id, batch_id, incentive_id)`
   con RLS por `business_id` e índice.
5. RLS por `business_id` en todo lo nuevo (patrón existente). `notify pgrst`.

Se **conservan** `sales_commission_rules`/`commission_payouts` como legacy de solo
lectura hasta validar; luego se marcan obsoletas (sin DROP en esta fase).

## 10. Backfill (con auditoría, §8/§21)

`scripts/backfill-incentives-from-sales.mjs` (dry-run primero): para cada venta
**pagada con vendedor** (4 hoy), genera el snapshot con la regla vigente y estado
`pending`, registrando en `commission_audit`. Idempotente por el `unique`. Las 12
ventas sin vendedor no generan incentivo (no hay a quién pagar). Convierte las 2
reglas de comisión a reglas de incentivo antes de generar.

## 11. Excel/PDF (§18/§19)

Se **reusa** `commission-report-excel.ts` (10 hojas) y `commission-report-pdf.ts`,
alimentados por la capa central (datos canónicos `base_amount`/`incentive_amount`/
`status`) — **no recalculan**.

## 12. Rendimiento y RLS (§23/§24)

Índices ya existentes en `sales_incentives (business_id, seller_id, status)`,
`(sale_id)`, `(payment_batch_id)`. RLS `business_id = auth_business_id()` en todas
las tablas (existente + nuevas). `business_id` siempre del JWT, nunca del body.

## 13. Criterio de aceptación (gate de deploy)

Un incentivo creado por una venta aparece con **el mismo monto, vendedor, regla y
estado** en `/ventas/incentivos` y en `/reportes/comision-ventas`, provado por
test de paridad sobre los mismos `sales_incentives`, y verificado en prod tras el
backfill. Sin páginas en blanco en PDF. DGII real apagado.

## 14. Etapas de implementación

1. Capa central `features/commission/central.ts` + **test de paridad** (Incentivos
   view == Comisión view desde los mismos snapshots). ← corazón, sin tocar prod.
2. Migración `0024` + ampliación del engine (base + reglas con método).
3. Repuntar reporte de Comisión + Excel/PDF a la capa central.
4. Navegación cruzada + acciones + KPIs sincronizados.
5. Backfill (dry-run → aplicar) + conversión de reglas.
6. Tests (§26, 20) + typecheck + build. Deploy gateado por §13.
