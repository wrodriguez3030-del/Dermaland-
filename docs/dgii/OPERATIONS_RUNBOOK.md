# Operación de la cola fiscal

## Dónde se mira, en el sistema

**DGII / Facturación → Estado** (`/dgii/estado`). Lee la base de verdad: cuántos
comprobantes hay y en qué estado, cuál lleva más tiempo esperando, si el
certificado aguanta, si los esquemas son los oficiales, y un botón para procesar
la cola sin esperar al cron.

⚠️ Las pantallas **«Comprobantes emitidos»** y **«Envíos a DGII»** siguen
mostrando datos de demostración de hace meses, no la base. Están pendientes de
migrar; hasta entonces, lo que vale es «Estado».

## Qué corre y cuándo

`/api/dgii/cola` cada 15 minutos (`vercel.json`).

| Entrada | Cómo se demuestra |
|---|---|
| Cron de Vercel | `Authorization: Bearer $CRON_SECRET` |
| Una persona | Permiso `dgii.retry` |

**Sin `CRON_SECRET` configurado, la puerta del cron no existe** — ni en el
portero del sistema ni en la ruta. No se cae a un
valor por defecto: una cola fiscal que se dispara con solo saber la URL es una
cola que puede disparar cualquiera.

## Qué hace en cada pasada

1. Busca negocios con trabajo pendiente. Máximo 5 por pasada.
2. **Uno por uno, nunca mezclados.** Cada negocio tiene su certificado y sus
   secuencias; un lote mezclado podría firmar el comprobante de uno con el
   certificado de otro.
3. Por negocio coge hasta **10 documentos**, los más viejos primero.
4. Para cada uno decide qué toca y lo hace — o se para.

## El freno

Con `DGII_TESTECF_SEND_ENABLED=false` (el valor por defecto), el trabajador:

- **sí** valida contra el XSD y firma — son pasos locales, se repiten sin
  consecuencias, y así lo pendiente sale de inmediato el día que se habilite;
- **no** envía ni consulta. Nada sale hacia la DGII.

Los que esperan salen en `waitingForSend` de la respuesta. **No gastan
reintento**: no ha fallado nada.

## Leer la respuesta

```json
{ "ok": true, "triggeredBy": "cron", "sendEnabled": false,
  "businesses": 1,
  "total": { "found": 12, "picked": 10, "advanced": 7,
             "waitingForSend": 3, "failed": 0, "skipped": 0 } }
```

| Campo | Qué mirar |
|---|---|
| `advanced` | Avanzaron de estado |
| `waitingForSend` | Esperan a que se habilite el envío. **Normal hoy** |
| `failed` | Fallaron y tienen cita para reintentar |
| `skipped` | Otro proceso los movió antes. Es concurrencia, no un fallo |
| `found` > `picked` | Hay más de lo que cabe en un lote: la siguiente pasada sigue |

## Cuándo preocuparse

| Señal | Qué pasa | Qué hacer |
|---|---|---|
| `failed` alto y creciendo | La DGII responde mal, o el certificado no sirve | Mirar `last_error_class` de los documentos |
| `found` sube pasada tras pasada | Entran más de los que salen | Subir la frecuencia o revisar por qué no avanzan |
| `advanced` en 0 con `picked` alto | Nada progresa | Mirar el historial de un documento concreto |
| `waitingForSend` = `picked` | Todo espera al envío | Es lo esperado hasta habilitar Fase G |

## Cuando algo falla

El historial de un documento contesta «¿qué pasó y en qué orden?»:

```sql
select created_at, status_from, status_to, event_type, error_class, message
from ecf_document_events
where electronic_invoice_id = '<id>'
order by created_at;
```

Y por qué está parado:

```sql
select status, retry_count, next_retry_at, last_error_class, last_error_message
from electronic_invoices where id = '<id>';
```

### Las clases de error, y qué significan

| Clase | Se reintenta | Qué hacer |
|---|---|---|
| `NETWORK`, `TIMEOUT` (sin entregar) | Sí | Nada. Se resuelve solo |
| `AUTHENTICATION` | Sí | Nada. Renueva el token y sigue |
| `TIMEOUT` **entregado** | **No** | Se consulta por `trackId`. **Nunca reenviar**: duplicaría el comprobante |
| `VALIDATION`, `DGII_REJECTION` | No | Corregir y emitir uno nuevo |
| `CERTIFICATE`, `CONFIGURATION` | No | Configurar; no es un problema de reintentos |

Tras 6 intentos el documento pasa a `error` y deja de reintentarse.

## Reintentar a mano

Con permiso `dgii.retry`:

```
POST /api/dgii/cola
```

Corre una pasada inmediata. Respeta las citas: un documento con
`next_retry_at` en el futuro **no** se toca, porque saltarse la espera anula el
backoff entero.

## Parar todo, ya

```
DGII_TESTECF_SEND_ENABLED = false
```

Ya es el valor por defecto. Con eso no sale ni un XML y el resto del ERP —POS,
inventario, tienda— sigue funcionando: el módulo fiscal no está en el camino de
una venta normal.

Para parar también el trabajo local, quitar la entrada de `crons` en
`vercel.json`.

## El certificado

Avisos a 30, 15, 7, 3, 1 y 0 días, **una vez por umbral**. Renovarlo no es cosa
de una tarde: hay que ir a la autoridad certificadora, pagar y validar
identidad. **Un certificado vencido no da un error a medias: no se emite ni un
comprobante.**

## RFCE

Casi toda venta de mostrador va como **Resumen** (por debajo de RD$250 000).
En el límite exacto y ante cualquier duda se manda el comprobante **completo**:
informar de más nunca es el problema.

⚠️ Dos puntos que el contador tiene que confirmar antes de emitir de verdad:
sobre qué importe se compara (se usa el monto total) y el comportamiento en
250 000,00 exactos (se trata como completo).
