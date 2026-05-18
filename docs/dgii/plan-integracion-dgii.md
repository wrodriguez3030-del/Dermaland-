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

- **Fase A (este PR)** — Auditoría documentada, matriz de brechas, ajustes
  cosméticos seguros (gitignore reforzado, comentarios y advertencias
  fiscales donde toca, copia de XSD y requisitos al repo). **Sin cambios
  funcionales en servicios DGII.**
- **Fase B+** — Cada brecha P0/P1 entra como PR propio sobre esta rama o
  ramas hijas, con tests y preview.

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
| A    | Este PR: docs + gitignore refuerzo + advertencias                                                                              | Mínimo                                      | No      | No             | —                                |
| B    | Schema DB: `dgii_settings`, `dgii_certificates`, `dgii_sequences`, `electronic_invoices(+items)`, `proformas(+items)`, `sales(+items)`, `cash_*` + RLS | `supabase/migrations/0003_dgii_pos.sql`     | **Sí**  | No             | Autorización del usuario          |
| C    | Ampliar `env.ts` con tres ambientes + `dgii_settings.base_url_*`; persistir `/dgii/configuracion`                              | env + page + service                        | Sí      | No             | Fase B                            |
| D    | Reescribir `DgiiXmlBuilder` (e-CF 31) con `xmlbuilder2` siguiendo XSD. Tests offline con fixture válida.                       | `service.ts` o nuevo `builder.ts` + tests   | No      | No             | Fase C parcial (settings)         |
| E    | Implementar `DgiiXmlValidator` con XSD local                                                                                   | nuevo `validator.ts`                        | No      | No             | Fase D                            |
| F    | Implementar `DgiiXmlSigner` con dummy cert local                                                                               | nuevo `signer.ts`                           | No      | No             | Fase D                            |
| G    | `DgiiAuthService` contra `testecf` **sólo** con dummy cert o cert real + autorización del usuario                              | nuevo `auth.ts`                             | No      | testecf only   | Fase F + cert dummy o autorización|
| H    | `DgiiReceptionService` + `DgiiStatusService` contra `testecf`                                                                  | nuevos                                       | Sí      | testecf only   | Fase G                            |
| I    | PDF + QR                                                                                                                       | nuevo `pdf.ts` + `qr.ts` + páginas         | No      | No             | Fase D-H                          |
| J    | Cierre de caja: % configurable + FIFO + autorización + auditoría                                                               | `caja/page.tsx` + `CashClosingEcfService`   | Sí      | No             | Fase B                            |
| K    | Pre-certificación: panel + set de pruebas + evidencias                                                                          | nueva pantalla + servicio                   | Sí      | testecf only   | Fase G-I + autorización           |
| L    | e-CF 32, 33, 34 (builders + validators)                                                                                        | servicios + UI                              | No      | testecf only   | Fase D-G                          |
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

Detalladas en la matriz. Resumen para futura `0003_dgii_pos.sql`:

- `dgii_settings`
- `dgii_certificates` (sin password — referencia a Vault)
- `dgii_sequences`
- `payment_methods` / `taxes`
- `sales` / `sale_items`
- `proformas` / `proforma_items`
- `cash_registers` / `cash_register_sessions` / `cash_closings` /
  `cash_closing_sales` / `cash_closing_percentage_logs` /
  `proforma_to_ecf_logs`
- `electronic_invoices` / `electronic_invoice_items`
- `dgii_submissions` / `dgii_status_logs`
- `dgii_received_ecf` / `dgii_commercial_approvals`

Todas con `business_id`, RLS por tenant, `created_at/updated_at`, soft-delete
donde aplique. Submissions y status_logs son **immutables** (no `deleted_at`).

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

## 12. Qué NO se hace en este PR

- ❌ Cambios al servicio DGII (`service.ts`) excepto comentarios documentales.
- ❌ Instalación de librerías nuevas.
- ❌ Migraciones de DB.
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
