# Cobro con tarjeta en la tienda — estado y puesta en marcha

> Módulo F3.5 de la tienda en línea. Complementa
> [`tienda-en-linea.md`](./tienda-en-linea.md).

**Estado a 2026-08-19: hay DOS caminos distintos y conviene no confundirlos.**

1. **El enlace de pago de Azul (ACTIVO, §0):** el comercio tiene un enlace en
   `pagos.azul.com.do` donde el cliente teclea el monto y paga con tarjeta. El
   cobro es real (lo procesa Azul); la **confirmación es humana**, por
   comprobante, igual que la transferencia.
2. **La pasarela con API (APAGADA):** la afiliación de comercio electrónico con
   integración programática sigue sin existir, y todo lo que dice el resto de
   este documento sobre ella sigue vigente: el hueco está hecho, el adaptador no
   se escribe hasta que llegue el paquete del banco.

---

## 0. Cobro por enlace de pago Azul (ACTIVO — enlace POR PEDIDO desde v0.132.0)

- **La realidad del producto de Azul (aprendida en v0.132.0):** el Link de
  Pagos se genera **por transacción** desde la App AZUL, con el **monto fijado
  al crearlo** — no hay parámetro de URL para inyectar el monto, y los enlaces
  caducan o se cancelan. Un enlace fijo del comercio mandaba a todos los
  clientes a pagar el monto con el que se creó (pasó con uno de RD$500).
- **Interruptor:** el enlace de la configuración
  (`business_web_settings.azul_payment_link_url`) **ya no se le enseña al
  cliente**: solo activa la opción de tarjeta en el checkout. **Fail-closed:**
  sin enlace, la opción no aparece — la misma regla que "sin cuentas bancarias
  no se ofrece transferencia".
- **El enlace que paga cada pedido** vive en `web_orders.azul_payment_link_url`
  (migración `20260819180000`, aplicada a prod): el admin genera el link en la
  App AZUL con el **monto exacto** (copiable en el detalle del pedido) y lo
  pega en *Ventas → Pedidos web → detalle* (`OrderAzulLinkForm`, ruta
  `POST /api/pedidos-web/[id]/azul-link` con sesión + rol). La regla de quién
  lo admite es `canSetAzulLink` (tarjeta, sin pagar, sin cancelar — probada), y
  el dominio se valida en cliente Y servidor (`normalizeAzulPaymentLink`, solo
  `https://pagos.azul.com.do/...`). Si el pedido tiene correo, al pegar el
  enlace se le avisa ("Tu enlace de pago está listo", riel Gmail; un fallo del
  correo nunca deshace el guardado).
- **Cómo paga el cliente:** en `/tienda/pedido/[token]` ve el total, su número
  de pedido (copiable) y el botón que abre **el enlace de su pedido**
  (`AzulPayBox`); la instrucción es **verificar** que Azul diga exactamente su
  total — ya no teclea nada. Sin enlace todavía, la página lo dice honesto
  ("estamos preparando tu enlace de pago") sin botón muerto. Al terminar sube
  el comprobante — el mismo riel de la transferencia (`web_order_receipts`,
  bucket privado).
- **Cómo se confirma:** en *Ventas → Pedidos web*, el admin compara el
  comprobante con el pedido, verifica en el portal de Azul que el dinero entró,
  y al ACEPTAR el comprobante el pedido queda `payment_status = 'pagado'`.
  **Nada se marca pagado solo.**
- **En el POS:** un pedido web de tarjeta preselecciona "Tarjeta" en el cobro
  (el cajero puede cambiarlo, como siempre).

---

## 1. La regla que gobierna este módulo

> **Nada puede decirle a un cliente que se le está cobrando mientras no haya una
> pasarela de verdad detrás.**

Un checkout que parece cobrar y no cobra es peor que no tener checkout: el
cliente cree que pagó, no vuelve a aparecer, y la venta se pierde con él
enfadado. Por eso:

- El proveedor **simulado tiene prohibido activarse en producción**. Si alguien
  pusiera `PAYMENTS_PROVIDER=simulated` en Vercel por error, el resultado es *no
  se cobra*, no *se finge que sí*. Hay una prueba que lo fija
  (`payments/registry.test.ts`).
- Una pasarela **a medio configurar tampoco se activa**. Es el peor estado
  posible: la interfaz ofrecería pagar y el banco rechazaría todo.
- El texto del checkout **lo decide el servidor**, no una constante en el
  cliente: mientras no haya pasarela, ahí no aparece nada que parezca un cobro.
- Y **el adaptador de Azul no está escrito**. Aunque estén todas las
  credenciales, el registro sigue devolviendo "no hay cobro" en vez de encender
  un botón que no puede cobrar (§3).

---

## 2. Cómo está montado

| Pieza | Qué hace |
|---|---|
| `features/storefront/payments/types.ts` | El contrato `PaymentProvider`: crear intento y verificarlo. Nada más. |
| `features/storefront/payments/registry.ts` | Decide **quién cobra**, o nadie. Función pura, fail-closed. |
| `features/storefront/payments/simulated.ts` | Proveedor de pruebas. Su etiqueta dice "no cobra de verdad". |
| `server/services/storefront/payments.ts` | Lee el entorno y expone `paymentsEnabled()` y `paymentReadiness()`. |
| `web_orders.payment_status` / `payment_provider` / `payment_reference` / `paid_at` | Dónde se anotará el cobro. Columnas creadas y vacías (migración 0039). |

**Los datos de la tarjeta nunca tocan nuestro servidor.** El contrato es
redirigir al cliente a la página del banco y verificar después. Es lo que
mantiene a DermaLand fuera del alcance de PCI-DSS, y no es negociable al escribir
el adaptador.

### Por qué las columnas están creadas y vacías

Migrar una tabla que ya tiene pedidos dentro, con el negocio funcionando, es
justo lo que conviene no tener que hacer. Se crean ahora, cuestan nada, y el día
del alta activar la pasarela es escribir el adaptador y ya.

---

## 3. Qué hace falta el día que llegue la afiliación

### Paso 1 — Conseguir la afiliación (esto es del negocio, no del código)

Hay que solicitar al banco la **afiliación de comercio electrónico**, que es
distinta de la del datáfono del mostrador. DermaLand ya registra pagos con
etiqueta "Azul" y "CardNET" en el POS, así que el punto de partida natural es
preguntar por el comercio electrónico al mismo banco que dio el datáfono.

Del banco llega un **paquete de integración**: credenciales, certificado de
cliente y las URL de pruebas y de producción.

### Paso 2 — Poner las variables

El código ya las espera con estos nombres. Los **valores** salen del paquete del
banco; si el banco los llama de otra forma, se mapean aquí y no en todo el
código:

| Variable | Qué es |
|---|---|
| `PAYMENTS_PROVIDER` | `azul`. Sin esto no se enciende nada, aunque el resto esté. |
| `AZUL_MERCHANT_ID` | Identificador del comercio. |
| `AZUL_AUTH1` / `AZUL_AUTH2` | Credenciales de autenticación del servicio. |
| `AZUL_AUTH_KEY` | Llave con la que se firma el hash de cada operación. |
| `AZUL_CERT_PATH` / `AZUL_KEY_PATH` | Certificado de cliente y su llave privada. |
| `AZUL_BASE_URL` | URL del entorno. **Empezar por el de PRUEBAS.** |

Ninguna lleva `NEXT_PUBLIC_`: son secretos y no pueden llegar al navegador.

Para ver qué falta sin abrir código: *Ventas → Pedidos web* lo dice arriba de la
pantalla, con los nombres exactos de las variables que faltan.

### Paso 3 — Escribir el adaptador

Crear `features/storefront/payments/azul.ts` cumpliendo `PaymentProvider`, y
devolverlo desde `registry.ts` donde hoy hay un `return null` comentado.

**No se escribe antes** de tener el paquete de integración: una integración
bancaria escrita contra la documentación pública y sin poder probarla contra el
entorno de pruebas del banco no es trabajo adelantado, es una suposición con
apariencia de código.

### Paso 4 — Probar en el entorno de PRUEBAS del banco

Con las tarjetas de prueba que da el propio banco, y comprobando los cuatro
caminos: pago aprobado, pago rechazado, cliente que abandona a mitad, y el
cliente que vuelve dos veces con la misma referencia.

### Paso 5 — Producción

Cambiar `AZUL_BASE_URL` al entorno real y hacer **una compra de verdad, pequeña,
con una tarjeta propia**, comprobando que el dinero aparece en la cuenta del
negocio y el pedido queda en `payment_status = 'pagado'`.

---

## 4. Qué ve el cliente hoy

Al confirmar el pedido, el checkout dice:

> *Te confirmamos disponibilidad por teléfono y pagas al retirar en sucursal.*

Y la pantalla del pedido:

> *Te llamamos al … para confirmarte disponibilidad. Pagas al retirar.*

Ninguna de las dos promete un cobro que no existe. Cuando la pasarela esté
activa, el texto cambia solo — lo decide `paymentsEnabled()` en el servidor.

Con el **enlace de Azul configurado** y el cliente eligiendo tarjeta, el texto
dice en cambio que después de enviar el pedido paga por el enlace seguro de
Azul (§0) — que también es verdad, porque ese cobro sí existe.

---

## 5. Lo que este módulo NO hace

- **No guarda tarjetas.** Ni el número, ni el CVV, ni un token de tarjeta.
- **No cobra en cuotas** ni gestiona suscripciones.
- **No devuelve dinero.** `payment_status = 'reembolsado'` existe en el modelo,
  pero el reembolso se gestiona hoy por el canal del banco, no desde el ERP.
- **No emite comprobante fiscal.** El pedido no genera proforma ni e-CF: la venta
  se factura en el POS. Ver `tienda-en-linea.md` §1.

---

## 6. Riesgos

| ID | Riesgo | Mitigación |
|---|---|---|
| R-PAY-01 | Un checkout simulado llega a un cliente real | El simulado **no puede** activarse en producción; hay prueba que lo fija |
| R-PAY-02 | Pasarela a medio configurar ofreciendo pagos que el banco rechaza | El registro exige **todas** las credenciales; a falta de una, no se activa |
| R-PAY-03 | El cliente paga dos veces | El pedido ya tiene `idempotency_key`; el adaptador debe reutilizar `payment_reference` en vez de crear un intento nuevo |
| R-PAY-04 | Se cobra un importe distinto al del pedido | El importe sale de `web_orders.total`, que calculó el servidor; nunca del navegador |
| R-PAY-05 | Credenciales del banco en el repositorio | Son variables de entorno sin `NEXT_PUBLIC_`; el certificado va por ruta, no por contenido |
