# Productos — Precio de venta automático (costo + ITBIS + margen)

**Versión:** 0.46.0 · **Fecha:** 2026-07-08 · No toca DGII real.

## Qué cambió

La sección **Precio y costo** de *Productos → Crear / Editar* pasa de
`Precio · ITBIS · Costo` (precio a mano) a un cálculo automático con este orden:

1. **Costo por unidad (DOP)** \* — costo de compra por unidad.
2. **ITBIS (%)** \* — `18%` o `0% Exento`.
3. **Margen (%)** \* — default **30 %**, editable (input + botón "Editar margen"
   con modal "Definir margen").
4. **Precio de venta (DOP)** — **readonly**, calculado.

## Fórmula (única fuente de verdad: `features/products/pricing.ts`)

```
costo_con_itbis = costo_unidad × (1 + itbis/100)
precio_venta    = costo_con_itbis × (1 + margen/100)   → redondeado
margen_real     = (precio − costo_con_itbis) / costo_con_itbis × 100
utilidad        = precio − costo_con_itbis
```

`itbis` y `margen` se guardan como porcentajes enteros (18 = 18 %), igual que
`product.itbisRate` en el resto de la app (`pos/cart-line.ts`).

### Ejemplos verificados (tests)

| Costo | ITBIS | Margen | Costo c/ITBIS | Precio |
|------:|------:|-------:|--------------:|-------:|
| 1000  | 18 %  | 30 %   | 1 180.00      | **1 534.00** |
| 1000  | 0 %   | 30 %   | 1 000.00      | **1 300.00** |
| 850   | 18 %  | 30 %   | 1 003.00      | **1 303.90** |

## Decisiones

- **El margen NO se persiste** en una columna aparte. El **precio** es lo que se
  guarda (`products.price`, ya existente) y el margen se **deriva** del precio al
  editar (`deriveMarginPercent`). Evita deriva entre dos campos y **no requiere
  DDL** en Supabase. Si más adelante se quiere `margin_percentage` /
  `price_calculation_mode` en la base, se añade la migración y el mapper ya está
  listo para leerlos.
- **Override manual (ADMIN)**: `canOverrideSalePrice` (roles `admin`/`super_admin`).
  Fija un precio a mano con motivo obligatorio; queda en la bitácora local
  `price-override-audit.ts` (quién, sugerido vs manual, margen real, motivo).
- **Cambio de costo al editar**: alerta no bloqueante; nunca cambia el precio en
  silencio (§10). La sincronización costo↔precio al recibir lotes es Fase 3.
- **Redondeo** configurable (2 decimales por defecto): entero, múltiplo de 5, de 10.

## Reportes

- **Excel** (`products-report-excel.ts`): Catálogo con Costo, ITBIS %, Costo con
  ITBIS, Precio venta, **Margen real** y **Utilidad estimada**. Se corrigió el
  bug de ITBIS que mostraba 1800 % (se pasaba 18 a un formato `percent` de 0-1).
- **PDF** (`products-report-pdf.ts`): Costo, ITBIS, Precio, Margen real.
- **Pantalla** (`reportes/productos`): sección "Márgenes por producto" + Exportar PDF.
- **Detalle de producto**: "Costo / Margen real".

## Archivos

- `features/products/pricing.ts` (+ `pricing.test.ts`)
- `features/products/price-override-audit.ts`
- `features/products/product-form.tsx`, `product-form-validation.ts`
- `features/products/products-report-excel.ts` / `products-report-pdf.ts`
- `app/(app)/reportes/productos/page.tsx`, `app/(app)/productos/[id]/page.tsx`
- Tests: `product-form.pricing.test.tsx`, `products-report-excel.test.ts`,
  `product-form-validation.test.ts`
