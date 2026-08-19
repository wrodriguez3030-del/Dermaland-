# Pago con tarjeta por enlace Azul + campos pendientes claros en el checkout

> Diseño aprobado el 2026-08-19. Dos mejoras independientes de la tienda en
> línea. Complementa `docs/pagos-en-linea.md` y `docs/tienda-en-linea.md`.

## Contexto

DermaLand tiene un **enlace de pago de Azul** (`https://pagos.azul.com.do/…`):
la página de pagos del comercio donde **el cliente teclea el monto** y paga con
tarjeta. No es la afiliación de comercio electrónico con API: no hay webhook, no
hay verificación programática, no hay adaptador que escribir. La confirmación
del pago es humana — exactamente como la transferencia bancaria, cuyo riel ya
existe completo: el cliente sube comprobante autorizado por el token firmado de
su pedido (`transfer-payments.ts`, bucket privado `payment-receipts`), el admin
lo revisa en *Ventas → Pedidos web*, y aceptar el comprobante marca
`payment_status = 'pagado'`.

La regla del módulo de pagos se mantiene: **nada le dice al cliente que se le
cobró mientras no haya un cobro real detrás.** Aquí el cobro ES real (lo procesa
Azul); lo manual es la verificación, y la pantalla lo dice así.

## Mejora 1 — Pago con tarjeta por el enlace de Azul

### El enlace vive en la administración, no en el código

- Nueva columna `business_web_settings.azul_payment_link_url` (`text`,
  nullable). Migración aditiva.
- Editable en la pantalla de configuración de la tienda, junto a los demás
  datos del comercio.
- **Fail-closed:** sin enlace configurado (o vacío), la opción de tarjeta **no
  aparece** en el checkout — misma regla que "sin cuentas bancarias no se
  ofrece transferencia". Se valida que sea una URL `https://` de
  `pagos.azul.com.do` antes de guardarla: cualquier otra cosa se rechaza, para
  que un error de tipeo no mande a los clientes a pagar a otro sitio.

### Checkout

- Tercera opción de pago: **"Tarjeta (enlace seguro de Azul)"**, visible solo
  si el enlace está configurado.
- El pedido se guarda con `payment_method = 'tarjeta'`. La columna es `text` y
  la lectura ya mapea `'tarjeta'`; solo se amplía el tipo de entrada de
  `createWebOrder` (hoy `"efectivo" | "transferencia"`).

### La página del pedido es donde se paga

En `/tienda/pedido/[token]`, cuando `paymentMethod === 'tarjeta'` y el pedido
no está cancelado ni pagado:

- Muestra el **total exacto a pagar** en grande, con botón de copiar.
- Botón **"Pagar con Azul"** que abre el enlace configurado (pestaña nueva).
- Instrucciones: teclear ese monto exacto en la página de Azul y poner el
  número de pedido (`WEB-…`) como referencia/concepto.
- El mismo subidor de comprobante de la transferencia (`ReceiptUpload`): el
  cliente sube el comprobante que le da Azul al terminar.
- Estado visible: "pago pendiente de confirmación" hasta que el admin lo
  acepte; una vez `pagado`, el mismo mensaje de confirmación que la
  transferencia.

El pago ocurre aquí y no en el checkout porque el número de pedido y el total
definitivo solo existen después de confirmar.

### Revisión del admin

- El flujo de revisión de comprobantes (`web_order_receipts` + aceptar/rechazar
  en *Ventas → Pedidos web*) sirve tal cual: es agnóstico al método. Se
  verifica que el detalle del pedido muestre la sección de comprobantes también
  para `'tarjeta'` (hoy la página del cliente solo la consulta para
  `'transferencia'`; se amplía la condición en ambos lados).
- El admin ve el total del pedido junto al comprobante al revisar, y confirma
  contra el portal de Azul que el dinero entró antes de aceptar.

### Riesgo aceptado

El cliente puede teclear un monto equivocado en la página de Azul (el enlace no
permite fijarlo ni pasarlo por parámetro). Mitigación: total prominente y
copiable, número de pedido como referencia, y revisión humana que compara
comprobante contra pedido. Se descartó el adaptador `PaymentProvider` de Azul:
sigue sin haber paquete de integración del banco y este flujo no lo necesita.

## Mejora 2 — Campos pendientes marcados en el checkout

**Hoy:** `required` nativo (el navegador solo señala el primer campo) y el
botón *Confirmar pedido* se deshabilita en silencio cuando falta la entrega:
el cliente no sabe qué le falta.

**Diseño:**

- El botón queda **siempre habilitado** (salvo mientras se envía). Al pulsarlo
  con datos pendientes:
  - Cada campo faltante se marca (borde de error) con su mensaje debajo:
    "Falta tu nombre", "Falta tu teléfono", "Elige la sucursal de retiro",
    "Elige cómo pagarás"…
  - Aparece un **resumen** encima del botón con la lista de lo pendiente.
  - La pantalla se desplaza al primer campo marcado y se le da el foco.
- Accesibilidad: `aria-invalid` en los campos marcados, mensajes ligados con
  `aria-describedby`, resumen con `role="alert"`.
- La regla de qué falta vive en una **función pura con su prueba**
  (`features/storefront/checkout-missing-fields.ts`), no repartida por el
  componente — la lección de `checkout-fulfillment.ts` (el estado inicial sin
  cambiar mantuvo vivo un fallo ya "corregido").
- Los mensajes se limpian por campo en cuanto el cliente lo completa.

## Qué NO cambia

- No se escribe integración con la API de Azul ni se tocan las variables
  `AZUL_*` / `PAYMENTS_PROVIDER` (`registry.ts` sigue fail-closed).
- No se marca ningún pedido como pagado automáticamente.
- El pedido web sigue sin generar proforma ni mover inventario.
- Los datos de tarjeta siguen sin tocar nuestro servidor: el cliente los
  teclea en la página de Azul.

## Pruebas

- Unit: validación del enlace de Azul (acepta `https://pagos.azul.com.do/…`,
  rechaza el resto); `checkout-missing-fields` (cada campo, combinaciones,
  todo completo → vacío); ampliación del tipo de pago en `createWebOrder`.
- Manual: checkout con tarjeta configurada y sin configurar; página del pedido
  con tarjeta (copiar total, abrir enlace, subir comprobante); revisión y
  aceptación en *Ventas → Pedidos web*; checkout con campos vacíos en móvil
  (390) y escritorio.
