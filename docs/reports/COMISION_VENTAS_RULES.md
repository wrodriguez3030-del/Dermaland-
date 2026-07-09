# Reglas de Comisión de Ventas — análisis del Excel de referencia

**Fuente:** `COMISION VENTAS MAYO 2026 - CUTIS.xlsx` (sucursal DermaLand Cutis, mayo 2026).
**Analizado programáticamente** (222 filas de datos + fila de totales). No toca DGII real.

## 1. Estructura del Excel

Una sola hoja `CUTIS`, 226 filas. Columnas:

| Col | Encabezado | Contenido |
|---|---|---|
| A | Número de comprobante | NCF B02 (factura de consumo) |
| B | Método de pago | `EFECTIVO` · `CREDITO` · `TRANSFERENCIA` |
| C | Creación | Fecha (DD/MM/YYYY) |
| D | Subtotal | Base antes de descuento e ITBIS |
| E | Descuento | Descuento aplicado |
| F | Antes de impuestos | **= Subtotal − Descuento** (verificado: 0 discrepancias) |
| G | Comisión 3% | `= F × 3%` cuando aplica |
| H | Comisión 1% | `= F × 1%` cuando aplica |
| I | Impuestos | ITBIS |
| J | Después de impuestos | = Antes + Impuestos |

Filas de totales (224–225): Total comisión 3%, Total comisión 1%, Comisión total.

## 2. Base comisionable (regla confirmada)

```
base_comisionable = subtotal − descuento     (columna "Antes de impuestos")
comisión          = base_comisionable × tasa
```

- **El ITBIS NUNCA entra en la base.** Verificado: `comisión 3% = antes×3%` y
  `comisión 1% = antes×1%` en el 100% de las filas con comisión (0 desviaciones).
- **El descuento SÍ reduce la base.** Ej. R211: subtotal 870 − descuento 87 =
  base 783 → 3% = 23.49. Verificado: `antes = subtotal − descuento` en todas.

## 3. ¿Cuándo aplica 3% y cuándo 1%? (regla por método)

Conteo por método sobre las 222 filas de datos:

| Método (Excel) | Filas | Con 3% | Con 1% | Sin comisión |
|---|---:|---:|---:|---:|
| EFECTIVO | 49 | 48 | 1* | 1 (exclusión) |
| TRANSFERENCIA | 13 | 13 | 0 | 0 |
| CREDITO | 160 | 0 | 148 | 12 (exclusiones) |

- **EFECTIVO → 3%** · **TRANSFERENCIA → 3%** · **CREDITO → 1%**.
- CREDITO **nunca** recibe 3%; EFECTIVO/TRANSFERENCIA **nunca** reciben 1%
  (salvo el artefacto de una fila, ver §6).

**Totales del Excel (coinciden con la fila de totales original):**
`Σ 3% = RD$5,722.29` · `Σ 1% = RD$5,548.81` · `Comisión total = RD$11,271.10`.
Base total de las filas de datos = RD$788,716.09.

## 4. Mapeo al catálogo REAL de DermaLand

DermaLand **no** tiene un método literal `credito`. Su catálogo (`PaymentMethod`)
es: `cash, card, transfer, azul, cardnet, visanet, paypal, manual, other`, y el
helper canónico `paymentMethodGroup` (en `features/sales/sales-report.ts`) los
agrupa en `cash | card | transfer | other`.

Las ventas "CREDITO" del Excel son todas **facturas B02** (e-CF 32 de consumo), que
en DermaLand se emiten para pagos con **tarjeta** (`card/azul/cardnet/visanet`, ver
`document-resolver`). Por tanto:

| Grupo canónico DermaLand | Métodos concretos | Equivale a (Excel) | Tasa |
|---|---|---|---:|
| `cash` | cash | EFECTIVO | **3%** |
| `transfer` | transfer | TRANSFERENCIA | **3%** |
| `card` | card, azul, cardnet, visanet | CREDITO (tarjeta) | **1%** |
| `other` | paypal, manual, other | — (no existe en el Excel) | **sin regla** → no comisiona por defecto |

> Decisión: `other`, pago mixto y ventas sin pago quedan **sin regla** (no
> comisionan) hasta que se configure una regla explícita — coherente con la
> instrucción de "no asumir que toda venta comisiona".

## 5. Exclusiones (ventas sin comisión)

**13 de 222** filas no tienen comisión pese a ser de un método comisionable. **No
son derivables por fórmula** — son decisiones manuales del negocio:

- 1 EFECTIVO (R71) y 12 CREDITO.
- 8 de las 12 CREDITO excluidas tienen descuento ≠ 0; 4 (R27, R90, R91, R105) tienen
  descuento 0 y son ventas normales con ITBIS → exclusión **puramente manual**.

**Conclusión de diseño:** el motor calcula la comisión automática por regla, pero
DEBE soportar **exclusión manual** por comprobante (con motivo). No se inventa
ninguna exclusión automática a partir del Excel; solo se excluyen automáticamente
las ventas **anuladas** (estado del sistema) y las que **no matchean ninguna regla**.

Estados de una venta en el reporte:
`comisionable` · `excluida` (manual) · `anulada` (estado del sistema) · `sin_regla`.

## 6. Anomalía detectada (no se replica)

- **R6** (`B0200012923`, EFECTIVO) tiene **ambas** columnas 3% (45.00) **y** 1%
  (15.00) — el operador dejó las dos fórmulas por error. El Σ1% del Excel incluye
  esos 15.00. El motor aplica **una sola** regla por venta (EFECTIVO → 3%), así que
  su Σ1% difiere del Excel en exactamente 15.00 (0.13%). Es un artefacto de captura,
  no una regla.
- Filas `=undefined=>valor`: fórmulas compartidas que ExcelJS no expande pero cuyo
  **resultado cacheado sí** se leyó; no afectan el análisis.

## 7. Reglas implementadas (config, NO hardcode en la página)

En `features/reports/commission/commission-rules.ts` (`DEFAULT_COMMISSION_RULES`):

1. **"Efectivo y transferencia 3%"** → grupos `cash`, `transfer` → 3% · prioridad 10.
2. **"Tarjeta / crédito 1%"** → grupo `card` → 1% · prioridad 10.

Resolución: se elige la regla **activa** de mayor prioridad que matchea (grupo de
método +, opcionalmente, sucursal/vendedor/fecha). Si ninguna matchea → `sin_regla`.
Las tasas y condiciones son datos configurables, no literales en el componente.

## 8. Vendedor vs cajero

El reporte agrupa por **vendedor** (`sellerId`/`sellerName`), independiente del
**cajero** (`cashierId`/`cashierName`). Ventas sin vendedor → "No asignado" (con
filtro dedicado). Ver §8 del requerimiento.

## 9. Alcance entregado vs Fase 2

- **Entregado:** cálculo desde ventas reales, filtros, KPIs, tabla, desgloses por
  vendedor/método/sucursal, Excel (9 hojas) y PDF profesional, exclusión manual
  (config), consistencia Pantalla = Excel = PDF, RLS, permisos, tests.
- **Fase 2 (requiere migraciones Supabase):** persistir aprobación/pago de comisión,
  lotes de pago (`commission_payment_batches`), reglas y exclusiones editables desde
  UI (`sales_commission_rules`), auditoría persistida y ajustes por devolución. El
  motor ya está diseñado para recibir reglas/exclusiones/estados desde esas tablas
  sin reescribir la lógica.
