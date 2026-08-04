# Cobro con tarjeta en la tienda — estado y puesta en marcha

> Módulo F3.5 de la tienda en línea. Complementa
> [`tienda-en-linea.md`](./tienda-en-linea.md).

**Estado a 2026-08-04: el cobro con tarjeta está APAGADO y no puede encenderse
todavía.** No es un fallo ni un olvido: DermaLand no tiene afiliación de comercio
electrónico con ningún banco, y eso es papeleo con plazos que no dependen del
código. Lo que sí está hecho es **el hueco con la forma exacta** que tendrá que
rellenar la integración.

Mientras tanto, **todos los pedidos se pagan al retirar en sucursal**, y así se
lo dice la tienda al cliente. Ver §4.

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
