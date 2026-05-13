# DermaLand · Setup WhatsApp Cloud API

Activación de envío/recepción de mensajes via Meta WhatsApp Cloud API.

## Pre-requisitos

1. Cuenta **Meta Business Manager** verificada.
2. Cuenta **WhatsApp Business** vinculada (WABA).
3. **Número telefónico verificado** — DermaLand: `+1 809-226-5252`.
4. **App Meta** creada con producto "WhatsApp" añadido.

## Pasos de configuración

### 1. Obtener credenciales

Meta for Developers → Tu app → WhatsApp → API setup:

| Variable | Dónde se obtiene |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | "Temporary access token" (24h) o **System User Token** permanente |
| `WHATSAPP_PHONE_NUMBER_ID` | Card del número verificado |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA ID |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Lo elegimos nosotros — string aleatorio |

> Para producción usar **System User Token** (no expira). Crear en
> Meta Business → Configuración → Usuarios del sistema → Generar token con
> permisos `whatsapp_business_messaging` + `whatsapp_business_management`.

### 2. Configurar webhook

En Meta → WhatsApp → Configuration → Webhook:

```
Callback URL:  https://app.dermaland.do/api/whatsapp/webhook
Verify Token:  <WHATSAPP_WEBHOOK_VERIFY_TOKEN>
```

Suscribirse a campos: `messages`, `message_status`, `message_template_status_update`.

Meta hace GET con `hub.challenge` — nuestra Route Handler en
`src/app/api/whatsapp/webhook/route.ts` ya lo maneja (`whatsappService.verifyWebhook()`).

### 3. Aprobar plantillas

Plantillas críticas (en `src/lib/mock-data/integrations.ts`):

- `envio_proforma` — transactional
- `envio_factura_ecf` — transactional
- `aviso_recall_lote` — service
- `seguimiento_recomendacion` — service
- `felicitacion_cumpleanos` — marketing (requiere opt-in del cliente)

Submitir cada una en Meta Business → WhatsApp Manager → Plantillas.
Aprobación toma 1–24h. Categoría incorrecta = rechazo.

### 4. Validación de firma SHA-256

Antes de procesar el body en `POST /api/whatsapp/webhook`, verificar el
header `X-Hub-Signature-256` con el **App Secret**:

```ts
const expected = "sha256=" + crypto
  .createHmac("sha256", APP_SECRET)
  .update(rawBody)
  .digest("hex");
if (expected !== request.headers.get("x-hub-signature-256")) {
  return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
}
```

**Pendiente** en `src/server/services/whatsapp/service.ts` — implementar antes
de prod. Riesgo R-WA-01.

### 5. Counters de uso

Cada mensaje saliente incrementa `business_usage_counters` con
`metric = 'whatsappMessages'`. Plan Business permite 10,000/mes.

Alertas:
- 80% → email al admin del business.
- 95% → notificación destacada en UI.
- 100% → bloqueo del módulo (NO bloquea POS — solo WhatsApp).

## Plantillas — body recomendado

### `envio_proforma`
```
Hola {{1}}, te enviamos tu proforma {{2}} por RD${{3}}.
Cualquier consulta respondemos por aquí.
```
Variables: `customer_name`, `proforma_number`, `total`.

### `aviso_recall_lote`
```
Aviso: el lote {{1}} del producto {{2}} fue retirado por el fabricante.
Si lo adquiriste, comunícate con nosotros para reposición.
```
Variables: `lot_number`, `product_name`.

## Test antes de prod

- [ ] GET webhook con verify token correcto → 200 + challenge.
- [ ] GET webhook con verify token incorrecto → 403.
- [ ] POST webhook con firma inválida → 401.
- [ ] Enviar plantilla `envio_proforma` a número real → confirma `read`.
- [ ] Cliente responde → conversación se crea con `assigned_to = null`.
- [ ] Operador toma la conversación → `assigned_to = <user_id>`.
- [ ] Counter de uso incrementa correctamente.

## Costo y límites

WhatsApp Cloud API: 1,000 conversaciones gratis/mes. Después, costo por
categoría (utility, marketing, service). Documentado en
`riesgos.md → R-WA-02`.
