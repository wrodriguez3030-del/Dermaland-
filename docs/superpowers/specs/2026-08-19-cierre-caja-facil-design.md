# Cierre de caja fácil — Diseño

**Fecha:** 2026-08-19 · **Aprobado por el dueño** (opción "Asistente + ticket 80mm")

## El problema

Cerrar caja hoy es un modal con UN campo: "Efectivo contado", tecleado a mano.
El cajero suma billetes con calculadora, no ve cuánto espera el sistema, y la
diferencia solo aparece después de cerrar. Todo el dato ya existe
(`computeShiftDetail`: esperado, ventas por método, movimientos) — el modal no
lo usa.

## La decisión

Un **asistente de cierre** en el mismo botón "Cerrar caja", con el conteo por
denominaciones, la diferencia en vivo y el resumen del turno; y un **ticket
80mm** del cierre para imprimir y archivar con el arqueo.

## Diseño

### 1. Lógica pura (`features/sales/cash-count.ts`, probada)

- `RD_DENOMINATIONS`: billetes 2000/1000/500/200/100/50 y monedas 25/10/5/1.
- `cashCountTotal(counts)`: total del conteo (cantidad × denominación, round2).
- `differenceLabel(diff)`: `{tone: "ok"|"sobra"|"falta", label}` — "Cuadra",
  "Sobra RD$X", "Falta RD$X".

### 2. Asistente (nuevo `CerrarCajaButton`, en `caja/cerrar-caja.tsx`)

- Recibe el `ShiftDetail` ya calculado por la página (no re-calcula).
- Resumen del efectivo esperado: apertura + ventas en efectivo + entradas −
  salidas − devoluciones = **esperado** (y aparte, informativo: tarjeta y
  transferencia del turno).
- **Conteo por denominaciones** (por defecto): una fila por denominación con
  cantidad y subtotal; el total se suma solo. Alternativa "teclear el total"
  para quien ya contó.
- **Diferencia en vivo** con color (verde cuadra / rojo falta / ámbar sobra).
  Con diferencia ≠ 0, el botón lo dice ("Cerrar con faltante de RD$X") — nada
  se esconde. Se mantiene el aviso de supervisor (> RD$50).
- Al cerrar NO se recarga a ciegas: el modal enseña el resultado y ofrece
  **"Imprimir ticket del cierre"**; "Listo" refresca.
- La API no cambia: `PATCH /api/cash/[id]` con `countedCash` (el desglose del
  conteo no se persiste — YAGNI hasta que alguien lo pida).

### 3. Ticket 80mm del cierre

- `features/sales/components/cash-closing-ticket.tsx` con la clase
  `.receipt-80mm` (el CSS global de impresión ya oculta todo lo demás).
  Contenido: negocio, sesión, cajero, sucursal, fechas de apertura/cierre,
  desglose (apertura, ventas por método, entradas/salidas/devoluciones),
  esperado, contado, diferencia, y línea de firma.
- Página `/caja/historial/[id]/print`: carga la sesión (historial o actual),
  sus proformas y movimientos, calcula el detalle y pinta el ticket con botón
  Imprimir. En el historial, cada sesión cerrada gana el enlace "Ticket".

### 4. Fuera de alcance

- Persistir el desglose por denominaciones (pediría migración).
- Cambiar la regla de autorización del supervisor.

### 5. Pruebas

Unitarias de `cash-count.ts`; suite completa + typecheck + build.
