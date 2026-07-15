# Cuentas por Cobrar

Módulo para administrar las ventas a crédito de DermaLand. Integrado con
Ventas, Clientes, Reportes, Dashboard, Auditoría, Permisos e IA (NAURA).

## Principio de diseño: cero duplicación

**La cuenta por cobrar ES la venta (`proformas`) con `balance > 0`.** No existe
una tabla paralela de "facturas por cobrar": el módulo deriva todo de las
tablas reales de ventas/pagos, así el saldo nunca puede divergir de la venta.

| Dato | Fuente |
|---|---|
| Factura, cliente, sucursal, vendedor, e-CF, monto, saldo | `proformas` |
| Pagos (historial inmutable, saldo anterior/nuevo) | `proforma_payments` (+ `balance_after`, mig 0031) |
| Vencimiento | `proformas.due_date` (mig 0031, fijado por el server al emitir) |
| Crédito del cliente | `clients.credit_limit / credit_days / credit_blocked` (mig 0031) |
| Promesas de pago | `ar_promises` (mig 0031, RLS por business_id) |
| Configuración | `ar_settings` (mig 0031) |

## Integración con Ventas (automática)

Al emitir una venta que queda con saldo (`recalcInvoice` server-side, SEC-002):

1. **Status derivado del saldo**: `paid` (saldo 0) / `partially_paid` (abono) /
   `issued` (sin pago inicial). El POS ofrece **"Emitir a crédito"** en el modal
   de cobro cuando hay cliente seleccionado.
2. **`due_date`** = hoy + días de crédito del cliente (o el default del negocio,
   `ar_settings.default_credit_days`, 30 por defecto).
3. **Política de crédito** validada ANTES de emitir (repo `sales.ts`):
   - cliente con `credit_blocked` → rechazo;
   - si `ar_settings.block_over_limit` está activo y `saldo usado + nueva venta
     > credit_limit` → rechazo con el disponible en el mensaje.

No requiere ningún proceso manual.

## Cobros

RPC **`ar_apply_payments`** (mig 0031, SECURITY INVOKER → RLS): aplica un pago
a una o varias facturas EN UNA transacción; valida que ningún pago exceda el
saldo; inserta en `proforma_payments` con `balance_after` y actualiza
`paid/balance/status`. Los pagos **nunca se eliminan** (no existe endpoint de
borrado por política).

## Pantallas (`/cuentas-por-cobrar/*`)

Dashboard (KPIs + antigüedad + cobranza mensual + por sucursal/vendedor),
Facturas pendientes (filtros por sucursal/cliente/estado/vendedor/monto),
Cobros (pago total/parcial/múltiple), Clientes con mora (llamar/WhatsApp/
correo/promesa/pago), Promesas (alerta al llegar la fecha), Calendario de
vencimientos, Estados de cuenta (PDF por cliente), Historial (inmutable),
Reportes (Excel 8 hojas + PDF + CSV), Configuración (política + crédito por
cliente). "Notas de crédito" enlaza al módulo existente de Ventas.

### Colores de estado (fuente única `features/receivables/aging.ts`)

| Estado | Condición | Color |
|---|---|---|
| Al día | faltan > 7 días | verde |
| Por vencer | vence en ≤ 7 días | amarillo |
| Vencida 1-30 | 1-30 días de atraso | naranja |
| Vencida 31-60 | 31-60 días | rojo |
| Vencida +60 | más de 60 días | rojo oscuro |

## Permisos (`features/receivables/permissions.ts`, patrón por rol)

- Ver: cualquier usuario del negocio.
- Registrar cobros / promesas: admin, manager, cashier, supervisor.
- Editar crédito de clientes: admin, manager.
- Exportar / estados de cuenta: admin, manager, supervisor, auditor.
- Configuración del módulo: solo admin.
- Eliminar pagos: **nadie** (historial inmutable).

## Auditoría

`audit_logs` con IP: `ar.collect`, `ar.promise_create`, `ar.promise_update`,
`ar.settings_update`, `ar.credit_update`.

## IA (NAURA)

Tool `get_receivables` (solo lectura): `summary`, `top_debtors`, `due_today`,
`overdue_60`, `collected_week`, `by_seller`. Responde preguntas como "¿cuánto
tengo pendiente por cobrar?", "¿qué clientes deben más?", "¿qué facturas vencen
hoy?", "¿cuánto cobré esta semana?", "¿cuál es el índice de recuperación?".

## Notificaciones (preparado)

`ar_settings.reminder_offsets_days` guarda los offsets (-7, -3, -1, 0, +1, +7,
+15, +30). Las alertas hoy viven en el dashboard (promesas vencidas, próximos
vencimientos) y Clientes con mora trae acciones de WhatsApp (`wa.me`), llamada
y correo. El envío automático se activará cuando el negocio conecte la
WhatsApp API / correo saliente.

## Verificación

- `features/receivables/aging.test.ts` — buckets y acumulados.
- `scripts/test/receivables-e2e-test.mjs` — e2e vivo: venta a crédito → aparece
  en pendientes → cobro parcial → cobro final → saldo 0 + historial con
  saldo anterior/nuevo. Autolimpiante.
