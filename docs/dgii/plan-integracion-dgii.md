# Plan de integración DGII — revisión y ajuste sobre módulo existente

> **Estado:** REVISADO / DOCUMENTADO. Cero código DGII real cambiado. Cero
> envíos a DGII. Cero certificados subidos. Cero migraciones aplicadas.
>
> **Rama:** `feature/dgii-module-review-adjustments`.
> **Base:** main fast-forwarded a `403b2e5` (restauración completa).
> **Fecha:** 2026-05-17.
>
> Este plan reemplaza cualquier intento previo de "construir desde cero" y
> reconoce que `apps/web/src/app/(app)/dgii/` ya existe con 5 pantallas, un
> servicio stub y mocks ricos. La ruta correcta ahora es **refinar lo
> existente por fases**, no crear un módulo paralelo.

## Tabla de contenidos

1. [Punto de partida real](#1-punto-de-partida-real)
2. [Agentes / roles utilizados](#2-agentes--roles-utilizados)
3. [Skills utilizadas o simuladas](#3-skills-utilizadas-o-simuladas)
4. [Estrategia](#4-estrategia)
5. [Brechas y prioridades](#5-brechas-y-prioridades)
6. [Plan por fases (sobre lo existente)](#6-plan-por-fases-sobre-lo-existente)
7. [Servicios a evolucionar](#7-servicios-a-evolucionar)
8. [Pantallas a evolucionar](#8-pantallas-a-evolucionar)
9. [Migraciones propuestas](#9-migraciones-propuestas)
10. [Librerías recomendadas](#10-librerías-recomendadas)
11. [Reglas duras de seguridad](#11-reglas-duras-de-seguridad)
12. [Qué NO se hace en este PR](#12-qué-no-se-hace-en-este-pr)
13. [Riesgos](#13-riesgos)
14. [Criterios de salida](#14-criterios-de-salida)

## 1. Punto de partida real

Ver `auditoria-modulo-dgii-existente.md`. En resumen:

- Módulo `/dgii` con 5 sub-pantallas presentes en producción.
- `DgiiService` con interface completa, generación XML esqueleto (no XSD-compliant),
  resto stub con `DgiiNotImplemented`.
- `document-resolver.ts` ya implementa la regla cash/transfer → proforma · card → e-CF.
- `env.ts` con `DGII_ENVIRONMENT: "cert"|"prod"` (faltan tres ambientes según doc).
- Mock data realista para secuencias, comprobantes, proformas.
- `caja/page.tsx` con cierre y selección manual de proformas (falta % configurable).
- Migración Supabase Fase 2 ya tiene `products` con `itbis_rate`.
- **No** hay tablas para `dgii_settings`, `dgii_certificates`, `dgii_sequences`,
  `electronic_invoices`, `sales`, `proformas`, `cash_*`.
- DATA_SOURCE=mock por defecto.
- `dgii_enabled = false` en el business piloto.

## 2. Agentes / roles utilizados

Los 10 roles fueron simulados (no son agentes reales de Claude Code; los
disponibles son `Explore`, `Plan`, `general-purpose`, `claude-code-guide`).

| Rol                                       | Insumo                                                                                   |
|-------------------------------------------|------------------------------------------------------------------------------------------|
| Coordinador                                | Coordinó pivote y consolidó reporte.                                                     |
| DGII / e-CF / XML / XSD                    | Leyó doc + XSD, mapeó orden de tags, identificó campos faltantes en el builder.          |
| Arquitectura Next.js / TypeScript          | Recorrió `apps/web/src/app/(app)/dgii/*`, `server/services/dgii`, `features/sales/*`.    |
| Base de datos / Supabase / RLS             | Confirmó que tablas DGII no existen; revisó migración 0001 y 0002.                       |
| Seguridad / Secretos / Certificados        | Verificó `.gitignore` root + apps/web; marcó refuerzo apps/web/.gitignore.               |
| Fiscal / Compliance / Contador             | Marcó cada estado y regla con bandera "validar contador" (sección 15 de la matriz).      |
| POS / Ventas / Cierre                      | Detectó falta de % configurable, autorización, auditoría en `caja/page.tsx`.             |
| QA / Testing                               | Diseñó tests XSD/firma/integration/smoke (no se ejecutan aún).                            |
| Vercel / Deploy                            | Confirmó no tocar producción. Preview opcional.                                          |
| Documentación                              | Generó este plan, auditoría y matriz.                                                    |

Para mapear el repo se invocó `Explore`. Para revisar/editar se usaron `Read`,
`Edit`, `Write`, `Bash`, `Grep`, `Glob`.

## 3. Skills utilizadas o simuladas

No existe una skill nativa para DGII / RD / e-CF. Se aplica una guía interna
de trabajo llamada **`dgii-ecf-module-review`** con estas reglas durante toda
la rama:

1. **No** inventar reglas fiscales.
2. **No** inventar endpoints DGII; cualquier URL u operación se valida contra
   la documentación oficial.
3. **No** enviar facturas reales en este proyecto.
4. **No** firmar XML en frontend; backend `"server-only"`.
5. **No** subir certificados ni claves.
6. **No** duplicar módulos. Se evolucionan los existentes.
7. Cambios mock no rompen el path producción/Vercel.
8. Implementación por fases pequeñas; cada fase su PR.

Skills runtime que pueden ayudar en fases siguientes:
`vercel:vercel-functions`, `vercel:vercel-storage`, `vercel:env-vars`,
`vercel:nextjs`, `vercel:workflow`, `vercel:routing-middleware`. Ninguna se
invoca en este PR.

## 4. Estrategia

- **Fase A** — Auditoría documentada, matriz de brechas, ajustes cosméticos
  seguros (gitignore reforzado, comentarios y advertencias fiscales donde
  toca, copia de XSD y requisitos al repo). **Sin cambios funcionales en
  servicios DGII.** ✅ Completada (commit `0f50c5f`).
- **Fase B** — Schema DB: `supabase/migrations/0003_dgii_pos.sql` con 19
  tablas DGII/POS + RLS + función `reserve_ecf_sequence_number`. El archivo
  queda en el repo pero **no se aplica** a ninguna DB hasta autorización
  explícita del usuario (`supabase db push` queda como acción manual). ✅
  Archivo entregado en commit `76d07a0`.
- **Fase D** — `DgiiXmlBuilder` XSD-compliant en
  `apps/web/src/server/services/dgii/{types,builder}.ts` con 31 tests verdes.
  Reemplaza el builder buggy de `service.ts` (el bug `<DetallesItems>` doblado
  ya no existe). `service.generateXml` queda como orquestador que lanzará
  `DgiiNotConfigured` hasta que Fase C provea settings + secuencias. ✅
  Implementación entregada en commit `46c70db`.
- **Fase F** — `DgiiXmlSigner` (XMLDSig enveloped + RSA-SHA256 + SHA256) en
  `apps/web/src/server/services/dgii/signer.ts` con 19 tests verdes. Usa
  `isEmptyUri: true` para producir `URI=""` sin añadir atributo `Id` al ECF.
  `service.signXml` queda como orquestador que lanzará `DgiiNotConfigured`
  hasta que Fase C provea el `DgiiCertificateService` (carga + descifrado del
  `.p12` con la password en Vault). ✅ Entregado en commit `3e2ab5b`.
- **Fase E** — `DgiiXmlValidator` (XSD oficial vía `xmllint-wasm`, libxml2 a
  WASM, sin native deps) en `apps/web/src/server/services/dgii/validator.ts`
  con 12 tests verdes. Cubre roundtrip `buildEcfXml → signEcfXml → validateEcfXml`
  contra el XSD `e-CF-31-v1.0.xsd` y detección de defectos comunes (campos
  faltantes, valores fuera de enum, RNCs / eNCFs mal formados, XML
  sintácticamente roto). Parche en memoria del typo del XSD oficial
  (`name=" IndicadorServicioTodoIncluidoType"` → sin espacio). Duda D-11
  **RESUELTA**: con `isEmptyUri: true` del signer, el XML firmado pasa
  XSD oficial. ✅ Entregado en commit `a4500fa`.
- **Fase L (parcial)** — Builder extendido a e-CF 32 (Consumo), 33 (Nota
  de Débito) y 34 (Nota de Crédito) en `builder.ts` con +16 tests (47 total).
  Tipos 33/34 requieren `informacionReferencia` (NCFModificado,
  RNCOtroContribuyente, FechaNCFModificado, CodigoModificacion). Tipo 32
  acepta consumidor final (RNCComprador y RazonSocialComprador opcionales).
  Validador XSD (Fase E) sigue usando solo `e-CF-31-v1.0.xsd` — los XSDs
  oficiales 32/33/34 no están en el repo (matriz D-13). ✅ Entregado en
  commit `4ec7ce2`.
- **Fase I** — Representación impresa offline: `qr.ts` (URL DGII
  consultaTimbre + QR PNG/SVG/data URL), `security-code.ts` (derivación
  desde SignatureValue del XML firmado), `pdf.ts` (PDF generado con
  `pdfkit` — encabezado emisor + comprador + items + totales + estado
  DGII + código de seguridad + QR). 24 tests nuevos (102 en services/dgii).
  Formato exacto del QR y código de seguridad sujeto a validación oficial
  (D-06). ✅ Entregado en commit `900750d`.
- **Integración POS-demo (parcial)** — Pipeline DGII expuesto via API y UI:
  `demo-cert.ts` genera cert dummy in-memory (cacheado por proceso),
  `demo-renderer.ts` mapea `ElectronicInvoice` mock → pipeline completo
  (build → sign → validate → security code → PDF). 3 endpoints
  (`/api/dgii/facturas/[id]/{pdf,xml-signed,xml-unsigned}`) sirven los
  artefactos. Nueva página `/dgii/facturas/[id]` con vista previa PDF
  embebido, descargas de XML firmado / sin firmar / PDF, banner de
  "DEMOSTRACIÓN — no fiscal". `next.config.ts` con `serverExternalPackages`
  para pdfkit/xmllint-wasm/node-forge/xml-crypto. 10 tests nuevos
  (225 totales). ✅ Entregado en commit `c0d8007`.
- **Fase L completa** — XSDs oficiales DGII 32/33/34 descargados directamente
  del portal DGII a `docs/dgii/xsd/`. Builder ajustado a las diferencias
  estructurales reales: e-CF 32 NO emite `<FechaVencimientoSecuencia>`;
  e-CF 34 emite `<IndicadorNotaCredito>` (obligatorio, 0/1) en su lugar.
  Validator extendido con tests por tipo: el output del builder pasa el
  XSD oficial correspondiente para 31, 32, 33, **y 34**. `patchOfficialDgiiXsd`
  ahora strippea UTF-8 BOM además del typo del XSD 31. Demo-renderer y
  3 tests previos actualizados con `indicadorNotaCredito: 0` para tipo 34.
  Duda D-13 **RESUELTA**. ✅ Entregado en este PR.
- **Fase C / E / F+** — Cada brecha P0/P1 entra como PR propio sobre esta
  rama. Aplicar la migración 0003 es prerrequisito para cualquier fase que
  persista (C en adelante).

## 5. Brechas y prioridades

Detalle completo en `matriz-requisitos-dgii.md`. Top P0:

1. `DgiiXmlBuilder`: reescribir contra XSD con `xmlbuilder2`.
2. `DgiiXmlValidator`: implementar con `libxmljs2` o equivalente.
3. `DgiiXmlSigner`: implementar XAdES-BES backend.
4. `DgiiAuthService` (semilla + token DGII).
5. `DgiiReceptionService` + `DgiiStatusService`.
6. Tabla `dgii_settings`, `dgii_certificates`, `dgii_sequences`,
   `electronic_invoices`, `proformas`, `sales`, `cash_*`.
7. Porcentaje configurable + autorización + auditoría en cierre de caja.
8. Cifrado at-rest del cert con AES-256-GCM.
9. Validación de "código de seguridad" / QR contra DGII.

## 6. Plan por fases (sobre lo existente)

| Fase | Contenido sobre el módulo existente                                                                                          | Toca código                                | Toca DB | Toca DGII real | Bloqueo                          |
|------|-------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------|---------|----------------|----------------------------------|
| A    | Docs + gitignore refuerzo + advertencias                                                                                       | Mínimo                                      | No      | No             | —                                |
| B    | Schema DB: 19 tablas DGII/POS en `supabase/migrations/0003_dgii_pos.sql` (escrito, **NO aplicado**) + función `reserve_ecf_sequence_number` | Sólo SQL                                   | Sólo archivo  | No             | **Aplicar requiere autorización del usuario** y `DATA_SOURCE=supabase` |
| C    | Ampliar `env.ts` con tres ambientes + `dgii_settings.base_url_*`; persistir `/dgii/configuracion`                              | env + page + service                        | Sí      | No             | Fase B                            |
| D    | ✅ Reescrito `DgiiXmlBuilder` (e-CF 31) en `builder.ts` con `xmlbuilder2`. 31 tests offline pasando. Bug `<DetallesItems>` doblado del builder anterior eliminado. `service.generateXml` lanza `DgiiNotConfigured` hasta Fase C. | `types.ts` + `builder.ts` + `builder.test.ts` + `service.ts` | No      | No             | —                                |
| E    | ✅ `DgiiXmlValidator` con `xmllint-wasm` (libxml2/WASM, sin native deps). XSD oficial leído de `docs/dgii/xsd/e-CF-31-v1.0.xsd` (typo parcheado en memoria). 12 tests verdes incluyendo roundtrip builder→signer→validator. Resuelve D-11 (signer ahora pasa XSD oficial). | `validator.ts` + `validator.test.ts` + `service.ts` | No      | No             | —                                |
| F    | ✅ `DgiiXmlSigner` XMLDSig enveloped (RSA-SHA256, SHA256, Reference, KeyInfo X509). Cert dummy generado por node-forge en runtime, jamás persistido. 19 tests + roundtrip verify. `service.signXml` lanza `DgiiNotConfigured` hasta `DgiiCertificateService`. | `signer.ts` + `signer.test.ts` + `service.ts` | No      | No             | —                                 |
| G    | `DgiiAuthService` contra `testecf` **sólo** con dummy cert o cert real + autorización del usuario                              | nuevo `auth.ts`                             | No      | testecf only   | Fase F + cert dummy o autorización|
| H    | `DgiiReceptionService` + `DgiiStatusService` contra `testecf`                                                                  | nuevos                                       | Sí      | testecf only   | Fase G                            |
| I    | ✅ `qr.ts` (URL DGII + QR PNG/SVG/dataURL) + `security-code.ts` (derivado del SignatureValue) + `pdf.ts` (pdfkit, layout DGII-compliant). 24 tests. Páginas UI llegan cuando se cablee al flujo POS. | `qr.ts` + `security-code.ts` + `pdf.ts` + tests + `service.ts` | No      | No             | —                                |
| J    | Cierre de caja: % configurable + FIFO + autorización + auditoría                                                               | `caja/page.tsx` + `CashClosingEcfService`   | Sí      | No             | Fase B                            |
| K    | Pre-certificación: panel + set de pruebas + evidencias                                                                          | nueva pantalla + servicio                   | Sí      | testecf only   | Fase G-I + autorización           |
| L    | ✅ Builder extendido a 32/33/34. Validator sigue con XSD 31 (XSDs 32/33/34 oficiales pendientes — matriz D-13). UI por tipo y validators específicos llegan cuando estén los XSDs. | `types.ts` + `builder.ts` + `builder.test.ts` | No      | No             | XSDs oficiales 32/33/34 (parcial) |
| M    | Hardening: roles/permisos DGII, reportes, redact logs                                                                          | seeds + UI                                  | Sí      | No             | Todas las anteriores              |
| N    | Cambio a `certecf` para certificación oficial                                                                                  | switch ambiente                              | No      | certecf        | Cert real + autorización + cierre del set de pruebas |
| O    | Cambio a `ecf` (producción real)                                                                                                | switch ambiente                              | No      | ecf            | **Aprobación explícita del usuario** + DGII certificación cerrada |

## 7. Servicios a evolucionar

Todo bajo `apps/web/src/server/services/dgii/` (manteniendo `"server-only"`).
El plan propone refactorizar el archivo único `service.ts` en módulos para
mantenibilidad. **No se ejecuta el refactor en este PR.**

- `service.ts` → orquestador.
- `builder.ts` → `DgiiXmlBuilder` (XSD-compliant, por tipo).
- `validator.ts` → `DgiiXmlValidator`.
- `signer.ts` → `DgiiXmlSigner`.
- `auth.ts` → `DgiiAuthService`.
- `reception.ts` → `DgiiReceptionService`.
- `status.ts` → `DgiiStatusService`.
- `pdf.ts` → `DgiiPdfService`.
- `qr.ts` → `DgiiQrService`.
- `sequences.ts` → `DgiiSequenceService`.
- `certificates.ts` → `DgiiCertificateService`.
- `certification.ts` → `DgiiCertificationService`.
- `utils.ts` → `formatDgiiDate`, `formatDgiiAmount`, redact helpers.
- `state-machine.ts` → transiciones de estado.
- `__tests__/` → fixtures + tests por servicio.

## 8. Pantallas a evolucionar

- `/dgii` (landing): añadir indicador del ambiente activo (testecf / certecf / ecf).
- `/dgii/configuracion`: persistir + selector tres ambientes + provincia/municipio.
- `/dgii/secuencias`: persistir + import + alertas reales.
- `/dgii/facturas`: detalle (`/dgii/facturas/[id]`) con XML, firmado, PDF descargables.
- `/dgii/envios`: cola real con reintentos visibles.
- `/dgii/certificado`: upload real cifrado, password vía Vault.
- **Nueva** `/dgii/certificacion`: panel de pre-certificación.
- `/caja`: % configurable + cálculo automático + advertencias fiscales + auditoría.
- `/proformas`: leyenda fiscal estandarizada.
- `/reportes`: reportes fiscales adicionales (L-01..L-06 de la matriz).

## 9. Migraciones propuestas

`supabase/migrations/0003_dgii_pos.sql` ya **existe** en este PR (escrito, NO
aplicado). Contiene 19 tablas:

- **Config y secretos** — `dgii_settings`, `dgii_certificates` (sólo metadata
  + referencia simbólica al secreto de password, nunca el password en sí).
- **Secuencias** — `ecf_sequences` + función `reserve_ecf_sequence_number()`
  con `SELECT ... FOR UPDATE` atómico para evitar duplicados.
- **Catálogo y proformas** — `payment_methods`, `proformas`, `proforma_items`,
  `proforma_payments`.
- **Caja** — `cash_registers`, `cash_register_sessions`, `cash_closings`,
  `cash_closing_sales`, `cash_closing_percentage_logs`, `proforma_to_ecf_logs`.
- **e-CF** — `electronic_invoices`, `electronic_invoice_items`.
- **DGII I/O** — `dgii_submissions`, `dgii_status_logs`, `dgii_received_ecf`,
  `dgii_commercial_approvals`.

Todas con `business_id`, RLS por tenant usando `auth_business_id()`,
timestamps `timestamptz`. FKs circulares (`proformas.electronic_invoice_id`,
`cash_closing_sales.electronic_invoice_id`, `proforma_to_ecf_logs.electronic_invoice_id`)
son `DEFERRABLE INITIALLY DEFERRED` para permitir crear ambos lados en una
sola transacción. Tablas immutables (sin `deleted_at`): `dgii_submissions`,
`dgii_status_logs`, `cash_closing_percentage_logs`, `proforma_to_ecf_logs`.

**`sales/sale_items` no se incluyó como tabla separada** — el documento del
usuario lista `sales` aparte pero los tipos TS (`Proforma` con
`documentKind: 'proforma' | 'invoice'`) ya unifican proforma + venta. La
tabla `proformas` con `document_kind` cumple ambos roles. Si más adelante se
prefiere separar, se hace en una migración posterior.

## 10. Librerías recomendadas

(Pendientes de instalar en Fase D+):

| Necesidad         | Recomendación                                       |
|-------------------|------------------------------------------------------|
| XML builder       | `xmlbuilder2`                                        |
| XML parser        | `fast-xml-parser`                                    |
| XSD validation    | `libxmljs2` (con fallback validador remoto si Vercel build falla por nativos) |
| Canonicalización  | provista por firmador o `xml-c14n`                   |
| XAdES-BES         | `xadesjs` + `xmldsigjs` + `node-webcrypto-ossl`      |
| PKCS#12           | `node-forge`                                          |
| QR                | `qrcode`                                              |
| PDF               | `@react-pdf/renderer` (server-side)                  |
| Crypto AES        | `crypto` (Node built-in)                              |
| HTTP DGII         | `undici`/`fetch` nativos                              |
| Colas / jobs      | Vercel Workflow (WDK) o Upstash Redis + BullMQ        |

Ya instaladas que sirven: `zod`, `pino`, `@supabase/ssr`, `@supabase/supabase-js`.

## 11. Reglas duras de seguridad

- ❌ No commitear `*.p12`, `*.pfx`, `*.key`, `*.pem`, `*.crt`, `*.cer`, `*.der`, `certificates/`.
- ❌ No imprimir passwords ni tokens DGII en logs.
- ❌ No exponer el certificado al cliente. `"server-only"` mandatorio.
- ❌ No `console.log` de XML completos en producción (PII + facturación).
- ✅ `.gitignore` raíz se refuerza en este PR con `*.cer`, `*.der`, `*.cert`, `certificates/` (faltaban tras el pull).
- ✅ Cifrar `.p12` at-rest con AES-256-GCM (clave en Vercel Env Secret).
- ✅ Password del cert vía Vercel Env Secret o Supabase Vault, referenciada por `dgii_certificates.password_secret_ref`.

## 12. Qué NO se hace en esta rama (hasta Fase B inclusive)

- ❌ Cambios al servicio DGII (`service.ts`) excepto comentarios documentales.
- ❌ Instalación de librerías nuevas.
- ❌ **Aplicar** la migración `0003_dgii_pos.sql` a Supabase (sólo el archivo
  queda en el repo; aplicar requiere `supabase db push` con autorización).
- ❌ Llamadas reales a cualquier ambiente DGII (incluso testecf).
- ❌ Subida de certificado.
- ❌ Activación de `dgii_enabled = true`.
- ❌ Cambios al builder XML.
- ❌ Cambios al cierre de caja.
- ❌ Cambios a `DATA_SOURCE` o conexión Supabase real.
- ❌ Deploy producción.
- ❌ Tocar DNS o variables Vercel.
- ❌ Borrar o renombrar archivos del módulo existente.
- ❌ Recuperar el `stash@{1}` con el plan viejo (queda en local, se descartará después).

## 13. Riesgos

| Riesgo                                                                                | Mitigación                                                                                            |
|---------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| Reescribir el builder XML rompe la UI mock                                            | Cambiar mocks en paralelo; mantener `service.ts` exportando misma interface.                          |
| `libxmljs2` requiere binarios nativos — puede fallar en Vercel build                  | Probar en preview. Fallback: validador JS puro o microservicio aparte.                                |
| Race en `next_number` de secuencias                                                    | `UPDATE ... SET next_number = next_number+1 RETURNING` atómico.                                       |
| Pérdida de `DGII_CERT_ENCRYPTION_KEY` → cert irrecuperable                              | Rotación documentada + backup en Vault.                                                                |
| Cambio de XSD DGII                                                                     | Versionado por archivo `xsd/e-CF-XX-vY.Z.xsd`; builder elige por versión activa.                      |
| Vercel build EPERM en Windows                                                          | Construir solo en builder remoto (`vercel deploy` sin `vercel build` local).                          |
| Implementar pre-certificación sin set oficial DGII                                     | Bloqueado por D-08 en `matriz-requisitos-dgii.md`. Pedir al usuario el set.                           |
| Confundir UI mock con realidad fiscal                                                  | Banner "Módulo DGII inactivo" ya está. Añadir advertencias adicionales en pantallas que toquen $.     |

## 14. Criterios de salida

Para esta Fase A:

- ✅ Carpeta `docs/dgii/` con auditoría, matriz, plan, requisitos copiados y XSD.
- ✅ `apps/web/.gitignore` reforzado con certificados.
- ✅ Working tree limpio aparte de los archivos esperados.
- ✅ `git status` sin `.env`, `.vercel`, `*.p12`, `*.pfx`, `*.key`, `*.pem`, `*.crt`, `*.cer`, `*.der`.
- ✅ Push a `feature/dgii-module-review-adjustments`.
- ✅ Preview deploy (opcional) sin cambios funcionales visibles.
- ✅ Reporte final entregado al usuario.

Para cualquier Fase B+:

- Build remoto Vercel verde en preview.
- Tests pasando para los servicios tocados.
- Nada de DGII real sin confirmación explícita.
- Documentación actualizada en `docs/dgii/`.
