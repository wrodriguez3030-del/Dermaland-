# Auditoría del módulo fiscal actual de DermaLand

> **Fecha:** 2026-08-04 · **Rama:** `feat/dgii-reformulacion`
> **Alcance:** estado REAL del módulo DGII hoy, medido contra el pliego de
> reformulación (`PROMPT_CLAUDE_REFORMULAR_MODULO_DGII_DERMALAND.md`).
> **Método:** lectura del código, del esquema en Supabase de producción y de la
> suite de pruebas. **No se llamó a DGII.** No se envió ningún XML.
>
> Sustituye a `auditoria-modulo-dgii-existente.md` (2026-05-17), que quedó
> desactualizada: aquel documento describe como *stubs* piezas que hoy están
> implementadas (firma, validación XSD, cliente testecf).

---

## 0. Resumen en una línea

El módulo **no está en cero ni cerca de terminado**: tiene el camino de emisión
—construir, validar contra XSD, firmar, autenticar y transmitir— escrito y
probado para cuatro tipos de comprobante, y le faltan enteros el modelo de
documentos recibidos, la aprobación comercial, los permisos fiscales, la cola de
reintentos y seis de los diez tipos e-CF.

**Recomendación: NO-GO** para producción fiscal. Los motivos están en §7 y
ninguno es discutible.

---

## 1. Lo que EXISTE y funciona

### 1.1 Código

| Pieza | Archivo | Estado |
|---|---|---|
| Constructor de XML e-CF | `server/services/dgii/builder.ts` | Real, tipos 31–34 |
| Validación XSD | `server/services/dgii/validator.ts` | Real, vía `xmllint` |
| Firma XMLDSig | `server/services/dgii/signer.ts` | `signEcfXml` + `verifyEcfSignature` |
| Código de seguridad | `server/services/dgii/security-code.ts` | Real |
| QR / URL de consulta | `server/services/dgii/qr.ts` | Real |
| Cliente testecf | `server/services/dgii/testecf-client.ts` | Semilla → firma → token → recepción |
| Certificado (cifrado) | `features/dgii/certificate-actions.ts` | AES con `DGII_CERT_ENCRYPTION_KEY` |
| Secuencias e-NCF | `features/dgii/numbering-*.ts` | Real, con historial |
| PDF del comprobante | `server/services/dgii/pdf.ts` | Real |
| Evaluador de habilitación | `features/dgii/enablement-evaluator.ts` | Real, 10 pasos |

**285 pruebas** pasan en `server/services/dgii` + `features/dgii`.

### 1.2 Esquema en Supabase (producción)

Ya existen **13 tablas**: `dgii_settings`, `dgii_certificates`, `dgii_submissions`,
`dgii_status_logs`, `dgii_logs`, `dgii_received_ecf`, `dgii_commercial_approvals`,
`ecf_sequences`, `electronic_invoices`, `electronic_invoice_items`,
`invoice_numberings`, `proforma_to_ecf_logs`, `cash_closing_ecf_items`.

Es decir: **el modelo conceptual del pliego (§8) ya está cubierto en más de la
mitad**, con otros nombres. Reformular NO debe empezar creando tablas nuevas.

### 1.3 XSD

`docs/dgii/xsd/` contiene **4 esquemas oficiales**: e-CF 31, 32, 33 y 34 v1.0.
El validador ya resuelve dos trampas reales: el BOM UTF-8 de los XSD 32/33/34 y
un typo del XSD 31.

### 1.4 Aislamiento

- `DGII_TESTECF_SEND_ENABLED` por defecto **`false`**.
- El CTA «Enviar pruebas a DGII testecf» está **deshabilitado a propósito**.
- QA pre-Fase G: **14/14 verde** en Preview (2026-05-21), sin una sola llamada a
  DGII real.

---

## 2. Lo que FALTA contra el pliego

| § del pliego | Qué pide | Estado |
|---|---|---|
| 10 | Diez tipos e-CF (31,32,33,34,41,43,44,45,46,47) | **4 de 10.** El tipo `EcfType` ya nombra 41–47 pero no hay builder ni XSD |
| 12 | E32 + RFCE con límite RD$250 000 | **No existe** el camino RFCE |
| 21 | Aprobación comercial | Tabla creada, **flujo no implementado** |
| 22 | Recepción de e-CF de terceros | Tabla creada, **endpoint receptor no existe** |
| 18 | Outbox / cola / reintentos con backoff | **No existe.** El envío es en línea |
| 19 | Job de consulta de `trackId` | **No existe** (es la Fase H, bloqueada) |
| 25 | 13 permisos `dgii.*` granulares | **No existe ninguno** |
| 9 | Máquina de estados explícita | Parcial: hay estados, no hay tabla de transiciones permitidas |
| 15 | Alertas de vencimiento del certificado (30/15/7/3/1/0) | **No existe** |
| 28 | Métricas y alertas | **No existe** |

---

## 3. Hallazgos de seguridad

### 3.1 — ALTO · Ocho rutas de API fiscal sin control de rol

Estas rutas no llaman `getSession` ni `authorizeRole`:

```
/api/dgii/certificate/current
/api/dgii/certificacion/run-test
/api/dgii/preview/pdf
/api/dgii/preview/xml-signed
/api/dgii/preview/xml-unsigned
/api/dgii/facturas/[id]/pdf
/api/dgii/facturas/[id]/xml-signed
/api/dgii/facturas/[id]/xml-unsigned
```

No están abiertas a internet —el middleware exige sesión del negocio—, pero
**DL-01 dice que la RLS valida el `business_id`, no el rol**. Traducido: hoy
cualquier usuario con sesión, incluido el de inventario, puede descargar el XML
**firmado** de una factura fiscal y los metadatos del certificado.

El propio pliego lo nombra en §25: *«un usuario que crea una factura no obtiene
automáticamente acceso al certificado»*.

### 3.2 — MEDIO · No hay permisos fiscales

El único rastro de `dgii.*` en el código son **nombres de acciones de auditoría**
(`dgii.numbering_created`…), no permisos. Los 13 permisos del §25 hay que
crearlos desde cero.

### 3.3 — BAJO · `DgiiService` legacy sigue enrutado

`server/services/dgii/service.ts` conserva stubs que lanzan `DgiiNotImplemented`
(`submitToDgii`, `getTrackStatus`, `cancelInvoice`, `createCreditNote`) y **cinco
rutas siguen importándolo**. Convive con `testecf-client.ts`, que es el camino
real. Dos caminos para lo mismo es cómo se acaba enviando por el equivocado.

---

## 4. Diferencias con el módulo Odoo de referencia

**No se pudo hacer.** Ver §6.

---

## 5. Riesgo de licencia

**No se pudo evaluar.** Ver §6.

---

## 6. BLOQUEANTE: falta el archivo de referencia

El pliego se apoya en `l10n_do_edi.zip` (§3, §4, §5, §6 y los pasos 2–5 del §35).

**Ese archivo no está en este equipo.** Se buscó en `~/Downloads`, `~/Desktop`,
`~/Documents` y `~/Projects`, y por nombre (`*l10n*`, `*edi*.zip`, `*dgii*.zip`).
No aparece.

Sin él no se pueden entregar:

- `docs/dgii/SOURCE_MODULE_AUDIT.md`
- `docs/dgii/THIRD_PARTY_AND_LICENSE_REVIEW.md`
- El mapa de equivalencias Odoo ↔ DermaLand
- El escaneo de secretos del ZIP (§35 paso 3), que el pliego marca como urgente
  porque el módulo trae **credenciales incrustadas** de un servicio de licencia
  de terceros

Todo lo demás del pliego **no depende del ZIP** y puede avanzar.

---

## 7. GO / NO-GO

**NO-GO** para envío fiscal real. Motivos, en el lenguaje del §34:

1. Faltan XSD: 4 de 10 tipos.
2. Faltan pruebas reales: nunca se ha transmitido a DGII, ni a testecf.
3. Faltan credenciales: las 4 validaciones externas siguen sin confirmar
   (acta de designación, vigencia y no revocación del certificado, titularidad
   frente al RNC, RNC emisor correcto).
4. La idempotencia no está probada porque no hay cola.
5. No hay rollback fiscal documentado.
6. Certificación DGII no completada.
7. **Producción no ha sido autorizada por el propietario.**

Los puntos 3 y 7 no los cierra ningún trabajo de programación.

---

## 8. Orden de trabajo propuesto

Respeta la política vigente: **Fase G, testecf y producción fiscal siguen
bloqueadas y requieren autorización explícita por turno.** Nada de lo de abajo la
toca.

| # | Trabajo | Depende del ZIP |
|---|---|---|
| 1 | Cerrar el hallazgo 3.1: rol en las ocho rutas | No |
| 2 | Crear los 13 permisos `dgii.*` y aplicarlos | No |
| 3 | Retirar el `DgiiService` legacy y dejar un solo camino | No |
| 4 | Máquina de estados explícita + eventos append-only | No |
| 5 | Outbox, idempotencia y reintentos con backoff | No |
| 6 | XSD y builders para 41, 43, 44, 45, 46, 47 | No |
| 7 | E32 + RFCE con el límite como constante única | No |
| 8 | Endpoint receptor y aprobación comercial | No |
| 9 | Alertas de vencimiento del certificado | No |
| 10 | Auditoría del módulo Odoo y revisión de licencia | **Sí** |

El punto 1 es el único que arregla algo que hoy está mal en producción; el resto
construye lo que falta.
