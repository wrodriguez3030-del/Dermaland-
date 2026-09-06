# Decisiones técnicas

Registro de decisiones de arquitectura/implementación. Una entrada por
decisión, con fecha (YYYY-MM-DD), contexto y consecuencias.

---

## 2026-09-06 — Tarea 5 (orquestación): se firma ANTES de validar contra el XSD, no al revés

**Archivos:** `apps/web/src/features/dgii/services/prepare.ts`

### Por qué

El resumen de una frase del pliego describía el paso 3 como "`buildEcfXml` →
`validateEcfXml` contra el XSD → `signEcfXml`". Implementado literalmente, la
validación SIEMPRE falla: los XSD oficiales exigen `<Signature>` como
`xs:any minOccurs="1"` al final de `<ECF>`
(`core/xsd/e-CF-32-v1.0.xsd:424`), y el propio `core/builder.test.ts` ya lo
prueba y lo documenta — "el XML SIN firma falla el XSD solo por el
`<Signature>` requerido (Fase 6)". Validar el XML sin firmar habría hecho que
CUALQUIER comprobante, sin excepción, se reportara como XSD inválido.

agendapp (`invoice-prepare.ts:428-433`, SOLO LECTURA) confirma cuál es el
orden que de verdad funciona: construye, firma, verifica la firma y **luego**
valida el `signed.signedXml` contra el XSD.

### Decisión

El orden real en `prepararComprobante` es: `buildEcfXml` → `signEcfXml` →
`validateEcfXml` sobre el XML **ya firmado**. Es una corrección de un error
de transcripción del pliego, no una desviación de la lógica fiscal: el
orden de los GATES (habilitación → configuración → certificado → mirar el
número) y el de la PERSISTENCIA (subir → preparar → finalizar) no cambian;
solo se corrige en qué momento exacto, dentro del paso 3, se llama a
`validateEcfXml`.

### Consecuencias

- Un XML mal formado (que ni siquiera pasaría el XSD con la firma puesta)
  se detecta ANTES de subir al bucket y ANTES de `prepararFactura`: no se
  consume ningún número por un documento que de todos modos no serviría.
- Quien lea el pliego de la tarea 5 sin leer esta entrada esperaría el orden
  contrario. Queda escrito aquí para que no se repita el error en una fase
  futura que porte lógica parecida.

---

## 2026-09-06 — Tarea 5: `dobles()` de la prueba necesitó emisor y certificado de prueba que el pliego no traía

**Archivos:** `apps/web/src/features/dgii/services/prepare.test.ts`

### Por qué

El pliego trae `dobles()` con tres claves: `habilitacion`, `secuencias`,
`almacenamiento`. Ninguna prueba mockea Supabase (no hay
`vi.mock("@/lib/supabase/server")`, a diferencia de `enablement.test.ts`),
así que `obtenerConfiguracion`/`obtenerCertificadoActivo` reales — que
`prepararComprobante` SÍ necesita usar por defecto, per el pliego
("Consume: ... `certificates.ts`, `settings.ts`") — corren de verdad en la
prueba. Comprobado empíricamente (`console.log` temporal, borrado después):
en `apps/web` sin `.env.local` cargado por vitest, `createServiceRoleClient()`
devuelve `null`. Con eso, `obtenerConfiguracion` devuelve `null` (sin
lanzar) pero `obtenerCertificadoActivo` **lanza** (`obtenerClienteOFallar()`
lanza si el cliente es `null`) — ninguno de los dos deja construir ni firmar
un XML real, y las pruebas 1/3/5 (que exigen llegar hasta "subir" y
"prepare") no podrían pasar nunca sin ayuda.

### Decisión

`prepararComprobante` trata `configuracion` y `certificado` como
dependencias inyectables MÁS (mismo patrón que `habilitacion`: un VALOR ya
resuelto, no una función), con default = los servicios reales
(`obtenerConfiguracion`, `obtenerCertificadoActivo` + `parsePkcs12Certificate`
del núcleo). `dobles()` se amplió con esas dos claves:
- `configuracion`: un objeto `ConfiguracionFiscal` de prueba (RNC, Provincia y
  Municipio con el catálogo jerárquico de 6 dígitos que exige el XSD
  oficial — un `"25"`/`"01"` cortos, como los que usan `settings.test.ts` y
  `enablement.test.ts` para pruebas que NO pasan por el XSD, no son un
  elemento válido de ese enum; el teléfono también exige el patrón
  `###-###-####`).
- `certificado`: `{certificatePem, privateKeyPem}` de
  `getDummyCert()` (`core/__port__/dgii-test-cert.ts`) — el certificado
  autofirmado en memoria que la regla global de la fase exige para
  cualquier prueba de firma. Ningún `.p12` real entra al repositorio.

El resto del cuerpo de los `it(...)` es literal del pliego, sin cambios.

### Consecuencias

- Las pruebas de "camino feliz" (1, 3, 5) ejercitan `buildEcfXml`,
  `signEcfXml` y `validateEcfXml` REALES contra el XSD oficial — no un doble
  — lo que de paso confirma en verde el resultado de la entrada anterior de
  esta lista (firmar antes de validar).
- La prueba "no abre ni una conexión a la DGII" queda más honesta: no
  depende de que Supabase esté (o no) configurado en el entorno donde corre
  vitest — `habilitacion`/`configuracion`/`certificado` son valores fijos,
  nunca tocan `fetch`, pase lo que pase con las variables de entorno.

---

## 2026-09-06 — Tarea 5: la ruta de almacenamiento durante el baile usa un id de intento, no el `invoiceId` final

**Archivos:** `apps/web/src/features/dgii/services/prepare.ts`

### Por qué

El path canónico es `dgii/{businessId}/invoices/{invoiceId}/signed.xml`. El
baile sube el XML (paso 4) ANTES de llamar a `prepararFactura` (paso 5), que
es quien INSERTA la fila de `electronic_invoices` y le asigna su `id`
(`gen_random_uuid()` por defecto — confirmado leyendo el `insert` de
`prepare_ecf_invoice` en `20260906090200_dgii_fase2_funciones.sql:255-267`:
no acepta un id de quien llama). En el momento de subir, el `invoiceId` real
**todavía no existe**.

### Decisión

Cada intento de firma sube con un id generado en el cliente
(`randomUUID()`, `node:crypto`) como segmento `{invoiceId}` de la ruta — uno
nuevo por reintento, porque cada reintento firma un XML distinto (e-NCF
distinto). La ruta resultante se guarda tal cual en `xml_signed_path` vía
`finalizarFactura`; la recuperación posterior (`leerXml`) usa esa ruta
guardada, no la reconstruye a partir del `id` de la fila. El segmento de la
ruta y el `id` de `electronic_invoices` no tienen por qué coincidir — nada
en `storage.ts` ni en la fase 2 lo exige.

### Consecuencias

- Un reintento por `ENCF_TOMADO` dejaría el objeto de un intento anterior
  huérfano en el bucket (nunca referenciado por ninguna fila). No es un
  riesgo fiscal —no se consumió ningún número por ese intento— así que el
  pliego no pide limpiarlo (su compensación, paso 7, es solo para fallos
  DESPUÉS de consumir), y esta tarea no la añade para no alterar el baile
  documentado. Queda anotado por si una fase futura quiere un barrido de
  higiene del bucket.

---

## 2026-09-06 — Tarea 5: el sha256 llega a `finalizarFactura` sin tocar `dgii-sequences.ts`, y el hueco que deja fase 2 al descubierto

**Archivos:** `apps/web/src/features/dgii/services/prepare.ts`

### Por qué

La nota del encargo decía: "El sha256 del XML firmado lo calcula este
módulo, no el de almacenamiento: se decidió así en la ronda 3 de la tarea 1"
(confirmado en `task-1-report.md`: se borró un `calcularSha256()` que nadie
llamaba, con el comentario "el SHA256 del XML lo calcula el preparador, no
este módulo"). Pero `finalizarFactura(invoiceId, datos)` en
`dgii-sequences.ts` tipa `datos` como `{ xml_signed_path: string }` — sin
sitio para el hash.

Al buscar dónde debía ir, aparece el hueco real de fase 2: el comentario de
`finalize_ecf_invoice` en `20260906090200_dgii_fase2_funciones.sql:298` dice
`p_datos: {xml_signed_path, xml_sha256, security_code}`, pero el CUERPO de
la función solo lee `xml_signed_path` — `xml_sha256` y `security_code` se
documentan y nunca se usan. Y la columna que sí existe en la tabla
(`electronic_invoices.hash_sha256`, reincorporada de `0045` en
`20260906090100_dgii_fase2_tablas.sql:228`) tiene OTRO nombre que el que
promete ese comentario. Ninguna migración de esta tarea puede tocar eso
(fuera de alcance: "no apliques migraciones, no escribas en la base").

### Decisión

`prepare.ts` calcula `xmlSha256` con `createHash("sha256")` sobre el XML
firmado y lo envía en `datos` de todos modos, vía una variable intermedia
tipada (`const datosFinalizar: {xml_signed_path: string; xml_sha256: string}`)
en vez de un objeto literal en la llamada: TypeScript permite pasar una
variable con MÁS propiedades que las que pide el parámetro (no aplica el
chequeo de "excess properties", que solo mira literales), así que
`dgii-sequences.ts` queda intacto — cero modificación a un archivo ya
cerrado en una tarea anterior. Hoy ese campo de más lo ignora
`finalize_ecf_invoice` (jsonb no valida forma), así que no persiste en la
base; el día que una migración futura lo lea (con el nombre de columna que
sea), este módulo no necesita cambiar.

### Consecuencias

- El cálculo del hash tiene un destino real (no queda como código muerto
  esperando a que alguien lo use, que es justo el patrón que la ronda 3 de
  la tarea 1 corrigió).
- Queda documentado para quien cierre ese hueco de fase 2: hace falta
  decidir el nombre de columna definitivo (`hash_sha256` ya existe;
  `xml_sha256` es solo el nombre del comentario) y escribir el `update` de
  `finalize_ecf_invoice` que hoy falta. No se resuelve aquí.

---

## 2026-09-06 — Tarea 5: por qué existe `dgii-invoices.ts`, y qué NO resuelve todavía

**Archivos:**
- `apps/web/src/server/repositories/supabase/dgii-invoices.ts` (nuevo)
- `apps/web/src/features/dgii/services/prepare.ts`

### Por qué

El pliego pide crear este archivo sin decir para qué. `prepare_ecf_invoice`
devuelve `IDEMPOTENT_PROFORMA_YA_FACTURADA` con SOLO `invoice_id` — sin
`e_ncf` ni ruta del XML (`20260906090200_dgii_fase2_funciones.sql:198-205`).
`ResultadoPreparar` (el de esta tarea) exige `eNcf` y `rutaXml` como
`string` también en el caso idempotente, así que hace falta leer esos dos
campos de la factura que YA existía.

### Decisión

`crearRepositorioFacturas` expone `leerResumen(invoiceId)`: una lectura
suelta de `electronic_invoices` (id, e_ncf, xml_signed_path) filtrada por
`business_id`, del mismo tipo que `leerConfiguracion`/`leerCertificadoActivo`
en `dgii-settings.ts` — no es el baile transaccional, así que no vive en
`dgii-sequences.ts`. `prepararComprobante` la usa de MEJOR ESFUERZO: si no
se puede leer (Supabase no configurado, fila no encontrada, lo que sea), se
responde igual `{ok:true, invoiceId, eNcf:"", rutaXml:""}` en vez de fallar
o de inventar un dato fiscal.

### Lo que queda fuera, a propósito

Los tipos que exigen `FechaVencimientoSecuencia` en el XSD (31, 33, 41, 43,
44, 45, 46, 47 — ver `core/builder.ts`, `requiereVencimiento`) necesitan la
fecha de vencimiento de la secuencia autorizada
(`ecf_sequences.expires_at`), y ningún repositorio de esta tarea ni de la
fase 2 expone esa lectura todavía. agendapp aprendió esto por las malas
(v525: "un comprobante con una fecha fiscal inventada es peor que uno que
falta") y no se repite aquí: sin esa lectura, `buildEcfXml` rechaza el
comprobante con un mensaje claro ANTES de firmar y ANTES de consumir el
e-NCF — falla seguro, no falla en silencio ni inventa la fecha. Con las
pruebas de esta tarea (tipo 32, que no exige vencimiento) esto no se
ejercita; queda para quien construya el flujo de tipo 31 (crédito fiscal),
que si necesita añadir esa lectura, probablemente vaya en `dgii-invoices.ts`
o en `dgii-sequences.ts`.

---

## 2026-09-06 — Los gates de habilitación leen los repositorios directamente, no `certificates.ts`

**Archivos:**
- `apps/web/src/features/dgii/services/enablement.ts` (tarea 4 de la fase 3A)
- `apps/web/src/server/repositories/supabase/dgii-settings.ts` (método nuevo `contarSecuenciasActivas`)

### Por qué

El pliego de la tarea 4 señala `certificates.ts` (tarea 2) como lo que hay
que reutilizar para "el certificado activo y su vigencia". Pero
`obtenerCertificadoActivo` DESCIFRA el `.p12` y, si el certificado activo
está vencido (o aún no es vigente), LANZA `ErrorCertificado(..., "vencido")`
sin devolver la fila — se pierde `valid_to`, justo el dato que un gate
necesita para poder decir "hay certificado, pero venció el DD/MM" sin una
excepción de por medio. Un certificado vencido no es un error de
programación: es un estado normal del negocio, y un gate tiene que poder
describirlo sin capturar una excepción.

Es, además, lo que hace el propio origen: `enablement-service.ts` de
agendapp tampoco pasa por el equivalente de `certificates.ts` para esto —
hace su propio `prisma.dgiiCertificate.findFirst({ select: { alias,
valid_to } })`, una lectura de metadata mínima, sin descifrar nada. Ir al
repositorio directamente es el port fiel; pasar por `certificates.ts`
habría sido la desviación.

Por separado, `evaluarHabilitacion` necesita contar las secuencias activas
de `ecf_sequences` (dos conteos en agendapp: el total y el de ambiente
`ecf`), y ningún repositorio de la fase 2 tenía un método para eso:
`dgii-sequences.ts` es el baile transaccional `peek/prepare/finalize/fail`
sobre las funciones PL/pgSQL, no lecturas de metadata sueltas.

### Decisión

`evaluarHabilitacion` llama a
`crearRepositorioConfiguracion(...).leerCertificadoActivo()` directamente
para la metadata del certificado (existe + `valid_to`), en vez de
`certificates.ts`. `certificates.ts` se queda como el único que descifra el
`.p12` para firmar de verdad (lo usará la tarea 5).

El conteo de secuencias se añadió como `contarSecuenciasActivas` en
`dgii-settings.ts` — no en `dgii-sequences.ts` ni en un repositorio
nuevo—: es una lectura de metadata simple, del mismo tipo que
`leerConfiguracion`/`leerCertificadoActivo` que ya viven ahí.

### Consecuencias

- No hay dos caminos que decidan si el certificado está vigente: la
  vigencia se calcula una sola vez, en `evaluarHabilitacion`, a partir de la
  misma columna `valid_to` que usa `certificates.ts` — solo que sin la
  excepción de por medio.
- Quien busque "el conteo de secuencias" en `dgii-sequences.ts` no lo va a
  encontrar ahí: está en `dgii-settings.ts`, junto a la configuración y el
  certificado.

---

## 2026-09-06 — La persistencia DGII portada vive en `features/dgii/services/`, no en `server/services/dgii/`

**Archivos:**
- `apps/web/src/features/dgii/services/certificates.ts` (tarea 2 de la fase 3A)
- `apps/web/src/features/dgii/services/storage.ts` (tarea 1)
- `apps/web/src/server/repositories/supabase/dgii-settings.ts`

### Por qué

El diseño aprobado de la fase 3A decía que la capa de persistencia portada de
agendapp fuera a `apps/web/src/server/services/dgii/`. Ese directorio ya está
ocupado por el módulo fiscal viejo de DermaLand (`builder.ts`,
`queue-worker.ts`, `dashboard.ts`, `pdf.ts`, `qr.ts` y otra veintena de
archivos), que sigue vivo — tiene un cron diario en `vercel.json`
(`/api/dgii/cola`) — y no se retira hasta la fase 8. Poner ahí el código
nuevo habría mezclado dos módulos fiscales con esquemas de base
incompatibles en el mismo directorio.

### Decisión

El código portado de la fase 3A vive en `apps/web/src/features/dgii/services/`,
junto al núcleo puro que la fase 1 dejó en `apps/web/src/features/dgii/core/`.
Así todo el módulo nuevo queda bajo `features/dgii/` y el viejo se queda
intacto en `server/services/dgii/` hasta que le toque su retirada.

Debía haberse anotado aquí desde la tarea 1 (que ya creó
`features/dgii/services/storage.ts` con este mismo motivo, documentado solo en
`task-1-report.md`); se deja constancia ahora, con la tarea 2 añadiendo el
segundo archivo al mismo directorio.

### Consecuencias

- Quien busque "el servicio de certificados/almacenamiento DGII" en
  `server/services/dgii/` no lo va a encontrar ahí — está en
  `features/dgii/services/`. Vale la pena repetirlo en el README del módulo
  cuando se escriba.
- El repositorio `apps/web/src/server/repositories/supabase/dgii-settings.ts`
  SÍ se queda en `server/repositories/supabase/`, junto a
  `dgii-sequences.ts`: esa carpeta no tiene el choque de nombres que sí tiene
  `server/services/dgii/`, así que no hizo falta desviarse ahí.

---

## 2026-09-06 — La unicidad del e-NCF pasa a ser TOTAL: un comprobante anulado bloquea su número

**Archivos:**
- `supabase/migrations/20260906090100_dgii_fase2_tablas.sql`
  (`electronic_invoices_encf_uniq`)
- `supabase/migrations/0045_ecf_idempotency_and_events.sql:42-47` (lo anterior)

### Por qué

`0045` creó la unicidad del e-NCF como un índice único **parcial**, que dejaba
fuera los cancelados:

```sql
create unique index electronic_invoices_encf_por_ambiente_uidx
  on public.electronic_invoices (business_id, ambiente, e_ncf)
  where e_ncf is not null and status <> 'cancelled';
```

La tabla portada de agendapp lo trae como restricción **total**:

```sql
constraint electronic_invoices_encf_uniq unique (business_id, ambiente, e_ncf)
```

La diferencia no es de nombre: la versión nueva es **más estricta**. Con el
índice parcial, cancelar un comprobante liberaba su número y otro comprobante
podía volver a usarlo. Con la restricción total, no: el número queda ocupado
para siempre, lo use quien lo use.

La revisión final de la rama lo marcó porque el cambio se estaba colando sin
que nadie lo decidiera: la migración nueva reemplazaba la tabla entera, y con
ella la regla, en silencio.

### Decisión

**Se queda la restricción TOTAL.** Un número anulado ante la DGII no se
reutiliza: la anulación es un trámite con la administración, no un `DELETE`. Si
un e-NCF se emitió y luego se anuló, ese número ya tiene historia ante la DGII
y volver a usarlo es exactamente el problema que esta fase entera existe para
evitar.

El índice parcial de `0045` (`electronic_invoices_encf_por_ambiente_uidx`) **no
se recrea**: la restricción total lo cubre y lo supera.

El `ambiente` sigue dentro de la llave, y eso no cambia: que un e-NCF exista en
`testecf` no debe estorbar a producción.

### Consecuencias

- Cancelar un comprobante ya no libera su número. Si hiciera falta reemplazar
  uno anulado, el nuevo lleva **otro** e-NCF, que es lo que la DGII espera.
- Es más estricto que lo que DermaLand tenía. Sobre una tabla vacía (0
  comprobantes emitidos) no hay nada que migrar ni ninguna fila que choque.
- Si algún día apareciera un caso real que necesite reutilizar un número
  anulado, hay que traerlo aquí y decidirlo de nuevo, no aflojar la restricción
  sobre la marcha.

---

## 2026-09-06 — Los índices que vuelven de `0045` cambian de nombre a propósito

**Archivos:**
- `supabase/migrations/20260906090100_dgii_fase2_tablas.sql` (bloques `4-bis` y
  `18`)
- `supabase/migrations/0045_ecf_idempotency_and_events.sql`

### Por qué

`alter table … rename to` **no renombra los índices**. Tras la parte 1, la
`electronic_invoices` retirada se queda con los nombres que `0045` les puso
(`electronic_invoices_idempotency_key_uidx`,
`electronic_invoices_pendientes_idx`), y `ecf_document_events_legacy_20260906`
con los suyos.

Y `create index if not exists <nombre ya ocupado>` **no falla**: emite un
`NOTICE: relation "…" already exists, skipping` y sigue. Comprobado contra un
Postgres 16 efímero: la tabla nueva se queda con **cero** índices y la
migración reporta éxito.

Copiar los nombres de `0045` tal cual —que era lo que decía el informe de
revisión— habría dejado la tabla nueva **sin barrera de idempotencia**, en
silencio. Justo el fallo que reintroducir `0045` existe para evitar.

### Decisión

Los cuatro índices reintroducidos llevan nombres nuevos, con el prefijo `idx_`
que ya usa el resto del esquema nuevo:

| `0045` | aquí |
|---|---|
| `electronic_invoices_idempotency_key_uidx` | `idx_einv_idempotency_key` |
| `electronic_invoices_pendientes_idx` | `idx_einv_pendientes` |
| `ecf_document_events_documento_idx` | `idx_ecf_events_documento` |
| `ecf_document_events_business_idx` | `idx_ecf_events_business` |

Hay una guarda en `migracion-fase2.test.ts` que se pone roja si alguien vuelve
a cualquiera de los nombres de `0045`.

### Consecuencias

- Cuando llegue el día de borrar de verdad las tablas `_legacy_20260906`, los
  nombres viejos se van con ellas y no chocan con nada.
- La misma trampa acecha a cualquier futura migración que renombre una tabla y
  recree índices con los mismos nombres. El patrón: **renombrar una tabla no
  libera los nombres de sus índices.**

---

## 2026-09-06 — Cada `revoke execute` de las RPC fiscales lleva su `grant` a `service_role`

**Archivos:** `supabase/migrations/20260906090200_dgii_fase2_funciones.sql`

### Por qué

Las cinco funciones fiscales revocan `execute` de `public, anon, authenticated`,
a diferencia del único precedente de la casa (`0038_web_orders.sql:120`, que
revoca sólo de `anon, authenticated`). Revocar de `public` quita también lo que
`service_role` heredaba por PUBLIC.

Comprobado contra un Postgres 16 efímero: sin un grant explícito,
`has_function_privilege('service_role', …, 'execute')` da **FALSE en las cinco**.
En un proyecto Supabase eso normalmente lo salva `alter default privileges … on
functions to … service_role`, pero eso es una suposición sobre cómo está
configurada la base, no algo que el fichero de migración garantice. Si esa
suposición fuera falsa, la fase 3 se estrellaría con «permission denied for
function» y hoy no había forma de saberlo sin mirar la base.

### Decisión

Después de cada `revoke` va su `grant execute … to service_role`, y el
verificador comprueba las dos caras: que `anon` y `authenticated` **no** pueden,
y que `service_role` **sí**.

### Consecuencias

- No afloja nada: `service_role` es la clave del servidor, que ya se salta la
  RLS entera. Lo que hace es que el permiso deje de depender de una suposición.
- Queda escrito también el **alcance real** del `revoke`, en la cabecera del
  fichero: protege el cruce ENTRE empresas. Dentro de una, cualquier usuario
  autenticado puede hacer `PATCH /rest/v1/ecf_sequences` y retroceder
  `next_number` sin tocar ninguna función, porque la política es
  `for all using (business_id = auth_business_id())`. No es una regresión de esta
  rama (`0003_dgii_pos.sql:150` ya la tenía, y agendapp también), pero el patrón
  de la casa para un contador que sólo debe tocar el servidor es el contrario:
  `proforma_counters` tiene RLS y **cero políticas**. Pendiente de decidir en la
  fase 4, antes de que se construya encima.

---

## 2026-09-06 — Firmar antes de reservar el e-NCF, no dentro de una transacción como agendapp

**Archivos:**
- `supabase/migrations/20260906090200_dgii_fase2_funciones.sql`
  (`peek_next_encf`, `prepare_ecf_invoice`)
- `docs/superpowers/plans/2026-09-05-dgii-fase2-base-de-datos.md` (sección
  «La solución: reservar por comparación e intercambio»)
- `apps/web/src/server/repositories/supabase/dgii-sequences.ts`

### Por qué

agendapp reserva el e-NCF dentro de una transacción de Prisma que también
construye el XML y **lo firma** (`src/lib/dgii/invoice-prepare.ts:270-628`).
Si algo revienta ahí dentro, la transacción entera se deshace y el número no
se consume: reservar y firmar son, para agendapp, la misma operación atómica.

DermaLand no puede hacer eso. La aplicación habla con la base por PostgREST y
no abre transacciones desde el servidor web (`pg` es solo `devDependency`,
la usan los guiones de este repo). Y aunque pudiera abrir una transacción, no
alcanzaría: la firma XMLDSig necesita `xml-crypto` y `node-forge`, y subir el
XML al almacenamiento necesita una llamada HTTP. Ninguna de las dos cosas
ocurre dentro de Postgres. No hay forma de meter «reservar + firmar +
guardar» en una sola función PL/pgSQL, por más que el diseño aprobado de la
fase lo pidiera así.

### Decisión

Se invierte el orden: **firmar antes de consumir el número**, con una
comprobación atómica de que el número sigue siendo el nuestro.

1. `peek_next_encf(business, tipo, ambiente)` dice qué número tocaría, sin
   consumirlo y sin bloquear nada.
2. La aplicación construye el XML con ese número, lo firma y lo sube al
   almacenamiento — fuera de cualquier transacción de base de datos.
3. `prepare_ecf_invoice(..., p_expected_encf)` bloquea la secuencia y
   comprueba, bajo ese bloqueo, que el próximo número sigue siendo el
   esperado. Si lo es, lo consume e inserta la factura y sus líneas. Si no lo
   es —otro cobro se adelantó—, devuelve `ENCF_TOMADO` sin consumir nada; la
   aplicación firma otra vez con el número nuevo.

Se descartó la alternativa obvia: reservar primero y marcar la factura como
`failed` si la firma fallaba. Es más simple, pero **quema un número en cada
fallo**, y un número fiscal quemado hay que declararlo anulado ante la DGII.
agendapp perdió entre 6 y 10 números así (su v550), y le costó bastante
arreglarlo. No se repite aquí.

### Consecuencias

- **Se gana:** un fallo al firmar ya no quema un número fiscal, porque en ese
  momento todavía no se ha consumido nada.
- **Se paga:** si dos cajas cobran a la vez, una firma el XML dos veces —
  milisegundos de CPU local, no una llamada a la DGII. DermaLand es una
  farmacia con dos terminales; el costo es aceptable.
- Es la única desviación deliberada del diseño de agendapp en toda la fase 2.
  La lógica fiscal —el orden de las comprobaciones, los gates, qué se
  guarda— no cambia; cambia dónde está el límite de la transacción, porque
  agendapp no tenía este problema (Prisma sí abre transacciones desde su
  propio servidor) y DermaLand sí.

---

## 2026-09-06 — `prepare_ecf_invoice` no levanta ninguna excepción propia: `reserve_next_encf` es la única fuente de P0002/P0003/P0004

**Archivos:**
- `supabase/migrations/20260906090200_dgii_fase2_funciones.sql` (líneas
  162-196, comentario y guarda del paso 2 de `prepare_ecf_invoice`)
- `.superpowers/sdd/2026-09-05-dgii-fase2-base-de-datos/task-5-report.md`
  (dónde se encontró y se resolvió, durante la tarea 5)

### Por qué

El diseño de `prepare_ecf_invoice` traía su propio
`if v_seq_id is null then raise exception ... end if;` para el caso «no hay
secuencia activa», con el mismo código `P0002` que ya usa `reserve_next_encf`.
Al implementarlo apareció el problema: esa misma comprobación ya existe, con
su propio mensaje y su propio `errcode`, dentro de `reserve_next_encf`, a la
que `prepare_ecf_invoice` llama unas líneas más abajo para consumir el
número de verdad. Dos sitios decidiendo lo mismo —¿hay secuencia
utilizable?— solo podían desincronizarse: bastaba con corregir uno y olvidar
el otro para que un caso quedara mal clasificado.

### Decisión

Se retiró el `raise exception` propio de `prepare_ecf_invoice`. Ahora
`reserve_next_encf` es la **única** fuente de los tres códigos que puede
levantar una secuencia inválida: `P0002` (no hay secuencia activa), `P0003`
(vencida) y `P0004` (agotada).

El mecanismo que lo permite: el `select ... for update` de
`prepare_ecf_invoice` trae `next_number` y `range_end` de la misma fila que
bloquea. Si no hay ninguna fila activa, las dos variables quedan `NULL`; si
la secuencia está agotada pero todavía marcada `'active'`, `next_number`
resulta mayor que `range_end`. En los dos casos la comparación
`v_next <= v_range_end` da `NULL` o falso, el bloque que construiría
`ENCF_TOMADO` se salta solo, y el control cae en la llamada a
`reserve_next_encf` de más abajo — que hace su propia lectura de la misma
fila y es quien decide, con su propia lógica, cuál de los tres códigos
corresponde.

Un revisor lo comprobó ejecutando el SQL completo contra un Postgres real:
sin secuencia → `P0002`; agotada → `P0004` sin avanzar el contador; carrera
→ `ENCF_TOMADO` sin consumir nada; camino feliz → factura en `draft` y
contador `+1`.

Se escribe como decisión consciente, no como detalle de implementación,
porque cambia el contrato de la función: quien llame a `prepare_ecf_invoice`
nunca recibe un error propio de esa función por causa de la secuencia —
todos los que reciba vienen de `reserve_next_encf`, con sus mensajes.

### Consecuencias

- Un solo sitio sabe qué significa «secuencia inválida» y por qué. Corregir
  un mensaje, un código o una condición se hace una vez, no dos.
- `prepare_ecf_invoice` queda con una responsabilidad más angosta: decidir
  `ENCF_TOMADO` cuando hay un número vigente y dentro de rango con el que
  comparar, y nada más sobre si la secuencia en sí es válida.
- Es una desviación del literal del pliego de la tarea 5 (que traía el
  `raise exception` propio), no autorizada de antemano; se aplicó
  extendiendo el mismo principio ya aprobado para el hueco de `range_end` en
  esa misma función: que `reserve_next_encf` sea quien decide.

---

## 2026-09-05 — `ecf_sequences_next_dentro_del_rango` es un renombre de `ecf_sequences_next_chk`, no una adición

**Archivos:**
- `supabase/migrations/20260906090100_dgii_fase2_tablas.sql` (constraint
  `ecf_sequences_next_dentro_del_rango`)
- `docs/superpowers/plans/2026-09-05-dgii-fase2-base-de-datos.md` (líneas 629
  y 1607-1609, corregidas en la misma ronda que esta entrada)

### Por qué

**Corrección de esta misma entrada** (ronda de revisión 1 de la tarea 3;
hallazgo Importante). La versión anterior, y el plan de la fase en dos
sitios, afirmaban que `ecf_sequences_next_dentro_del_rango` era un CHECK que
agendapp no traía («no está en agendapp», «que agendapp no tiene»). Es falso.
`~/Projects/agendapp/prisma/migrations/applied/20260609_dgii_phase2_core_tables.sql:94`
ya trae:

```sql
CONSTRAINT ecf_sequences_next_chk  CHECK (next_number >= range_start AND next_number <= range_end + 1),
```

que es, carácter por carácter salvo mayúsculas, la misma expresión que quedó
en `ecf_sequences_next_dentro_del_rango`. No es una restricción nueva: es el
mismo CHECK de la fuente, con otro nombre.

### Decisión

Al portar `ecf_sequences` se **renombró** `ecf_sequences_next_chk` →
`ecf_sequences_next_dentro_del_rango`, para que el nombre diga en español lo
que la restricción hace (que `next_number` — el puntero que se mueve en cada
cobro — no salga del rango autorizado), no para añadir una garantía que no
existiera. El CHECK de rango (`ecf_sequences_range_chk`,
`range_start <= range_end`) y el UNIQUE (`ecf_sequences_uniq`,
`business_id, tipo_ecf, ambiente, range_start`) se conservaron de la fuente
tal cual, con sus nombres originales. **No hay ninguna adición neta sobre el
DDL de origen** en `ecf_sequences` ni en ninguna de las 17 tablas PORTADAS de la
fase (nota de 2026-09-06: la revisión final añadió después, y a propósito, dos
bloques que NO salen de agendapp — las ocho columnas de `0045` sobre
`electronic_invoices` y la tabla `ecf_document_events`; ver las entradas de
arriba. Lo que sigue siendo cierto es que no hay adiciones sobre el DDL
portado)
2: el porte es copia fiel con las siete sustituciones del pliego (ayudante de
RLS, `sales`→`proformas`, esquema cualificado, `search_path`, minúsculas,
comentarios reescritos, y el renombre del CHECK `ecf_sequences_next_chk` →
`ecf_sequences_next_dentro_del_rango`) y nada más.

### Consecuencias

- El comportamiento de la base en este punto es idéntico al de agendapp:
  `next_number` ya estaba acotado al rango en la fuente, así que no cambia
  nada observable para la aplicación.
- El plan de la fase tenía la afirmación errónea en el paso 3 de la tarea 3
  (línea 629) y en el paso 7 de la tarea 8 (línea 1609); ambas se corrigieron
  para no seguir propagando el error a quien ejecute las fases siguientes. El
  error era del plan, no de la migración: la migración y el `task-3-report.md`
  ya decían, desde el principio, que el CHECK es "semánticamente igual" al de
  la fuente.
- Esta entrada sustituye a la que llevaba el mismo título y fecha, que
  afirmaba lo contrario.

---

## 2026-08-19 — El enlace de Azul es POR PEDIDO, no un enlace fijo del comercio

**Archivos:**
- `supabase/migrations/20260819180000_web_orders_azul_link.sql`
- `apps/web/src/features/storefront/azul-link.ts` (`canSetAzulLink`, + prueba)
- `apps/web/src/app/api/pedidos-web/[id]/azul-link/route.ts`
- `apps/web/src/features/storefront/components/admin/order-azul-link-form.tsx`

### Por qué

La decisión anterior (abajo) asumió que el enlace del comercio era una página
de **monto abierto** donde el cliente teclea el total. La realidad del Link de
Pagos de Azul es otra: se genera **por transacción** desde la App AZUL, con el
monto **fijado al crearlo**, sin parámetro de URL para cambiarlo, y **caduca**.
El enlace configurado nació con RD$500 fijo: todo pedido, del monto que fuera,
mandaba al cliente a pagar RD$500 (y al caducar, a una página de error).

### Decisión

Cada pedido de tarjeta lleva su enlace (`web_orders.azul_payment_link_url`):
el admin lo genera en la App AZUL con el monto exacto —copiable en el detalle
del pedido— y lo pega ahí. El cliente **verifica** el monto en Azul, no lo
teclea. El enlace de `business_web_settings` queda SOLO como interruptor de
"la tienda acepta tarjeta" (fail-closed) y no se le enseña a nadie.

### Consecuencias

- Un paso manual más por pedido de tarjeta (generar y pegar el link) — es el
  costo de no tener la afiliación con API; el día que se encienda la pasarela
  (`AZUL_*`), este riel manual se sustituye por intentos verificables.
- El aviso "Tu enlace de pago está listo" sale por el riel Gmail existente;
  su fallo nunca deshace el guardado.
- La confirmación sigue 100 % manual: aceptar el comprobante es lo único que
  marca `pagado`.

---

## 2026-08-19 — Enlace de pago de Azul con confirmación manual, no adaptador de API

**Archivos:**
- `apps/web/src/features/storefront/azul-link.ts` (+ prueba)
- `apps/web/src/features/storefront/components/azul-pay-box.tsx`
- `supabase/migrations/20260819120000_web_settings_azul_payment_link.sql`

### Por qué

El comercio consiguió un **enlace de pago** en `pagos.azul.com.do` (el cliente
teclea el monto), no la afiliación de comercio electrónico con API. Un enlace
no tiene webhook ni verificación programática, así que **no encaja en el
contrato `PaymentProvider`** (crear intento + verificar) y se integró por el
riel que ya existía para la transferencia: el cliente paga fuera, sube
comprobante, y el admin lo acepta — que es lo ÚNICO que marca `pagado`. El
adaptador de Azul sigue sin escribirse (la regla de `pagos-en-linea.md` §1 no
cambia): esto es un método manual honesto, no una pasarela.

### Consecuencias

- Encender/apagar tarjeta es pegar/vaciar el enlace en la configuración de la
  tienda; sin despliegue. Fail-closed sin enlace, dominio validado en cliente
  y servidor.
- El monto correcto depende del cliente (Azul no permite fijarlo): se mitiga
  con el total copiable, el número de pedido como referencia y la revisión
  humana. Si algún día llega la afiliación con API, el enlace convive o se
  sustituye sin tocar pedidos ni base (el método sigue siendo `tarjeta`).

---

## 2026-08-05 — Arenero efímero en vez de base compartida para el simulacro de DR

**Archivos:**
- `scripts/backup/dr-drill.mjs`
- `scripts/backup/lib/dr-guards.mjs` (`assertOrigenDistinto`, `assertMagnitudCreible`, el contrato/lease)

### Por qué

B-01 exigía probar que un respaldo de producción **restaura de verdad**, no
solo que se genera. Eso necesita un destino donde restaurar. La alternativa
obvia — mantener un segundo proyecto Supabase (o una base persistente) como
"destino de pruebas" — se descartó a propósito: una base que sobrevive entre
corridas puede acumular residuos de una corrida anterior y aprobar un
simulacro que en realidad está comparando contra sí misma o contra un estado
viejo. Es exactamente el modo de falla que un simulacro de recuperación
existe para detectar, no para tener.

### Cómo

Cada corrida levanta un contenedor Docker desechable
(`supabase/postgres:17.6.1.132`) en el mismo servidor (`supabase-01`), sin
puertos publicados, restaura ahí el respaldo, compara, y lo destruye al
terminar. Dos guardas hacen que esto sea seguro y no un simulacro que se
autoaprueba:

1. **`assertOrigenDistinto`** — compara el `system_identifier` del clúster de
   origen contra el del destino (único por clúster, independiente del DSN).
   Sin esto, apuntar por error el destino a producción daría `diff.ok: true`
   trivialmente.
2. **Un contrato (*lease*) de 300 s, renovado en cada paso**, vigilado por un
   proceso `setsid` en el propio servidor. Si el proceso local muere de golpe
   (`SIGKILL`, corte de red, laptop suspendida), el vigilante destruye
   contenedor, volumen y respaldo temporal sin que nadie tenga que darse
   cuenta — verificado con un `SIGKILL` real: destruido en 35 s.

### Consecuencias

- Cada corrida es independiente y no puede "aprender" a pasar: el destino
  nace vacío y muere después de cada comparación.
- Complejidad extra (orquestación del contenedor + vigilante), pero a cambio
  no existe una segunda copia persistente de datos de producción en reposo
  en otro servidor — menos superficie de ataque, no más.
- El servidor aloja producción de otros clientes (`csl-app`, PalusaApp); el
  arenero nunca publica puertos y se verifica, corrida tras corrida, que los
  contenedores vecinos no se tocan (mismo uptime antes y después).

---

## 2026-08-06 — Break-glass en vez de códigos de recuperación para 2FA obligatorio

**Archivos:**
- `scripts/mfa-break-glass.mjs`
- `apps/web/src/lib/auth/mfa-gate.ts`
- `docs/security.md` (sección "Break-glass de 2FA")

### Por qué

Al volver obligatorio el 2FA para `admin`/`super_admin`/`is_platform_admin`
(B-04), hacía falta una vía de recuperación para quien pierda su dispositivo
TOTP — si no, un teléfono perdido significa quedar fuera del sistema para
siempre. La opción estándar son **códigos de recuperación** (un lote de
códigos de un solo uso generados al enrolar, que el usuario guarda aparte).
Se descartó: en una farmacia con dispositivos y turnos compartidos, esos
códigos son un secreto estático que hay que imprimir/guardar en algún sitio,
y ese sitio es exactamente donde se filtran — un código de recuperación
robado es un bypass permanente del 2FA que nadie audita hasta que ya se usó.

### Cómo

En vez de un secreto que el usuario custodia, la recuperación es una
**acción operativa auditada**: `scripts/mfa-break-glass.mjs`, corrido fuera de
la aplicación con la `service_role_key`, retira el segundo factor de **un**
usuario nombrado (nunca por patrón, nunca varios a la vez), pide confirmación
interactiva, y deja rastro en `audit_logs` — incluso si la operación se
corta a medias. Verificado 16/16 contra Supabase real con usuarios
desechables: el camino feliz retira el factor, la persona vuelve a entrar
solo con contraseña, y el rastro queda completo.

### Consecuencias

- No hay ningún secreto estático que un usuario pueda perder o que alguien
  pueda robar de un cajón. La recuperación exige poseer la
  `service_role_key`, que ya es el secreto más sensible del proyecto —no se
  añade una superficie nueva, se reutiliza la que ya existía.
- Eso convierte a la `service_role_key` en el punto único de fallo del 2FA
  entero (documentado como riesgo abierto `R-SEC-04` en `docs/riesgos.md`):
  quien la tenga puede retirar el factor de cualquiera. Es una decisión
  consciente, no un descuido — la alternativa (códigos de recuperación)
  tiene el mismo problema con un secreto peor custodiado.
- La recuperación es más lenta (requiere a alguien con la clave y presencia,
  no un código en un cajón), pero deja rastro siempre, cosa que un código de
  recuperación usado en secreto no garantiza.

---

## 2026-08-05 — El dump deja de ser destructivo por defecto

**Archivos:**
- `scripts/backup/lib/pg-dump-args.mjs`
- `scripts/backup/pg-dump-backup.mjs`

### Por qué

El script de respaldo generaba el dump con `--clean --if-exists`, así que el
archivo **empezaba con sentencias `DROP`**. Consecuencia real, no teórica: si
alguna vez el destino de una restauración se apunta por error (typo en el
DSN, variable de entorno equivocada), el respaldo no "ensucia" esa base con
datos viejos — **la vacía**, sin preguntar. Un script cuyo comportamiento por
defecto es destructivo es exactamente el tipo de herramienta que un día se
corre contra el sitio equivocado.

### Cómo

`--clean --if-exists` deja de ser el default. Hace falta pasar
`--with-drop` explícito para obtenerlo (lo que sí necesita el propio
`dr-drill.mjs`, porque el contenedor `supabase/postgres` trae objetos previos
que chocan sin el `DROP`). Sin ese flag, el dump es aditivo.

### Consecuencias

- El caso de uso normal (respaldo nocturno, guardado en el NAS) ya no puede
  destruir nada por definición, aunque alguien lo corra con el DSN
  equivocado.
- El caso que sí necesita `--clean` (restaurar sobre un destino con basura
  previa, como el arenero de DR) lo pide explícitamente, con un flag que deja
  constancia de la intención en el propio comando.

---

## 2026-08-05 — La huella de tablas se deriva de las migraciones, no se mantiene a mano

**Archivos:**
- `scripts/backup/lib/dermaland-footprint.mjs`
- `scripts/backup/lib/assert-safe-target.mjs`
- `scripts/lib/migration-objects.mjs` (reutilizado, ya existía para
  `scripts/audit-migrations.mjs`)

### Por qué

La guarda de destino (`assertSafeTarget`, que impide escribir en el proyecto
equivocado de `supabase-01` — que también aloja `csl-app` y PalusaApp)
comparaba contra una lista de tablas de DermaLand **escrita a mano**. Esa
lista tenía 16 de las 83 tablas reales, y **4 de esos 16 nombres ni siquiera
existían** (`sales`, `sale_items`, `categories`, `cash_sessions` — nunca
fueron los nombres reales; las tablas de verdad son `proformas`,
`product_categories`, `cash_register_sessions`). Con esa huella, un restore
real habría abortado **siempre** por "tablas desconocidas" — y una guarda que
estorba siempre termina desactivada por la primera persona con prisa, que es
el modo de falla que una guarda de seguridad no se puede permitir.

### Cómo

`dermaland-footprint.mjs` deriva la huella leyendo
`supabase/migrations/*.sql` en vivo con `extractObjects()` — el mismo
extractor que ya usa `scripts/audit-migrations.mjs` para B-07. La huella deja
de mantenerse en dos sitios (un archivo de migraciones y una lista aparte que
alguien tiene que recordar actualizar) y pasa a tener una sola fuente de
verdad. Verificado contra producción: las 83 tablas reales coinciden 1 a 1
con lo derivado del repo — 0 de más, 0 de menos.

### Consecuencias

- Agregar una migración nueva actualiza la huella automáticamente; nadie
  tiene que acordarse de tocar una lista aparte.
- La guarda (`assert-safe-target.mjs`) se mantiene pura y sin leer disco —
  recibe la huella ya construida como parámetro — para que sus pruebas
  unitarias sigan siendo deterministas e independientes del estado del repo.
- Reutiliza la misma auditoría por objeto que ya es la fuente de verdad para
  B-07, en vez de inventar un segundo mecanismo de "qué tablas son nuestras".

---

## 2026-05-07 — POS: layout responsivo + reglas documentales explícitas

**Archivos:**
- `apps/web/src/features/pos/pos-terminal.tsx`
- `apps/web/src/features/sales/document-resolver.ts` (nuevo)
- `apps/web/src/features/sales/document-resolver.test.ts` (nuevo)
- `apps/web/src/features/sales/components/receipt-80mm.tsx`
- `apps/web/src/types/index.ts` (campos opcionales `documentKind`, `ecfType`,
  `sequenceType` en `Proforma`)

### Por qué

El POS tenía tres problemas que se resolvieron en un solo pase:

1. **Layout no aprovechaba el ancho.** En desktop el panel derecho quedaba
   con un ancho fijo proporcional poco usable y los productos en una sola
   relación 1.4fr/1fr.
2. **No había regla clara de qué documento se emite.** Todo terminaba como
   "proforma" aunque la combinación de tipo de facturación + método de pago
   indicara que debía ser una factura e-CF.
3. **El selector de método de pago tenía un default implícito (`cash`)**
   que se veía resaltado desde el inicio y confundía: el operario podía
   creer que ya había elegido método cuando en realidad no lo había
   tocado.

### Cómo

1. **Layout fluido.** Wrapper cambia a
   `lg:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)]
    xl:grid-cols-[minmax(0,2fr)_minmax(420px,1fr)]`. La grilla de productos
   sube a `sm:2 md:3 lg:3 xl:4 2xl:5`. Altura mínima en lugar de fija para
   no clipping en pantallas estrechas. Buscador y botones fluyen con
   `flex-wrap` y `min-w-[220px]`.

2. **Función pura `resolveDocumentToIssue({ billingType, paymentMethod })`.**
   Reglas:
   - `consumo` + (`cash` | `transfer` | `paypal` | `manual` | `other` | `null`)
     → **Proforma** (no fiscal).
   - `consumo` + (`card` | `azul` | `cardnet` | `visanet`)
     → **Factura e-CF 32 (Consumo)**.
   - `credito_fiscal` + cualquier método (incluido `null`)
     → **Factura e-CF 31 (Crédito Fiscal)**.

   Devuelve `{ documentKind, ecfType, sequenceType, label, buttonLabel }`.
   El POS lo usa para dibujar el indicador "Documento a emitir" y para la
   etiqueta del botón final ("Cobrar y emitir proforma" / "...factura").

3. **Selector explícito.** `paymentMethod` cambia de tipo a `PrimaryPaymentMethod
   | null` con default `null`. Botones con `role="radio"` y `aria-checked`,
   ningún botón resaltado al inicio. Submit deshabilitado mientras
   `paymentMethod === null` o el carrito está vacío. Aviso "selecciona uno"
   visible junto al título del selector.

4. **Validación de crédito fiscal.** Si `billingType === "credito_fiscal"` y
   el cliente no tiene `documentType === "rnc"` con `documentNumber`, se
   muestra un aviso ámbar y se bloquea el submit hasta que cambie cliente o
   tipo.

5. **Tipo `Proforma` extendido** con tres campos opcionales (`documentKind`,
   `ecfType`, `sequenceType`). Backward-compatible con proformas existentes.
   `Receipt80mm` los respeta para mostrar el rótulo correcto del
   comprobante (FACTURA e-CF 31/32 o PROFORMA).

### Consecuencias

- **Producción fiscal queda preparada sin costo de UI:** cuando se conecte
  DGII, sólo el repositorio tiene que materializar la secuencia indicada
  por `sequenceType`. El POS y el comprobante ya saben qué emitir.
- El selector de pago **obliga a un click consciente** — menos errores de
  "ay, pensé que era efectivo".
- El usuario ve **antes de cobrar** qué documento va a salir, lo que
  reduce reclamos de "esto debió ser factura, no proforma".

---

## 2026-05-07 — Página de impresión de proformas con render diferido

**Ruta:** `apps/web/src/app/(app)/proformas/[id]/print/page.tsx`

La página de impresión de proformas usa un componente cliente con un estado
`mounted` para evitar **hydration mismatch** al leer `localStorage`.

### Por qué

Mientras las proformas vivan en `localStorage` (transición a Supabase), el
servidor no puede saber si una proforma existe — sólo el navegador local
conoce el dato. Si el componente leyera `localStorage` durante el primer
render, el HTML del servidor (sin acceso a `window`) y el del cliente (que
sí lo tiene) divergirían y React lanzaría:

> Hydration failed because the server rendered HTML didn't match the client.

### Cómo

- El servidor y el primer render del cliente devuelven el mismo HTML
  estable: una tarjeta "Cargando proforma...".
- Tras `useEffect`, el componente marca `mounted = true` y llama
  `getProformaByIdFromStore(id)` para resolver el ticket.
- Si se encuentra → renderiza `Receipt80mm` con la proforma como prop.
- Si no existe → renderiza la card "Proforma no encontrada".
- `Receipt80mm` recibe los datos por props (no toca `window`,
  `localStorage`, `Date.now`, `Math.random`); las fechas se formatean a
  partir de `proforma.createdAt` que ya está persistido al emitir.

### Consecuencias

- Hay un parpadeo breve ("Cargando proforma...") antes de mostrar el
  ticket. Aceptable porque la página vive detrás de un click explícito en
  el POS / listado.
- Cuando la fuente de proformas pase de `localStorage` a Supabase, el
  patrón sigue siendo válido: bastará con sustituir
  `getProformaByIdFromStore` por la consulta server-side y el placeholder
  desaparecerá (o se mantendrá como skeleton durante el fetch).
