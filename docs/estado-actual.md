# Estado actual — DermaLand

> Snapshot de qué está hecho. Actualizar al cerrar cada cambio
> importante. Léelo después de `CLAUDE.md` y `PROJECT_MEMORY.md`.

**Última actualización:** 2026-09-08

## 2026-09-08 · El panel, medido de verdad (peticiones 13 → 7)

- **El problema.** El dueño pidió «optimizar la carga» seis veces. Mis tres primeras
  explicaciones fueron **falsas**: el tamaño del JSON (Vercel lo comprime con brotli,
  3,5 MB → 320 KB), un índice que faltaba (con él quedó **más lento**: 190 ms vs 110 ms)
  y las consultas del histórico (las cinco juntas cuestan ~300 ms de trabajo real).
- **Qué se hizo primero: medir.** `Server-Timing` en el middleware y en `/api/ventas`.
  En producción, en caliente: middleware 114 ms · sesión 47 ms · contexto 39-86 ms ·
  base 653 ms → 738 ms de servidor. **En frío la base sola tarda 3 883 ms.**
- **Los «3 segundos» son el arranque en frío**, no el trabajo. Cuantas menos funciones
  sin servidor arranquen a la vez, menos frío se paga.
- **Peticiones del panel: 13 → 7.**
  - `?vista=` acepta una LISTA: el resumen, el listado y los desgloses van en UNA
    petición (antes tres, con exactamente los mismos filtros).
  - El resumen de inventario ya no se pide dos veces (una iba con `sucursales=` vacío y
    la contestaba un 503; la buena empezaba en el ms 885 en vez del 552).
- **Un viaje de sesión menos.** `authorizeRole` ya devuelve la sesión; `/api/ventas`
  llamaba después a `getRepoContext()`, que se la volvía a pedir a Supabase Auth.
  🔴 Quedan **48 rutas** con el mismo doble viaje.
- **Un viaje de base menos.** `panel_ventas_unificadas` devuelve el resumen y todos los
  desgloses en una sola llamada. **No recalcula nada**: llama a las dos funciones que ya
  existían, con los mismos parámetros. Mientras la migración no esté aplicada, el
  repositorio cae al camino de siempre — solo ante «la función no existe».
- **Pendiente del dueño:**
  ```
  node scripts/db/apply-migration.mjs supabase/migrations/20260909150000_panel_ventas_unificadas.sql --apply
  node scripts/db/verificar-panel-ventas.mjs
  ```
  El verificador compara los dos caminos contra la base real y falla si difieren.

## 2026-09-06 · Las ventas de Alegra, integradas al sistema (v0.146.0)

- **El problema.** El panel decía RD$0.00 teniendo RD$48 millones migrados. Las 14 965
  facturas de Alegra viven en sus propias tablas —decisión consciente de la migración,
  para no mezclar el historial fiscal de un sistema con las ventas del otro— y las
  pantallas principales solo miraban `proformas`, que está vacía porque DermaLand
  todavía no ha cobrado nada por su propio punto de venta.
- **Qué se hizo.** Se corrige el efecto, no la decisión: **los datos siguen separados en
  la base y se unen al leerlos.** No se copió ni se modificó una sola factura, y no se
  insertó nada en `proformas`.
- **Dónde se ven ya.** Panel, reportes de ventas (con desglose por vendedor, forma de
  pago y producto), ficha del cliente y cuentas por cobrar. Cada fila lleva su etiqueta
  **«Migrada de Alegra»**, y lo migrado se ve pero no se toca: no se edita ni se cobra.
- **Rendimiento.** El panel descargaba 12 358 filas y ~3 MB para enseñar cuatro números.
  Ahora los totales se calculan en la base y viajan hechos. Las tres rutas de listado que
  no tenían tope ya lo tienen, aplicado en el repositorio y no solo en la ruta.
- **Vendedores del histórico.** Desteny Reynoso 5 513 · Laura Mejía 1 027 · Darío 6 ·
  Oficina 8 197 (las de mostrador sin vendedor). Oficina no es una persona y no cobra
  comisiones.
- **Cuadre verificado contra producción:** 14 743 ventas · RD$48 454 899,08, al céntimo.
- **Pendiente del dueño:** aplicar las tres migraciones en orden y correr el relleno de
  vendedores. Hasta entonces, las tarjetas del histórico enseñan un aviso ámbar visible,
  nunca un cero disfrazado.

## 2026-09-06 · DermaLand prepara y firma un comprobante fiscal (v0.145.0, fase 3A)

- **Qué hace ya.** Construye un e-CF con los datos del negocio, lo valida contra el
  **XSD oficial de la DGII**, lo firma con el certificado, verifica la firma, lo guarda
  en el bucket privado `dgii-xml`, y consume un **e-NCF real** de la secuencia. Todo
  probado de extremo a extremo con un certificado autofirmado generado en memoria.
- **Qué NO hace.** No envía nada a la DGII, y ninguna prueba abre una conexión. Eso es
  la fase 3B, que ya tiene plan escrito.
- **Cómo se sustituyó la transacción de agendapp.** agendapp reserva el número dentro
  de la transacción que también firma; DermaLand no abre transacciones desde el servidor
  web. Aquí se mira el número sin consumirlo, se firma fuera, y se consume comprobando
  bajo bloqueo que sigue siendo el nuestro. Un fallo al firmar no quema un número.
- **Dónde vive.** `apps/web/src/features/dgii/services/`, no en `server/services/dgii/`
  como decía el diseño: ese directorio lo ocupa el módulo viejo, que tiene un cron diario
  vivo hasta la fase 8.
- **Dos fallos Críticos que encontró la revisión final de la rama**, y que ninguna de las
  siete revisiones por tarea pudo ver:
  1. Faltaba `IndicadorMontoGravado`. El XSD lo declara opcional, así que la validación
     pasaba; la DGII lo exige. Cada ticket con ITBIS habría quemado un número fiscal a
     declarar anulado. agendapp ya lo había arreglado y el portado se saltó esa línea.
  2. Un rechazo de `prepare_ecf_invoice` consumía el número y se iba sin dejar rastro:
     factura en `draft` sin motivo, XML huérfano en el bucket, cero registros.
- **La lección que deja:** el XSD no es la red que parecía. Valida la forma del documento,
  no lo que la DGII exige de verdad. Un campo opcional en el esquema puede ser obligatorio
  en la práctica, y eso solo está escrito en los módulos portados.
- **Riesgos abiertos:** `R-FIS-04` (el hash del XML no se persiste), `R-FIS-05` (el crédito
  fiscal —tipo 31— falla por falta de la fecha de vencimiento de la secuencia; es lo
  primero de la fase 4), `R-FIS-06` (barrido de facturas `draft` huérfanas), `R-FIS-07`
  (el cambio de certificado no es atómico), `R-FIS-08` (RFCE sin llamador, con su punto
  de inserción anotado).
- Typecheck ✓ · 961 pruebas del módulo ✓ · build ✓ · agendapp intacto.

## 2026-09-06 · Base de datos de la fase 2 portada desde agendapp (v0.144.0, fase 2 de 9)

- **Por qué.** La fase 1 trajo el núcleo puro (construcción de XML, firma,
  validación) pero no tenía dónde vivir: le faltaban las tablas y las
  funciones que reservan un e-NCF y guardan la factura. Esta fase las trae.
- **Qué entra** (18 tablas, todas con RLS por
  `(select public.auth_business_id())`):
  `dgii_settings`, `dgii_certificates`, `ecf_sequences`,
  `electronic_invoices`, `electronic_invoice_items`, `dgii_submissions`,
  `dgii_status_logs`, `dgii_enablement_progress`,
  `dgii_representative_attestations`, `received_ecf`,
  `received_commercial_approvals`, `dgii_certification_datasets`,
  `dgii_certification_cases`, `dgii_simulation_ranges`,
  `dgii_certification_applications`, `dgii_certification_events` y
  `dgii_certification_evidence` — y `ecf_document_events`, la decimoctava, que
  NO viene de agendapp. Copia fiel del DDL de agendapp con siete sustituciones
  mecánicas (el detalle está en el plan de la fase).
  `reserve_next_encf` se portó tal cual; cuatro funciones son nuevas:
  `peek_next_encf`, `prepare_ecf_invoice`, `finalize_ecf_invoice`,
  `fail_ecf_invoice`.
- **Lo que NO viene de agendapp y está aquí a propósito.** La migración `0045`
  de esta casa añadió a `electronic_invoices` ocho columnas
  (`idempotency_key`, `retry_count`, `next_retry_at`, `last_error_class`,
  `last_error_message`, `hash_sha256`, `rejected_at`, `cancelled_at`), el
  índice único que es LA barrera contra gastar dos veces el mismo e-NCF, y la
  tabla `ecf_document_events` con su disparador append-only. La primera
  versión de esta rama las descartó todas —la auditoría de fidelidad contra
  agendapp no podía verlo, porque allá nunca existieron— y las devolvió la
  revisión final. Las lee y las escribe código vivo: `queue-worker.ts`,
  `dashboard.ts` y `transitions.ts`.
- **Los índices reintroducidos llevan nombres NUEVOS a propósito.**
  `alter table … rename to` no renombra los índices: la tabla retirada
  conserva los nombres que `0045` les puso, y `create index if not exists` con
  esos mismos nombres se los salta con un simple NOTICE. Reusarlos habría
  dejado la tabla nueva sin barrera de idempotencia, en silencio.
- **Guarda de orden.** Las partes 2 y 3 se niegan a correr si la parte 1 no
  está aplicada. Antes eso era una frase en la cabecera y nada lo obligaba: la
  parte 2 no habría creado las ocho tablas cuyo nombre ocupa el módulo viejo y
  habría reportado éxito.
- **Qué se retira, sin borrar.** Las 13 tablas del módulo fiscal viejo, que
  nunca emitió un comprobante: se renombran a `*_legacy_20260906`, no se
  borran. Los 4 certificados que tenían (3 revocados) no se migran; el dueño
  vuelve a subir el `.p12` por la pantalla nueva en la fase 6.
- **La desviación de agendapp, y por qué.** Allá, reservar el número y firmar
  el XML ocurren en la misma transacción de Prisma: si algo revienta, no se
  consume nada. DermaLand no puede abrir una transacción desde el servidor
  web, así que se firma primero — con el número que dice `peek_next_encf`,
  sin consumirlo — y se reserva después, comprobando bajo bloqueo que el
  número sigue siendo el nuestro (`prepare_ecf_invoice`). Un fallo al firmar
  ya no quema un número fiscal; el costo es que, si dos cajas cobran a la
  vez, una firma dos veces. Detalle completo y alternativa descartada en
  `docs/decisiones.md`.
- **`prepare_ecf_invoice` no levanta ninguna excepción propia**, a propósito:
  `reserve_next_encf` quedó como la única fuente de los códigos `P0002` (sin
  secuencia), `P0003` (vencida) y `P0004` (agotada), para no tener la misma
  lógica en dos sitios. También en `docs/decisiones.md`.
- **Esta fase NO toca el punto de venta:** ni la numeración, ni el cobro, ni
  el cierre de caja. Las claves foráneas de `proformas` y `cash_closing_sales`
  se soltaron y se recrearon apuntando a las tablas nuevas, sin que la
  aplicación lo note. Comprobado por dos vías independientes: ninguna función
  del POS (`emit_sale_atomic`, `void_sale_atomic`, `reserve_invoice_number`,
  `next_proforma_number`) toca las 13 viejas ni las 18 nuevas, y no hay un
  solo disparador sobre `proformas`, `proforma_items`, `proforma_payments`,
  `cash_closings`, `cash_closing_sales` ni `cash_register_sessions`.
- **Pero SÍ cambia el comportamiento de la aplicación.** La frase que estaba
  aquí antes —«esta fase NO cambia el comportamiento de la aplicación: no toca
  el punto de venta ni ninguna pantalla»— era FALSA en su segunda mitad, y
  llevaba escrita en esta memoria desde el 2026-09-06. Al aplicar las
  migraciones:
  - dejan de funcionar las pantallas `/dgii/configuracion`,
    `/dgii/certificado`, `/dgii/estado` (que está en la barra lateral) y
    `/dgii/habilitacion`, más `/api/dgii/certificate/current` y
    `/api/dgii/certificate/test-local`;
  - **el cron diario `/api/dgii/cola` (`0 7 * * *`, declarado en
    `vercel.json`) se queda sin trabajo** hasta que la fase 3 reconecte el
    módulo nuevo. Ese cron está VIVO en producción: el killswitch
    `DGII_TESTECF_SEND_ENABLED` gatea sólo `enviar` y `consultar`; `validar` y
    `firmar` corren siempre, y el otro juego de killswitches
    (`features/dgii/core/killswitches.ts`) todavía no tiene ningún llamador.
  Mientras el dueño no aplique las tres migraciones, la base sigue igual que
  hoy y no cambia nada.
- **Hasta la fase 6 no habrá pantalla capaz de subir un `.p12`.** Los 4
  certificados quedan en `dgii_certificates_legacy_20260906` y ninguna
  migración los copia. La recuperación que decía el plan —«el dueño vuelve a
  subir el `.p12` por la pantalla nueva»— es circular mientras tanto, porque
  la pantalla de subida actual (`server/services/certificate-storage.ts`)
  escribe cuatro columnas que la tabla nueva no tiene:
  `pkcs12_storage_bucket`, `pkcs12_storage_path`, `iv` y `tag` (la nueva usa
  `storage_bucket` / `storage_path` y no tiene sitio para el IV ni el tag del
  sobre AES-256-GCM). Entre aplicar y la fase 6 no hay forma de poner un
  certificado.
- **Corregido antes de fusionar (2026-09-06), tras la revisión final de la
  rama.** Dos hallazgos críticos que ninguna revisión por tarea podía ver —el
  CHECK de `status` sin `'prepared'`, y el descarte de la migración `0045`—,
  cuatro importantes y ocho menores. Hallazgo por hallazgo, con la evidencia
  de las pruebas en rojo y en verde, en
  `.superpowers/sdd/2026-09-05-dgii-fase2-base-de-datos/correccion-final-report.md`.
- **Validado antes de documentar:** typecheck ✓ (0 errores) · suite completa
  ✓ · build ✓. Las tres migraciones se probaron en dry-run, en orden, sin
  ejecutar nada, **y además se aplicaron de punta a punta contra un Postgres
  16 efímero en Docker**, con el estado «antes» reconstruido (las 13 tablas
  viejas con sus nombres de índice reales): las dos guardas de orden muerden,
  quedan 13 retiradas y 18 vivas con RLS y política, los índices caen sobre
  las tablas nuevas, la barrera de idempotencia rechaza el duplicado y el
  verificador pasa entero sin dejar una fila. Contra la base REAL no se ha
  ejecutado nada.
- **Deuda conocida: el porte llegó fiel a junio/julio de agendapp y se saltó
  lo que evolucionó allá después.** Nada de esto bloquea la fase 2; queda aquí
  y no sólo en un diario, para que las fases siguientes no lo redescubran:
  - **`electronic_invoices.reference_e_ncf`** (agendapp
    `20260710_dgii_invoice_note_reference.sql`). La fase 1 ya trajo
    `core/note-reference.ts` y `core/nota-que-modifica.ts`, los dos construidos
    sobre esa columna. `note-reference.ts:34-41` detecta su ausencia y degrada
    con un WARNING en vez de reventar, pero las notas 33/34 quedan **sin enlace
    persistido** al comprobante que modifican y **sin el tope** que impide que
    una nota de crédito supere el total del original.
  - **Dos disparadores de auditoría de PII sin portar:**
    `audit_dgii_pii_change()` + `trg_dgii_cert_pii_audit` +
    `trg_dgii_settings_pii_audit` (agendapp
    `20260609_dgii_phase2_core_tables.sql:337-380`, corregido en
    `20260701_fix_dgii_pii_audit_trigger_entity_id_uuid.sql`). Activar o
    revocar un certificado, y cambiar `rnc_emisor` / `ambiente` /
    `dgii_enabled_real_send`, dejan de dejar rastro a nivel de base.
  - **`dgii_settings.b2b_receive_token_hash`** y su índice único parcial
    (agendapp `20260707_dgii_b2b_received_ecf.sql:83-86`). Importa porque
    `received_ecf` **sí** se portó, y ese hash es lo que autentica su endpoint
    público. Fase 7.
  - **`dgii_certification_datasets`:** se portó el índice único **superado**
    (por `dataset_sha256`), no el que agendapp lo reemplazó incluyendo
    `purpose` (`20260722_dgii_certification_dataset_purpose.sql`). Se reimporta
    una colisión ya arreglada allá. Faltan también la columna `purpose` en las
    dos tablas de certificación y el valor `'acecf'` en el CHECK de `kind`
    (`20260721_dgii_certification_kind_acecf.sql:19-24`).
- **Deuda del repositorio de secuencias:** `dgii-sequences.ts` no sigue el
  patrón de la casa (`RepoContext` + `getClient`, `SupabaseRepositoryError`) y
  recibe un `SupabaseClient` sin tipar. No bloquea esta fase porque nadie lo
  llama; **átalo a la fase 3, antes de que haya llamadores**, junto con la
  regeneración de `database.types.ts` (que hoy describe el esquema viejo y no
  conoce las cinco RPC nuevas).
- **Pendiente (lo hace el dueño, no esta tarea):** aplicar las tres
  migraciones con `scripts/db/apply-migration.mjs --apply`, correr
  `scripts/db/verificar-dgii-fase2.mjs` y `scripts/audit-migrations.mjs`, y
  cobrar una venta de prueba en efectivo y otra con tarjeta para comprobar
  que el punto de venta sigue funcionando con las claves foráneas recreadas.
- `~/Projects/agendapp` se trató como solo lectura: `git status` de
  `src/lib/dgii`, `docs/dgii` y `prisma` quedó en cero ficheros modificados.

## 2026-09-05 · Núcleo fiscal DGII portado desde agendapp (v0.143.0, fase 1 de 9)

- **Por qué.** El módulo fiscal que DermaLand tenía (~27 700 líneas) nunca emitió
  un comprobante, ni al ambiente de pruebas, y su propia documentación lo
  declaraba «no apto». El de agendapp está certificado ante la DGII desde el
  28 de julio y facturando en producción desde agosto. El dueño aprobó portarlo
  entero y retirar el viejo.
- **Qué entró** (`apps/web/src/features/dgii/core/`): 40 ficheros de núcleo,
  5 constructores auxiliares (`builders/`) y los 14 XSD oficiales con su
  `SOURCE.md`. Construcción del XML de los 10 tipos de e-CF, reglas fiscales
  (RFCE, ITBIS, indicador de monto gravado, notas que modifican), firma XMLDSig,
  validación contra XSD sin red, cliente DGII con transporte inyectable, máquina
  de estados, killswitches y representación impresa. Copia literal: no hubo que
  reescribir un solo import de agendapp, porque esos ficheros no importaban nada
  de su aplicación.
- **Pruebas.** 45 ficheros portados. **607 pasan, 0 fallan.** Suite completa de
  DermaLand: 3 591 pruebas ✓ · typecheck ✓ · build ✓.
- **132 pruebas en espera, no escondidas.** Son guardas de arquitectura que
  vigilan servicios, rutas API y pantallas de las fases 2 a 9. Cada una lleva
  encima la fase que la revive y el fichero que le falta; el índice completo
  está en [`docs/dgii/pruebas-pendientes-por-fase.md`](dgii/pruebas-pendientes-por-fase.md).
  Las que más esperan: `submission-service.ts` (19), `estado-veredicto.ts` (7),
  `invoice-prepare.ts` (6).
- **Dos adaptaciones**, ambas en `core/__port__/`: un traductor de rutas
  (agendapp guarda el módulo en `src/lib/dgii/`, DermaLand en
  `src/features/dgii/core/`) y el generador de certificados autofirmados en
  memoria — no entra ni un certificado real al repositorio.
- **Riesgo conocido para la fase 6:** los XSD se leen del disco en ejecución.
  Cuando existan las rutas API habrá que declararlos en `next.config.ts`
  (`outputFileTracingIncludes`) o Vercel no los empaquetará y el validador
  fallará en producción. La guarda que lo vigila ya está portada y marcada.
- **Esta fase NO cambia el comportamiento de la aplicación**: no toca el punto de
  venta, ni rutas, ni pantallas, ni la base de datos. El módulo viejo sigue
  funcionando; se retira en la fase 8.
- **La certificación no se hereda:** DermaLand SRL tendrá que hacer su propio
  trámite de 15 pasos ante la DGII.
- `~/Projects/agendapp` se trató como solo lectura: `git status` de `src/lib/dgii`
  y `docs/dgii` quedó en cero ficheros modificados.

## 2026-09-05 · La sincronización con Alegra corre sola y se ve en pantalla (v0.142.0)

- **Trabajo diario** `.github/workflows/alegra-sync.yml`: cron 10:00 UTC =
  06:00 RD, timeout 45 min, disparo manual con alcance/entidades/simulación,
  comprobación de secretos y de credenciales antes de escribir, reporte como
  artefacto. Las entradas del disparo manual NO se interpolan en el `run`
  (inyección) y se validan contra lista blanca.
- **Cuatro pantallas nuevas:** Administración → Integración con Alegra (estado,
  historial y botón «Sincronizar ahora»), ficha del cliente → pestaña «Compras
  en Alegra», Reportes → Ventas en Alegra (rango, sucursal, vendedor, forma de
  pago, productos, día a día) y Cuentas por cobrar → Saldos en Alegra.
- **Cómo se dispara desde la app:** `POST /api/alegra/sync` NO sincroniza; pide
  a GitHub Actions que corra el workflow, así el token de Alegra nunca vive en
  el servidor web. Roles: leer el historial casi todos; disparar solo
  admin/manager/super_admin.
- **Motor de agregados PURO** (`features/alegra/sales-report.ts`, 12 pruebas):
  las facturas anuladas quedan fuera de todos los totales y se cuentan aparte.
  Consultas con RLS y paginación siempre. Typecheck ✓ · 2 977 pruebas ✓ · build ✓.
- **Verificado contra producción:** 468 facturas en los últimos 30 días por
  RD$1 874 669,80; 20 facturas con saldo por RD$27 207,53, la más antigua de
  2025-01-09; un cliente con 172 compras.
- **Falta configurar (acción del dueño):** los cuatro secretos del repositorio
  para el trabajo diario y `GITHUB_ACTIONS_TOKEN` en Vercel para el botón. Ver
  `docs/alegra-sync.md`.

## 2026-09-05 · MIGRACIÓN COMPLETA desde Alegra + sincronizador (v0.141.0)

- **Autorizado por el dueño** («migra todo los datos de cliente y producto
  ventas y todo lo relacionado», «dale», «sigue con el stock y las facturas»).
  Decisiones suyas: Alegra manda y DermaLand solo lee; las facturas van a
  tablas propias sin mezclarse con POS/tienda; el stock se iguala a diario; los
  clientes se emparejan por teléfono/correo/documento, nunca por nombre.
- **En producción hoy:** 6 524 clientes (6 523 enlazados a Alegra) · 1 509
  productos (1 487 enlazados) · 1 proveedor · **14 965 facturas** y **31 213
  líneas** desde 2023-02-01 · stock Principal 2 609 y Villa Olga 1 407.
  Verificado por vía independiente: 0 líneas sin producto, 1 factura sin
  cliente (su contacto ya no existe en Alegra, conserva el nombre), 0 NCF
  repetidos, 20 facturas con saldo y 222 anuladas.
- **Cuatro fallos encontrados AL CORRERLO, todos con prueba de regresión:**
  (1) el ITBIS es por ítem, no 18 % fijo — habría inflado 273 precios;
  (2) la paginación de Alegra pierde y repite si no se ordena por `id` — la
  lectura de ítems daba 1 486 de 1 487; (3) el corte por límite llega como
  HTTP 400 y el tope real es 100/min; (4) 40 contactos tienen `type: []` y sí
  facturan. Además se respetan los índices únicos de DermaLand (código de
  barras y documento).
- **Pendientes:** Isispharma Secalia Ato Shower Cream 200 ML no tiene lote en
  Principal, así que el stock no puede crearlo en Villa Olga (recibirlo a mano
  una vez). 7 productos con el código de barras en conflicto, en
  `backups/alegra-sync-*/productos-conflictos-codigo.json`. Falta el plan 2:
  trabajo diario en GitHub Actions, botón «Sincronizar ahora» y pantallas
  (compras del cliente, reporte de ventas, saldos).

## 2026-09-05 · «Reintentar no encontrados» en el conteo físico (v0.140.0)

- El dueño preguntó si podía «reintegrar los no encontrados como encontrados»
  tras el arreglo UPC-A. Los eventos `not_found` guardan el código en la sesión
  local (`scan-session-store`), así que sí: `pendingNotFoundCodes` +
  `recoverNotFoundScans(id, Map<código, Product>)` suman +1 por escaneo
  recuperado (mismo `addUnit` que `applyScan`), crean el evento resuelto y
  marcan el viejo con `recoveredAt` (idempotente). Botón en
  `conteo-fisico/[id]/escanear` bajo los contadores, visible solo si hay
  pendientes; resuelve con `findProductByCode` y el respaldo del servidor, y
  encola cada recuperado con `persistirEscaneo`. Typecheck ✓ · tests ✓ · build ✓.

## 2026-09-05 · Escáner del conteo físico: «no encontrado» con códigos UPC-A (v0.139.3)

- **Síntoma:** «Elta MD UV Sport está en el inventario pero al escanear en
  conteo físico dice no encontrado». El producto existía (`DERM-I00427`, código
  `0390205022878`). **Causa:** la cámara (`BarcodeDetector`, formato `upc_a`)
  devuelve 12 dígitos (`390205022878`); `findProductByCode` y el POS comparaban
  con `===`. **113 productos** del catálogo tienen el código en esa forma
  (EAN-13 con cero delante = UPC-A rellenado); 0 colisiones al quitar el cero.
- **Arreglo:** `features/products/barcode-match.ts` (`barcodeVariants`,
  `sameBarcode`, `findByBarcodeOrSku`) + uso en `scan-session-store.ts`
  (conteo) y `pos-terminal.tsx` (cámara del POS). `product.byBarcode` del
  repositorio sigue exacto: no tiene llamadores. Typecheck ✓ · tests ✓ · build ✓.
- **Pendiente relacionado:** el formulario de producto guarda el código tal
  cual se teclea/escanea (12 o 13 dígitos), así que la restricción única no
  detecta el mismo código en las dos formas. Normalizar a EAN-13 al guardar
  queda como mejora.

## 2026-09-05 · Inventario MIGRADO completo desde Alegra (referencia `ALEGRA-20260905-1409`)

- **Autorizado por el dueño** («migra el nuevo stock», «crea los productos»,
  «ejecuta»). Respaldo previo: `backups/20260905*` (57 tablas, 4 703 filas).
- **Aplicado con `scripts/migrar-inventario-alegra.mts --apply`** (v0.139.2):
  3 productos renombrados · **91 productos creados** (`DERM-000602`…`000692`) ·
  74 lotes iniciales en Principal (317 uds, vencimiento provisional
  **2027-09-05**, `AJU-ALEGRA-20260905-1409`) · Principal: 333 ajustes ·
  Villa Olga (Cutis): 512 ajustes, **510 lotes nuevos** heredando el vencimiento
  de Principal · 907 movimientos · **0 fallos**.
- **Verificación (dos vías: el script y un comparador aparte):** 1 408/1 408
  productos cuadran con el archivo; stock final **Principal 2 619 uds · Villa
  Olga 1 438 uds**; catálogo 1 446 productos; 0 lotes negativos.
- **Deuda que deja (decisión de negocio, no de código):** (1) 7 productos nuevos
  con precio 0 porque Alegra trae costo «1» de relleno (Total Eye Deep, Total
  Brush Tan, Sunforgettable Tan, Total Balm Golden Hour, Lip Shine Savanna,
  Clorexin 4 % Espuma, Elta MD UV Restore Mini) — el POS no los vende hasta que
  tengan precio; (2) los 74 lotes iniciales y los 510 de Villa Olga tienen
  vencimiento heredado/provisional, no real; (3) la fila 577 del archivo
  («Guantes de tela», −1) sigue en negativo en Alegra; (4) 31 productos nuevos
  sin marca reconocida por el parser.
- Movimientos en *Inventario → Movimientos* con motivo «Importación Alegra
  ALEGRA-20260905-1409» y usuario «Dario (script migración Alegra)».

## 2026-09-05 · Importador de Alegra roto desde el 19/08 por el renombre de la sucursal (v0.139.1)

- **Síntoma:** el dueño cargó «Alegra - Valor de inventario - 05-09-2026» y
  «hay productos que no cuadran». **Causa 1 (código):** la segunda sucursal se
  renombró de «Dermaland Cutis» a «Dermaland  Villa Olga» el 2026-08-19 17:13
  UTC (nombre público «Cutis»); `pickImportBranches` buscaba «cutis» en el
  nombre → el preview devolvía 400 «No se encontró la sucursal "Cutis"». No hay
  ningún movimiento `ALEGRA-*` posterior al 03/08: **ninguna importación se
  aplicó desde entonces.** Arreglo: la segunda sucursal es la única otra
  sucursal activa (preferencia por «Cutis» si hay varias). Test de regresión
  con el nombre real. Typecheck ✓ · tests ✓.
- **Causa 2 (datos, NO es bug):** comparación del archivo contra producción
  (solo lectura, `service_role`): 1 414 filas; 732 cuadran; **94 filas sin
  producto en DermaLand** (77 con stock, 404 unidades, ~RD$292 mil a costo; 67
  de ellas están al final del archivo = creadas en Alegra después de la carga
  del 01/08); **3 son el mismo producto con otro nombre** (Bella Aurora
  Repigment 12 · Sesderma Azelac RU Gel · Uriage Crema Lavante 500 ML);
  **Cutis/Villa Olga tiene 0 lotes en DermaLand** (Alegra dice 1 438 unidades)
  y **Principal se desfasó desde el 01/08** (334 productos difieren, neto +3
  unidades: 158 con más en Alegra, 176 con más en DermaLand). El importador
  corrige 2 y 3 al aplicarse; 1 exige crear los productos en el catálogo.
- **Archivo:** 1 fila negativa (fila 577, «GUANTES DE TELA MEDIEUM», −1), 5
  nombres duplicados (el importador los suma), 3 productos «Inactivo» en
  Alegra con stock (ALERCET 10 MG = 20 unidades; el importador ignora el
  estado y los importa igual).
- **Pendiente del dueño:** revisar `~/Downloads/DermaLand - productos que no
  cuadran - 05-09-2026.xlsx`, crear/renombrar los productos faltantes, exportar
  de Alegra otra vez justo antes de importar (el archivo del 05/09 09:28 ya no
  refleja ventas posteriores) y aplicar desde *Inventario → Importar*.

## 2026-08-19 · B-04 CERRADO DEL TODO: drill de break-glass PASADO con el dueño

- **Descubierto al verificar:** el enforcement de 2FA obligatorio YA estaba
  fusionado en `main` y desplegado (la rama `feat/cierre-pendientes-produccion`
  quedó dentro de `main`), y el dueño YA tenía su 2FA enrolado. La nota "sin
  desplegar" estaba vieja.
- **Drill spec §6.2 ejecutado con el dueño presente (autorizado):**
  `scripts/mfa-break-glass.mjs` retiró su factor real (auditoría
  `user.mfa_break_glass` registrada) → entró solo con contraseña → el
  enforcement lo forzó a re-enrolar en `/perfil/seguridad` → factor nuevo
  `verified` comprobado en `auth.mfa_factors`. **Sin encierro en ningún paso.**
- Cuentas admin hoy: el dueño (2FA ✓) y `preview-admin@dermaland.do`
  (0 factores — el enforcement la obligará a enrolar al entrar).
- **Con esto, B-01/B-02/B-03/B-04/B-05/B-06/B-07 están TODOS cerrados.** Lo
  único pendiente del informe es catalogación (decisión de negocio): 338
  productos sin laboratorio y 79 laboratorios sin `min_shelf_life_days`.

## 2026-08-19 · B-07 CERRADO DEL TODO: los 14 archivos registrados

- **Autorizado por el dueño** ("finaliza lo pendiente"). Antes de registrar,
  los 5 INDETERMINADA se verificaron contra los DATOS reales de prod:
  0016 seed (92 laboratorios ✓), 0017 backfill (1019 productos con lab ✓),
  0021 rol vendedor (CHECK + default en users.id ✓), 0044 teléfonos (0 sin
  formato ✓), 0009 init-plan (52 policies con `(select auth_business_id())` ✓).
- Los 14 se registraron en `supabase_migrations.schema_migrations` con su
  prefijo de archivo como versión (`0007`…`0044`), statements vacíos (igual
  que `supabase migration repair`) y `created_by = repair-20260819-b07`.
- **Re-auditoría: «Archivo sin registro: 0».** Queda 1 caso documentado como
  cosmético: la fila histórica `transfer_stock_atomic (20260716203746)` es la
  MISMA función que `0032_transfer_atomic.sql` — el diff verificado es solo
  comentarios y tildes en mensajes; el `prosrc` de producción coincide byte a
  byte con la fila histórica. Nada que aplicar.

## 2026-08-19 · El respaldo diario ESTÁ ACTIVO y en verde (verificado)

- La nota de 2026-08-06 ("el cron diario sigue DESACTIVADO") quedó vieja: el
  `backup.yml` endurecido (pg_dump 17 vía PGDG) está en `main`, el workflow
  figura **active** y las corridas diarias de `schedule` llevan al menos 8
  días seguidos en **success** (última: 2026-08-19 07:27 UTC, 1m19s).
  B-01 queda operativo de punta a punta: respaldo diario cifrado + drill de
  restauración PASADO (`docs/dr-drill-20260805.md`).

## 2026-08-19 · Fecha y quién cerró, en el ticket (v0.139.0)

- `closed_by_name` en `cash_register_sessions` (mig `20260819230000` en
  prod); el repo lo guarda al cerrar y el ticket imprime "Fecha del cierre"
  y "Cerrada por". Typecheck ✓ · 2880 tests ✓ · build ✓.

## 2026-08-19 · Logo en el ticket del cierre (v0.138.1)

- `CashClosingTicket` lleva el logo del negocio (el mismo del ticket de
  venta). Typecheck ✓ · 2880 tests ✓ · build ✓.

## 2026-08-19 · Ventas por método y de la web en el cierre (v0.138.0)

- Asistente y ticket 80mm enseñan "Ventas del turno" (efectivo/tarjeta/
  transferencia/total) + "De la tienda web: N · RD$X". `computeShiftDetail`
  gana `webSalesCount/webSalesTotal` (ids de `web_orders.proforma_id` vía
  `webInvoicedProformaIds`). Typecheck ✓ · 2880 tests ✓ · build ✓.

## 2026-08-19 · Checklist del cierre + proformas en el reporte (v0.137.0)

- **Cierre**: sección "Antes de cerrar" — ventas cobradas ✓, borradores ⚠
  (enlace a Ventas), crédito ℹ (queda en CxC), pedidos web sin facturar ⚠.
  Informa, no bloquea. Regla pura `cash-close-checklist.ts` (4 pruebas) +
  `countWebOrdersToInvoice`.
- **Reporte de ventas**: las proformas ahora SALEN por defecto (con e-CF en
  demo, todas las ventas reales son proformas y el reporte salía vacío);
  el checkbox excluye, y la etiqueta avisa "Solo facturas".
- Validación: typecheck ✓ · 2878 tests ✓ (5 nuevos) · build ✓.

## 2026-08-19 · Cierre de caja fácil (v0.136.0)

- Asistente de cierre: conteo por denominaciones (total se suma solo),
  esperado a la vista, diferencia en vivo con color y botón que la nombra;
  al cerrar ofrece el **ticket 80mm** (`/caja/historial/[id]/print`, también
  desde el historial). Lógica pura en `features/sales/cash-count.ts`.
  API sin cambios. Diseño en
  `docs/superpowers/specs/2026-08-19-cierre-caja-facil-design.md`.
- Validación: typecheck ✓ · 2874 tests ✓ (6 nuevos) · build ✓.

## 2026-08-19 · "Tu ubicación" destacada en el checkout (v0.135.1)

- La tarjeta de ubicación del checkout ahora lleva fondo/borde de marca,
  icono en círculo y botón relleno. Typecheck ✓ · 2868 tests ✓ · build ✓.

## 2026-08-19 · Tarjeta OG del pedido compartido (v0.135.0)

- El enlace `/tienda/pedido/[token]` sale en WhatsApp con tarjeta profesional:
  logo del negocio (módulo de marca), nombre de la tienda (configuración),
  número y total del pedido (`opengraph-image.tsx` + `generateMetadata`).
  Token inválido = tarjeta genérica. Typecheck ✓ · 2868 tests ✓ · build ✓.

## 2026-08-19 · Barra de seguimiento en el detalle del ERP (v0.134.0)

- "Mover el pedido" enseña el mismo `OrderTimeline` del cliente encima de los
  botones de estado. Typecheck ✓ · 2868 tests ✓ · build ✓.

## 2026-08-19 · Aviso de pago por WhatsApp y correo (v0.133.0)

- En el detalle del pedido de tarjeta, con el enlace ya pegado, bloque
  **"Avisar al cliente"**: *Enviar por WhatsApp* (`wa.me` al número del
  pedido, mensaje puro probado en
  `features/storefront/order-payment-share.ts`) y *Enviar por correo*
  (`POST /api/pedidos-web/[id]/aviso-pago`, rol + auditoría
  `web_order.azul_link_notice`). Siempre se comparte la página del pedido
  (token firmado), nunca el enlace de Azul suelto.
- Validación: typecheck ✓ · 2868 tests ✓ (4 nuevos) · build ✓.

## 2026-08-19 · El enlace de Azul es POR PEDIDO (v0.132.0)

- **Descubierto:** el Link de Pagos de Azul lleva el monto **fijado al
  crearlo** (no hay parámetro de URL) y caduca; el enlace fijo del comercio
  nació con RD$500 y mandaba a todos a pagar eso.
- **Ahora:** cada pedido de tarjeta lleva su enlace
  (`web_orders.azul_payment_link_url`, mig `20260819180000` en prod). El admin
  lo genera en la App AZUL con el monto exacto (copiable en el detalle) y lo
  pega (`OrderAzulLinkForm` → `POST /api/pedidos-web/[id]/azul-link`, rol +
  validación de dominio + auditoría). Al pegarlo se avisa por correo. El
  cliente **verifica** el monto, ya no lo teclea; sin enlace, aviso honesto.
  El enlace de la configuración queda solo de interruptor del checkout.
- Diseño y plan en `docs/superpowers/{specs,plans}/2026-08-19-azul-enlace-por-pedido*`.
- Validación: typecheck ✓ · 2864 tests ✓ (4 nuevos de `canSetAzulLink`) · build ✓.

## 2026-08-19 · Comprobante con el texto de su método (v0.131.1)

- En el pedido pagado con tarjeta, el subidor decía "Comprobante de la
  transferencia". `ReceiptUpload` ahora recibe `metodo` y con tarjeta dice
  "Comprobante del pago" (captura de la confirmación de Azul). Typecheck ✓ ·
  2860 tests ✓ · build ✓.

## 2026-08-19 · Pago con enlace de Azul + checkout claro (v0.131.0)

- **Tarjeta por enlace de pago de Azul** en la tienda: el enlace del comercio
  se pega en la configuración (`business_web_settings.azul_payment_link_url`,
  migración `20260819120000`, aplicada a prod). Fail-closed y con el dominio
  validado en cliente y servidor. El pago ocurre en la página del pedido
  (`AzulPayBox`: total copiable + número de pedido + comprobante); el admin
  confirma aceptando el comprobante — el mismo riel de la transferencia. El
  POS preselecciona "Tarjeta" al facturar esos pedidos. La pasarela con API
  sigue apagada; ver `docs/pagos-en-linea.md` §0.
- **El checkout marca lo que falta**: botón siempre habilitado; al enviar con
  datos pendientes marca cada campo (aria-invalid + mensaje), resume junto al
  botón y se desplaza al primero. Regla pura probada en
  `features/storefront/checkout-missing-fields.ts`.
- Validación: typecheck ✓ · 2860 tests ✓ · build ✓.

## 2026-08-06 · Cierre de B-01, B-07 y B-04

Cierre de los tres bloqueadores restantes de `docs/production-readiness-report.md`
que dependían de prueba real, no de código sin verificar. Detalle técnico completo
en `.superpowers/sdd/2026-08-05-cierre-pendientes-produccion/task-{7,8,9}-report.md`;
esta entrada es el resumen con los números reales.

### B-01 · Respaldos — CERRADO

- `scripts/backup/dr-drill.mjs`: simulacro de un comando que restaura un respaldo
  fresco de producción en un arenero efímero (contenedor Docker desechable en
  `supabase-01`) y compara **7 dimensiones** contra producción. Veredicto real en
  `docs/dr-drill-20260805.md`: **PASA**.
- Números de la última corrida: **98 tablas rastreadas, 5.900 filas, 106 políticas
  RLS, 15 funciones, 219 índices, 325 restricciones, 0 errores de restauración, 0
  diferencias**.
- Verificado por auditoría independiente con **5 sabotajes distintos** (filas
  borradas, RLS apagada, índice eliminado, política cambiada a `USING (true)`, FK
  eliminada) → **los 5 detectados**. Reproducido con un arenero nuevo cada vez; el
  `system_identifier` del clúster destino cambia en cada corrida — es la prueba de
  que la restauración ocurre de verdad, no un resultado guardado.
- El arenero se autodestruye si el proceso local muere de golpe: verificado con
  `SIGKILL` real, destruido en **35 s** (contrato de 300 s, renovado en cada paso).
- **Lo que NO cubre, dicho a propósito:** `pg_dump` no exporta los roles del
  clúster (haría falta `pg_dumpall -g`) ni los **archivos binarios de Storage** —
  las 642 filas de `storage.objects` son metadatos; las fotos de producto viven
  fuera de la base.
- **El respaldo diario automático sigue DESACTIVADO** (`gh workflow disable`)
  hasta que la versión endurecida de `.github/workflows/backup.yml` llegue a
  `main`. Los secretos `SUPABASE_DB_URL` y `BACKUP_GPG_PASSPHRASE` ya están
  configurados; la passphrase está en el Llavero
  (`security find-generic-password -s dermaland-backup-gpg -w`).

### B-07 · Migraciones — CERRADO

- `scripts/audit-migrations.mjs` audita **por objeto contra la base real**, no
  por el historial de `schema_migrations`.
- Se recuperaron **4 migraciones** aplicadas en su día por `apply_migration` del
  MCP de Supabase que nunca dejaron un `.sql` en el repo (`ai_providers_module`,
  `product_images_storage_bucket`, `ecf_events_fk_restrict`, `0042_payments_azul`),
  reconstruidas **byte a byte** desde `schema_migrations.statements`.
- Se trajeron 2 migraciones de la rama DGII cuyos archivos solo vivían ahí.
- Se renombraron 5 archivos que **la CLI de Supabase saltaba en silencio** —
  `supabase db push` habría reconstruido una base sin las tablas `ai_*`, sin el
  bucket de imágenes, y reventando en `0003_dgii_pos.sql`. Hoy: **51 archivos, 0
  saltados**.
- Reconstrucción desde cero verificada en un PostgreSQL 17.6 vacío y desechable:
  **83 tablas frente a 83 de producción, delta cero**, 106 políticas con md5
  idéntico.
- **Pendiente del dueño:** autorizar `supabase migration repair` para los **14
  archivos «sin registro»** (9 ya `APLICADA`). No es para las 3 PARCIALES: esas
  **ya están registradas** y un `repair` sobre ellas no hace nada — lo que les
  falta son objetos que migraciones posteriores renombraron (verificado en
  producción: `products_barcode_unique` → `products_barcode_live_unique`,
  `businesses_select`/`clients_select` → `*_sel`/`_ins`/`_upd`/`_del`), drift
  cosmético que se revisa a mano. El bloqueo de los 14 es decidir su **versión
  de 14 dígitos**; la auditoría deliberadamente no la inventa.
- **2026-08-06 · Backfill de laboratorios — reducido de 45,1 % a 24,9 %.**
  `0017_backfill_product_laboratories.sql` tenía SQL inválido (`p` referenciado
  dentro del `ON` de un `JOIN` que no la incluía) y nunca corrió en ningún
  entorno; corregido moviendo la condición al `WHERE`. Pero el arreglo de
  sintaxis por sí solo solo cubría 8 de 611 productos: la mayoría de marcas
  reales del catálogo nunca estuvieron en la lista de 30 patrones de texto.
  Migración nueva (`20260806172849_backfill_laboratories_missing_brands.sql`):
  creó 12 laboratorios que faltaban (IDCP, Medihealth, Babé, Sensilis,
  Primaderm, Darrow, EltaMD, Colorescience, Rilastil, Neutrogena, Pilopeptan,
  Abravia) y vinculó `products.laboratory_id` por `brand_id` — dato
  estructurado ya limpio, no por texto del nombre. Resultado real: **1.018 de
  1.356 con laboratorio (75,1 %), 338 sin (24,9 %)**. Los 338 restantes **no
  tienen `brand_id` en absoluto** (ítems como "Melina Loción 100 ML" o
  "Vaseline Blueseal") — no es un problema de mapeo, es catalogación manual
  pendiente, fuera de alcance de un backfill automático.
  `country` y `min_shelf_life_days` de los 12 laboratorios nuevos quedan en
  `NULL` a propósito: es política de negocio (acuerdos de recepción con cada
  proveedor), igual que **67 de los 68** laboratorios ya sembrados en 0016.
  La regla de vencimiento por laboratorio sigue inerte donde no se configure
  el umbral, tengan o no productos vinculados — pendiente del dueño en
  Configuración → Laboratorios.

### B-04 · 2FA — CERRADO EN CÓDIGO, SIN DESPLEGAR

- 2FA obligatorio para `admin`, `super_admin` e `is_platform_admin`; opcional
  para el resto, con fail-open conservado para quien no está obligado.
- `scripts/mfa-break-glass.mjs`: retira el factor de **un** usuario nombrado,
  con confirmación interactiva y rastro en `audit_logs`. Probado contra Supabase
  real con usuarios desechables y TOTP verificado real: **16/16**.
- Durante el trabajo se cerró un **bypass completo del 2FA** (con la contraseña
  robada se podía retirar el factor de la víctima desde `/perfil/seguridad` y
  enrolar el propio) y **tres formas distintas de quedar encerrado fuera del
  sistema**, dos de ellas ya presentes en producción antes de esta tarea.
- **Pendiente del dueño, orden no negociable (spec §6.2):** 1) enrolar su propio
  2FA en `/perfil/seguridad`; 2) probar el break-glass contra su propia cuenta,
  con él presente; 3) autorizar el despliegue (merge `feat/cierre-pendientes-produccion`
  → `main`) en ese mismo momento.
- **Dato corregido respecto al informe anterior: son 3 administradores reales**
  en `auth.users`, no 2 (`wrodriguez3030@gmail.com`, `preview-admin@dermaland.do`,
  `cnttest-ct5jmp@example.com`), todos con `role: admin` en `app_metadata` y
  **ninguno con factor enrolado**. `cnttest-ct5jmp@example.com` es basura de una
  corrida de prueba vieja — decisión del dueño si se borra antes de encender el
  enforcement (ver `docs/riesgos.md`).

### Riesgos nuevos registrados

Ocho hallazgos quedaron como riesgos abiertos en `docs/riesgos.md`
(`R-SEC-02` a `R-SEC-07`, `R-BACKUP-01`, `R-BACKUP-02`): la cuenta de prueba con
rol admin, el preview-admin sin enrolar, la `service_role_key` como punto único
de fallo del 2FA, el enforcement solo en middleware (125 rutas de API y 6
acciones de servidor sin comprobar AAL), el `matcher` que deja pasar rutas con
extensión de imagen, `public.users.two_factor_enabled` sin escribir, el respaldo
diario desactivado, y PITR inexistente en plan Free.

## 2026-08-05 · B-07 — el repositorio vuelve a reconstruir el esquema

- **El agujero:** `supabase/migrations/` tenía **47** archivos, pero el
  historial de producción (`supabase_migrations.schema_migrations`) registraba
  **cuatro migraciones que nunca dejaron un `.sql`**: se aplicaron en su día con
  `apply_migration` del MCP de Supabase. Con ellas fuera del repositorio, el
  repositorio **no reconstruía producción desde cero**: faltaban el módulo de
  Proveedores de IA, el bucket de fotos de producto, la tabla de pagos y el
  `ON DELETE RESTRICT` del historial fiscal.
- **La auditoría por objeto** (`scripts/audit-migrations.mjs` →
  `docs/migration-audit-20260805.md`) las identificó comparando lo que declara
  cada archivo contra lo que existe de verdad en la base, no por nombre.
- **Recuperadas (47 → 51 archivos):**

  | Archivo | Versión en el historial | Qué trae |
  |---|---|---|
  | `20260711182946_ai_providers_module.sql` | `20260711182946` | 4 tablas `ai_*` + 4 índices + RLS por `business_id` |
  | `20260803010512_product_images_storage_bucket.sql` | `20260803010512` | bucket `product-images` (público en lectura) + 4 policies en `storage.objects` |
  | `20260804195156_0042_payments_azul.sql` | `20260804195156` | tabla `payments` + 8 índices + RLS + `revoke` de escritura a `anon`/`authenticated` |
  | `20260805020813_ecf_events_fk_restrict.sql` | `20260805020813` | FK de `ecf_document_events` → `ON DELETE RESTRICT` |

- **De dónde salió el DDL:** de la columna `statements` del propio historial —
  el SQL **literal** que se ejecutó — contrastado después objeto por objeto
  contra el catálogo vivo. No se inventó ni una línea.
- **El nombre lleva delante la versión registrada, y eso NO es renumerar.** La
  CLI de Supabase lista las migraciones locales con `/^([0-9]+)_(.*)\.sql$/` y
  **salta en silencio** (solo aviso por stderr) las que no casan. Con el nombre a
  secas, `supabase db push` —el procedimiento de `docs/supabase-setup.md`, y el
  remedio que el informe de producción nombra para B-07— ignoraba tres de los
  cuatro archivos y reconstruía una base **sin las tablas `ai_*`, sin el bucket
  `product-images` y con el `ON DELETE CASCADE` que `ecf_events_fk_restrict`
  vino a quitar**. El cuarto era peor: `0042_payments_azul.sql` sí casaba, pero
  la CLI derivaba versión `0042` y nombre `payments_azul` —que no existen en el
  historial— así que `db push` lo habría **reaplicado** a producción. Con el
  prefijo `<versión>_`, la CLI deriva exactamente la versión y el nombre que ya
  guarda `schema_migrations`: el viaje de ida y vuelta es exacto y no se inventa
  ningún número.
- **La prueba:** los **51** archivos se aplicaron en orden sobre un PostgreSQL
  **17.6 vacío** (contenedor desechable `supabase/postgres:17.6.1.132`,
  destruido al terminar). **50 de 51 aplican limpio.** La huella de los objetos
  de las cuatro migraciones recuperadas (154 líneas: columnas, índices,
  constraints, policies, RLS, bucket y grants) salió **idéntica** entre la base
  reconstruida y producción.
- **`0002a_clients.sql` caía en la misma trampa — corregido, pero NO con el
  mismo remedio.** La `a` de `0002a` rompía `/^([0-9]+)_/`, así que la CLI
  también lo saltaba; y como crea la tabla `clients`, de la que dependen otras
  **8** migraciones, con `db push` la reconstrucción reventaba en
  `0003_dgii_pos.sql` con un error que no señalaba la causa.
  **Anteponerle su versión registrada (`20260519205927_`) lo empeora:** los
  prefijos de 14 dígitos ordenan después de todos los de 4, así que `clients`
  se iba al final y los fallos pasaban de **1 a 23**. Tampoco sirve ningún
  `0002X_`: cualquier dígito ordena antes del `_` en ASCII (`'9' < '_'`), así
  que `00021_` cae antes de `0002_`. El único prefijo que ordena **entre**
  `0002_` y `0003_` es `00030_`, y ese es el que lleva:
  **`00030_0002a_clients.sql`**. Conserva exacto lo que importa —la CLI deriva
  `name = 0002a_clients`, el nombre con que figura en el historial— y el
  `00030` es de la misma naturaleza que los `0001`…`0046` del resto: ninguno de
  esos 46 números es tampoco la versión registrada.
- **Los 51 archivos son visibles para la CLI.** Barrido de los 51 nombres contra
  `/^([0-9]+)_(.*)\.sql$/`: **0 se saltan** (antes se saltaban 4, y luego 1).
  Es lo único que demuestra que B-07 quedó cerrado por la vía documentada
  (`supabase db push`) y no solo por un bucle de `psql`.
- **La reconstrucción es completa, no solo aplicable:** la base levantada desde
  cero con los 51 archivos tiene **83 tablas en `public`** y producción tiene
  **83**, con **diferencia cero** en ambos sentidos.
- **Hallazgo aparte — `0017_backfill_product_laboratories.sql` NO es aplicable.**
  Su `UPDATE products p ... FROM alias a JOIN laboratories l ON ... = p.business_id`
  es SQL inválido: la tabla objetivo no se puede referenciar desde el `ON` de un
  `JOIN` del `FROM`. Falla siempre, en cualquier base. Encaja con que la
  auditoría la marque `INDETERMINADA` y sin fila en el historial: **nunca corrió
  en ningún sitio**. Es un backfill de datos (asignar laboratorio por el nombre
  del producto), no crea objetos, así que no afecta la reconstrucción del
  esquema — pero el backfill que prometía **no se hizo** (611 de 1356 productos
  siguen sin laboratorio). **Se deja fallando a propósito:** es una decisión de
  negocio del dueño, no técnica, y que la prueba se detenga ahí hace visible un
  problema real en vez de taparlo.
  *(Actualización 2026-08-06: el bug de sintaxis se corrigió en el mismo
  archivo — nunca se había registrado, sin riesgo de desajuste — y se cerró el
  hueco real por otra vía. Ver la entrada de arriba.)*
- **Nota sobre el entorno de prueba:** la imagen `supabase/postgres` trae los
  roles y los esquemas, pero no `auth.jwt()` ni las tablas de `storage` (en la
  nube las crean GoTrue y storage-api). Se añadieron al contenedor como andamio
  con las definiciones oficiales de Supabase, **fuera del repositorio**; sin
  ellas fallaban por entorno seis migraciones ya existentes (0038, 0040, 0041,
  0045, 0046) además de la recuperada `0042_payments_azul`.
- **Sigue pendiente** lo que la auditoría dejó a decisión humana: las
  migraciones `APLICADA` sin fila en el historial necesitan que alguien decida
  su versión de 14 dígitos antes de poder correr `supabase migration repair`.
  Eso es contabilidad del historial, no un agujero de reconstrucción.

## 2026-06-18 · R-SEC-01 Leaked Password Protection — riesgo aceptado (plan Free)

- **Warning Supabase Security Advisor → Auth:** *Leaked password protection is
  currently disabled.* Solo activable en **Supabase Pro+** (cruce HaveIBeenPwned).
  **No se corrige con SQL ni migración** — es una feature de la capa Auth, se
  activa en el Dashboard tras subir a Pro.
- **Control compensatorio implementado:** política de contraseña fuerte
  (`apps/web/src/lib/auth/password-policy.ts`): ≥12 chars, mayúscula, minúscula,
  número, símbolo y rechazo de contraseñas comunes. Cableada en el script
  `scripts/bootstrap-preview-supabase-user.mjs` (valida la password seed, nunca
  la imprime) y disponible para formularios. Aviso interno en
  `/admin/configuracion` (sección Seguridad).
- **Estado:** riesgo aceptado en dev/preview; **bloqueante para producción SaaS
  real** si no se sube a Pro o no se implementa mitigación equivalente.
- **Documentación completa + checklist de upgrade a Pro:** `docs/security.md`.
  No hay formulario de registro/cambio de contraseña en la app todavía (usuarios
  por script); la utilidad queda lista para cuando se agregue.

## 2026-05-29 · Correcciones Supabase Security Advisor (migración 0008)

- **Migración `supabase/migrations/0008_security_advisor_fixes.sql`** —
  100% no destructiva e idempotente. NO toca DGII real, NO testecf,
  NO XML, NO certificados, NO datos. Solo metadatos de objetos y
  reorganización de policies RLS preservando la semántica exacta de
  acceso multi-tenant.
- **Warnings corregidos por SQL:**
  1. **Security Definer View** · `public.inventory_stock_by_lot` →
     `security_invoker = true` (la view ahora respeta la RLS de
     `product_lots` del usuario que consulta; antes la bypaseaba →
     riesgo cross-tenant).
  2. **Auth RLS Initialization Plan** · `public.audit_logs` →
     `auth_business_id()`/`auth.uid()` envueltos en `(select ...)`
     (InitPlan, una sola evaluación por query).
  3. **Function Search Path Mutable** · `select_lot_for_sale`,
     `auth_business_id`, `auth_is_platform_admin`,
     `reserve_ecf_sequence_number` → `set search_path = public, auth,
     extensions` (sin cambiar cuerpo ni security model; siguen
     SECURITY INVOKER).
  4. **Multiple Permissive Policies** · `plans`, `businesses`,
     `branches`, `users`, `clients` → consolidadas a una policy por
     comando (select/insert/update/delete). Unión por OR preserva el
     acceso previo; auth.*() envueltas en `(select ...)`.
- **Warning que requiere acción MANUAL en Dashboard (no por SQL):**
  - **Leaked Password Protection Disabled** → Supabase Dashboard →
    Authentication → Settings → Security → activar "Leaked password
    protection" (HaveIBeenPwned). Ver runbook.
- **Aislamiento multi-tenant confirmado por diseño:** todas las
  policies siguen filtrando por `business_id = auth_business_id()`
  (o `id = auth_business_id()` en `businesses`); platform admin
  mantiene su alcance; ningún cambio abre acceso cross-business.
- **Validaciones:** `typecheck` ✅ · `vitest run` 446/446 ✅ ·
  `build` ✅. Sin referencias en código/tests a los nombres de policy
  renombrados.
- **Migración `0009_rls_initplan_remaining.sql`** (follow-up autorizado
  2026-05-29): envuelve `auth_business_id()`/`auth_is_platform_admin()`
  en `(select ...)` en las **34 policies `_all` restantes** (incl.
  tablas DGII como `dgii_certificates`, `ecf_sequences`,
  `dgii_submissions`). Vía `ALTER POLICY`, behavior-preserving, no
  destructivo, no fiscal. Cierra el resto de warnings "Auth RLS Init
  Plan".
- **APLICADO 2026-05-29** por el dueño vía **SQL Editor** del proyecto
  `sntcvyozbhrgicwmtcoh` (sin credenciales en sesión; el MCP apuntaba a
  otro proyecto y `SUPABASE_DB_URL` estaba en placeholder). Verificación
  SELECT-only confirmada (6/6):
  1. `inventory_stock_by_lot` → `security_invoker=true` ✅
  2. view consultable ✅
  3. 4 funciones con `search_path` fijo ✅
  4. multiple permissive → 0 filas ✅
  5. auth RLS init-plan sin envolver → 0 filas ✅
  6. policies siguen filtrando por `business_id` (sin `qual=true`) ✅
  - **Leaked Password Protection:** NO activable — feature solo en
    Supabase **Pro+**, el proyecto está en **Free**. Aceptado como riesgo
    temporal **R-SEC-01** (`docs/riesgos.md`); mitigación: passwords
    fuertes, no reutilizar, rotar seeds, MFA, y upgrade a Pro antes de
    producción SaaS real. No se crean más migraciones por este warning.
    **Producción Vercel y env intactos.**

## 2026-05-21 · QA SaaS pre-Fase G APROBADO (14/14)

- **Checklist QA browser-based ejecutado manualmente** sobre el
  Preview `https://dermaland-igsr1gdv4-wrodriguez3030-4801s-projects.vercel.app`
  (commit `c02d714`).
- **Resultado: 14/14 criterios técnicos verdes** — login, wizard
  carga, panel "Pendiente antes de enviar a DGII testecf", paso 1
  cert digital (8 steps incluyendo `xsd_valid`), paso 2 config
  fiscal, paso 4 pruebas locales (4 tipos e-CF), paso 8
  autorización representante (banner pre-fill + 9 ítems con
  evidencia + declaración formal), gate `ready_for_testecf`
  bloquea/desbloquea correctamente, CTA "Enviar pruebas a DGII
  testecf" sigue disabled aún con todo verde, mensajes MOCK / NO
  FISCAL visibles, `audit_logs` recibe inserts (migración 0007
  funcionando).
- **Fase G sigue bloqueada por política operativa** hasta confirmar
  formalmente las 4 validaciones externas no técnicas:
  1. Acta / designación oficial Usuario Administrador e-CF.
  2. Certificado vigente y válido (>60 días + sin revocación).
  3. Titular del cert autorizado para representar el RNC.
  4. RNC emisor correcto para el contribuyente.
- **Producción Vercel intacta** · 0 env vars · `DATA_SOURCE=mock`
  por default · sin DGII real · sin testecf · sin envío XML · sin
  consumo de secuencias reales · sin `vercel deploy --prod` · sin
  cambios de DNS.
- **Commit del cierre del QA:** ver branch
  `feature/dgii-module-review-adjustments` (último commit de docs
  documenta esta aprobación).
- **Documentación detallada:**
  - `docs/dgii/qa-saas-pre-fase-g.md` (623 LOC) — checklist 13
    secciones + bloque de aprobación 2026-05-21 al inicio.
  - Resultado por sección: tabla 14×PASS.

**Próximo paso natural:** completar las 4 validaciones externas
(acta firmada por contador, vigencia del cert, autorización del
titular, RNC emisor). Recién con esas 4 + el QA técnico aprobado
tendría sentido conversar sobre autorizar Fase G (envío real a
testecf).

## 2026-05-20 (madrugada) · Preview Supabase QA 11/11 verde

- **QA automatizado del preview**: las 11 rutas del checklist
  devuelven **200** con sesión válida del seed user. Sin sesión las
  rutas protegidas devuelven 307 → `/login`. Middleware Supabase
  comportándose correctamente.
- **`/api/health`** confirma runtime: `env=production`,
  `data_source=supabase`, `integrations.supabase=true`.
- **Login REST** via `POST /auth/v1/token?grant_type=password` →
  JWT con `app_metadata.business_id`,
  `app_metadata.role=admin`,
  `app_metadata.is_platform_admin=false`. Coincide con lo seteado
  en el bootstrap.
- **Cookie `@supabase/ssr`** construida manualmente:
  `sb-<project_ref>-auth-token = "base64-" + base64(JSON.stringify(session))`.
  ~2.1 KB. Usada en curl para superar middleware.
- **Bug fix seed user**: GoTrue requiere strings vacíos (no NULL)
  en columnas de token (`confirmation_token`, `recovery_token`,
  etc.). Inserciones con SQL crudo deben hacer `COALESCE(col, '')`.
  El script `scripts/bootstrap-preview-supabase-user.mjs` no tiene
  ese problema porque Admin SDK setea los defaults.
- **Vercel Protection Bypass**: usado el secret existente del
  proyecto (registrado previamente) en header
  `x-vercel-protection-bypass` para QA via curl. La env var
  `VERCEL_AUTOMATION_BYPASS_SECRET` que agregamos requiere también
  toggle de Dashboard que NO tocamos.
- **Production sin cambios** (0 env vars en Vercel Project).
- **Validaciones locales**: typecheck ✅, build ✅, vitest 382/382.

## 2026-05-19 (noche tarde) · Preview Supabase con auth real

- **Vercel Preview desplegado** con `DATA_SOURCE=supabase` (env vars
  limitadas a la branch `feature/dgii-module-review-adjustments`).
  URL: `https://dermaland-1h96y60m8-wrodriguez3030-4801s-projects.vercel.app`.
  Status: `Ready`, target `preview`, 197 λ functions en `iad1`.
- **Producción intacta**: Vercel Project sigue con **0 env vars** →
  `DATA_SOURCE` defaultea a `mock` por el schema de `lib/env.ts`.
- **Auth Supabase real** con un solo usuario seed:
  `preview-admin@dermaland.do` con `role='admin'`, business y branch
  del seed mock. Claims (`business_id`, `role`, `is_platform_admin`,
  `branch_id`, `branch_ids`, `full_name`) en `raw_app_meta_data` +
  `raw_user_meta_data`. Password generada localmente, persistida
  en `apps/web/.env.local` (gitignored).
- **Migración `0006_auth_helpers_jwt_metadata.sql`** — actualiza
  `auth_business_id()` y `auth_is_platform_admin()` para leer del
  JWT en orden: root → `app_metadata` → `user_metadata`. Sin esto,
  RLS bloquearía todas las queries con `auth_business_id() = null`.
- **Script `scripts/bootstrap-preview-supabase-user.mjs`** —
  idempotente, requiere `SUPABASE_SERVICE_ROLE_KEY` real (no es
  obligatorio para el preview actual, pero queda listo).
- **Validación funcional via curl bloqueada** por Vercel SSO
  Deployment Protection (`set-cookie: _vercel_sso_nonce`). El usuario
  debe abrir el preview en browser autenticado. La app build pasó
  (197 lambdas, typecheck/build/vitest 382/382 localmente).
- **Hallazgo corregido**: el bloqueador "stubs Supabase rompen
  `/pos`/`/caja/cierre`/etc." era falso. Esas rutas son client-only
  + localStorage y no invocan `getRepositories()`. Solo
  `/api/inventory-counts/sync` y la server action de
  `/dgii/configuracion` usan adapters; el primero usa stubs (no
  bloquea preview) y el segundo ya tiene implementación real.

## 2026-05-19 (noche) · Fase C — regen `database.types.ts` + base completa en Supabase

- **Hallazgo:** el proyecto Supabase `sntcvyozbhrgicwmtcoh` (URL
  `https://sntcvyozbhrgicwmtcoh.supabase.co`) estaba realmente
  **vacío** al iniciar la sesión — 0 tablas en `public`, 0
  migrations registradas. La aplicación de Fase C documentada en
  el bloque "tarde" del 2026-05-19 no estaba presente. Posible
  reset del proyecto entre sesiones.
- **Set completo de migraciones re-aplicado** vía
  `mcp__supabase__apply_migration` (Claude Code) en orden:
  `0001 → 0002 → 0002a_clients → 0003 → 0004 → 0005`. MCP
  Supabase autenticado por OAuth.
- **Nueva migración `0002a_clients.sql`** committeada en el
  repo. Define la tabla `clients` (CRM mínimo, RLS por
  business_id) que `proformas.customer_id` y
  `electronic_invoices.customer_id` referencian en 0003. Sin
  esta migración intermedia, un fresh-apply de 0003 fallaba con
  `relation "clients" does not exist`.
- **Fix `0002_phase2_inventory.sql`** en el repo: la vista
  `inventory_stock_by_lot` filtraba por `where deleted_at is
  null` pero `product_lots` no tiene esa columna (el descarte
  lógico vive en `status`). Se quita el `WHERE` para que un
  fresh-apply funcione en cualquier proyecto vacío.
- **Counts post-aplicación:** 43 tablas en `public`, 19
  tablas DGII/POS, 18 permisos, 7 roles, 59 role_permissions —
  coincide con la matriz esperada de Fase C.
- **`database.types.ts` regenerado** desde el proyecto Supabase
  vía `mcp__supabase__generate_typescript_types` — 3.372 líneas,
  103 KB, reemplaza el esqueleto manual previo (sólo
  `businesses`). Commit `0cad04b`.
- **`.mcp.json` en `.gitignore`** — config MCP no se publica a
  GitHub (decisión confirmada por el usuario).
- **`.claude/` en `.gitignore`** — harness local fuera del repo.
- **Validaciones:** `typecheck` ✅, `build` ✅ (78 páginas,
  middleware 89.4 kB), `vitest` ✅ 382/382 en los dos commits.
- **`DATA_SOURCE=mock` intacto** local y en Vercel; Vercel env
  sigue vacío; DGII real no tocado; certificado `.p12` no usado;
  sin deploy producción.

## 2026-05-19 (tarde) · Fase C — migraciones DGII aplicadas en Supabase

- Tres migraciones aplicadas manualmente desde Supabase Dashboard
  SQL Editor (`.scratch-fase-c-combined.sql`, una sola transacción):
  - `0003_dgii_pos.sql` — 19 tablas DGII/POS + función
    `reserve_ecf_sequence_number` + RLS por tenant
    (`business_id = auth_business_id()`).
  - `0004_dgii_permissions_seed.sql` — 18 permisos DGII/cash.
  - `0005_dgii_role_permissions_seed.sql` — 7 roles + 59 pares
    rol→permiso (super_admin 18, admin 18, manager 12, cashier 4,
    inventory 0, supervisor 3, auditor 4).
- Validador in-transaction confirmó los counts exactos antes del
  `COMMIT`; el usuario reportó "aplicado, counts OK".
- **Repo:** working tree limpio en commit `12d7963`. No se generaron
  cambios de código en este paso. `pg` (intentado para apply
  automatizado) y `scripts/apply-fase-c-migrations.mjs` fueron
  removidos al cierre — la ruta automatizada vía Node falló por
  placeholders en `.env.local`.
- **`DATA_SOURCE=mock` intacto** local y en Vercel (project
  `dermaland` sigue con **cero environment variables**).
- **`database.types.ts` NO regenerado** — `SUPABASE_PROJECT_REF` es
  placeholder; pendiente para cuando el usuario llene credenciales
  reales.
- Pendientes documentados para completar Fase C: real
  `SUPABASE_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN` + ejecutar
  `supabase gen types` + commit `"Aplicar tipos Supabase para DGII"`.
- **No se tocó** DGII real, no se usó cert real, no se desplegó a
  producción. Fases G/H siguen bloqueadas.

## 2026-05-19 · Asistente de habilitación DGII (mock)

- Nueva ruta `/dgii/habilitacion` — wizard/checklist vertical con 6
  pasos (postulación, pruebas e-CF, representaciones impresas, URLs de
  servicios, declaración jurada, asignación roles + NCF).
- Cada paso tiene checklist propio, 7 estados (`pending`,
  `in_progress`, `completed`, `blocked`, `requires_user_action`,
  `requires_accountant_validation`, `requires_dgii_validation`),
  estado configurable por el usuario, link a módulo relacionado.
- Persistencia en `localStorage` vía
  `apps/web/src/features/dgii/enablement-store.ts`. Producción: migrar
  a tabla `dgii_enablement_progress` con RLS por business.
- Catálogo declarativo en
  `apps/web/src/lib/mock-data/dgii-enablement.ts` (6 pasos + URLs de
  servicios planificadas + permisos relevantes).
- Componentes nuevos en `apps/web/src/components/dgii/`:
  `enablement-step-card.tsx`, `enablement-status-badge.tsx`.
- Sidebar nav DGII ahora muestra "Habilitación" como primer item.
- 31 tests nuevos (382 totales). Pasos con `requiresDgii=true` quedan
  marcados `blocked` hasta Fase G/H.
- NO toca Supabase real, NO envía a DGII, NO firma con cert real.

## 2026-05-13 · Restauración a versión completa + deploy prod

- Versión completa copiada de `C:\Users\Admin\OneDrive\Escritorio\dermaland\`
  hacia ruta canónica `C:\dev\dermaland\` (228 archivos, 0 secretos).
  Origen intacto.
- Next.js bump 15.1.6 → **15.5.18** (Vercel bloqueaba 15.1.6 por CVE).
- Rama `feature/restore-complete-project` creada y pushada a
  `https://github.com/wrodriguez3030-del/Dermaland-`.
- `main` fast-forward (no `--force`) usando merge `-s ours
  --allow-unrelated-histories` para preservar la Fase 0 como segundo padre.
- Deploy producción en Vercel ✅: `https://dermaland.vercel.app` —
  13/13 rutas devuelven 200, `/` ya no es la landing de Fase 0.
- Detalle del proceso: `docs/deploy-vercel.md`,
  `docs/comparacion-versiones.md`.

**Anterior última actualización:** 2026-05-07

## Fases completadas

| Fase | Descripción | Resultado |
|---|---|---|
| 0 | Scaffold del monorepo pnpm + Next.js 15 + Tailwind 4 | ✅ |
| 1-8 | MVP navegable — 75 rutas con mock data | ✅ |
| P1 | Backend prep — repos + Supabase clients + tipos de dominio | ✅ |
| P2 | Auth prep — server actions + middleware + página `/login` | ✅ |
| P3 | RLS — 2 migraciones + `docs/rls-policy.md` | ✅ |
| P4 | Scanner real — BarcodeDetector + ZXing + Bluetooth | ✅ |
| P5 | Offline PWA — IndexedDB queue + sync + sw.js | ✅ |
| P6 | DGII service stubs + service.ts | ✅ stubs |
| P7 | WhatsApp service stubs + webhook handler | ✅ stubs |
| P8 | IA service — tools registry + bloqueo de agendamiento | ✅ stubs |
| P9 | Tests — vitest unit + Playwright smoke | ✅ |
| P10 | CI/CD — `.github/workflows/ci.yml` | ✅ |
| P11 | Documentación — 8 docs técnicas en `docs/` | ✅ |
| (extra) | Hydration fix de impresión de proformas | ✅ 2026-05-07 |
| (extra) | Sistema de agentes (10 agentes + workflow) | ✅ 2026-05-07 |
| (extra) | Rediseño POS + reglas documentales + selector de pago | ✅ 2026-05-07 |
| (extra) | Memoria persistente del proyecto | ✅ 2026-05-07 |

## Módulos creados

### Tenancy

- `Business` (RNC, plan, estado)
- `Branch` (sucursal con dirección)
- `Warehouse` (almacén dentro de sucursal)

### Usuarios / roles

- `User` con `role`: `super_admin · admin · manager · cashier ·
  inventory · supervisor · auditor`.
- `RoleDefinition`, `Permission`, `AuditLog`.
- Super-Admin shell separada en `(super-admin)/`.

### Catálogo

- `Brand`, `Laboratory`, `Category`.
- `Product` con foto, registro sanitario, ITBIS por producto, forma
  farmacéutica, presentación, ingrediente activo.
- `ProductLot` con vencimiento, cantidad, status.

### Inventario

- `InventoryStockByLot`, `InventoryMovement`.
- Conteo físico: `InventoryCount`, `InventoryCountScan`,
  `InventoryCountItem`.
- FEFO en `selectFefoLot`.
- Lotes vencidos bloqueados en POS.

### CRM

- `Customer` con `defaultBillingType`, `skinType`, `consents`.
- `CustomerNote`.
- Detección de duplicados por documento.

### Ventas

- `Proforma` (con `documentKind`, `ecfType`, `sequenceType`).
- `SaleItem`, `Payment`.
- `CashRegisterSession`.
- `resolveDocumentToIssue` (función pura testeada).

### Recomendaciones

- `SkinType`, `SkinCondition`, `RoutineTemplate`, `Recommendation`.

### SaaS

- `Plan`, `PlanLimits`, `Subscription`, `UsageCounter`.

### Servicios

- `WhatsappTemplate`, `WhatsappConversation`, `WhatsappMessage`.
- `AIAgent`, `AIActionLog`, registry de tools, bloqueo de agendamiento.
- `ApiKey`, `Webhook` (esqueleto API V3).
- `DgiiSequence`, `ElectronicInvoice` (stubs).

## Rutas existentes (78 páginas en build)

### Públicas / auth

- `/login`

### App shell `(app)`

- `/` (dashboard)
- `/admin/auditoria · /admin/configuracion · /admin/empresa ·
   /admin/permisos · /admin/roles · /admin/sucursales · /admin/usuarios`
- `/api-v3 · /api-v3/keys`
- `/caja · /caja/historial`
- `/clientes · /clientes/[id] · /clientes/[id]/editar · /clientes/nuevo`
- `/conteo-fisico · /conteo-fisico/[id] · /conteo-fisico/[id]/movil ·
   /conteo-fisico/nuevo`
- `/devoluciones`
- `/dgii · /dgii/certificado · /dgii/configuracion · /dgii/envios ·
   /dgii/facturas · /dgii/secuencias`
- `/ia · /ia/agentes · /ia/conversaciones · /ia/logs`
- `/inventario · /inventario/almacenes · /inventario/bajo-stock ·
   /inventario/cuarentena · /inventario/movimientos · /inventario/por-lote ·
   /inventario/recall · /inventario/vencimientos`
- `/notas-credito`
- `/pagos`
- `/pos`
- `/productos · /productos/[id] · /productos/[id]/editar ·
   /productos/categorias · /productos/laboratorios · /productos/marcas ·
   /productos/nuevo`
- `/proformas · /proformas/[id]/print`
- `/recomendaciones · /recomendaciones/[id] ·
   /recomendaciones/condiciones · /recomendaciones/nueva ·
   /recomendaciones/rutinas · /recomendaciones/tipos-piel`
- `/reportes · /reportes/caja · /reportes/clientes · /reportes/conteos ·
   /reportes/inventario · /reportes/productos · /reportes/ventas`
- `/ventas`
- `/whatsapp · /whatsapp/conversaciones · /whatsapp/enviados ·
   /whatsapp/plantillas`

### Super-Admin shell `(super-admin)`

- `/super-admin · /super-admin/branding · /super-admin/modulos ·
   /super-admin/negocios · /super-admin/pagos · /super-admin/planes ·
   /super-admin/suscripciones · /super-admin/uso`

### API

- `/api/health`
- `/api/whatsapp/webhook`
- `/api/inventory-counts/sync`

## Componentes importantes

### UI primitives (`apps/web/src/components/ui/`)

- `button`, `card`, `input`, `badge`, `table`, `tabs`,
  `confirm-dialog`, `empty-state`, `filter-bar`, `row-actions`,
  `search-input`, `sortable-table-header`, `stat-card`, `toast`,
  `bar-chart`, `use-local-soft-delete`.

### Layout (`apps/web/src/components/layout/`)

- `AppShell`, `Sidebar`, `Header`, `OfflineStatusPill`, `PageHeader`.

### Features

- `pos/pos-terminal.tsx` — terminal completo, rediseñado.
- `sales/document-resolver.ts` — función pura de reglas documentales.
- `sales/proforma-store.ts` — store en `localStorage`.
- `sales/components/receipt-80mm.tsx` — ticket térmico.
- `customers/customer-store.ts` + `customer-search-select.tsx` +
  `new-customer-form.tsx` + `billing.ts` + `utils/duplicate-detection.ts`
  + `utils/search-clients.ts`.
- `products/product-store.ts` + `components/product-image.tsx`.
- `inventory/lot-badges.tsx`.
- `inventory-counts/mobile-scanner` + hooks + `offline` + `sync`.

### Server

- `server/auth/` — context, actions (`signIn`, `signOut`, MFA), middleware.
- `server/repositories/` — types · mock · supabase · factory.
- `server/services/dgii/` · `whatsapp/` · `ai/` (con tools registry).

### Tipos

- `apps/web/src/types/index.ts` — todos los tipos del dominio.

## Tests existentes

| Archivo | Cubre |
|---|---|
| `apps/web/src/features/customers/customer-store.test.ts` | Persistencia y operaciones del store |
| `apps/web/src/features/customers/utils/duplicate-detection.test.ts` | Detección de duplicados por documento |
| `apps/web/src/features/customers/utils/search-clients.test.ts` | Búsqueda de clientes |
| `apps/web/src/features/sales/document-resolver.test.ts` | Reglas documentales (consumo · crédito fiscal · todos los métodos) |
| (otros) | Hooks, helpers, utilidades — total **111 tests** en 9 archivos |

Smoke browser:

- `apps/web/tests/hydration-proforma-print.mjs` — Playwright headless,
  detecta hydration mismatch en `/proformas/[id]/print`.
- `apps/web/tests/pos-flow-smoke.mjs` — Playwright headless, valida
  selector de pago, indicador de documento, botón dinámico, aviso CF
  sin RNC.

E2E (Playwright `tests/e2e/`):

- Smoke principal pasando en CI.

## Qué funciona en local

```
typecheck  ✅  pnpm --filter web typecheck
build      ✅  pnpm --filter web build  → 78/78 páginas
test       ✅  pnpm --filter web test   → 111 tests pasando
dev        ✅  pnpm --filter web dev    → http://localhost:3031
```

Smoke HTTP a las rutas críticas (todas en 200):

- `/`, `/clientes`, `/clientes/nuevo`, `/productos`, `/productos/nuevo`,
  `/inventario`, `/conteo-fisico`, `/pos`, `/proformas`, `/ventas`,
  `/super-admin`, `/api/health`.

Smoke browser:

- `/proformas/[id]/print` — 0 hydration issues.
- `/pos` — 11/11 checks (sin método pre-seleccionado, indicador
  documento dinámico, botón dinámico, aviso CF sin RNC, 0 hidratación).

## Qué falta para producción

Ver `docs/proximos-pasos.md` para la lista priorizada. Resumen:

1. Conectar Supabase real.
2. Migrar mocks a repositorios Supabase.
3. DGII real (secuencias, certificado, envío).
4. WhatsApp Cloud API real.
5. IA real (OpenAI / Claude).
6. CI/CD verde end-to-end.
7. Cerrar `docs/production-checklist.md`.
