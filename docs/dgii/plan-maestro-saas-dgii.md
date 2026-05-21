# Plan Maestro SaaS DGII — Facturación Electrónica e-CF para República Dominicana

> **Versión:** 1.0
> **Fecha:** 2026-05-21
> **Autor:** Equipo SaaS DGII (basado en las lecciones aprendidas implementando DermaLand)
> **Audiencia:** Equipo técnico, dueño del SaaS, contador / asesor fiscal, soporte y auditor.

---

## 1. Portada

Este documento es el primero de un paquete de cinco entregables que conforman el Plan Maestro para construir, certificar y operar un módulo SaaS de facturación electrónica DGII (e-CF) para República Dominicana.

El paquete completo está pensado para ser reutilizable: un equipo nuevo, en un SaaS distinto, debería poder usar estos cinco documentos como guía para implementar el módulo desde cero hasta producción fiscal, respetando los gates de seguridad y compliance que ya validamos en DermaLand.

**Documentos del paquete:**

1. `plan-maestro-saas-dgii.md` (este documento) — visión estratégica y operativa.
2. `prd-saas-facturacion-electronica-dgii.md` — Product Requirements detallado.
3. `agentes-y-skills-saas-dgii.md` — catálogo de 25 agentes + skills + prompts.
4. `roadmap-fases-saas-dgii.md` — 20 fases con criterios de salida.
5. `checklist-implementacion-saas-dgii.md` — checklists prácticos con responsables.

**Garantía de seguridad de este documento:** NO contiene secretos, contraseñas, tokens, RNCs reales, contenido de certificados ni datos sensibles. Las URLs `ecf.dgii.gov.do/*` son documentación pública oficial DGII.

---

## 2. Resumen ejecutivo

La facturación electrónica e-CF es obligatoria en República Dominicana para un volumen creciente de contribuyentes según la implementación progresiva definida por la DGII (Norma 06-2018 y sus actualizaciones). Cada contribuyente que llegue a su fecha de obligatoriedad debe ser capaz de emitir comprobantes fiscales electrónicos firmados con certificado digital, validados contra el XSD oficial, enviados al ambiente correspondiente (testecf / certecf / ecf) y consultados por TrackId, conservando evidencias por al menos diez años.

Implementar esto desde cero en un SaaS multi-tenant tiene tres dimensiones críticas que no se pueden separar: **técnica** (XML, XMLDSig, criptografía PKCS#12, integración HTTP con DGII), **fiscal** (postulación, designación de Usuario Administrador e-CF, rangos e-NCF, conservación legal) y **operativa** (onboarding del cliente final no-técnico, soporte, monitoreo, respuesta a incidentes DGII).

Este Plan Maestro consolida una arquitectura, un modelo de datos, un flujo de fases y un conjunto de killswitches que aíslan cada riesgo: el cliente puede subir un certificado real sin que el sistema haga nunca una llamada a DGII; puede preparar un envío completo en modo dry-run sin consumir secuencias; puede certificarse en testecf antes de tocar producción fiscal. El sistema acompaña al cliente paso a paso y no se mueve solo aunque técnicamente pudiera.

---

## 3. Visión del sistema

El estado final deseado es un módulo SaaS multi-tenant donde:

- Cualquier contribuyente RD se registra, configura sus datos fiscales y carga su certificado digital en menos de 30 minutos sin asistencia técnica.
- Cada cliente opera bajo su propio `business_id`, con aislamiento garantizado por Row-Level Security (RLS) en Supabase: cero data leak cross-tenant.
- El proceso de habilitación es un wizard de 10 pasos con explicaciones claras, evidencia por ítem, y un panel de estado global con 8 estados nombrados que cualquier usuario no-técnico entiende.
- El envío real a DGII está protegido por killswitches en capas: env flag + chequeo de ambiente + postulación confirmada + rango autorizado + confirmación manual + permiso de rol. Ninguno se asume; todos se verifican.
- Errores DGII se muestran tal como vienen, sin ocultar — el cliente y su contador ven exactamente qué dijo DGII y qué hacer al respecto.
- Producción fiscal nunca se activa por accidente: requiere transición explícita testecf → certecf → ecf con autorización per-cliente.

---

## 4. Objetivo del módulo

**Habilitar a cada contribuyente cliente del SaaS para emitir, firmar, enviar y conservar comprobantes fiscales electrónicos DGII de forma segura, auditable y reutilizable entre proyectos.**

- Configurar datos fiscales sin tocar código.
- Subir y custodiar certificado digital cifrado server-side.
- Generar XML e-CF XSD-compliant para los tipos 31/32/33/34 (y opcionalmente 41-47).
- Firmar con XMLDSig enveloped contra el cert del Usuario Administrador e-CF.
- Enviar a testecf / certecf / ecf con auth flow Semilla → ValidarSemilla → bearer token.

---

## 5. Alcance funcional

Lo que el cliente final puede hacer dentro del módulo:

- Configurar RNC, razón social, dirección fiscal, provincia/municipio, contacto, ambiente activo.
- Subir certificado `.p12` o `.pfx` cifrado server-side; validarlo localmente con prueba de firma.
- Cargar rangos e-NCF autorizados por DGII para cada tipo de comprobante.
- Completar checklist de habilitación de 10 pasos con evidencia por ítem.
- Ejecutar pruebas de pre-certificación local (XSD válido + firma válida + QR demo).
- Preparar pre-flight de envío a testecf en modo dry-run (no toca DGII).
- Enviar comprobantes reales a testecf cuando la postulación esté aprobada.
- Consultar TrackId y estado de cada envío.
- Generar PDFs de representación impresa con QR y código de seguridad.
- Recibir e-CF de terceros (sender) y aprobarlos comercialmente.
- Crear notas de crédito (e-CF 34) sobre comprobantes propios.
- Acceder a reportes fiscales por período.
- Asignar permisos DGII por rol (admin / cajero / contador / soporte).

---

## 6. Alcance técnico

- **Stack:** Next.js 15 App Router (Server Components + Server Actions + Route Handlers), React 19, TypeScript estricto, Tailwind, Supabase (Postgres + Auth + Storage + RLS), Vercel hosting (Edge + Node Functions), Vitest para tests, Playwright para E2E.
- **Librerías DGII clave:** `node-forge` (PKCS#12 parsing, RSA sign), `xml-crypto` (XMLDSig enveloped), `xmllint-wasm` (validación XSD oficial), `xmlbuilder2` (construcción de XML), `qrcode` (QR de representación impresa).
- **Persistencia:** Postgres con RLS por `business_id`. Storage privado para blobs de certificados cifrados (AES-256-GCM).
- **Integraciones externas:** DGII (HTTP/HTTPS a `ecf.dgii.gov.do/*`), entidad certificadora INDOTEL/DGII (offline; el cert se compra y se sube).
- **Build & deploy:** monorepo con `apps/web` como Root Directory; Vercel autodeploy desde rama; `outputFileTracingIncludes` para bundlear los XSDs.
- **Tests:** ≥80% cobertura en builder/signer/validator; tests cross-tenant que rechazan inserts ajenos; tests con `vi.spyOn(global, 'fetch')` que prohíben llamadas accidentales a DGII en suites locales.

---

## 7. Alcance fiscal

- **Norma DGII 06-2018** y sus actualizaciones (consultar siempre la última vigente).
- **Tipos de e-CF cubiertos:** 31 (Crédito Fiscal), 32 (Consumo), 33 (Nota de Débito), 34 (Nota de Crédito). Opcional ampliar a 41 (Compras), 43 (Gastos Menores), 44 (Regímenes Especiales), 45 (Gubernamental), 46 (Exportaciones), 47 (Pagos al Exterior).
- **Ambientes DGII:** `testecf` (pre-pruebas), `certecf` (certificación formal), `ecf` (producción fiscal).
- **Postulación DGII:** trámite externo del contribuyente; el sistema no lo gestiona pero lo bloquea como pre-requisito para enviar.
- **Usuario Administrador e-CF:** persona física designada formalmente ante DGII para firmar e-CF en nombre del contribuyente.
- **Rangos e-NCF:** asignados por DGII por contribuyente y tipo; el sistema los administra como tabla `ecf_sequences` con `range_start`, `range_end`, `next_number`, `status` y `ambiente`.
- **Conservación:** evidencias XML firmado + respuesta DGII + TrackId + status logs se conservan al menos 10 años per normativa.

---

## 8. Qué queda fuera del alcance

- **No es un sistema contable.** No lleva contabilidad doble entrada ni estado de resultados.
- **No es un ERP.** No gestiona inventario complejo, compras, RRHH, ni nómina.
- **No reemplaza al contador.** No emite dictámenes ni asesoría fiscal personalizada.
- **No emite NCF legados.** Solo e-CF según Norma 06-2018; los NCF físicos pre-2019 quedan fuera.
- **No recupera certificados perdidos.** Si el cliente pierde el `.p12` o la password, debe comprar uno nuevo a la CA emisora.
- **No automatiza la postulación DGII.** El cliente / contador la hace en el portal SIRTSS de DGII.
- **No interfiere con políticas internas del contribuyente.** Quien firma, qué se factura y cuándo es decisión del contador y la administración del cliente.
- **No es un sustituto del cumplimiento legal.** El cliente sigue siendo responsable ante DGII por errores u omisiones fiscales.

---

## 9. Principios del sistema

1. **Aislamiento por tenant.** Cada cliente vive bajo su `business_id`; RLS lo enforza; cross-tenant queries fallan.
2. **Killswitches en capas.** Cada acción potencialmente fiscal está detrás de múltiples flags independientes que deben coincidir.
3. **Dry-run primero, real después.** Cada flow tiene una versión local que se puede ejecutar muchas veces sin consecuencias antes de la versión "live".
4. **Certificado server-only.** El `.p12` nunca llega al cliente; se descifra solo en server actions / route handlers / edge functions.
5. **No secretos en logs.** Passwords, tokens, private keys jamás se imprimen. Tests con spies que detectan leaks.
6. **Errores DGII transparentes.** Lo que DGII devuelve se muestra como vino, sin reinterpretar; el cliente y su contador deciden.
7. **Producción intacta por default.** Vercel Production env queda vacío; el cliente solo activa producción fiscal cuando todo está verde.
8. **Onboarding asistido pero no asumido.** El wizard guía, no asume; cada confirmación requiere acción explícita.
9. **Documentación al lado del código.** Cada fase deja su runbook, su QA, su checklist de cierre.
10. **Reutilizable entre SaaS.** El módulo está empaquetado de forma que se pueda copiar a otro proyecto con ajustes mínimos.
11. **Tests prohíben red.** Suite local nunca golpea DGII real; spy global de `fetch` falla los tests si alguien lo intenta.
12. **Lo que afecta cumplimiento, se audita.** Todo cambio fiscal se loggea en `audit_logs` con `business_id` + `user_id` + timestamp + metadata.

---

## 10. Arquitectura SaaS multi-tenant recomendada

```
┌─────────────────────────────────────────────────────────────┐
│                    Cliente del SaaS                         │
│   (dueño del negocio + contador + cajero + admin e-CF)      │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS + cookie sesión
┌────────────────────────────▼────────────────────────────────┐
│              Next.js 15 (App Router · Vercel)               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Server Components (RSC)                              │   │
│  │  - /dgii/habilitacion (wizard 10 pasos)              │   │
│  │  - /dgii/certificado (subida + prueba local)         │   │
│  │  - /dgii/configuracion (form fiscal)                 │   │
│  │  - /dgii/secuencias (rangos e-NCF)                   │   │
│  │  - /dgii/certificacion (pre-cert mock)               │   │
│  │  - /dgii/facturas (emisión + listado)                │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Route Handlers (server-only)                         │   │
│  │  - /api/dgii/certificate/upload                      │   │
│  │  - /api/dgii/certificate/test-local                  │   │
│  │  - /api/dgii/invoices/testecf-send (dry-run)         │   │
│  │  - /api/dgii/invoices/[id]/send (Fase G, gated)      │   │
│  │  - /api/dgii/invoices/[id]/status (Fase H, gated)    │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Services (puros, testables)                          │   │
│  │  - builder.ts (XML XSD-compliant)                    │   │
│  │  - signer.ts (XMLDSig enveloped)                     │   │
│  │  - validator.ts (xmllint-wasm)                       │   │
│  │  - testecf-client.ts (prepare + execute stub)        │   │
│  │  - certificate-storage.ts (AES-256-GCM)              │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │ supabase-js (anon + JWT) / service-role
┌────────────────────────────▼────────────────────────────────┐
│                  Supabase (Postgres + Auth + Storage)       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Tables (todas con RLS por business_id):              │   │
│  │  businesses · users · dgii_settings                  │   │
│  │  dgii_certificates · ecf_sequences                   │   │
│  │  electronic_invoices · electronic_invoice_items      │   │
│  │  dgii_submissions · dgii_status_logs                 │   │
│  │  audit_logs · enablement_progress                    │   │
│  │  representative_attestations                         │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Storage (privado):                                   │   │
│  │  - certificates/<business_id>/<uuid>.p12.enc         │   │
│  │  - xml/<business_id>/<invoice_id>.signed.xml         │   │
│  │  - xml/<business_id>/<invoice_id>.response.xml       │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────┐
│                          DGII RD                            │
│  - testecf (https://ecf.dgii.gov.do/testecf/)               │
│  - certecf (https://ecf.dgii.gov.do/certecf/)               │
│  - ecf     (https://ecf.dgii.gov.do/ecf/)                   │
│  Flow auth: Semilla → ValidarSemilla → Bearer token         │
│  Recepción: POST multipart /recepcion/api/ecf               │
└─────────────────────────────────────────────────────────────┘
```

**Capas:**

- **UI** (RSC + client components): wizard, formularios, dashboard.
- **API** (route handlers): endpoints internos del SaaS; nunca expuestos a internet sin auth.
- **Services** (puros TS): builder, signer, validator, client DGII — testables sin DB.
- **Persistence** (Supabase): tablas con RLS, storage cifrado, audit_logs.
- **Integraciones** (HTTP): DGII como única externa relevante; CAs son offline.

---

## 11. Modelo de datos mínimo

### `businesses`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() |
| `legal_name` | text | razón social |
| `rnc` | text | 9 u 11 dígitos |
| `country` | text | "DO" |
| `dgii_enabled` | boolean | default false |
| `plan_id` | uuid FK | a planes SaaS |
| `status` | text | active / suspended / trial |

### `users`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | linkea a `auth.users` |
| `business_id` | uuid FK NOT NULL | tenant key |
| `role` | text | admin / cashier / accountant / support |
| `branch_ids` | uuid[] | optional |

### `dgii_settings`
| Columna | Tipo | Notas |
|---|---|---|
| `business_id` | uuid PK FK | 1:1 con business |
| `rnc_emisor` | text | denormalizado para validación rápida |
| `razon_social_emisor` | text | |
| `direccion_emisor` | text | |
| `provincia_codigo` | text | |
| `municipio_codigo` | text | |
| `correo_emisor` | text | |
| `telefono_emisor` | text | |
| `ambiente` | text | `testecf` / `certecf` / `ecf` |
| `dgii_enabled_real_send` | boolean | killswitch nivel tenant |

### `dgii_certificates`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK NOT NULL | |
| `alias` | text | nombre legible (CN del subject) |
| `subject_dn` | text | RFC 2253 |
| `issuer_dn` | text | |
| `serial_number` | text | hex |
| `valid_from` | timestamptz | |
| `valid_to` | timestamptz | |
| `pkcs12_storage_bucket` | text | |
| `pkcs12_storage_path` | text | |
| `pkcs12_encrypted_blob` | bytea | sealed AES-256-GCM JSON |
| `password_secret_ref` | text | sealed AES-256-GCM JSON |
| `kdf` | text | "AES-256-GCM" |
| `is_active` | boolean | una sola fila activa por business |
| `uploaded_by` | uuid FK users | |
| `created_at` | timestamptz | |
| `revoked_at` | timestamptz | nullable |

Constraint: parcial unique `(business_id) WHERE is_active = true`.

### `ecf_sequences`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK NOT NULL | |
| `tipo_ecf` | text | 31/32/33/34/41-47 |
| `ambiente` | text | testecf/certecf/ecf |
| `range_start` | bigint | inicio del rango DGII |
| `range_end` | bigint | fin del rango DGII |
| `next_number` | bigint | siguiente a reservar |
| `expires_at` | timestamptz | vencimiento del rango |
| `status` | text | active/exhausted/expired/revoked |

Función SQL `reserve_next_encf(business_id, tipo, ambiente)` atómica con `SELECT ... FOR UPDATE`.

### `electronic_invoices`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK NOT NULL | |
| `tipo_ecf` | text | |
| `e_ncf` | text | reservado de ecf_sequences |
| `secuencia_id` | uuid FK ecf_sequences | |
| `status` | text | draft → generated → validated → signed → submitted → in_process → accepted / accepted_conditional / rejected / cancelled / error |
| `customer_rnc` | text | optional |
| `subtotal_gravado` | numeric(14,2) | |
| `total_itbis` | numeric(14,2) | |
| `total` | numeric(14,2) | |
| `xml_generated_path` | text | Storage |
| `xml_signed_path` | text | Storage |
| `xml_response_path` | text | Storage |
| `track_id` | text | DGII |
| `dgii_status_code` | text | |
| `dgii_status_message` | text | |
| `ambiente` | text | |
| `generated_at/signed_at/sent_at/accepted_at` | timestamptz | |

### `electronic_invoice_items`
Snapshot inmutable de las líneas. `business_id`, `electronic_invoice_id`, `line_no`, `name_item`, `quantity`, `unit_price`, `itbis_rate`, `monto_item`.

### `dgii_submissions`
Cada envío a DGII (puede haber varios reintentos por invoice).
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK | |
| `electronic_invoice_id` | uuid FK | |
| `attempt_no` | int | |
| `endpoint_url` | text | el URL exacto invocado |
| `request_headers` | jsonb | sin secretos |
| `request_body_path` | text | Storage |
| `response_status` | int | HTTP |
| `response_body_path` | text | Storage |
| `track_id` | text | |
| `error_code` / `error_message` | text | |
| `sent_at` / `responded_at` | timestamptz | |

### `dgii_status_logs`
Cada consulta de TrackId.

### `audit_logs`
`business_id` + `user_id` + `action` + `entity` + `entity_id` + `metadata` + `created_at`. RLS INSERT exige `business_id = auth_business_id() AND (user_id IS NULL OR user_id = auth.uid())`.

### `enablement_progress`
Estado del wizard por business + step + checklist con evidencia por ítem + `declaration_accepted`.

### `representative_attestations`
Snapshot inmutable de las 9 evidencias del paso "Autorización del representante e-CF" con responsable, fecha, ref documental, nota.

---

## 12. Separación por business_id

**Regla:** toda tabla del módulo DGII tiene `business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE`. Excepciones:
- `businesses` (raíz).
- `users` (linkea a `auth.users` con `business_id` para tenant context).
- Tablas globales (planes, branding del SaaS) no tienen `business_id`.

Toda PK compuesta o índice debe llevar `business_id` como primera columna. Toda FK que cruza tablas del módulo arrastra `business_id` para que la RLS funcione transitivamente.

---

## 13. RLS por tenant

Template aplicado a todas las tablas con `business_id`:

```sql
ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;

CREATE POLICY <tabla>_all ON <tabla>
  FOR ALL
  USING (business_id = auth_business_id())
  WITH CHECK (business_id = auth_business_id());
```

`auth_business_id()` lee el claim del JWT en este orden: root → `app_metadata` → `user_metadata`. Esto permite que la app use el JWT del seed user para queries y service-role para jobs administrativos.

**Verificación:** smoke test con dos seed users (business A y business B); el usuario A no puede SELECT, INSERT, UPDATE ni DELETE filas del business B. El test forma parte del CI.

---

## 14. Auditoría por tenant

`audit_logs` tiene dos policies:

```sql
-- Lectura: solo tu business.
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (business_id = auth_business_id());

-- Insert: solo tu business + tu user (o NULL para acciones del sistema).
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT WITH CHECK (
    business_id = auth_business_id()
    AND (user_id IS NULL OR user_id = auth.uid())
  );
```

Eventos auditables mínimos:
- `dgii_certificate_upload` (subida cert) / `dgii_certificate_revoke`.
- `dgii_settings_update` (cambio config fiscal).
- `dgii_sequence_load` (carga rango e-NCF).
- `dgii_invoice_generate` / `_sign` / `_send` / `_status_check`.
- `dgii_representative_attestation_save`.
- `dgii_environment_switch` (testecf → certecf → ecf).

Retención mínima: **10 años** según conservación fiscal.

---

## 15. Seguridad de certificados

- **Subida:** form `multipart/form-data` con `.p12` + password. Backend valida MIME, tamaño (< 10KB típico), parsea con `node-forge`, extrae metadata (subject, issuer, vigencia).
- **Cifrado:** blob `.p12` y password se cifran con **AES-256-GCM**; key de cifrado en env var `DGII_CERT_ENCRYPTION_KEY` (32 bytes random base64) o KMS. IV 12 bytes random por blob; tag 16 bytes; sealed JSON `{v:1, alg:"AES-256-GCM", data:base64(iv|tag|cipher)}`.
- **Persistencia:** blob cifrado en Supabase Storage privado `certificates/<business_id>/<uuid>.p12.enc`. Solo `service_role` lee.
- **Descifrado:** solo en server-side (route handlers / server actions / edge functions). El cert PEM y la private key existen en memoria durante el flow de firma; al salir del scope se liberan.
- **Cliente:** la UI nunca recibe el cert ni la password. Solo recibe metadata pública (subject, vigencia, fingerprint) y resultados de la prueba de firma.
- **Rotación:** cliente sube nuevo cert → se cifra → se marca `is_active=true` y se desactiva el anterior (`is_active=false, revoked_at=now()`). Constraint parcial unique garantiza una sola fila activa.

---

## 16. Seguridad de secretos

- **Env vars sensibles:** marcadas `--sensitive` en Vercel. Lista mínima: `DGII_CERT_ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `DGII_TESTECF_SEND_ENABLED`.
- **No-go list para Git:** `.env`, `.env.local`, `.vercel/`, `.mcp.json`, `.claude/`, `*.p12`, `*.pfx`, `*.key`, `*.pem`, `*.crt`, `*.cer`, `*.der`, `*.cert`, `certificates/`. `.gitignore` los cubre todos.
- **Rotación:** `DGII_CERT_ENCRYPTION_KEY` no se rota fácil (requiere re-cifrar todos los blobs); documentar procedimiento. Service role key se rota semestral.
- **Backups:** key principal en Vault físico + copia en KMS. Procedimiento de recuperación documentado.
- **Logs:** ningún log de producción puede contener passwords, JWTs, private keys ni contenido cifrado. Tests con regex anti-leak.

---

## 17. Seguridad de logs

- **Server logs:** filtran tokens DGII, passwords, JWTs. Nunca imprimir `request_headers` completos (los headers Authorization se redactan).
- **Audit logs:** sólo metadata pública (subject DN, fingerprint short, validity, RNC). El `metadata jsonb` valida con un allowlist antes de insertarse.
- **Client logs:** zero — el frontend no loggea info sensible al console; en producción los console.log se strippean.
- **Error reporting:** Sentry o equivalente filtra PII (`beforeSend` con scrubbing de RNC, cédula, número de tarjeta).
- **Logs de DGII:** request/response bodies se guardan en Storage cifrado (path en `dgii_submissions.request_body_path`) — no en logs de aplicación.

---

## 18. Flujo completo del cliente SaaS

```
1. Crear negocio
   └─ Signup → onboarding inicial → business creado con plan trial.

2. Configurar datos fiscales
   └─ /dgii/configuracion: RNC, razón social, dirección, provincia/municipio,
      contacto, ambiente=testecf.

3. Subir certificado
   └─ /dgii/certificado: drag&drop .p12 + password. Backend cifra y persiste.

4. Validar certificado
   └─ Click "Ejecutar prueba local": cargar, vigencia, build XML demo,
      firma RSA-SHA256, verificar, validar XSD oficial, generar QR demo.
      8 steps verdes = cert técnicamente OK para firma.

5. Cargar secuencias
   └─ /dgii/secuencias: capturar rangos e-NCF que DGII asignó al RNC por tipo.

6. Completar checklist
   └─ /dgii/habilitacion paso 8: 9 ítems con evidencia (titular, cédula,
      RNC emisor, relación, designación, entidad cert, vigencia, CRL,
      acta) + declaración formal del responsable.

7. Ejecutar dry-run
   └─ Botón "Verificar pre-flight" en wizard. POST /api/dgii/invoices/
      testecf-send {tipoEcf: "31"}. Backend prepara payload completo,
      muestra URLs, valida XSD + firma, lista razones de bloqueo del
      envío real. NO toca DGII.

8. Enviar testecf
   └─ Cuando postulación + rango aprobados, y DGII_TESTECF_SEND_ENABLED=true:
      botón habilitado. POST /api/dgii/invoices/[id]/send {live:true,
      postulacionApproved:true, rangoAuthorized:true, userConfirmedAt}.
      Backend ejecuta auth flow + recepción; guarda track_id.

9. Consultar TrackId/status
   └─ Polling cron Edge Function cada N min consulta cada track_id
      con status='submitted'|'in_process'. Actualiza electronic_invoices.

10. Certificarse
    └─ Cuando 7-30 días de envíos testecf OK + métricas verdes,
       cliente solicita transición a certecf en portal DGII; sube
       evidencia; SaaS cambia ambiente='certecf'.

11. Activar producción fiscal
    └─ Cuando DGII certifica formalmente al contribuyente, el cliente
       (con autorización admin + contador + dueño SaaS) cambia a
       ambiente='ecf' y dgii_enabled_real_send=true. Producción fiscal
       activa.
```

---

## 19. Flujo completo técnico

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  MOCK   │ → │ PREVIEW │ → │DRY-RUN  │ → │TESTECF  │ → │ CERTECF │ → ECF
│ (local) │   │supabase │   │Fase G   │   │ Fase G  │   │ Fase 16 │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
                                                              │
                                                              ▼
                                                       ┌──────────┐
                                                       │PRODUCCIÓN│
                                                       │ FISCAL   │
                                                       └──────────┘
```

Cada flecha es **una autorización explícita**. No se salta una etapa. No hay fallback automático de regreso a una etapa superior; cada degradación es manual.

---

## 20. Dependencias externas

| Dependencia | Rol | Disponibilidad | Plan B |
|---|---|---|---|
| **DGII** (`ecf.dgii.gov.do`) | endpoint final de e-CF | SLA no público; outages reales | Cola interna + retry con backoff; comunicar a clientes |
| **Supabase** | DB + Auth + Storage | 99.9% SLA | Backups diarios; multi-region opcional |
| **Vercel** | hosting + edge | 99.99% SLA | Branch deploy + rollback < 1 min |
| **Entidad certificadora** (Viafirma, Avansi, Certi-Empresa) | emite el cert | Off-system | Cliente compra con anticipación |
| **Contador / asesor fiscal** | valida postulación + designación | Cliente humano | Sin él el cliente no certifica |
| **Cliente SaaS** | toma decisiones fiscales | Crítico | Soporte asistido con runbook |

---

## 21. Reglas de seguridad obligatorias

- **NUNCA** llamar a `ecf.dgii.gov.do/ecf/*` desde Preview ni desde tests.
- **NUNCA** subir `.p12`, `.pfx`, `.key`, `.pem`, `.crt`, `.cer`, `.der`, `.cert` a Git.
- **NUNCA** imprimir passwords, JWTs, service role keys, contenido cifrado en logs ni en chat ni en commits.
- **NUNCA** activar `DGII_TESTECF_SEND_ENABLED=true` en Production env hasta que la certificación esté completa.
- **NUNCA** hacer `vercel deploy --prod` sin checklist go-live cumplido.
- **NUNCA** modificar `.env.local`, `.mcp.json`, `.claude/`, ni archivos de certificado en el repo.
- **NUNCA** asumir que la postulación o el rango e-NCF están listos sin confirmación externa documentada.
- **NUNCA** desactivar RLS, ni siquiera "temporalmente para debugging".
- **NUNCA** usar `service_role` desde el cliente; solo desde Edge Functions / Server Actions.
- **NUNCA** hacer fallback automático testecf → certecf → ecf; toda transición es manual y autorizada.

---

## 22. Auditoría

Cada acción del módulo escribe en `audit_logs`:

```typescript
await audit.insert({
  business_id: session.businessId,
  user_id: session.user.id,
  user_name: session.user.fullName,
  action: 'dgii_invoice_send',
  entity: 'electronic_invoices',
  entity_id: invoice.id,
  metadata: {
    tipo_ecf: '31',
    track_id: track.id,
    dgii_response_status: 200,
    ambiente: 'testecf',
  },
});
```

**Retención:** 10+ años. Política de backups asegura inmutabilidad.

**Exportación:** `/admin/auditoria/export?from=YYYY-MM-DD&to=YYYY-MM-DD` genera CSV/JSON filtrado por business_id (RLS aplica).

**Consulta:** UI dedicada con filtros por acción, entidad, usuario, rango de fechas.

---

## 23. Manejo de errores DGII

Códigos comunes y respuesta esperada:

| Código DGII | Significado | Acción del sistema |
|---|---|---|
| 200 | Aceptado / TrackId emitido | Guardar `track_id`, status `submitted` |
| 400 | Error de schema o body malformado | Marcar `electronic_invoices.status='error'`, exponer mensaje al usuario |
| 401 | Token inválido o expirado | Re-ejecutar Semilla → ValidarSemilla; reintento limitado |
| 403 | Contribuyente no autorizado o ambiente incorrecto | Status `error`, alarma a contador (postulación pendiente?) |
| 404 | Endpoint no existe | Verificar `DGII_BASE_URL_*`; alarma a devops |
| 429 | Rate limit | Backoff exponencial (1m, 5m, 15m, 30m) |
| 5xx | DGII caída | Cola interna `status='pending_retry'`; reintento con backoff; alarma |
| Timeout | Sin respuesta en 30s | Reintento; si persiste, alarma DGII outage |

**Retry policy:**
- Reintentos automáticos: 3 con backoff (1m, 5m, 15m).
- Después de 3 fallidos: status `error` + alarma manual.
- Rate limit por business: máx 60 envíos/min al inicio.

**Alarmas:**
- Tasa de rechazo > 5% en 1h → notificar a soporte + cliente.
- DGII timeout > 3 consecutivos → notificar oncall.
- Cert vence en < 30 días → notificar cliente y contador.

---

## 24. Riesgos críticos

| # | Riesgo | Probabilidad | Impacto | Mitigación | Dueño |
|---|---|---|---|---|---|
| R-01 | Pérdida de `DGII_CERT_ENCRYPTION_KEY` | Baja | Crítico | Backup en Vault físico + KMS; procedimiento documentado | Seguridad |
| R-02 | Cert vencido sin aviso | Media | Alto | Cron alerta 60/30/7 días antes | Soporte + cliente |
| R-03 | Cross-tenant data leak | Baja | Crítico | RLS en todas las tablas + tests automatizados | Backend |
| R-04 | Envío masivo accidental a DGII | Baja | Alto | `dgii_enabled_real_send` per-business + rate limit + killswitches | DevOps |
| R-05 | Secuencia agotada en mid-venta | Media | Alto | Validación `next_number <= range_end - 100` antes de cada emisión; alarma 90% del rango | Backend |
| R-06 | XML rechazado por XSD post-deploy | Media | Alto | Validar contra XSD oficial antes de cada envío; tests del builder | Backend |
| R-07 | DGII outage prolongado | Baja-Media | Alto | Cola `pending_retry`; UI muestra estado "DGII caída" | DevOps + soporte |
| R-08 | Datos del emisor incorrectos en XML | Baja | Alto | Validar `dgii_settings.rncEmisor` contra SIRTSS al guardar | Compliance |
| R-09 | Mismatch RNC cert ↔ business | Baja | Alto | Validación al activar cert; bloquear si mismatch | Compliance |
| R-10 | Filtración del cert / password | Muy baja | Crítico | AES-256-GCM + Storage privado + decrypt solo server | Seguridad |
| R-11 | Re-uso de eNCF (duplicate) | Muy baja | Crítico | Función SQL atómica `reserve_next_encf` con FOR UPDATE | Backend |
| R-12 | Token DGII filtrado en logs | Baja | Alto | Redactor de headers; tests anti-leak | Seguridad |
| R-13 | Vercel Production env contaminado | Baja | Crítico | Política "cero env vars en Production hasta certificación"; revisión per-cambio | DevOps |
| R-14 | Postulación con datos viejos | Media | Alto | Validar antes de cada activación testecf; checklist § 3.7 | Contador |
| R-15 | Cliente cambia razón social y emite con dato viejo | Baja | Alto | Snapshot inmutable de datos del emisor por invoice | Backend |

---

## 25. Decisiones técnicas recomendadas

1. **XMLDSig enveloped (no XAdES-BES)** según documento oficial DGII; `SignatureMethod=rsa-sha256`, `DigestMethod=sha256`, `CanonicalizationMethod=c14n-20010315`, `Reference URI=""` con `isEmptyUri:true` para que xml-crypto no añada `Id` al elemento ECF (el XSD no lo permite).
2. **multipart/form-data** para recepción ECF según la doc oficial DGII.
3. **eNCF format:** `^[A-Z][0-9]{12}$` — primera letra E, dos siguientes el tipo (31/32/33/34), 10 dígitos del rango.
4. **`xmllint-wasm` para validación XSD** — sin dependencias nativas, funciona en Vercel functions; alternativa `libxmljs2` rota el build de Vercel.
5. **`xml-crypto v6+`** para XMLDSig; antes de v6 tenía bugs con Reference URI vacío.
6. **`node-forge`** para PKCS#12 — más portable que `openssl` shell.
7. **Encoding del XML:** UTF-8 declarado; sin BOM.
8. **Storage cifrado server-side** para blobs `.p12` — Supabase Storage privado con service_role; Edge Function descifra al firmar.
9. **`DGII_TESTECF_SEND_ENABLED`** como killswitch independiente de los flags per-business — capa adicional.
10. **Tests prohíben fetch real** — `vi.spyOn(global, 'fetch')` que tira; verificación al final del suite.

---

## 26. Checklist antes de producción

- [ ] Cert vigente > 90 días.
- [ ] Postulación DGII aprobada formalmente.
- [ ] Rangos e-NCF de producción autorizados por DGII para cada tipo emitible.
- [ ] Margen suficiente: `next_number <= range_end - 100`.
- [ ] Backup Supabase del día (verificado restorable).
- [ ] Cron polling status Fase H activo y monitoreado.
- [ ] Alarmas configuradas: rechazo > 5%, DGII timeout > 3, secuencia 90% agotada, cert vence en 30 días.
- [ ] Plan de rollback documentado y simulado en stage.
- [ ] Acta de habilitación DGII recibida y archivada.
- [ ] Contador firmó declaración jurada interna.
- [ ] Comunicación a clientes: emisión activa, política de e-CF.
- [ ] Soporte capacitado para errores comunes.
- [ ] Runbook actualizado para "qué hacer si DGII está caída".
- [ ] Acceso a logs de auditoría verificado por auditor.
- [ ] Política de retención de evidencias (10 años) implementada.

Solo cuando los 15 items estén verdes: `ambiente='ecf'` y `dgii_enabled_real_send=true` per business autorizado.

---

## 27. Estrategia de soporte

- **Canales:** chat in-app, email, ticket. Soporte solo desde rol "support" con acceso de solo-lectura a `audit_logs` y `dgii_submissions`.
- **SLA:**
  - P0 (DGII outage o cliente no puede emitir): respuesta < 15 min, mitigación < 1h.
  - P1 (cliente bloqueado por config): respuesta < 1h, resolución < 4h.
  - P2 (consulta general): respuesta < 4h, resolución < 24h.
- **Runbook:** `docs/dgii/runbook-soporte.md` (referencia a runbook-fase-f-g-h.md y a este plan maestro).
- **Escalation:** soporte → ingeniero backend → líder técnico → compliance/contador.
- **Capacitación:** mensual sobre cambios DGII, casos comunes, lectura de XML.

---

## 28. Estrategia de onboarding de clientes

**5 etapas:**

1. **Signup + provisioning** (día 0): cliente firma, recibe acceso al SaaS, business creado.
2. **Habilitación** (día 0-7): wizard /dgii/habilitacion — paso 1 a 10. Soporte acompaña por chat.
3. **Pre-Fase G** (día 7-14): checklist representante con contador + obtener cert + cargar secuencias mock.
4. **Testecf** (día 14-21): enviar 10+ comprobantes de prueba a DGII testecf; resolver rechazos.
5. **Certecf → producción** (día 21-45): solicitar transición DGII, certificación formal, activar producción fiscal.

**Métricas:**
- TTHabilitación (signup → wizard 100%): < 7 días media.
- TTProducción (signup → emite real): < 45 días media.
- Sin-soporte rate: % de clientes que completan habilitación sin ticket > 60%.

---

## 29. Estrategia de monitoreo

**Alarmas críticas (página oncall):**
- DGII responde 5xx > 3 consecutivos.
- Rechazo > 5% en 1h.
- Cert vencido en < 7 días (per business).
- Secuencia agotada (`next_number > range_end`) per business + tipo.
- Audit logs no se insertan (RLS issue).
- Spike de errores 401 (token o postulación).

**Dashboards:**
- Volumen de e-CFs emitidos por día / tipo / business.
- Tasa de aceptación DGII por business.
- Latencia p95 del flow `submit`.
- Edge Function ejecución y errores.
- Backups Supabase status.

**Métricas de negocio:**
- Clientes en cada estado del enablement.
- Tiempo medio para llegar a `ready_for_testecf`.
- % de clientes que llegan a producción fiscal.

---

## 30. Estrategia de recuperación ante errores

- **Backups Supabase:** point-in-time recovery 7 días + snapshot diario retenido 30 días + snapshot mensual retenido 1 año + snapshot anual retenido 10 años (compliance fiscal).
- **Rollback de fase:** cada fase del roadmap tiene rollback documentado. Ej. revertir Fase G se hace con `UPDATE dgii_settings SET dgii_enabled_real_send=false` y desactivando el flag de env.
- **DGII outage fallback:** cola `pending_retry`; UI muestra banner "DGII caída"; el cliente sigue operando offline; al volver DGII, los envíos drenan automáticamente.
- **Cert revocado de emergencia:** `UPDATE dgii_certificates SET is_active=false, revoked_at=now()`; UI vuelve a "Sin certificado activo".
- **Recuperación de `DGII_CERT_ENCRYPTION_KEY`:** procedimiento de 2 personas + Vault físico; sin la key los certs son irrecuperables (se vuelve a subir cada uno).

---

## 31. Estrategia para múltiples clientes SaaS

**Tenant lifecycle:**
- Trial (30 días) → Active → Suspended (impago) → Cancelled (datos retenidos 30 días) → Hard-delete (cumpliendo retención fiscal de 10 años para evidencias).
- Suspension: bloquea emisión real DGII pero conserva datos.
- Hard-delete: `audit_logs` y `electronic_invoices` se exportan a archivo cifrado para retención legal antes de borrar.

**Billing:**
- Por business + plan. e-CFs emitidos como métrica secundaria.
- Métricas para upselling: % uso de rango eNCF, # comprobantes/mes.

**Multi-region:**
- Supabase región us-east-1 (cercano a DGII en RD).
- Vercel edge en mismo región para latencia.

---

## 32. Cómo adaptar el módulo a otro sistema

**Reutilizable tal cual:**
- `apps/web/src/server/services/dgii/*` (builder, signer, validator, testecf-client, preflight).
- `supabase/migrations/000[1-7]_*.sql` (multi-tenant + DGII).
- `docs/dgii/xsd/*.xsd` (XSDs oficiales).
- Tests del builder/signer/validator.

**Adaptar al nuevo proyecto:**
- UI (`/dgii/habilitacion`, `/dgii/certificado`, etc.) — copiar y ajustar al sistema de design / componentes del nuevo SaaS.
- `env.ts` schema — adaptar a las env vars del nuevo proyecto.
- `getSession()` — reemplazar por el auth del nuevo proyecto.
- `getRepositories()` — adaptar al data layer existente.

**Dejar en el nuevo proyecto:**
- Branding (logo, colors).
- Modelos de negocio específicos (productos, pricing).
- Integraciones específicas (Whatsapp, OpenAI, etc.).

**Plan de migración recomendado:**
1. Importar las migraciones Supabase.
2. Importar los services puros (sin dependencias del proyecto original).
3. Instalar deps (`node-forge`, `xml-crypto`, `xmllint-wasm`, `xmlbuilder2`).
4. Crear las rutas UI con tu sistema de design.
5. Adaptar el wizard a tu lenguaje / tono.
6. Correr el QA SaaS pre-Fase G como smoke test.

---

## 33. Lecciones aprendidas de DermaLand

**25 lecciones extraídas de la implementación real:**

1. **Separar mock, preview y producción** desde día 1 — `DATA_SOURCE` env y `dgii_enabled_real_send` permiten emitir mock indefinidamente.
2. **Producción puede estar en MOCK/DEMO mientras se certifica** — no hay que esperar a tener cert real para deployar; el feature flag protege.
3. **Nunca tocar DGII real antes de tiempo** — incluso GET /Semilla deja huella en logs DGII y puede confundir al contador.
4. **Validar certificado localmente antes de testecf** — prueba local con XSD oficial confirma que el cert puede firmar XML válido; ahorra una iteración con DGII.
5. **No enviar a testecf sin postulación** — DGII responde 401 con mensaje opaco; mejor bloquear en cliente.
6. **No enviar a testecf sin rango e-NCF** — incluso con postulación, sin rango asignado el comprobante se rechaza.
7. **Usar dry-run antes de POST real** — `prepareTestecfSubmission` permite ver el payload exacto sin riesgo.
8. **Guardar certificado cifrado** — nunca en texto plano, nunca en filesystem del server, nunca en repo.
9. **Nunca imprimir secretos** — tests con `vi.spyOn(global, 'fetch')` y regex en evidencias garantizan que un cambio no introduzca leak.
10. **No subir `.p12`/`.pfx`/`.key`/`.pem` a Git** — `.gitignore` exhaustivo + pre-commit hook + revisión de PRs.
11. **RLS por `business_id`** — no es opcional; cualquier tabla que no tenga RLS es un agujero.
12. **Auditoría por `business_id`** — `audit_logs` requiere INSERT policy con `user_id = auth.uid()` para evitar suplantación.
13. **Fase G debe ser autorizada por cliente y por tipo e-CF** — no autorización genérica; cada tipo es un trámite separado.
14. **Cada tenant debe tener su propio certificado** — no hay "cert del SaaS"; el cert es del contribuyente.
15. **Cada tenant debe tener sus propias secuencias** — DGII las asigna por RNC.
16. **Cada tenant debe tener su configuración fiscal** — `dgii_settings` 1:1 con business.
17. **Cada tenant debe tener su evidencia** — `representative_attestations` con responsable + fecha + ref doc por ítem.
18. **Cada tenant debe tener auditoría separada** — RLS aplicada también a `audit_logs`.
19. **El certificado puede ser de persona física** — DGII lo exige así para procesos tributarios; validar titularidad como Usuario Administrador e-CF en checklist § 3.7.
20. **La validación técnica no sustituye la aprobación DGII** — XSD verde + firma OK no significa que DGII vaya a aceptar; postulación + rango siguen siendo necesarios.
21. **El cliente/contador debe validar postulación y rangos** — el sistema no puede; los muestra como gates explícitos.
22. **No hacer fallback automático testecf → certecf → producción** — toda transición es manual con autorización per-cliente.
23. **Mantener killswitches** — `DGII_TESTECF_SEND_ENABLED` default false; `dgii_enabled_real_send` default false; `ambiente=testecf` default.
24. **Mantener botones de envío real deshabilitados hasta completar requisitos** — incluso con todo verde, el botón sigue disabled hasta que el flag explícito esté activo.
25. **Registrar todo lo que afecta cumplimiento fiscal** — cada decisión, cambio, error, retry, status check va al `audit_logs`.

---

## 34. Glosario

| Término | Significado |
|---|---|
| **e-CF** | Comprobante Fiscal Electrónico — XML firmado emitido al ambiente DGII. |
| **NCF** | Número de Comprobante Fiscal — formato legado anterior a 2019. |
| **eNCF** | Electronic NCF — secuencia 13 chars `E + tipo(2) + numero(10)` (ej. `E310000000001`). |
| **RNC** | Registro Nacional del Contribuyente — 9 dígitos (jurídicas) u 11 (físicas). |
| **testecf** | Ambiente DGII de pre-pruebas. URL base `https://ecf.dgii.gov.do/testecf/`. |
| **certecf** | Ambiente DGII de certificación formal. URL base `https://ecf.dgii.gov.do/certecf/`. |
| **ecf** | Ambiente DGII de producción fiscal real. URL base `https://ecf.dgii.gov.do/ecf/`. |
| **Postulación** | Trámite del contribuyente en DGII para habilitar e-CF; entrega documentos + cert + URLs. |
| **Usuario Administrador e-CF** | Persona física designada formalmente ante DGII para firmar e-CF a nombre del contribuyente. |
| **XAdES-BES** | XML Advanced Electronic Signature - Basic Electronic Signature (no usado por DGII actualmente). |
| **XMLDSig** | XML Digital Signature — estándar W3C; usado por DGII (enveloped, c14n, RSA-SHA256). |
| **TrackId** | Identificador devuelto por DGII al aceptar un envío; usado para consultar status. |
| **Semilla** | XML con un valor aleatorio que DGII devuelve para autenticación; el cliente lo firma y lo retorna. |
| **ValidarSemilla** | Endpoint DGII que recibe la semilla firmada y devuelve bearer token. |
| **RLS** | Row-Level Security — Postgres feature para filtrar filas por usuario/tenant. |
| **PKCS#12** | Formato estándar de contenedor de cert + private key + chain (extensión `.p12` o `.pfx`). |
| **AES-256-GCM** | Algoritmo de cifrado autenticado simétrico con clave 256 bits. |
| **CRL** | Certificate Revocation List — lista de certs revocados por la CA emisora. |
| **OCSP** | Online Certificate Status Protocol — query online para verificar si un cert está revocado. |
| **CA** | Certificate Authority — entidad que emite certs (Viafirma, Avansi, Certi-Empresa, etc.). |
| **INDOTEL** | Instituto Dominicano de Telecomunicaciones — regula las CAs en RD. |
| **SIRTSS** | Sistema DGII para trámites del contribuyente; donde se hace la postulación. |
| **Norma 06-2018** | Norma DGII que regula la facturación electrónica. |
| **Killswitch** | Flag de alto nivel que bloquea una funcionalidad crítica con efecto inmediato. |
| **Dry-run** | Ejecución que prepara todo sin hacer el efecto final (ej. sin tocar DGII). |
| **Pre-flight** | Verificación previa al envío real (URLs, validaciones, gates). |
| **Tenant** | Cliente del SaaS; en el modelo equivale a un `business_id`. |
| **Multi-tenant** | Arquitectura donde múltiples tenants comparten infra con aislamiento. |
| **Wizard de habilitación** | Flujo guiado de 10 pasos para que el cliente complete el proceso DGII. |
| **Ambiente** | Uno de los tres entornos DGII: testecf / certecf / ecf. |

---

## 35. Anexos

### A. URLs DGII públicas oficiales

- testecf: `https://ecf.dgii.gov.do/testecf/`
- certecf: `https://ecf.dgii.gov.do/certecf/`
- ecf:     `https://ecf.dgii.gov.do/ecf/`
- Portal contribuyente SIRTSS: `https://dgii.gov.do/cicloContribuyente/`
- Documentación técnica e-CF (referencia, no enlace directo a cambios): página oficial DGII / sección Comprobantes Electrónicos.

### B. Documentos complementarios del paquete

- `prd-saas-facturacion-electronica-dgii.md` — PRD.
- `agentes-y-skills-saas-dgii.md` — agentes + skills + prompts.
- `roadmap-fases-saas-dgii.md` — 20 fases.
- `checklist-implementacion-saas-dgii.md` — checklists.
- `plan-maestro-saas-dgii-completo.pdf` — consolidado.

### C. Documentos internos relevantes en DermaLand (referencia)

- `docs/dgii/runbook-fase-f-g-h.md` — operativo de Fases F/G/H.
- `docs/dgii/qa-saas-pre-fase-g.md` — checklist QA manual.
- `docs/dgii/matriz-requisitos-dgii.md` — matriz C-XX de requisitos.
- `docs/dgii/requisitos-facturacion-electronica-dgii.md` — fuente normativa.
- `PROJECT_MEMORY.md` — historial de sesiones.

### D. Plantillas

- Plantilla de checklist por ítem (ver Doc 5).
- Plantilla de prompt por agente (ver Doc 3).
- Plantilla de fase del roadmap (ver Doc 4).

### E. Versionado

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 2026-05-21 | Documento inicial basado en DermaLand pre-Fase G real. |

---

**Fin del Plan Maestro.** Continuar con los Docs 2-5 del paquete para profundizar en cada dimensión.
