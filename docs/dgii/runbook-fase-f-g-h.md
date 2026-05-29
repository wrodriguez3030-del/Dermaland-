# Runbook DGII — Fase F / G / H

> **Estado**: bloqueado hasta autorización explícita del dueño.
> **Aplica a**: `/dgii/certificado`, `/dgii/configuracion`,
> `/dgii/secuencias`, `/dgii/envios`, `/dgii/facturas`, API
> `/api/dgii/*`.
> **Pre-requisito**: Fase C aplicada y verificada
> (`docs/dgii/fase-c-checklist-supabase.md`).
> **No fiscal hasta el final**: cada paso documenta cómo mantener el
> sistema en modo mock hasta que DGII real esté autorizada.

Este runbook describe **paso a paso** lo que se ejecutará el día que
se autorice cada fase. Hasta ese día todo lo que aquí se describe
está **deshabilitado a nivel de UI, de runtime o por env var**.

---

## Índice

1. [Visión general de Fases F / G / H](#1-vision-general)
2. [Pre-requisitos transversales](#2-pre-requisitos)
3. [Fase F — Certificado digital real](#3-fase-f--certificado-digital-real)
4. [Fase G — Envío real a `testecf`](#4-fase-g--envio-real-a-testecf)
5. [Fase H — Status / TrackId / e-CF recibidos](#5-fase-h--status--trackid)
6. [Checklist final antes de producción fiscal](#6-checklist-pre-prod-fiscal)
7. [Rollback de cada fase](#7-rollback)
8. [Variables de entorno por fase](#8-env-vars-por-fase)
9. [Riesgos operacionales y mitigaciones](#9-riesgos)

---

## 1. Visión general

| Fase | Qué activa | Riesgo principal | Reversible |
|---|---|---|---|
| **F** Certificado | Subida real del `.p12` cifrado en Storage + password en Vault; firma XAdES-BES habilitada | Filtración del cert o de la password si hay un bug | Sí (revoke + delete) |
| **G** Envío `testecf` | POST XML firmado al endpoint DGII de pruebas | Submission accidental, tracker DGII queda con basura | Sí (DGII permite re-test en `testecf`); en `certecf` queda historial |
| **H** Status / TrackId | Polling del estado y recepción de e-CF de terceros | Polling abusivo a DGII (rate limit) | Sí (cron desactivable) |

Las tres fases son **independientes** pero **encadenadas**: sin F no
hay G; sin G no hay TrackId que consultar en H.

---

## 2. Pre-requisitos transversales

Antes de cualquiera de las 3 fases:

1. ✅ **Migraciones aplicadas** — confirmar con
   `mcp__supabase__list_migrations` o `vercel deploy` correcto. Ver
   `docs/dgii/fase-c-checklist-supabase.md`.
2. ✅ **Repos Supabase reales activos** — `DATA_SOURCE=supabase` en
   Preview + adapters implementados (este commit cierra esa
   pre-condición salvo `inventoryCount`).
3. ✅ **Permisos** — el usuario que ejecuta acciones tiene los
   permisos correspondientes en `role_permissions` (e.g.
   `dgii:certificate:upload`, `dgii:invoices:sign`,
   `dgii:invoices:send`, `dgii:invoices:check_status`).
4. ✅ **Vercel Production env**:
   - `DATA_SOURCE` no debe estar en `supabase` en Production hasta
     que se autorice explícitamente.
   - Hasta entonces, todas las pruebas se hacen en **Preview** o
     **local con `.env.local`**.
5. ✅ **Backup Supabase reciente** — Database → Backups → confirmar
   snapshot del día.
6. ✅ **Mock store del certificado limpio** —
   `dermaland.dgii-certificate-status` en localStorage NO es fuente
   de verdad para la fase real; al activar Fase F se ignora y se
   lee de la tabla `dgii_certificates`.

---

## 3. Fase F — Certificado digital real

### 3.1 Qué activa

- UI de `/dgii/certificado` deja de estar en modo "disabled".
- Drag & drop del archivo `.p12` o `.pfx`.
- Cifrado AES-256-GCM con clave derivada de
  `DGII_CERT_ENCRYPTION_KEY` + per-business salt.
- Persistencia del blob cifrado en bucket Supabase Storage
  `certificates/` (RLS: solo `service_role` lee).
- Metadata del cert en tabla `dgii_certificates` (alias, subject_dn,
  issuer_dn, valid_from, valid_to, is_active).
- Lectura runtime solo desde **Edge Function `dgii-sign-xml`** vía
  service-role. Nunca desde Server Components ni desde el cliente.

### 3.2 Pre-requisitos específicos

- [ ] Certificado `.p12` emitido por una Autoridad Certificadora
      aprobada por DGII / INDOTEL (Avansi, Certi-Empresa, GoDaddy DR,
      Viafirma Dominicana, etc.).
- [ ] Password del cert custodiada (1Password / Bitwarden / KMS).
- [ ] **Tipo de cert: persona física es válido.** DGII requiere
      certificado digital **de persona física** para procesos
      tributarios. El titular debe ser el **Usuario Administrador
      e-CF** o representante autorizado del RNC contribuyente. No
      bloqueamos por subject del cert; lo validamos via checklist § 3.7
      antes de Fase G.
- [ ] Validez del cert > 60 días hacia adelante.
- [ ] Permiso `dgii:certificate:upload` asignado al rol del usuario
      que sube.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configurada en Preview
      (no se requiere en runtime de la app, sí para la Edge Function).
- [ ] `DGII_CERT_ENCRYPTION_KEY` configurada (32 bytes random
      base64) en Vercel Preview env.

### 3.3 Pasos para activar (orden estricto)

1. **Generar `DGII_CERT_ENCRYPTION_KEY`**:
   ```powershell
   # Generar 32 bytes random y NO imprimirlos al chat.
   python -c "import secrets; print(secrets.token_urlsafe(32))" > .scratch-cert-key.txt
   # Setear en Vercel Preview (limitado a la branch que usemos para QA)
   $env:KEY = Get-Content .scratch-cert-key.txt
   vercel env add DGII_CERT_ENCRYPTION_KEY preview --value $env:KEY --sensitive --yes
   Remove-Item .scratch-cert-key.txt
   ```
2. **Crear bucket `certificates`** en Supabase Storage con `public=false`.
   Vía MCP:
   ```sql
   INSERT INTO storage.buckets (id, name, public)
   VALUES ('certificates', 'certificates', false)
   ON CONFLICT (id) DO NOTHING;
   ```
3. **Implementar `/api/dgii/certificate/upload`** (server action):
   - Recibe `FormData` con archivo + password.
   - Valida MIME (`application/x-pkcs12`) y tamaño (< 10 KB típico).
   - Parsea cert con `node-forge` para extraer subject_dn,
     issuer_dn, valid_from, valid_to.
   - Cifra el blob con AES-256-GCM, key derivada de
     `DGII_CERT_ENCRYPTION_KEY` + per-business salt (SHA-256 del
     business_id).
   - Sube blob cifrado a `storage://certificates/<business_id>/<uuid>.p12.enc`.
   - INSERT en `dgii_certificates` con metadata + `is_active=false`.
4. **Implementar `/api/dgii/certificate/activate/[id]`**:
   - Marca `is_active=true` y desactiva los anteriores del mismo
     business (constraint `dgii_certificates_one_active` los maneja).
5. **Implementar Edge Function `dgii-sign-xml`** (server-only):
   - Lee blob cifrado de Storage usando `service_role`.
   - Descifra con la key del business salt.
   - Firma el XML con `XAdES-BES` (lib `xadesjs` o equivalente).
   - Devuelve el XML firmado.
   - **Nunca expone el cert al cliente.**
6. **Test smoke**:
   - Subir cert demo en Preview.
   - Verificar `dgii_certificates` count = 1, `is_active=true`.
   - Hacer una llamada a `/api/dgii/certificate/sign-demo` (endpoint
     de prueba que firma un XML mock con el cert real).
   - Validar que el XML viene firmado con `<ds:Signature>`.
7. **Documentar la rotación** en `docs/dgii/cert-rotation.md`.

### 3.4 Reglas de seguridad

- **NUNCA** loggear la password ni el cert en stdout.
- **NUNCA** subir `.scratch-cert*.txt` o `.p12` a git
  (`.gitignore` ya cubre `*.p12`, `*.pfx`, `*.key`).
- El cliente Supabase server-only (`createServiceRoleClient()`)
  **solo** lee Storage en la Edge Function — no en Server
  Components, Server Actions ni cliente.
- Auditoría: cada subida y cada firma debe escribir un row en
  `audit_logs` con `action='dgii_certificate_upload' | 'dgii_xml_sign'`
  y `user_id`.

### 3.5 Bloqueo hasta autorización

- Hoy `/dgii/certificado/page.tsx` tiene los `<Input disabled>` y un
  banner "Bloqueado · Fase F". El día que se autorice se retiran
  los `disabled` y se cablea el form al server action.
- El `certificate-status-store` (localStorage) se mantiene como
  fallback de UI en modo mock; cuando Fase F entre, se prioriza la
  query a `dgii_certificates`.

### 3.6 Prueba local end-to-end (CLI) — `scripts/run-cert-full-test.mjs`

Script Node que replica el flujo de Fase F **sin browser** y **sin
DGII**: parsea el `.p12` real, cifra con AES-256-GCM, persiste en
`dgii_certificates` con RLS via JWT del seed user, firma un XML
demo (`Ambiente=PRUEBA_LOCAL`) con RSA-SHA256, verifica la firma y
genera un payload QR marcado `NO_FISCAL`. **Además ejecuta una
validación XSD oficial contra `docs/dgii/xsd/e-CF-32-v1.0.xsd` vía
xmllint-wasm** — sobre el XML demo simplificado (que se espera falle,
por tener `<PruebaLocal>` y omitir campos obligatorios; el step
informa "esperado" en ese caso). Para XSD real end-to-end con un
e-CF tipo 32 completo y firmado, usar la ruta
`/api/dgii/certificate/test-local` (el step `xsd_valid` ahí
construye un e-CF válido con `buildEcfXml + signEcfXml` antes de
validar). No llama DGII, no envía XML real, no consume secuencias,
no imprime password, cert, claves ni tokens.

Pre-requisitos: `apps/web/.env.local` con `DGII_CERT_ENCRYPTION_KEY`,
`DGII_CERT_TEST_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PREVIEW_ADMIN_EMAIL`,
`PREVIEW_ADMIN_PASSWORD`. Migración 0006 aplicada (RLS lee claims).
Migración 0007 aplicada para que el `INSERT` en `audit_logs` no
viole RLS (ver § audit_logs abajo).

Uso (Bash / Linux / macOS):
```bash
CERT_TEST_P12_PATH="ruta/al/cert.p12" node scripts/run-cert-full-test.mjs
```

Uso (PowerShell):
```powershell
$env:CERT_TEST_P12_PATH = "C:\ruta\al\cert.p12"
node scripts/run-cert-full-test.mjs
```

Alternativa: pasar el path como argumento posicional —
`node scripts/run-cert-full-test.mjs ruta/al/cert.p12`. Si falta
`CERT_TEST_P12_PATH` **y** no se pasa argv[2], el script falla con
mensaje claro sin tocar nada.

### 3.7a Flujo SaaS: cómo un cliente completa el checklist (UX)

DermaLand expone el checklist como **paso 8 del wizard SaaS** en
`/dgii/habilitacion` ("Autorización del representante e-CF"). El
cliente NO necesita asistencia técnica:

1. **Pre-fill automático.** Al expandir el paso, el panel sky
   "Datos sugeridos extraídos del certificado activo" muestra
   titular CN, cédula `IDCDO-...`, RNC, entidad certificadora,
   vigencia — extraído del subject/issuer del cert via
   `useLocalTest()`. Si no hay evidencia local todavía, el panel
   invita a correr la prueba en `/dgii/certificado` primero.

2. **Evidencia por ítem.** Cada uno de los 9 ítems se confirma
   individualmente con: **estado** (Confirmado / Pendiente / No
   aplica), **responsable** que confirma (contador, admin, dueño),
   **fecha de confirmación** (auto-fill al marcar Confirmado),
   **referencia documental** (acta, código, enlace al expediente)
   y **nota libre** de auditoría. Todo persiste en localStorage
   (`dermaland.dgii-enablement-progress`).

3. **Declaración formal del responsable.** Al pie del paso hay un
   checkbox de declaración explícita: "Confirmo que el titular del
   certificado está designado como Usuario Administrador e-CF o
   representante autorizado del contribuyente." Sin aceptar la
   declaración el evaluador **NO** marca el paso como `completed`,
   aunque los 9 ítems estén Confirmed.

4. **Gate estricto del evaluador.** El evaluador
   (`enablement-evaluator.ts`) degrada `status === "completed"` a
   `in_progress` si:
   - faltan ítems con `evidence.status === "confirmed"` o
     `not_applicable`, O
   - `declarationAccepted !== true`.
   Esto significa que el usuario NO puede saltarse el checklist
   forzando el Select del paso a Completed.

5. **Panel global "Pendiente antes de enviar a DGII testecf".** En
   la parte superior del wizard se lista cada gap explícito (cert,
   config fiscal, ítems de autorización, declaración, pruebas
   locales). Cuando todo está verde aparece el badge "listo para
   enviar*".

6. **Botón CTA "Enviar pruebas a DGII testecf".** Visible pero
   **siempre deshabilitado** en este wizard. Tooltip:
   *"Disponible cuando certificado, configuración fiscal,
   representante e-CF y validaciones locales estén completas.
   Además, el envío real a DGII permanece bloqueado hasta que se
   autorice Fase G."* El botón nunca dispara red — es indicador
   visual de que el flujo está completo localmente.

7. **Trazabilidad.** La estructura `ChecklistItemEvidence` queda
   pensada para migrar a Supabase (tabla
   `dgii_enablement_evidence` con RLS por `business_id`) cuando
   se mueva de cliente-only a multi-device. Mientras tanto, el
   cliente puede exportar el JSON del localStorage si DGII pide
   evidencia escrita.

### 3.7 Checklist titularidad pre-Fase G

DGII exige que el certificado digital sea de **persona física** y
que el titular esté autorizado a actuar fiscalmente por el RNC
emisor. Antes de avanzar a Fase G se valida con el dueño / contador:

- [ ] **Titular del certificado** (CN del subject) anotado:
      ___________________________
- [ ] **Cédula del titular** (de `IDCDO-XXXXXXXXXXX` o equivalente
      en serialNumber): _________________
- [ ] **RNC emisor** que se usará en e-CFs:
      _________________ (debe coincidir con
      `dgii_settings.rncEmisor` y con `businesses.rnc`).
- [ ] **Relación titular ↔ contribuyente** documentada (empleado
      autorizado, representante legal, dueño del RNC, etc.):
      ___________________________
- [ ] **Designación oficial como Usuario Administrador e-CF**
      registrada en DGII o documento que delegue al titular como
      representante autorizado del RNC para firma e-CF: SÍ / NO
      (con referencia al documento si SÍ).
- [ ] **Entidad certificadora autorizada DGII / INDOTEL** que emitió
      el cert: ___________________________ (ej. Viafirma Dominicana,
      Avansi, Certi-Empresa). Validar contra la lista vigente en
      INDOTEL antes de Fase G.
- [ ] Cert NO está revocado (verificar CRL/OCSP de la CA emisora).

Si cualquier ítem está NO o sin confirmar, Fase G permanece
bloqueada — no se envía a `testecf` ni `ecf`.

### 3.8 audit_logs INSERT (migración 0007)

`audit_logs` originalmente solo tenía policy `SELECT` con guardia
`business_id`. Los INSERT desde usuarios autenticados (no
service_role) fallaban con `new row violates row-level security
policy for table "audit_logs"`. La migración `0007_audit_logs_insert_policy.sql`
agrega `audit_logs_insert`:

- Permite INSERT cuando `business_id = auth_business_id()`
  (sin cross-business).
- Restringe `user_id` a NULL o `auth.uid()` (no suplantación de
  auditoría de otro usuario).
- 100% aditiva (idempotente, no toca data, no cambia el SELECT
  existente).

Aplicar via MCP Supabase o `npx supabase db push` cuando esté
disponible. La prueba local funcional pasa sin migración 0007 aunque
emite un `audit warning` de RLS — el cert sí se persiste; solo la
fila de auditoría se pierde.

---

## 3.9 Pre-flight Fase G (dry-run) — 2026-05-21

**Estado:** DRY-RUN LISTO. NO se hace ningún fetch a DGII.

DermaLand expone un endpoint server-side que construye el payload
exacto de Fase G y lo valida localmente — **sin tocar DGII**:

- **Cliente:** `apps/web/src/server/services/dgii/testecf-client.ts`
  - `prepareTestecfSubmission(args)` — pura, build → XSD → firma →
    URLs calculadas. Refuse `ambiente !== "testecf"` y overrides de
    URL que apuntan a `/ecf/` (anti foot-gun anti-producción).
  - `executeTestecfSubmission(args)` — **STUB. Siempre tira
    `TestecfSendDisabled`**. El cuerpo HTTP real está pendiente de
    autorización formal de Fase G + postulación + rango.
- **Orquestador:** `apps/web/src/server/services/dgii/testecf-preflight.ts`
  - `runTestecfPreflight({businessId, tipoEcf})` — resuelve cert
    server-side, lee dgii_settings, construye e-CF demo, llama
    `prepareTestecfSubmission`.
- **Endpoint:** `POST /api/dgii/invoices/testecf-send` con body
  `{ tipoEcf: "31"|"32"|"33"|"34" }`. Auth seed user. Devuelve la
  evidencia + razones de bloqueo del envío real.
- **UI:** botón "Pre-flight Fase G testecf (dry-run)" en
  `/dgii/habilitacion` dentro del panel "Pendiente antes de enviar".
  Selector de tipo + resultado en pantalla.

**Killswitches en capas (todas deben estar verdes para enviar real):**

1. `DGII_TESTECF_SEND_ENABLED=true` (env var, default `false`).
2. `ambiente === "testecf"` (jamás `certecf` ni `ecf`).
3. `postulacionApproved: true` en el body.
4. `rangoAuthorized: true` en el body.
5. `userConfirmedAt` ISO timestamp en el body.
6. Aun con todo en true, **el código de `executeTestecfSubmission`
   tira `TestecfSendDisabled`** porque el HTTP real no está
   implementado en este build.

**Endpoints DGII testecf** (calculados, NO invocados):

| Paso | Método | URL |
|---|---|---|
| Semilla | GET | `https://ecf.dgii.gov.do/testecf/autenticacion/api/autenticacion/semilla` |
| ValidarSemilla | POST | `https://ecf.dgii.gov.do/testecf/autenticacion/api/autenticacion/validarsemilla` |
| Recepción ECF | POST (multipart) | `https://ecf.dgii.gov.do/testecf/recepcion/api/ecf` |

**Variables de entorno relevantes:**

| Variable | Default | Uso |
|---|---|---|
| `DGII_ENVIRONMENT` | `testecf` | Enum: `testecf\|certecf\|ecf` (legacy `cert\|prod` aceptados) |
| `DGII_BASE_URL_TESTECF` | `https://ecf.dgii.gov.do/testecf` | Override del default; refuse URLs `/ecf/` |
| `DGII_BASE_URL_CERTECF` | `https://ecf.dgii.gov.do/certecf` | Override |
| `DGII_BASE_URL_ECF` | `https://ecf.dgii.gov.do/ecf` | Override |
| `DGII_TESTECF_SEND_ENABLED` | `"false"` | Killswitch — `"true"` requerido para que `executeTestecfSubmission` salga del primer guard |

**Tests:**

- `apps/web/src/server/services/dgii/testecf-client.test.ts` (11):
  - URLs correctas testecf
  - XSD oficial pasa tipo 31 y tipo 32
  - rechaza ambiente !== `testecf`
  - `send.enabled === false` + reasons (killswitch, postulación, rango)
  - evidencia NO contiene password ni private key
  - `executeTestecfSubmission` tira siempre (con/sin flags externas)
  - **guard global de fetch:** ningún test invoca `global.fetch`
    (mocked con `vi.spyOn` que tira si se llama).

**Cómo correr el dry-run desde browser:**

1. Login en Preview con seed user.
2. `/dgii/habilitacion`.
3. Scroll al panel "Pendiente antes de enviar a DGII testecf".
4. Seleccionar tipo e-CF (31/32/33/34).
5. Click "Verificar pre-flight".
6. Resultado muestra: URLs calculadas, XSD ✓/✗, firma ✓/✗, tamaño
   XML firmado, razones de bloqueo del envío real (siempre listadas
   en este build).

**Lo que falta antes de Fase G real:**

- Confirmar postulación testecf del RNC emisor con DGII (externo).
- Obtener rango e-NCF testecf autorizado por DGII (externo).
- Implementar el cuerpo HTTP de `executeTestecfSubmission` (semilla,
  validarsemilla, recepción multipart, persistencia en
  `dgii_submissions`, audit log).
- Tests E2E mockeados con `nock` o equivalente.
- Autorización explícita per-tipo del dueño.

---

## 4. Fase G — Envío real a `testecf`

### 4.1 Qué activa

- POST `XML firmado` a `https://ecf.dgii.gov.do/testecf/...`
  (endpoints exactos en
  `dgii_settings.base_url_testecf`).
- Reintentos con backoff exponencial.
- Persistencia del request/response en `dgii_submissions`.
- Recepción de `track_id` que se guarda en `electronic_invoices.track_id`.

### 4.2 Pre-requisitos específicos

- [ ] Fase F completada (cert activo).
- [ ] `dgii_settings.ambiente = 'testecf'`.
- [ ] `dgii_settings.dgii_enabled_real_send = true` (guard
      adicional; sin esto la app NO envía).
- [ ] Secuencias e-NCF de `testecf` cargadas en `ecf_sequences`
      (rango autorizado por DGII; estas las consume el sistema,
      no son ficticias).
- [ ] Permiso `dgii:invoices:send` asignado al rol que envía.
- [ ] URLs en `applies_to_payment_methods` confirmadas con contador.

### 4.3 Pasos para activar

1. **Validar el cert** — `dgii_certificates.is_active=true` y
   `valid_to > now() + 30 días`.
2. **Validar secuencias** — al menos un rango activo en
   `ecf_sequences` con `status='active'` por cada `tipo_ecf` (31, 32).
3. **Implementar `/api/dgii/invoices/[id]/send`**:
   - Lee la `electronic_invoice` por id.
   - Genera XML si `status='draft'`.
   - Valida XSD (XSDs DGII públicos).
   - Llama Edge Function `dgii-sign-xml` para firmar.
   - POST a `dgii_settings.base_url_testecf + '/api/SignXML/v1/...'`
     con header `Authorization: Bearer <seed token DGII>`.
   - Lee `track_id` de la respuesta y guarda en
     `electronic_invoices.track_id`.
   - INSERT en `dgii_submissions` con `request_body_path` (Storage),
     `response_body_path`, `track_id`, `error_code`, `error_message`.
   - Si `response_status >= 500` o timeout: reintento con backoff
     (1m, 5m, 15m).
4. **Rate limit interno** — máximo 60 envíos / min al inicio para
   evitar quemar DGII.
5. **UI** — `/dgii/facturas/[id]` muestra botón "Enviar a DGII"
   habilitado solo si:
   - `proforma.status === 'pending_ecf'`.
   - `dgii_enabled_real_send=true`.
   - Permiso `dgii:invoices:send`.
6. **Test smoke**:
   - Crear proforma 32 (consumo) demo.
   - Convertir a e-CF tipo 32.
   - Enviar a DGII.
   - Verificar `dgii_submissions` con `response_status=200` y
     `track_id` no nulo.
7. **Documentar incident response** en `docs/dgii/dgii-outage.md`
   (qué hacer si DGII rechaza, qué hacer si DGII está caída).

### 4.4 Reglas de seguridad

- `dgii_enabled_real_send=true` es la última llave. Si se setea
  manualmente sin Fase G autorizada, la UI sigue ocultando el botón
  por permiso.
- **NUNCA** enviar XML con `ambiente='ecf'` (producción) sin
  autorización explícita y separada.
- Auditoría: cada envío en `audit_logs` con
  `action='dgii_xml_send'`, `entity_id=electronic_invoice.id`.

### 4.5 Bloqueo hasta autorización

- Hoy `/api/dgii/invoices/[id]/send` no existe — solo el stub
  `proforma.convertToEcf` que devuelve mock.
- `dgii_settings.dgii_enabled_real_send` default false en la
  migración 0003.

---

## 5. Fase H — Status / TrackId / e-CF recibidos

### 5.1 Qué activa

- Polling de `https://ecf.dgii.gov.do/testecf/api/EstadoTrackIds/v1/...`
  para cada `electronic_invoices.track_id` con `status != 'accepted'`.
- Recepción de e-CF de terceros vía endpoint
  `/api/dgii/recepcion` (Vercel function).
- Aprobación comercial UI (`/dgii/recibidos`).

### 5.2 Pre-requisitos

- [ ] Fase G completada (hay TrackIds reales).
- [ ] Permiso `dgii:invoices:check_status` asignado.
- [ ] Cron job o Edge Function programada para polling cada N min.

### 5.3 Pasos para activar

1. **Implementar `/api/dgii/invoices/[id]/status`**:
   - GET al endpoint DGII con `track_id`.
   - Parsea response (XML o JSON dependiendo de DGII).
   - Mapea código DGII a `electronic_invoices.status`:
     - `Aceptado` → `accepted`
     - `Aceptado Condicional` → `accepted_conditional`
     - `Rechazado` → `rejected`
     - `En proceso` → `in_process`
   - INSERT en `dgii_status_logs`.
2. **Cron** — Edge Function `dgii-poll-status` que corre cada 5 min
   contra los `electronic_invoices` con `status IN
   ('submitted','in_process')`.
3. **Implementar `/api/dgii/recepcion`**:
   - Endpoint público que recibe POST XML firmado por otro
     contribuyente.
   - Verifica firma con la public key del emisor.
   - Guarda en Storage + `dgii_received_ecf`.
4. **UI Aprobación Comercial** — `/dgii/recibidos/[id]` muestra
   detalle, botones "Aprobar", "Aprobar condicional", "Rechazar".
   Cada acción inserta en `dgii_commercial_approvals` y opcionalmente
   envía respuesta firmada al emisor.

### 5.4 Reglas

- Rate limit: cada `track_id` se consulta máximo cada 60 segundos.
- Si DGII responde 429: backoff a 5 min entre polls.
- Si DGII responde 5xx: degradar a polling cada 30 min hasta que
  vuelva.

---

## 6. Checklist final antes de producción fiscal

Antes de cambiar `dgii_settings.ambiente='ecf'` (producción fiscal
real, **NO** simulada):

- [ ] Fase F, G, H estables ≥ 7 días en `testecf`.
- [ ] Cert activo válido > 90 días hacia adelante.
- [ ] Secuencias e-NCF de producción importadas en `ecf_sequences`
      con `ambiente='ecf'`.
- [ ] Rango disponible verificado: `next_number <= range_end - 100`
      (margen).
- [ ] Backup Supabase del día.
- [ ] `DATA_SOURCE=supabase` en Vercel Production env vars.
- [ ] Cron de polling Fase H activo.
- [ ] Alarmas configuradas:
  - Rechazo > 5% en últimas 24h.
  - DGII timeout > 3 consecutivos.
  - Secuencia próxima a agotarse (< 100 disponible).
- [ ] Plan de rollback documentado y probado.
- [ ] Acta de habilitación DGII recibida y archivada.
- [ ] Contador firmó declaración jurada interna.
- [ ] Comunicación a clientes: emisión activa, política de e-CF.

**Solo después**: cambiar `dgii_settings.dgii_enabled_real_send=true`
y `ambiente='ecf'`.

---

## 7. Rollback

### Rollback Fase F (cert real)

```sql
-- Desactivar cert activo (no borra)
UPDATE dgii_certificates SET is_active = false, revoked_at = now()
WHERE business_id = '<bid>' AND is_active = true;
```

UI vuelve a "Sin certificado activo" inmediatamente.

### Rollback Fase G (envío real)

```sql
-- Apagar el flag, los envíos en curso terminan en error pero no se
-- pierden (re-enviables después).
UPDATE dgii_settings SET dgii_enabled_real_send = false
WHERE business_id = '<bid>';
```

Si hay submission corrupto:
```sql
DELETE FROM dgii_submissions WHERE electronic_invoice_id = '<id>';
UPDATE electronic_invoices SET status = 'draft', track_id = NULL
WHERE id = '<id>';
```

### Rollback Fase H (polling)

- Desactivar la cron Edge Function desde Vercel Dashboard →
  Settings → Cron Jobs.
- `electronic_invoices` con `status='in_process'` permanecen así
  hasta re-activar.

### Rollback completo (vuelta a MOCK)

```powershell
# Vercel Preview env vars
vercel env rm DATA_SOURCE preview <branch> --yes
vercel env rm NEXT_PUBLIC_SUPABASE_URL preview <branch> --yes
vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY preview <branch> --yes
vercel deploy --no-clipboard --yes
```

Sin vars → `DATA_SOURCE` defaultea a `mock` por el schema en
`lib/env.ts:7`.

---

## 8. Env vars por fase

| Variable | Fase | Scope sugerido | Notas |
|---|---|---|---|
| `DATA_SOURCE` | Pre | Preview (ya configurada) | `supabase` solo en Preview hasta Fase G estable |
| `NEXT_PUBLIC_SUPABASE_URL` | Pre | Preview (ya) | publishable |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pre | Preview (ya) | publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | F | Preview (sensitive) | Solo Edge Function lo usa |
| `DGII_CERT_ENCRYPTION_KEY` | F | Preview (sensitive) | 32 bytes random, NO rotar sin re-cifrar todos los certs |
| `DGII_BASE_URL_TESTECF` | G | Preview | default en `dgii_settings.base_url_testecf` |
| `DGII_BASE_URL_ECF` | producción | Production (sensitive) | **NO setear hasta autorización fiscal** |
| `JWT_SECRET` | F (opcional) | Preview (sensitive) | si se usa para derivar per-business salt |
| `OPENAI_API_KEY` | n/a | n/a | no relacionado a DGII |

**Nunca**:
- `DGII_CERT_PASSWORD` no debe existir como env var — la password
  vive cifrada en blob, no en env.
- Cualquier variable que prefije `DGII_*_SECRET` o `DGII_*_PASSWORD`
  va en Vault, no en Vercel env.

---

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Cert expira sin aviso | Media | Cron `dgii-cert-expiring` que alerta 60/30/7 días antes |
| Password del cert se filtra | Baja | Solo cifrada en Storage, decrypt solo en Edge Function |
| Envío masivo accidental a DGII | Baja | `dgii_enabled_real_send` doble flag + permiso de rol |
| Secuencia agotada en mid-venta | Media | Validación `next_number <= range_end` antes de cada emisión |
| DGII rechaza por XSD | Media | Validación XSD interna previa al envío |
| DGII fuera de servicio | Media | Cola interna de pendientes (`status='pending_ecf'`); UI muestra "DGII caída" |
| Datos del emisor incorrectos en XML | Baja | Validación `dgii_settings.razonSocialEmisor` exacto al RNC en SIRTSS |
| Mismatch RNC cert ↔ business | Baja | Validación al activar cert |
| Pérdida de `DGII_CERT_ENCRYPTION_KEY` | Crítica | Backup en Vault + procedimiento de re-cifrado documentado |

---

## 10. Notas operativas

- **Toda activación de Fase F/G/H se hace en Preview primero**.
  Producción solo se activa tras 7+ días sin incidentes en Preview.
- **Cada fase requiere un commit dedicado** con título claro:
  - `Activar Fase F: certificado real en preview`
  - `Activar Fase G: envío testecf en preview`
  - `Activar Fase H: status / trackid en preview`
- **Cada activación requiere autorización explícita del dueño** —
  asumir que el silencio significa "no autorizado".
- **Sin DNS custom hasta producción fiscal**. Hasta entonces el
  dominio default `dermaland.vercel.app` es suficiente para Preview.

---

## 11. Supabase Security Advisor — correcciones (migración 0008)

> Añadido 2026-05-29. No fiscal, no DGII real. La migración
> `supabase/migrations/0008_security_advisor_fixes.sql` corrige los
> avisos del Security Advisor de forma no destructiva.

### 11.1 Qué corrige por SQL (migración 0008)

| Warning | Objeto | Fix |
|---|---|---|
| Security Definer View | `inventory_stock_by_lot` | `security_invoker = true` |
| Auth RLS Init Plan | `audit_logs` (select + insert) | `auth.*()` → `(select auth.*())` |
| Function Search Path Mutable | `select_lot_for_sale`, `auth_business_id`, `auth_is_platform_admin`, `reserve_ecf_sequence_number` | `set search_path = public, auth, extensions` |
| Multiple Permissive Policies | `plans`, `businesses`, `branches`, `users`, `clients` | una policy por comando |

`reserve_ecf_sequence_number` solo recibe `search_path` (metadato).
NO se cambia su lógica de reserva de secuencias e-CF.

### 11.2 Cómo aplicar 0008 (NO se aplicó automáticamente)

El MCP de Supabase apunta a otro proyecto y `SUPABASE_DB_URL` en
`.env.local` es placeholder, así que la migración **no se aplicó ni se
inspeccionó en vivo** desde la sesión. Aplicarla manualmente sobre el
proyecto `sntcvyozbhrgicwmtcoh`:

- **Opción A (recomendada, Preview/branch primero):** Supabase CLI
  `supabase db push` apuntando al branch de Preview, validar Advisor,
  y luego promover. O usar el SQL Editor del Dashboard.
- **Opción B:** pegar el contenido de `0008_security_advisor_fixes.sql`
  en el SQL Editor del proyecto y ejecutar (corre en transacción).

Verificación post-aplicación (queries SELECT-only al final del archivo
de migración). Confirmar en **Dashboard → Advisors → Security** que los
4 grupos de warnings bajan.

### 11.3 Leaked Password Protection (acción MANUAL, no por SQL)

- **Qué es:** Supabase Auth puede rechazar contraseñas filtradas
  comparándolas contra HaveIBeenPwned (k-anonymity, no envía la
  contraseña en claro).
- **Dónde se activa:** Dashboard → **Authentication → Settings →
  Security** → toggle "Leaked password protection". No se puede activar
  por migración SQL.
- **Plan:** disponible en planes Pro+ de Supabase. En Free puede no
  aparecer el toggle.
- **Impacto en login:** no afecta logins existentes; solo valida en
  signup / cambio de password. Riesgo de ruptura: nulo para usuarios
  ya creados. Recomendado activarlo.

### 11.4 Impacto en SaaS multi-tenant

Ningún cambio abre acceso cross-business. Todas las policies siguen
filtrando por `business_id` (o `id` en `businesses`); platform admin
conserva su alcance. La view `inventory_stock_by_lot` pasa a respetar
la RLS de `product_lots` (antes la bypaseaba). Service role sigue
bypaseando RLS como antes.

---

**Última actualización:** 2026-05-29
**Próxima revisión:** al activar cada fase / tras aplicar 0008.
