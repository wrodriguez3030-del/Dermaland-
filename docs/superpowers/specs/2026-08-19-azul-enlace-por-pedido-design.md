# Enlace de pago de Azul POR PEDIDO — Diseño

**Fecha:** 2026-08-19 · **Aprobado por el dueño** (conversación de esta fecha)

## El problema

v0.131.0 asumió que el enlace del comercio en `pagos.azul.com.do` era una
página de monto abierto donde el cliente teclea el total. La realidad del
producto de Azul es otra: el **Link de Pagos se genera por transacción desde la
App AZUL, con el monto fijado al crearlo**. El enlace configurado
(`pagos.azul.com.do/dcb1c70b`) nació con RD$500 fijo y hoy además responde una
página de error de Azul — esos enlaces caducan o se cancelan. Consecuencia
observada: un pedido de cualquier monto mandaba al cliente a pagar RD$500.

No existe parámetro público en la URL para inyectar el monto. La afiliación de
comercio electrónico (pasarela con API, `AZUL_*`) sigue apagada a propósito.

## La decisión

**Cada pedido de tarjeta lleva SU enlace**, generado por el dueño en la App
AZUL con el monto exacto del pedido y pegado en el detalle del pedido en el
ERP. El enlace fijo de la configuración **deja de enseñarse al cliente**: queda
solo como interruptor de "la tienda acepta tarjeta" en el checkout
(fail-closed intacto — sin él, la opción de tarjeta no aparece).

## Diseño

### 1. Base de datos

- Migración `20260819180000_web_orders_azul_link.sql`: columna
  `azul_payment_link_url text` (nullable) en `web_orders`. Aditiva, sin
  backfill; los pedidos viejos quedan sin enlace.

### 2. Servidor

- `WebOrder` (y por herencia `WebOrderForBusiness`) gana
  `azulPaymentLinkUrl?: string`; `findWebOrderByToken` y
  `getWebOrderForBusiness` lo seleccionan y mapean.
- Regla pura `canSetAzulLink({paymentMethod, paymentStatus, status})` en
  `features/storefront/azul-link.ts` (probada): solo pedidos de **tarjeta**,
  **no pagados**, **no cancelados**.
- Servicio `setWebOrderAzulLink(businessId, id, urlEscrita)`: normaliza con
  `normalizeAzulPaymentLink` (mismo validador del dominio), aplica la regla
  contra el pedido real y guarda. Vacío = borrar el enlace (legítimo: venció).
- Ruta `POST /api/pedidos-web/[id]/azul-link` (fuera de `/api/storefront`,
  igual que `/estado`): exige sesión + rol `WEB_ORDER_MANAGE_ROLES`, valida
  con zod, llama al servicio, **avisa al cliente por correo** ("Tu enlace de
  pago está listo", riel Gmail de `order-notify`; un fallo del correo nunca
  deshace el guardado) y deja auditoría con etiquetas legibles
  (`web_order.azul_link_set`).

### 3. Admin — Ventas → Pedidos web → detalle

En la tarjeta "Pago con tarjeta (Azul)", bloque nuevo
(`order-azul-link-form.tsx`):

- Enseña el **monto exacto copiable** y el número de pedido, para generar el
  link en la App AZUL sin equivocarse.
- Campo para pegar el enlace + Guardar; enseña el enlace vigente y permite
  **reemplazarlo** (los links de Azul caducan) o borrarlo.
- Solo se pinta cuando la regla lo permite (tarjeta, sin pagar, sin cancelar).

### 4. Cliente — página del pedido

- **Con enlace del pedido:** botón "Pagar con Azul". El texto cambia: ya no
  "teclea el monto" — el enlace lo trae. Se enseña el total para **verificar**
  ("verifica que Azul diga RD$X; si no coincide, no pagues y escríbenos") y el
  número de pedido. `AzulPayBox` pierde `amountRaw` (ya no hay nada que
  teclear).
- **Sin enlace todavía:** aviso honesto — "Estamos preparando tu enlace de
  pago; te avisamos cuando esté listo" — sin botón muerto. El subidor de
  comprobante se muestra igual (pudo pagar coordinado por otra vía).
- El enlace del negocio (`business_web_settings.azul_payment_link_url`) ya no
  se usa en esta página.

### 5. Checkout y configuración

- Checkout (tarjeta elegida): el texto pasa a decir que el enlace de pago con
  el monto exacto le llega en la página de su pedido / por correo.
- Formulario de configuración de la tienda: la ayuda del campo explica que ese
  enlace solo **activa** la opción de tarjeta; el enlace que paga cada cliente
  se genera por pedido en la App AZUL y se pega en el pedido.

### 6. Manejo de errores

- Ruta nueva: 401/403 sin rol, 400 cuerpo inválido, 422 dominio malo o regla
  incumplida (mensajes en cristiano, sin filtrar detalles internos).
- Correo: `sent:false` se registra en auditoría (`aviso_al_cliente`), nunca
  bloquea.

### 7. Pruebas

- Unitarias: `canSetAzulLink` (todas las combinaciones) y lo que ya cubre
  `normalizeAzulPaymentLink`.
- Suite completa + typecheck + build antes de commitear (regla del proyecto).

## Fuera de alcance

- Encender la pasarela con API (`AZUL_*`).
- Notificar por WhatsApp.
- Cambiar el gate del checkout a un booleano propio (YAGNI: el enlace de
  configuración ya sirve de interruptor).
