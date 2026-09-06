# Portar el módulo de facturación electrónica de agendapp a DermaLand — Diseño

**Fecha:** 2026-09-05 · **Estado:** pendiente de aprobación del dueño · **Versión objetivo:** v0.143 → v0.150

---

## 1. Por qué se hace

DermaLand tiene un módulo DGII de ~27.700 líneas que **nunca ha emitido un comprobante**, ni
siquiera al ambiente de pruebas. Su propia documentación (`docs/dgii/README.md`, 2026-08-04)
lo declara **NO-GO** para emisión real, con cuatro criterios abiertos.

agendapp tiene un módulo de ~27.700 líneas que **está certificado y facturando en producción**:
completó los 15 pasos del portal de la DGII el 2026-07-28, emite desde el 2026-08-06 y a
2026-08-25 llevaba 17 comprobantes reales aceptados de cinco tipos (31, 32/RFCE, 34, 41, 43).
Cada rechazo que sufrió está documentado con su causa raíz y su arreglo
(`docs/dgii/INCIDENTS.md`).

**Decisión del dueño (2026-09-05):** portar el módulo completo de agendapp, retirar por
completo el de DermaLand, con diseño y plan aprobados antes de implementar.

### 1.1 Lo que este portado NO consigue

**La certificación no se hereda.** La de agendapp está a nombre de CIBAO SPA LASER
(RNC 131561985). DermaLand SRL (RNC 1-32-59077-5) tendrá que hacer **su propio trámite de 15
pasos** ante la DGII, con su certificado, su postulación y sus rangos autorizados. Lo que se
gana es que el software pasará las pruebas a la primera, porque ya las pasó una vez.

Corolario que cambia el alcance: las ~8.000 líneas de herramientas de certificación que en
agendapp ya no se usan **sí hacen falta aquí**, porque son las que guían ese trámite.

---

## 2. Regla dura: agendapp no se toca

`~/Projects/agendapp` es **solo lectura** durante todo el trabajo. No se mueve, no se
refactoriza, no se extrae a un paquete compartido. Se copia y se adapta.

Estado de referencia registrado antes de empezar: commit `8dbda0f6`, rama `main`, 0 cambios
pendientes, 262 ficheros del módulo, huella del contenido
`d18aacecfdaa0fc2972cb57d10702568bcffd3e7`. **Se vuelve a calcular al terminar y debe coincidir.**

Esto respeta además la regla del dueño de no mezclar proyectos: DermaLand tendrá su propia
copia, su propia base y su propio despliegue. Nada se comparte en caliente.

---

## 3. Qué se porta, capa por capa

### 3.1 Copia literal — funciones puras, cero cambios (~9.000 líneas)

Van a `apps/web/src/features/dgii/core/` (puro, importable desde vitest, sin `server-only`).

| Origen en agendapp | Qué es |
|---|---|
| `src/lib/dgii/builder.ts` (793 L) | Constructor del XML e-CF de los 10 tipos, derivado del XSD |
| `src/lib/dgii/builder-types.ts` (382 L) | Tipos y catálogos oficiales |
| `src/lib/dgii/xml-utils.ts` | Serialización, escapado, fechas y montos en formato DGII |
| `src/lib/dgii/builders/{rfce,arecf,acecf,anecf,common}.ts` | Resumen de consumo y los tres acuses |
| `src/lib/dgii/rfce-routing.ts` | Decide íntegro vs resumen por tipo y monto |
| `src/lib/dgii/itbis-rate.ts` | Única conversión decimal ↔ porcentaje |
| `src/lib/dgii/indicador-monto-gravado.ts` | El campo que provocó un rechazo real |
| `src/lib/dgii/{nombre-item,nota-que-modifica,note-reference}.ts` | Reglas de nombre y de notas |
| `src/lib/dgii/signer.ts` (204 L) | Firma XMLDSig del e-CF |
| `src/lib/dgii/seed-signer.ts` (145 L) | Firma de semilla, RFCE y acuses |
| `src/lib/dgii/{signer-types,seed-signer-types}.ts` | Constantes de algoritmos |
| `src/lib/dgii/certificate-parser.ts` | PKCS#12 → PEM con `node-forge` |
| `src/lib/dgii/certificate-encryption.ts` | AES-256-GCM del certificado |
| `src/lib/dgii/{validator,xsd-loader,certification-xsd}.ts` | Validación XSD con `xmllint-wasm` |
| `src/lib/dgii/{dgii-client,dgii-client-types,dgii-http-transport,dgii-http-transport-types,dgii-endpoints,dgii-response-normalizer,dgii-mock-server}.ts` | Cliente y transporte de la DGII |
| `src/lib/dgii/{killswitches,errores-bloqueantes}.ts` | Los gates y la válvula anti-quemado |
| `src/lib/dgii/{submission-state-machine,submission-state-types,estado-tras-envio}.ts` | Máquina de estados |
| `src/lib/dgii/{print-representation,ri-generator,bloque-fiscal,comprobante-origen,qr-decode}.ts` | Representación impresa y QR |
| `src/lib/dgii/{remote-trust,trust-anchors}.ts` | Confianza de certificados de terceros |
| `src/lib/dgii/{xml-guard,xml-classifier,xml-extract}.ts` | Guardas de XML entrante |
| `docs/dgii/xsd/*` (14 ficheros) | Los 11 esquemas oficiales + su procedencia y huellas |

Las librerías que necesitan **ya están en DermaLand** en versiones casi idénticas:
`xml-crypto`, `node-forge`, `@xmldom/xmldom`, `xmllint-wasm`, `qrcode`. Hay que **añadir**:
`pdf-lib`, `fflate`, `jsqr`, `pngjs`, `unpdf`. Se retira `xmlbuilder2` (el builder de agendapp
escribe el XML a mano).

**Condición de aceptación:** estos ficheros se copian sin editar una línea salvo las rutas de
`import`. Cualquier cambio de lógica se documenta y se justifica en el plan.

### 3.2 Adaptar la persistencia — misma lógica fiscal, otro almacén (~2.500 líneas)

Van a `apps/web/src/server/services/dgii/`.

| Origen | Qué cambia |
|---|---|
| `invoice-prepare.ts` (699 L) | Prisma → repositorios de DermaLand; `prisma.sale` → `proformas`; `$transaction` → RPC transaccional |
| `submission-service.ts` (762 L) | Igual, más el almacenamiento del XML |
| `estado-veredicto.ts` (434 L) | Igual |
| `certificate-storage.ts` (371 L) | `prisma.dgiiCertificate` → tabla equivalente |
| `dgii-storage.ts` | Bucket `dgii-private` de agendapp → bucket privado de DermaLand, **mismo path canónico** |
| `enablement-service.ts`, `enablement-evaluator.ts` | Persistencia |
| `preflight.ts`, `dry-run.ts`, `fiscal-mode.ts` | Persistencia |

**Regla:** la lógica fiscal (orden de pasos, gates, transiciones, qué se guarda) **no se toca**.
Solo se sustituye la capa de datos. Cualquier desviación se anota en el plan con su motivo.

**Riesgo principal y su mitigación:** `invoice-prepare` hace todo dentro de una transacción de
Prisma de 20 segundos, y ese aislamiento es lo que garantiza que un fallo **no consuma un
número fiscal**. DermaLand no tiene ORM con transacciones desde la aplicación: escribe por
PostgREST. Por eso la reserva y la persistencia se implementan como **una función PL/pgSQL
transaccional en la base** (`prepare_ecf_invoice`), no como una secuencia de llamadas REST.
Sin eso, un fallo a mitad quema un e-NCF, que es el error que agendapp ya sufrió (6-10 números
perdidos, v550).

### 3.3 Herramientas de certificación — se portan (~8.000 líneas)

En agendapp son historia; en DermaLand son el camino. Incluye `certification-dataset-service.ts`
(el set oficial de 25 e-CF + 4 RFCE del Excel de la DGII), el parser OOXML, la máquina de
estados de la postulación, la simulación del paso 4, la declaración jurada, la delegación y el
seguimiento del portal.

Se portan **con sus pantallas**, adaptadas al diseño de DermaLand.

### 3.4 Recepción de comprobantes de terceros — se porta (~2.500 líneas)

`b2b-reception.ts`, `acecf-reception.ts`, `fe-facade.ts`, `fe-auth.ts` y las cuatro rutas
públicas. **Hace falta para certificar**: el trámite exige exponer los servicios de recepción,
autenticación y aprobación comercial.

Cambio obligatorio: agendapp resuelve el inquilino por el slug de la URL (`/t/{slug}/fe/...`).
DermaLand es de un solo negocio operativo, así que las rutas quedan en `/fe/...` y el negocio
se resuelve por configuración, no por la URL. Se conserva el `fe_endpoint_slug` en la
configuración porque es **la URL que se declara ante la DGII** y debe sobrevivir a cambios de
nombre.

Arranca **apagado** (`DGII_FE_RECEPTION_ENABLED=false` → 404), igual que en agendapp.

### 3.5 Lo que NO se porta

- **El padrón de RNC** (787 mil filas, cron diario). Útil pero accesorio: corrige la razón
  social del comprador. Queda para una entrega posterior, anotado como deuda.
- **Los adaptadores de negocio de agendapp** (`pos-sale-ecf.ts`, `pos-sale-send.ts`,
  `purchase-emit.ts`, `petty-expense-emit.ts`, `foreign-payment-emit.ts`,
  `return-credit-note.ts`). Se **reescriben** para DermaLand: son los cinco ficheros que
  conocen el negocio. Ver §5.
- Los tipos 44, 45, 46 y 47 (regímenes especiales, gubernamental, exportación, pagos al
  exterior) se portan en el código porque vienen en el builder, pero **no se cablean** a ningún
  flujo de DermaLand. Una farmacia no los emite.

---

## 4. Modelo de datos

### 4.1 Tablas nuevas (migración `20260906xxxxxx_dgii_portado.sql`)

Se traen de agendapp, adaptadas a las convenciones de DermaLand (`business_id`, RLS
deny-by-default, `if not exists`, `notify pgrst`):

| Tabla | Para qué |
|---|---|
| `dgii_settings` | Configuración fiscal del negocio: RNC, razón social, dirección, ambiente, killswitch del negocio, política de facturación |
| `ecf_sequences` | Rangos autorizados por tipo y ambiente, con `next_number` y vencimiento |
| `electronic_invoices` | El comprobante: e-NCF, estado, montos, rutas de XML, trackId |
| `electronic_invoice_items` | Sus líneas, congeladas |
| `dgii_submissions` | Cada intento de envío con su evidencia |
| `dgii_status_logs` | Cada consulta de estado |
| `dgii_certificates` | El .p12 cifrado y sus metadatos |
| `dgii_enablement_progress` | Los 10 pasos de habilitación |
| `dgii_representative_attestations` | Las 9 evidencias del representante |
| `received_ecf` | Comprobantes recibidos de terceros |
| `received_commercial_approvals` | Aprobaciones comerciales recibidas |
| `dgii_certification_datasets` / `_cases` | El set oficial de certificación |
| `dgii_certification_applications` / `_events` / `_evidence` | La postulación y su historial |
| `dgii_simulation_ranges` | Rangos del paso 4, separados de los comerciales |

Más la función **`reserve_next_encf(business_id, tipo_ecf, ambiente)`** de agendapp, tal cual
(bloquea la fila, valida rango y vigencia, incrementa y devuelve el e-NCF), y la nueva
**`prepare_ecf_invoice(...)`** que envuelve la preparación completa en una transacción.

### 4.2 Tablas que se retiran

Las 13 exclusivas del módulo actual, listadas en el informe: `dgii_settings` (la vieja),
`dgii_certificates` (la vieja), `ecf_sequences` (la vieja), `electronic_invoices`,
`electronic_invoice_items`, `dgii_submissions`, `dgii_status_logs`, `dgii_received_ecf`,
`dgii_commercial_approvals`, `proforma_to_ecf_logs`, `dgii_logs`, `ecf_document_events`,
`cash_closing_ecf_items`. **Todas vacías** salvo `dgii_certificates` (4 filas).

Varias comparten nombre con las nuevas. La migración las **renombra a `*_legacy_20260906`**
antes de crear las nuevas, en vez de borrarlas de golpe. Se borran de verdad en una migración
posterior, cuando el módulo nuevo lleve tiempo funcionando. Así el retorno es posible.

**Antes hay que soltar dos claves foráneas**: `proformas.electronic_invoice_id` y
`cash_closing_sales.electronic_invoice_id`. Se vuelven a crear apuntando a la tabla nueva.

### 4.3 Tablas intocables

`invoice_numberings` (5 filas vivas, el POS reserva ahí), `reserve_invoice_number`,
`proformas`, `proforma_items`, `proforma_payments`, `cash_closings`, `cash_closing_sales`,
`billing_settings`, `proforma_counters`, `next_proforma_number`, `payment_methods`,
`cash_registers`, `cash_register_sessions`.

### 4.4 Los 4 certificados guardados

Están cifrados con `DGII_CERT_ENCRYPTION_KEY` y el mismo algoritmo AES-256-GCM que usa
agendapp, pero con distinto formato de sobre. **No se migran**: el dueño vuelve a subir el
`.p12` una vez, por la pantalla nueva. Es una acción suya, de dos minutos, y evita escribir un
conversor para cuatro filas de las que tres están revocadas.

---

## 5. El punto de sutura: la numeración del punto de venta

Es el único acoplamiento que puede dejar de cobrar. Hoy `pos-terminal.tsx` llama:

```ts
const reservation = await reserveNextPreferredAnywhere(dt, environment, { branchId, cashierId });
// → { ok, formatted, numberingId, environment, source }
```

**Esa firma se conserva exactamente.** Detrás, el adaptador nuevo enruta por tipo de documento:

| Tipo | A dónde va | Por qué |
|---|---|---|
| `consumo` (B02), `credito_fiscal` (B01) | `invoice_numberings` + `reserve_invoice_number` | Comprobantes en papel; no son e-CF y no cambian |
| `ecf_31`, `ecf_32`, `ecf_34` | `ecf_sequences` + `reserve_next_encf` | Secuencia fiscal electrónica, la certificada |

`pos-terminal.tsx` **no se modifica** más que el import. Esto es una condición de aceptación
del plan: si el portado exige tocar la lógica de cobro, el diseño está mal.

Los adaptadores de negocio nuevos, equivalentes a los cinco de agendapp:

| Fichero nuevo | Equivalente en agendapp | Qué hace |
|---|---|---|
| `features/dgii/adapters/proforma-to-ecf.ts` | `pos-sale-ecf.ts` | Proforma → entrada del builder: tipo 31 vs 32 según `billing_type` y documento del cliente |
| `features/dgii/adapters/send-on-sale.ts` | `pos-sale-send.ts` | Envío en mostrador (presupuesto 6 s) y drenaje al cerrar caja |
| `features/dgii/adapters/credit-note.ts` | `return-credit-note.ts` | Nota de crédito (34) desde una factura |

Compras, gastos menores y pagos al exterior **no se cablean**: DermaLand no los emite hoy.

---

## 6. Retirada del módulo actual

Ocho ubicaciones, no cuatro:

`features/dgii`, `server/services/dgii`, `app/(app)/dgii`, `app/api/dgii`, `components/dgii`,
`lib/dgii`, la cadena de certificado (`server/services/{certificate-service,certificate-storage,local-cert-test}.ts`
y `server/crypto/cert-cipher.ts`) y las piezas alojadas fuera de sitio
(`features/billing/{dgii-logs-store,ecf-lifecycle}.ts`, `lib/mock-data/dgii-enablement.ts`).

**Orden obligatorio**, porque el POS no puede quedar sin numerar ni un commit:

1. Entra el módulo nuevo **en paralelo**, bajo `features/dgii/core` y `server/services/dgii-v2`.
2. Se cambia el adaptador de numeración y se verifica que el POS cobra.
3. Se retiran las pantallas y rutas viejas.
4. Se retira el código viejo.
5. Se renombran las tablas viejas a `*_legacy_20260906`.

En el mismo cambio que borra `/api/dgii/cola`: quitar el cron de `vercel.json` y la entrada de
`CRON_PATHS` en `middleware.ts`. **Nunca un cron más frecuente que diario**: el plan Hobby de
Vercel rechaza el despliegue entero, y eso ya tumbó producción una vez.

Se conservan tres ideas del módulo actual aunque venga otro código:

- **`routes-guarded.test.ts`** — la prueba que recorre el árbol de rutas y exige que cada
  handler tenga su portero. Es la única que atrapa lo que alguien olvida escribir.
- **El modelo de permisos por acción** (`dgii.issue`, `dgii.manage_sequences`…) en vez de por
  grupo de roles.
- **El trigger append-only** sobre el historial de eventos.

---

## 7. Seguridad y gates

Se porta la cadena completa de agendapp, sin relajar nada:

1. Killswitch de entorno: `DGII_{TESTECF,CERTECF,PROD}_SEND_ENABLED`, solo el literal `"true"`.
2. Killswitch del negocio: `dgii_settings.dgii_enabled_real_send`.
3. Estado de habilitación en la lista de permitidos.
4. Certificado activo y vigente.
5. Comprobante preparado o firmado, con XML en almacenamiento.
6. Confirmación manual explícita por envío.
7. Rol: `authorizeDgii(permiso)` con el patrón de DermaLand.
8. Válvula anti-quemado: si el último envío falló por configuración, no se reserva número.

Todo apagado por defecto. El estado inicial en producción es: **no se envía nada**.

Y los requisitos de seguridad de DermaLand que el módulo debe cumplir: `business_id` del JWT
nunca de la URL, filtro explícito por `business_id` además de la RLS, RLS deny-by-default,
`security definer` solo con `search_path` fijado, y un portero por handler exportado.

---

## 8. Lo que no depende del código

Sin esto, el módulo funciona pero no emite:

| Qué falta | Quién lo hace |
|---|---|
| Certificado digital válido para firmar a nombre de DermaLand SRL | El dueño. El activo hoy es **personal** (Willian Rafael Rodríguez Rodríguez, Viafirma, vence 2027-05-05); hay que confirmar con la DGII si sirve o hace falta uno de la empresa |
| Dirección fiscal de la empresa | El dueño. Hoy `businesses.address`, `city` y `province` están **vacíos** y el XML los exige |
| Acta de Usuario Administrador de e-CF ante la DGII | El dueño |
| Delegación del rol de **firmante de e-CF** en la Oficina Virtual | El dueño. Es exactamente donde se atascó agendapp: tener «Administrador de contribuyente» no basta |
| Los 15 pasos del portal y los rangos autorizados | El dueño, guiado por las pantallas portadas |

---

## 9. Pruebas

- **Se portan las 227 pruebas de agendapp** que cubren el núcleo. Las que dependen de Prisma se
  reescriben contra los repositorios; las puras se copian.
- Prueba de propiedad del árbol de rutas (heredada del módulo actual).
- Prueba de que el POS sigue cobrando: reserva de B02, B01, E32 y E31 con la firma intacta.
- Prueba de que un fallo a mitad de la preparación **no consume e-NCF** (la que justifica la
  función transaccional).
- Ensayo completo con `dry-run.ts` antes de cualquier envío.
- Typecheck, suite completa y build en cada entrega.

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| El POS deja de cobrar | La firma del adaptador no cambia; prueba dedicada; el módulo nuevo entra en paralelo antes de retirar el viejo |
| Se quema un e-NCF por un fallo a mitad | Preparación dentro de una función transaccional en la base, no por llamadas REST sueltas |
| El cron tumba el despliegue | Diario y nada más; se verifica `vercel.json` antes de cada fusión |
| El portado se desvía de la lógica certificada | Los ficheros puros se copian sin editar; cualquier cambio se justifica por escrito |
| agendapp se modifica sin querer | Huella registrada antes y verificada al final |
| Se pierde el retorno | Las tablas viejas se renombran, no se borran; el borrado real va en otra migración |
| Emitir sin querer | Todos los gates apagados por defecto; el envío real exige confirmación manual con frase literal |

---

## 11. Entregas, en orden

1. **Núcleo puro** — copia literal de los ~9.000 líneas + los 14 XSD + dependencias nuevas.
   Pruebas portadas. No toca nada de la aplicación.
2. **Base de datos** — migración con las 15 tablas, `reserve_next_encf` y `prepare_ecf_invoice`.
   Tablas viejas renombradas. Claves foráneas recolocadas.
3. **Persistencia y orquestación** — `invoice-prepare`, `submission-service`, `estado-veredicto`,
   certificado y almacenamiento, sobre repositorios de DermaLand.
4. **Sutura del POS** — adaptador de numeración; el POS cobra con el módulo nuevo. Se verifica
   antes de seguir.
5. **Adaptadores de negocio** — proforma → e-CF, envío en mostrador y al cerrar caja, nota de
   crédito.
6. **Pantallas** — configuración, certificado, secuencias, habilitación, envíos, facturas,
   estado y las de certificación.
7. **Recepción de terceros** — servicios `/fe/...`, apagados.
8. **Retirada del módulo viejo** — las ocho ubicaciones, el cron y la documentación.
9. **Ensayo completo** — `dry-run` de los tipos que DermaLand emite, sin enviar nada.

Cada entrega termina con typecheck, suite completa y build en verde, y su commit.
