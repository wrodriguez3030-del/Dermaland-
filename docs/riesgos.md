# Riesgos conocidos

Riesgos vivos del proyecto, con mitigación y dueño cuando aplica. Cuando un
riesgo se cierra, mover la entrada al final con `[CERRADO YYYY-MM-DD]`.

---

## R-FIS-03 · Al aplicar la fase 2, el módulo DGII viejo se queda a oscuras hasta la fase 3

**Fecha:** 2026-09-06
**Severidad:** Media
**Dueño:** el dueño, que decide cuándo aplica las tres migraciones.

Las migraciones de la fase 2 **no están aplicadas**. Cuando se apliquen, el
módulo fiscal viejo pierde sus tablas (se renombran a `*_legacy_20260906`) y
deja de funcionar lo siguiente, hasta que la fase 3 reconecte el módulo nuevo:

- las pantallas `/dgii/configuracion`, `/dgii/certificado`, `/dgii/estado` —que
  está en la barra lateral— y `/dgii/habilitacion`;
- `/api/dgii/certificate/current` y `/api/dgii/certificate/test-local`;
- el **cron diario `/api/dgii/cola`** (`0 7 * * *`, declarado en `vercel.json`),
  que se queda sin trabajo. Está vivo en producción: el killswitch
  `DGII_TESTECF_SEND_ENABLED` gatea sólo `enviar` y `consultar`; `validar` y
  `firmar` corren siempre.

**El punto de venta NO está en riesgo**, ni antes ni después de aplicar:
ninguna función del POS toca las tablas fiscales y no hay disparadores sobre
`proformas`, `proforma_items`, `proforma_payments`, `cash_closings`,
`cash_closing_sales` ni `cash_register_sessions`.

**Lo más incómodo, y hay que nombrarlo:** entre aplicar y la fase 6 **no habrá
forma de subir un `.p12`**. Los 4 certificados quedan en
`dgii_certificates_legacy_20260906`, ninguna migración los copia, y la pantalla
de subida actual (`server/services/certificate-storage.ts`) escribe cuatro
columnas que la tabla nueva no tiene: `pkcs12_storage_bucket`,
`pkcs12_storage_path`, `iv` y `tag`. La tabla nueva usa `storage_bucket` /
`storage_path` y no tiene sitio para el IV ni el tag del sobre AES-256-GCM.

### Mitigación / plan de salida

- Con el módulo fiscal sin emitir ni un comprobante, quedarse a oscuras no
  cuesta nada operativamente: la farmacia factura por el POS, que no depende de
  esto.
- La ventana la cierra la fase 3 (pantallas y servicios) y la fase 6
  (certificado). Si hiciera falta acortarla, lo barato es adelantar el arreglo
  de `certificate-storage.ts` a las cuatro columnas nuevas.
- Tras aplicar, `scripts/audit-migrations.mjs` reportará `0003_dgii_pos`,
  `0045_ecf_idempotency_and_events` y `20260805020813_ecf_events_fk_restrict`
  como `PARCIAL` / `NO_APLICADA`. **Es esperado, no un fallo:** `classify()`
  compara objetos declarados contra objetos existentes, y esos objetos ahora se
  llaman `*_legacy_20260906`.
- `apps/web/src/server/db/database.types.ts` sigue describiendo el esquema
  VIEJO y no se regeneró. Consecuencia: tras aplicar, todo sigue compilando y
  todos los fallos son de ejecución. Regenerarlo romperá el build en los
  ficheros del módulo viejo — **eso es la señal que hoy no existe**, y toca
  decidir entonces si se arreglan o se marcan como retirados hasta la fase 3.

---

## R-FIS-04 · `finalize_ecf_invoice` no persiste el hash del XML firmado, y `security_code` no existe donde su comentario promete

**Fecha:** 2026-09-06
**Severidad:** Media — no bloquea emitir ni compromete ningún e-NCF; deja
sin registrar un dato que se necesitará (integridad del XML persistido y,
más adelante, el resumen RFCE).
**Dueño:** quien prepare la migración de la fase 3B que toque
`finalize_ecf_invoice`.
**Archivos:** `supabase/migrations/20260906090200_dgii_fase2_funciones.sql`
(comentario en la línea 298), `supabase/migrations/20260906090100_dgii_fase2_tablas.sql`
(línea 243, columna `hash_sha256`; línea 548, columna `security_code`).

Encontrado al implementar `apps/web/src/features/dgii/services/prepare.ts`
(fase 3A, tarea 5), corregido con precisión en su ronda de corrección 1:

- El comentario de `finalize_ecf_invoice`
  (`20260906090200_dgii_fase2_funciones.sql:298`) dice
  `p_datos: {xml_signed_path, xml_sha256, security_code}`. El CUERPO de la
  función (ya aplicada en producción) solo lee `xml_signed_path` — nunca
  toca `xml_sha256` ni `security_code`.
- La columna que existe de verdad para el hash se llama
  **`electronic_invoices.hash_sha256`** (`20260906090100_dgii_fase2_tablas.sql:243`,
  reincorporada de `0045_ecf_idempotency_and_events.sql`) — un nombre
  DISTINTO al que promete el comentario (`xml_sha256`).
- **`security_code` no existe en `electronic_invoices` en absoluto.** La
  única columna con ese nombre en toda la migración de fase 2 es
  `dgii_certification_cases.security_code`
  (`20260906090100_dgii_fase2_tablas.sql:548`) — una tabla del flujo de
  CERTIFICACIÓN (datasets/casos de prueba contra DGII), no la tabla de
  facturación real. No hay ninguna columna a la que escribir el código de
  seguridad de un comprobante emitido normalmente.

**Consecuencia real, hoy:** `prepararComprobante` (tarea 5) calcula el
sha256 del XML firmado y lo envía en `p_datos.xml_sha256` en cada llamada a
`finalizarFactura` — pero como el cuerpo de `finalize_ecf_invoice` lo
ignora, **todo comprobante firmado con este flujo queda con
`hash_sha256` NULO** en la base. No es un fallo silencioso del código nuevo:
es la función de fase 2, ya aplicada, la que no lo persiste.

Esto **no puede arreglarse en la fase 3A**: `finalize_ecf_invoice` ya está
aplicada en producción, y tocar su cuerpo es una migración
(`create or replace function`), fuera del alcance de una tarea que no
aplica migraciones ni escribe en la base.

### Mitigación / plan de salida

1. Decidir el nombre de columna definitivo para el hash del XML firmado:
   ¿se corrige el comentario de `finalize_ecf_invoice` para decir
   `hash_sha256` (el que ya existe), o se añade una columna `xml_sha256`
   nueva? Recomendado: corregir el comentario y usar la columna que ya
   existe — añadir una segunda columna para lo mismo sería la "lógica
   paralela" que este proyecto evita.
2. Escribir la migración que actualiza `finalize_ecf_invoice` para hacer
   `set hash_sha256 = nullif(p_datos->>'xml_sha256','')` junto al resto del
   `update`.
3. Para `security_code`: decidir si un comprobante normal (no de
   certificación) necesita guardarlo. Si la fase 3B trae el resumen RFCE
   (que sí lo necesita, según `agendapp` — el código de seguridad son los
   6 primeros caracteres del `SignatureValue`, vía
   `core/print-representation.ts`), esa fase tendrá que decidir en qué
   columna de qué tabla vive — HOY no hay ninguna en `electronic_invoices`.
4. Mientras tanto, `prepare.ts` ya envía `xml_sha256` en cada llamada
   (código listo, cero coste); cuando la migración exista, no hace falta
   tocar `prepare.ts` de nuevo.

---

## R-FIS-05 · El tipo 31 (crédito fiscal) no puede emitirse hasta que exista una lectura de `ecf_sequences.expires_at`

**Fecha:** 2026-09-06
**Severidad:** Alta para la fase 4 — es lo PRIMERO que va a fallar, porque
es el tipo que el POS elige para TODO cliente de crédito fiscal.
**Dueño:** quien cablee el punto de venta contra DGII en la fase 4.
**Archivos:** `apps/web/src/features/dgii/core/builder.ts` (`requiereVencimiento`),
`apps/web/src/features/dgii/services/prepare.ts`,
`apps/web/src/features/sales/document-resolver.ts`.

Los tipos 31, 33, 41, 43, 44, 45, 46 y 47 exigen `FechaVencimientoSecuencia`
en el XSD oficial (`requiereVencimiento` en `core/builder.ts`). Ese dato es
la fecha de vencimiento del RANGO AUTORIZADO por la DGII —vive en
`ecf_sequences.expires_at`— y ningún repositorio de la fase 2 ni de la
tarea 5 expone hoy una lectura de esa columna. Comprobado con una sonda
directa contra `prepararComprobante`: para un tipo 31, la única llamada que
llega a hacerse es `peekNextEncf`; `buildEcfXml` rechaza el comprobante
antes de firmar, con el motivo exacto ("FechaVencimientoSecuencia requerida
y válida (XSD)"). **No se quema ningún e-NCF** — falla limpio, como debe
ser (la lección de agendapp v525: "un comprobante con una fecha fiscal
inventada es peor que uno que falta").

**Por qué esto importa para la fase 4 en particular:** las reglas ya
acordadas y documentadas de DermaLand
(`document-resolver.ts`, `resolveDocumentToIssue`, ver también R-FIS-01)
dicen que `credito_fiscal` + CUALQUIER método de pago produce **Factura
e-CF 31**. El día que el punto de venta llame a `prepararComprobante` de
verdad, el PRIMER cliente que pida crédito fiscal va a fallar — no por un
bug de esa fase, sino porque la lectura que hace falta nunca se construyó.

### Mitigación / plan de salida

1. Antes de cablear el POS a `prepararComprobante` en la fase 4: añadir una
   lectura de `ecf_sequences.expires_at` (candidato natural:
   `dgii-invoices.ts` o `dgii-sequences.ts`, a decidir según encaje) y
   pasarla a `buildEcfXml` como `fechaVencimientoSecuencia`.
2. Igual que agendapp: si la secuencia activa no tiene `expires_at`
   cargado, BLOQUEAR con el motivo exacto — nunca inventar una fecha
   (`hoy + 365 días` fue el error real de agendapp antes de v525).
3. No se resuelve en la fase 3A a propósito: el pliego de la tarea 5 no lo
   pedía, y las pruebas de esa tarea usan tipo 32 (que no exige el campo).
   Queda anotado aquí para que no sea una sorpresa al cablear el POS.

---

## R-FIS-06 · Un rechazo de `prepararFactura` puede dejar un e-NCF consumido, en `draft`, sin motivo y con su XML huérfano en el bucket

**Fecha:** 2026-09-06
**Severidad:** Alta — no es hipotético: `prepare_ecf_invoice` hace commit
del incremento de la secuencia y del `insert` en `draft` ANTES de que la
respuesta HTTP llegue de vuelta a este proceso.
**Dueño:** quien haga el barrido de facturas `draft` huérfanas en la fase
3B o 4.
**Archivos:** `apps/web/src/features/dgii/services/prepare.ts` (paso 5 del
baile, la llamada a `secuencias.prepararFactura` dentro de
`prepararComprobante`), `apps/web/src/server/repositories/supabase/dgii-sequences.ts`
(`prepararFactura` → RPC `prepare_ecf_invoice`).

Encontrado en la revisión final de la fase 3A (hallazgo Crítico C2). Si
`prepararFactura` **lanza** — timeout de Vercel, 5xx de PostgREST — en vez
de devolver `{ok:false}` con un motivo estructurado, `prepare.ts` no tiene
forma de saber si la RPC alcanzó a comprometer su escritura antes de que la
excepción llegara. A diferencia de `finalizarFactura` (la otra llamada
consumidora del mismo archivo, compensada con `marcarFallo` + `borrarXml`
desde la ronda de corrección 1), esta no se puede compensar de la misma
manera: no llega ningún `invoice_id` con el que llamar a `marcarFallo`, ni
ruta de bucket que borrar con `borrarXml` — la respuesta que los traería es
exactamente la que se perdió.

**Qué se corrigió aquí, y qué no:** ahora `prepare.ts` deja un
`console.error` con `businessId`, `tipoEcf`, el candidato de e-NCF y el
número de intento (nunca el XML, el certificado ni la contraseña) antes de
devolver `{ok:false}`. Es lo mínimo que hace ese número **reconciliable**
después — antes de esta corrección el archivo entero no tenía un solo
`console.*`. No resuelve el barrido en sí: eso sigue pendiente.

### Mitigación / plan de salida

1. Barrido periódico (cron o script manual) de facturas en `draft` más
   viejas que un umbral razonable (p. ej. 15 minutos) sin
   `xml_signed_path`: son candidatas exactas a este escenario. Cruzar con
   el `console.error` de arriba para confirmar `businessId`/e-NCF.
2. Decidir, para cada caso que el barrido encuentre, si se llama a
   `marcarFallo` (motivo: huérfana por timeout, recuperada por barrido) o
   si —dado que el e-NCF sigue siendo válido y no llegó a firmarse con
   éxito ningún XML sobre él— se reintenta la emisión con ese mismo
   número antes de darlo por perdido. Requiere conocer el estado real de
   `ecf_sequences` en ese momento; no es una decisión que este código deba
   tomar solo.
3. Borrar de storage el XML asociado al intento perdido, una vez
   identificado (mismo patrón que `borrarDeMejorEsfuerzo` ya usa en el
   resto de `prepare.ts`).
4. Es trabajo de la fase 3B o 4, según el pliego de la revisión final de la
   fase 3A — no de esta corrección, que solo deja el rastro para que el
   barrido sea posible.

---

## R-SEC-02 · Cuenta de prueba con rol admin efectivo en producción

**Fecha:** 2026-08-06
**Severidad:** Alta
**Dueño:** el dueño decide si se borra.

`cnttest-ct5jmp@example.com` es basura de una corrida vieja de
`scripts/test/count-adjustment-test.mjs` que no limpió. Tiene `role: admin` en
`app_metadata` —el claim que manda por SEC-001— pero `role: cashier` en su
ficha de `public.users`. Como el enforcement de 2FA (y cualquier gate de rol)
lee los claims, esta cuenta de prueba es hoy un **administrador real y
funcional** del sistema en producción, sin que nadie lo haya decidido así.

### Mitigación / plan de salida

Borrarla es una acción sobre datos reales de producción y requiere
confirmación explícita del dueño (regla dura del proyecto). Mientras exista,
al desplegar el enforcement de 2FA (B-04) esta cuenta también queda obligada
a enrolar 2FA como cualquier admin — lo cual, perversamente, la legitimaría
más en vez de resolver el problema de fondo.

---

## R-SEC-03 · `preview-admin@dermaland.do` sin 2FA romperá los smokes de Preview

**Fecha:** 2026-08-06
**Severidad:** Media
**Dueño:** por decidir (dueño del proyecto).

Los despliegues Preview de Vercel usan `DATA_SOURCE=supabase` contra la misma
base que producción, y el usuario seed `preview-admin@dermaland.do` tiene
`role: admin`. Al encender el 2FA obligatorio (B-04), ese usuario también
queda obligado a enrolar — y ningún script puede hacerlo por él (2FA exige un
dispositivo TOTP humano). Cualquier smoke test de Preview que dependa de
iniciar sesión como `preview-admin` empezará a fallar hasta que alguien lo
enrole a mano o se le cambie el rol.

### Mitigación / plan de salida

Decidir antes de desplegar: enrolar `preview-admin` con un TOTP de servicio
(alguien lo custodia), o bajarle el rol a uno no obligado. Ninguna de las dos
es responsabilidad del código.

---

## R-SEC-04 · `service_role_key` es el punto único de fallo del 2FA

**Fecha:** 2026-08-06
**Severidad:** Alta

Quien tenga la `SUPABASE_SERVICE_ROLE_KEY` puede retirar el segundo factor de
cualquier usuario —vía `scripts/mfa-break-glass.mjs` o directamente contra la
Admin API— sin pasar por ninguna confirmación de la aplicación. La
confirmación interactiva del script es una salvaguarda contra equivocaciones,
no una barrera de autorización: se salta trivialmente (`echo correo | node
...`), a propósito, porque el control real ya está en quién posee la clave.
No hay ningún control técnico que limite esto desde la aplicación — no puede
haberlo, por diseño de Supabase Auth.

### Mitigación / plan de salida

Si la `service_role_key` se filtra alguna vez, el 2FA obligatorio deja de
significar nada. La respuesta es **rotarla**, no endurecer el script.
Guardarla donde ningún proceso automático la lea nunca (fuera de CI, fuera de
logs). Documentado en `docs/security.md`.

---

## R-SEC-05 · El 2FA se aplica solo en el middleware

**Fecha:** 2026-08-06
**Severidad:** Media · diferido a otra iteración

Ninguna de las **125 rutas de API** ni las **6 acciones de servidor**
comprueban el nivel de garantía (AAL) por su cuenta — todas confían en que el
middleware ya bloqueó la petición antes de llegar. Si algún día una ruta
nueva se monta fuera del alcance del `matcher` del middleware (ver R-SEC-06),
esa ruta queda con el 2FA completamente apagado sin que nada lo señale.

### Mitigación / plan de salida

Por ahora, disciplina: toda ruta nueva de API/Server Action debe caer dentro
del `matcher`. Mitigación estructural (comprobar AAL en cada handler) queda
para una iteración aparte — no es parte de B-04.

---

## R-SEC-06 · El `matcher` del middleware deja pasar rutas con extensión de imagen

**Fecha:** 2026-08-06
**Severidad:** Baja hoy · trampa latente

El patrón del `matcher` excluye rutas terminadas en extensión de imagen
(p. ej. `/dashboard.webp` no ejecuta el middleware, ni el gate de 2FA ni el de
sesión). Hoy no es explotable porque no existe ninguna ruta comodín que sirva
contenido dinámico bajo esos sufijos. Se vuelve real el día que alguien añada
una ruta comodín (`/[...slug]`) que también sirva HTML/JSON.

### Mitigación / plan de salida

Vigilar en code review: cualquier ruta comodín nueva debe verificarse contra
el `matcher` antes de mergear. Endurecer el patrón es un cambio pequeño y
aislado si se prioriza.

---

## R-SEC-07 · `public.users.two_factor_enabled` no lo escribe nadie

**Fecha:** 2026-08-06
**Severidad:** Baja · confunde, no es agujero de seguridad

Ni el flujo de enrolamiento (`/perfil/seguridad`) ni el break-glass
(`scripts/mfa-break-glass.mjs`) tocan esta columna. Las pantallas de usuarios
la muestran como "2FA activo/inactivo", así que hoy **miente en las dos
direcciones**: puede decir "inactivo" con un TOTP verificado real, o "activo"
tras un break-glass que lo retiró.

### Mitigación / plan de salida

La fuente de verdad real es `auth.mfa_factors` (vía Admin API), no esta
columna. Corregirlo es una tarea aparte: escribirla desde los mismos dos
lugares que ya tocan el factor, o dejar de mostrarla y consultar
`auth.mfa_factors` directamente desde la pantalla.

---

## R-BACKUP-01 · Respaldo diario automático desactivado

**Fecha:** 2026-08-06
**Severidad:** Alta mientras siga así

`.github/workflows/backup.yml` está deshabilitado (`gh workflow disable`)
hasta que la versión endurecida del workflow (los mismos fixes que pasó
`dr-drill.mjs`: dump no destructivo por defecto, huella derivada del repo,
guarda de destino deny-by-default) llegue a `main`. Los secretos
`SUPABASE_DB_URL` y `BACKUP_GPG_PASSPHRASE` ya están configurados en el repo;
la passphrase vive en el Llavero
(`security find-generic-password -s dermaland-backup-gpg -w`). Mientras el
workflow siga apagado, **no hay respaldo automático corriendo** —el simulacro
de recuperación (B-01) prueba que un respaldo restaura, no que se esté
generando uno todos los días.

### Mitigación / plan de salida

Reactivar el workflow (`gh workflow enable`) en cuanto la rama con las
correcciones de esta tarea se fusione a `main`. Hasta entonces, backups
manuales si se necesita uno reciente.

---

## R-BACKUP-02 · PITR sigue sin existir (plan Free)

**Fecha:** 2026-08-06
**Severidad:** Alta para producción plena

El proyecto Supabase sigue en plan **Free** → sin *Point-in-Time Recovery*.
El simulacro de B-01 prueba que el respaldo lógico diario **restaura
completo**; no permite volver al minuto anterior a un borrado o corrupción —
el RPO real es "desde el último respaldo lógico", no "desde hace un
instante".

### Mitigación / plan de salida

Solo se resuelve con un upgrade a Supabase Pro (o superior). Mientras tanto,
el respaldo lógico diario (una vez reactivado, ver R-BACKUP-01) es el único
mecanismo de recuperación.

---

## R-FIS-01 · Reglas documentales POS sin política fiscal final confirmada

**Fecha:** 2026-05-07
**Severidad:** Alta para producción · Aceptable para MVP
**Archivos:** `apps/web/src/features/sales/document-resolver.ts`,
`apps/web/src/features/pos/pos-terminal.tsx`

La función `resolveDocumentToIssue` cristaliza las reglas:

| billingType       | paymentMethod                          | resultado          |
|-------------------|----------------------------------------|--------------------|
| consumo           | cash · transfer · paypal · manual · other | Proforma         |
| consumo           | card · azul · cardnet · visanet        | Factura e-CF 32   |
| credito_fiscal    | cualquiera                             | Factura e-CF 31   |

Las reglas son las acordadas en el pedido del 2026-05-07, pero **no han
sido validadas contra la política fiscal definitiva del negocio ni
contra la normativa DGII vigente al 100%**. Hay zonas grises:

- `consumo + transfer` → ¿siempre proforma o algunos negocios prefieren
  factura e-CF 32?
- `credito_fiscal + cash` → ¿factura siempre, o sólo cuando el cliente
  pide explícitamente comprobante fiscal?
- Procesadores específicos (Azul, CardNET, VisaNet) tratados como `card`
  para la decisión documental. Verificar si el reporte de cierre debe
  diferenciarlos.

### Mitigación / plan de salida

1. Antes de producción: revisión con la dueña del negocio + contador, y
   ajuste de reglas en `document-resolver.ts`.
2. La función es pura y testeada (`document-resolver.test.ts`); cualquier
   cambio se cubre añadiendo casos al test.
3. Cuando DGII se conecte de verdad, validar que la `sequenceType`
   devuelta cuadra con las secuencias configuradas en
   `apps/web/src/server/services/dgii/`.
4. Mientras tanto: el comprobante imprime "FACTURA e-CF 31/32" pero
   **sin número fiscal real** — el campo `ecfNumber` permanece vacío
   hasta que DGII esté activo.

---

## R-SEC-01 · Leaked Password Protection no disponible en plan Free

**Fecha:** 2026-05-29
**Severidad:** Baja-Media · Aceptable temporalmente para MVP/preview ·
**No aceptable para producción SaaS real**
**Dueño:** upgrade de plan antes de go-live.

- **Warning (Supabase Security Advisor):** Leaked Password Protection Disabled (Auth).
- **Causa:** la feature (chequeo de contraseñas filtradas contra
  HaveIBeenPwned, k-anonymity) está disponible **solo en Supabase Pro+**.
  No se puede activar por migración SQL ni en plan Free.
- **Impacto:** no hay protección adicional automática contra el uso de
  contraseñas ya filtradas en brechas conocidas. Resto de avisos del
  Advisor ya corregidos (ver migraciones 0008/0009 y
  `docs/estado-actual.md`).

### Mitigación temporal (mientras siga en Free)

1. **Exigir contraseñas fuertes** (mín. 12 chars, mayús/minús/número/símbolo
   — ya en política de `production-checklist.md` Auth P2).
2. **No reutilizar passwords** entre cuentas/entornos.
3. **Rotar credenciales seed** (p. ej. `PREVIEW_ADMIN_PASSWORD`) periódicamente
   y tras cada handoff.
4. **Activar MFA/TOTP** donde aplique (obligatorio para `admin`/`super_admin`).
5. **Upgrade a Supabase Pro** y activar el toggle en Authentication →
   Settings → Security **antes de producción SaaS real**.

> No se crean más migraciones por este warning: es config de plan, no de SQL.

---

## R-FIS-02 · Secuencia DGII / e-CF aún no integrada

**Fecha:** 2026-05-07
**Severidad:** Alta para go-live · Aceptable para MVP

El POS hoy persiste el `documentKind`, `ecfType` y `sequenceType`
indicados por el resolver, pero **no consume ninguna secuencia real de
e-CF** porque el módulo DGII está en stubs. Las "facturas" emitidas
desde POS son visualmente facturas pero sin número fiscal.

### Mitigación / plan de salida

- Materializar `sequenceType` en el repositorio de secuencias
  (`apps/web/src/server/services/dgii/`) — incrementar y persistir el
  número antes de cerrar la venta.
- Sincronizar con la tabla `dgii_sequences` (Supabase) cuando esté
  activa.
- Hasta entonces, comunicar a usuarios: "los documentos marcados como
  FACTURA en pantalla aún no son fiscalmente válidos — ver
  `docs/dgii-setup.md`".

---

## Proformas en `localStorage` (MVP)

**Fecha:** 2026-05-07
**Severidad:** Alta para producción · Aceptable para MVP

Las proformas se persisten en `localStorage` bajo la key
`dermaland.proformas`. Mientras eso siga así:

- Las páginas de impresión (`/proformas/[id]/print`) **dependen del
  navegador local**: una proforma emitida en un dispositivo no se puede
  imprimir desde otro, ni desde otro perfil del mismo navegador.
- El servidor no puede pre-renderizar el ticket — la página debe diferir
  el render al cliente con el patrón `mounted` (ver
  [decisiones.md](./decisiones.md)) para evitar hydration mismatch.
- Vaciar caché / cambiar de navegador / modo incógnito = pérdida de datos.
- No hay aislamiento por `business_id`: cualquier proforma local es
  visible para cualquier sesión en ese navegador.

### Mitigación / plan de salida

En producción las proformas deben cargarse desde Supabase, filtradas por
`business_id` (y `branch_id` cuando corresponda), con RLS para que cada
negocio sólo vea las suyas. La ruta de impresión pasará a:

1. Consultar `proformas` en un Server Component o Route Handler usando el
   cliente Supabase server-side.
2. Renderizar el ticket directamente en SSR (sin patrón `mounted`).
3. Mantener `localStorage` sólo como caché optimista para el POS offline.

Mientras tanto, comunicar a usuarios que **el ticket sólo se puede imprimir
desde el navegador donde se emitió la proforma**.

---

## Riesgos cerrados

## R-BACKUP-00 · Restauración de backup nunca probada (B-01) `[CERRADO 2026-08-06]`

**Fecha de apertura:** 2026-07-12 (bloqueador B-01 de
`docs/production-readiness-report.md`)
**Cierre:** `scripts/backup/dr-drill.mjs` restauró producción real en un
arenero efímero y comparó 7 dimensiones sin diferencias (98 tablas, 5.900
filas, 106 políticas, 0 errores). Verificado con 5 sabotajes distintos, los 5
detectados; sobrevive a un `SIGKILL` real del proceso local (autodestrucción
en 35 s). Detalle: `docs/dr-drill-20260805.md`,
`.superpowers/sdd/2026-08-05-cierre-pendientes-produccion/task-7-report.md`.
**No cerrado por esto:** el respaldo diario automático (`R-BACKUP-01`, arriba)
y PITR (`R-BACKUP-02`, arriba) siguen abiertos — son riesgos distintos al de
"¿un respaldo restaura de verdad?", que es lo que esta entrada cerraba.

## R-SEC-00-MFA · Ninguna cuenta admin con 2FA — código `[CERRADO EN CÓDIGO 2026-08-06]`

**Fecha de apertura:** 2026-07-13 (bloqueador B-04 de
`docs/production-readiness-report.md`)
**Cierre parcial:** 2FA obligatorio para `admin`/`super_admin`/
`is_platform_admin` implementado, con `scripts/mfa-break-glass.mjs` probado
16/16 contra Supabase real. Durante el trabajo se cerraron un bypass completo
del 2FA y tres formas de encierro. **Sigue sin desplegar** — el enforcement no
está activo en producción. No se marca `[CERRADO]` sin calificar porque el
riesgo original ("ninguna cuenta admin tiene 2FA") sigue siendo cierto en
producción hoy: `auth.mfa_factors` está vacía. Pendientes exactos y en orden
no negociable (spec §6.2) en `docs/proximos-pasos.md`. Riesgos nuevos que
aparecieron al construirlo: `R-SEC-02` a `R-SEC-07`, arriba.
