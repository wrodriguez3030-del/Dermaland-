# Checklist de Implementación — SaaS DGII e-CF para RD

> **Versión:** 1.0 · **Fecha:** 2026-05-21
> 30 checklists prácticos con responsable + evidencia + criterio de salida + riesgo si no se cumple.

---

## Introducción

Este documento es la guía operativa para implementar el módulo SaaS DGII e-CF en otro proyecto. Cada checklist contiene tareas con:

- **Responsable:** agente o rol que ejecuta (ver `agentes-y-skills-saas-dgii.md`).
- **Evidencia requerida:** qué debe quedar como prueba (archivo, output, screenshot, commit).
- **Criterio de salida:** condición binaria que indica que está hecho.
- **Riesgo si no se cumple:** impacto en compliance, seguridad u operación.

**Símbolos:** `[ ]` pendiente · `[x]` hecho · `[-]` no aplica al proyecto.

---

## Checklist 1 — Inicial del proyecto

- [ ] **Kickoff con stakeholders (dueño, contador, técnico)**
  - Responsable: Orquestador
  - Evidencia: Acta de reunión + lista de stakeholders
  - Criterio: Todos los stakeholders identificados y comprometidos
  - Riesgo: Avanzar sin alineación → re-trabajo

- [ ] **Alcance documentado en PRD**
  - Responsable: Producto
  - Evidencia: `docs/dgii/prd-saas-facturacion-electronica-dgii.md` adaptado
  - Criterio: PRD firmado por dueño SaaS
  - Riesgo: Scope creep

- [ ] **Autorizaciones iniciales firmadas**
  - Responsable: Orquestador
  - Evidencia: Email / firma del dueño autorizando construir el módulo
  - Criterio: Autorización archivada
  - Riesgo: Construir sin mandato

- [ ] **Plan Maestro adaptado al proyecto**
  - Responsable: Orquestador
  - Evidencia: `docs/dgii/plan-maestro-saas-dgii.md` con secciones específicas
  - Criterio: Plan revisado por arquitectura
  - Riesgo: Decisiones inconsistentes

- [ ] **Equipo asignado por agente**
  - Responsable: Orquestador
  - Evidencia: Matriz nombre → agente (`agentes-y-skills-saas-dgii.md`)
  - Criterio: Todos los 25 agentes con asignación (humano o IA)
  - Riesgo: Tareas sin owner

---

## Checklist 2 — Arquitectura

- [ ] **ADR de stack (Next.js + Supabase + Vercel + node-forge + xml-crypto + xmllint-wasm)**
  - Responsable: Arquitectura
  - Evidencia: `docs/architecture/ADR-001-stack.md`
  - Criterio: ADR firmado
  - Riesgo: Cambios de stack a medio camino

- [ ] **Diagrama multi-tenant documentado**
  - Responsable: Arquitectura
  - Evidencia: Diagrama ASCII / Mermaid en plan maestro
  - Criterio: Diagrama explica capas + flujos
  - Riesgo: Acoplamiento entre tenants

- [ ] **Decisiones técnicas (XMLDSig enveloped, isEmptyUri, multipart) documentadas**
  - Responsable: Arquitectura + Backend
  - Evidencia: ADRs específicos
  - Criterio: Cada decisión con justificación
  - Riesgo: Re-implementación con decisión equivocada

- [ ] **Estructura de carpetas definida**
  - Responsable: Arquitectura
  - Evidencia: `apps/web/src/server/services/dgii/`, `app/(app)/dgii/`, `app/api/dgii/`, `docs/dgii/`
  - Criterio: Convención clara
  - Riesgo: Inconsistencia entre PRs

---

## Checklist 3 — Supabase

- [ ] **Proyecto Supabase creado**
  - Responsable: DevOps
  - Evidencia: `SUPABASE_PROJECT_REF` documentado
  - Criterio: Acceso Studio + API funcional
  - Riesgo: Bloqueo de Fase 1

- [ ] **Migraciones 0001-0007 escritas y aplicadas**
  - Responsable: Supabase/RLS
  - Evidencia: `supabase/migrations/000[1-7]*.sql` + `pg_policies` query
  - Criterio: Migraciones idempotentes; tablas con RLS
  - Riesgo: Schema inconsistente entre entornos

- [ ] **Backups diarios + retención 10 años configurados**
  - Responsable: DevOps + Compliance
  - Evidencia: Configuración Supabase Backups + retención mensual cifrada
  - Criterio: Restore probado en stage
  - Riesgo: Pérdida de evidencias fiscales

- [ ] **Región Supabase elegida (us-east-1 cercana a DGII)**
  - Responsable: Arquitectura
  - Evidencia: Configuración region
  - Criterio: Latencia < 200ms DGII
  - Riesgo: Latencia alta en flow submit

---

## Checklist 4 — RLS

- [ ] **Todas las tablas DGII tienen `business_id NOT NULL`**
  - Responsable: Supabase/RLS
  - Evidencia: `\d <tabla>` + query a `information_schema`
  - Criterio: Sin excepciones (excepto `businesses`)
  - Riesgo: Cross-tenant leak

- [ ] **Policy `_all` con `USING + WITH CHECK = business_id = auth_business_id()` en cada tabla**
  - Responsable: Supabase/RLS
  - Evidencia: `SELECT * FROM pg_policies` por tabla
  - Criterio: Policy presente en cada tabla
  - Riesgo: Sin enforcement RLS

- [ ] **`audit_logs` tiene INSERT policy con `user_id = auth.uid()`**
  - Responsable: Auditoría
  - Evidencia: Migración 0007 aplicada
  - Criterio: Suplantación bloqueada
  - Riesgo: Auditoría falseable

- [ ] **Smoke test cross-tenant en CI**
  - Responsable: QA Auto
  - Evidencia: Test vitest + seeder 2 businesses
  - Criterio: User A NO puede SELECT/INSERT en business B
  - Riesgo: Regresión silenciosa

---

## Checklist 5 — Vercel

- [ ] **Proyecto Vercel link a repo**
  - Responsable: DevOps
  - Evidencia: `.vercel/project.json` (gitignored)
  - Criterio: Preview deploy automático por PR
  - Riesgo: Deploys manuales propensos a error

- [ ] **Root Directory configurado en `apps/web` (monorepo)**
  - Responsable: DevOps
  - Evidencia: Vercel project settings
  - Criterio: Build funciona desde apps/web
  - Riesgo: Build falla en monorepo

- [ ] **Production env vars VACÍAS al inicio**
  - Responsable: DevOps + Compliance
  - Evidencia: `vercel env ls production` retorna lista vacía o solo no-sensibles
  - Criterio: `DATA_SOURCE` ausente → defaultea a mock
  - Riesgo: Activación accidental de prod

- [ ] **Preview env vars seteadas (Supabase URL, anon key, DGII_CERT_ENCRYPTION_KEY)**
  - Responsable: DevOps
  - Evidencia: `vercel env ls preview` confirma vars sin imprimir valores
  - Criterio: Preview deploy funcional
  - Riesgo: Preview no opera

- [ ] **`outputFileTracingIncludes` para XSDs configurado**
  - Responsable: Backend + DevOps
  - Evidencia: `next.config.ts` con `outputFileTracingIncludes`
  - Criterio: XSDs disponibles en deploy
  - Riesgo: XSD validation falla en producción

---

## Checklist 6 — Variables de entorno

- [ ] **`NEXT_PUBLIC_SUPABASE_URL` (Preview) configurada**
  - Responsable: DevOps
  - Evidencia: vercel env ls preview
  - Criterio: URL válida
  - Riesgo: Sin conexión Supabase

- [ ] **`NEXT_PUBLIC_SUPABASE_ANON_KEY` (Preview) configurada**
  - Responsable: DevOps
  - Evidencia: vercel env ls preview
  - Criterio: Key válida
  - Riesgo: Sin auth

- [ ] **`SUPABASE_SERVICE_ROLE_KEY` (Preview, sensitive) configurada**
  - Responsable: DevOps + Seguridad
  - Evidencia: vercel env ls --sensitive
  - Criterio: Key marcada como sensitive
  - Riesgo: Leak service role

- [ ] **`DGII_CERT_ENCRYPTION_KEY` (32 bytes random base64, sensitive) configurada**
  - Responsable: Seguridad + DevOps
  - Evidencia: vercel env + backup en Vault
  - Criterio: Key generada con `secrets.token_urlsafe(32)`
  - Riesgo: Pérdida = todos los certs irrecuperables

- [ ] **`DGII_TESTECF_SEND_ENABLED=false` (default)**
  - Responsable: DevOps
  - Evidencia: vercel env / repo default
  - Criterio: Killswitch off
  - Riesgo: Envío accidental

- [ ] **`.env.example` actualizado (sin valores reales)**
  - Responsable: Documentación
  - Evidencia: Archivo committed
  - Criterio: Lista completa de vars sin valores
  - Riesgo: Onboarding confuso

---

## Checklist 7 — Multi-tenant

- [ ] **`businesses` como tabla raíz; otras referencian via FK**
  - Responsable: Supabase
  - Evidencia: Schema diagram
  - Criterio: Modelo consistente
  - Riesgo: Tablas huérfanas

- [ ] **JWT contiene claim `business_id`**
  - Responsable: Supabase + Backend
  - Evidencia: Bootstrap seed user con `raw_app_meta_data.business_id`
  - Criterio: `getSession()` lee business_id
  - Riesgo: RLS no aplica

- [ ] **`auth_business_id()` SQL function lee claim en orden correcto**
  - Responsable: Supabase
  - Evidencia: Migración 0006
  - Criterio: Función retorna business_id del JWT
  - Riesgo: Queries devuelven vacío

- [ ] **Storage paths llevan prefijo `<business_id>/`**
  - Responsable: Backend
  - Evidencia: `certificate-storage.ts` usa pattern
  - Criterio: Sin paths sin prefijo
  - Riesgo: Cross-tenant en Storage

---

## Checklist 8 — Certificados

- [ ] **Endpoint POST `/api/dgii/certificate/upload` implementado**
  - Responsable: Backend + Seguridad
  - Evidencia: route.ts
  - Criterio: Recibe FormData + valida + cifra + persiste
  - Riesgo: Subida insegura

- [ ] **Cifrado AES-256-GCM aplicado a blob `.p12` y password**
  - Responsable: Seguridad
  - Evidencia: `cert-cipher.ts` + test
  - Criterio: Blob descifrable solo con `DGII_CERT_ENCRYPTION_KEY`
  - Riesgo: Cert en claro

- [ ] **Blob cifrado persistido en Supabase Storage privado**
  - Responsable: Backend
  - Evidencia: dgii_certificates con `pkcs12_storage_path`
  - Criterio: Storage bucket privado (sin acceso anon)
  - Riesgo: Leak vía URL pública

- [ ] **UI muestra solo metadata pública (subject, issuer, vigencia, fingerprint short)**
  - Responsable: Frontend
  - Evidencia: `certificado-real.tsx`
  - Criterio: Sin password, sin private key, sin blob
  - Riesgo: Leak en cliente

- [ ] **Audit log `dgii_certificate_upload` insertado**
  - Responsable: Auditoría
  - Evidencia: audit_logs row + RLS verde
  - Criterio: Log con metadata + sin secretos
  - Riesgo: Sin trazabilidad

---

## Checklist 9 — Cifrado

- [ ] **Key de cifrado: 32 bytes random base64**
  - Responsable: Seguridad
  - Evidencia: `python -c "secrets.token_urlsafe(32)"`
  - Criterio: Length 43+ chars base64
  - Riesgo: Key débil

- [ ] **IV 12 bytes random por blob (AES-GCM)**
  - Responsable: Seguridad
  - Evidencia: `cert-cipher.ts` usa `crypto.getRandomValues`
  - Criterio: IV único por blob
  - Riesgo: Reuso → comprometer cifrado

- [ ] **Tag 16 bytes auth (AES-GCM)**
  - Responsable: Seguridad
  - Evidencia: Sealed JSON `{iv, tag, cipher}`
  - Criterio: Tag verificado al descifrar
  - Riesgo: Manipulación no detectada

- [ ] **Backup de `DGII_CERT_ENCRYPTION_KEY` en Vault físico + KMS**
  - Responsable: Seguridad
  - Evidencia: Procedimiento documentado + acta
  - Criterio: 2 ubicaciones independientes
  - Riesgo: Pérdida total de certs

---

## Checklist 10 — DGII

- [ ] **Norma 06-2018 y actualizaciones leídas**
  - Responsable: Compliance + Contable
  - Evidencia: Resumen + matriz de requisitos
  - Criterio: Mapeo norma → requisito sistema
  - Riesgo: Incumplimiento legal

- [ ] **Ambientes testecf / certecf / ecf documentados con URLs**
  - Responsable: Backend + Compliance
  - Evidencia: `testecf-client.ts` con DEFAULT_BASE_URLS
  - Criterio: 3 URLs hardcoded; override solo via env
  - Riesgo: Endpoint incorrecto

- [ ] **XSDs oficiales descargados a `docs/dgii/xsd/`**
  - Responsable: XML/XSD
  - Evidencia: Archivos `e-CF-N-v1.0.xsd`
  - Criterio: Tipos 31/32/33/34 mínimo
  - Riesgo: Validación incorrecta

---

## Checklist 11 — RNC / Contribuyente

- [ ] **Validación de RNC (9 u 11 dígitos)**
  - Responsable: Backend
  - Evidencia: `builder.ts` con `RNC_RE`
  - Criterio: Regex `/^(?:\d{9}|\d{11})$/`
  - Riesgo: XML rechazado por XSD

- [ ] **`dgii_settings.rncEmisor` denormalizado por business**
  - Responsable: Backend
  - Evidencia: Tabla migrations 0003
  - Criterio: Acceso O(1) sin join
  - Riesgo: Performance al emitir

- [ ] **RNC del cert se valida contra RNC del business al activar cert**
  - Responsable: Compliance
  - Evidencia: `certificate-storage.ts` validación
  - Criterio: Mismatch bloquea activación
  - Riesgo: Firma con cert ajeno

---

## Checklist 12 — Usuario Administrador e-CF

- [ ] **Designación oficial archivada (PDF acta DGII)**
  - Responsable: Contable + Cliente
  - Evidencia: Documento en archivo del cliente
  - Criterio: Acta firmada y fechada
  - Riesgo: Sin autoridad para firmar

- [ ] **Titular del cert coincide con designación**
  - Responsable: Compliance
  - Evidencia: Checklist § 3.7 paso 8 wizard
  - Criterio: CN del cert = nombre designado
  - Riesgo: Firma sin autorización

- [ ] **Cédula del titular en evidencia paso 8**
  - Responsable: Cliente + Frontend
  - Evidencia: representante_attestations row
  - Criterio: Cédula registrada
  - Riesgo: Sin trazabilidad

- [ ] **Procedimiento de revocación documentado**
  - Responsable: Compliance + Soporte
  - Evidencia: Runbook
  - Criterio: Cliente puede revocar < 24h
  - Riesgo: Cert sigue activo sin titular

---

## Checklist 13 — Secuencias e-NCF

- [ ] **Rango DGII testecf cargado en `ecf_sequences`**
  - Responsable: Contable + Cliente
  - Evidencia: row con `status='active'`, ambiente='testecf'
  - Criterio: Rango oficial DGII
  - Riesgo: eNCF rechazado por DGII

- [ ] **`reserve_next_encf` función atómica (FOR UPDATE)**
  - Responsable: Supabase
  - Evidencia: Migración 0003
  - Criterio: Concurrencia 100 reservas sin duplicado
  - Riesgo: eNCF duplicado

- [ ] **Alarma 90% del rango configurada**
  - Responsable: Observabilidad
  - Evidencia: Alert rule
  - Criterio: Notifica al cliente
  - Riesgo: Agotamiento sin aviso

- [ ] **`expires_at` registrado por rango**
  - Responsable: Backend
  - Evidencia: ecf_sequences schema
  - Criterio: Bloqueo automático post-vencimiento
  - Riesgo: Emisión con rango expirado

---

## Checklist 14 — XML / XSD

- [ ] **`buildEcfXml` soporta tipos 31/32/33/34**
  - Responsable: Backend e-CF + XML/XSD
  - Evidencia: builder.test.ts cobertura por tipo
  - Criterio: Tests verdes para cada tipo
  - Riesgo: Tipo no emitible

- [ ] **`validateEcfXml` usa XSD oficial sin modificar archivo**
  - Responsable: XML/XSD
  - Evidencia: `patchOfficialDgiiXsd` en memoria
  - Criterio: XSD en disco intacto
  - Riesgo: Parche difícil de mantener

- [ ] **Orden de elementos respeta XSD**
  - Responsable: Backend
  - Evidencia: Tests que verifican orden
  - Criterio: XSD acepta
  - Riesgo: Rechazo por orden

- [ ] **Encoding UTF-8 declarado**
  - Responsable: Backend
  - Evidencia: `<?xml version="1.0" encoding="UTF-8"?>`
  - Criterio: Sin BOM
  - Riesgo: Encoding error en DGII

---

## Checklist 15 — Firma digital

- [ ] **`signEcfXml` implementa XMLDSig enveloped**
  - Responsable: Firma Digital
  - Evidencia: signer.ts con SignedXml de xml-crypto
  - Criterio: Firma enveloped al final de ECF
  - Riesgo: Firma rechazada por DGII

- [ ] **`SignatureMethod=rsa-sha256`, `DigestMethod=sha256`, `c14n=20010315`**
  - Responsable: Firma Digital
  - Evidencia: Constants en signer.ts
  - Criterio: Algoritmos exactos según DGII
  - Riesgo: Verificación falla

- [ ] **`Reference URI=""` con `isEmptyUri:true`**
  - Responsable: Firma Digital
  - Evidencia: signer.ts addReference
  - Criterio: Sin Id agregado al ECF
  - Riesgo: XSD rechaza por Id

- [ ] **`KeyInfo` con `X509Certificate` (sin headers PEM)**
  - Responsable: Firma Digital
  - Evidencia: `getKeyInfoContent` retorna base64 puro
  - Criterio: PEM limpio sin BEGIN/END
  - Riesgo: KeyInfo mal formado

- [ ] **`verifyEcfSignature` valida la firma producida**
  - Responsable: Firma Digital + QA Auto
  - Evidencia: signer.test.ts roundtrip
  - Criterio: Sign → verify ciclo OK
  - Riesgo: Firma inconsistente

---

## Checklist 16 — PDF / representación impresa

- [ ] **`generateEcfPdf` genera PDF con datos del e-CF**
  - Responsable: Backend + Producto
  - Evidencia: pdf.ts + pdf.test.ts
  - Criterio: PDF descargable con campos requeridos
  - Riesgo: Falta info legal

- [ ] **Campos visibles: RNC emisor, razón social, eNCF, fecha, totales, ITBIS, cliente**
  - Responsable: Producto
  - Evidencia: Test snapshot + revisión visual
  - Criterio: Todos los campos según norma DGII
  - Riesgo: Representación inválida

- [ ] **QR DGII visible y escaneable**
  - Responsable: Backend
  - Evidencia: QR en PDF + test scan
  - Criterio: QR contiene payload oficial DGII
  - Riesgo: QR no válido

- [ ] **Advertencia "NO FISCAL / DEMO" visible en modo mock**
  - Responsable: Producto
  - Evidencia: PDF demo con watermark
  - Criterio: Sin posibilidad de confusión con e-CF real
  - Riesgo: Emisión legal de PDF demo

---

## Checklist 17 — QR / código de seguridad

- [ ] **Payload QR sigue formato oficial DGII**
  - Responsable: Backend + Compliance
  - Evidencia: qr.ts + buildDgiiConsultaUrl
  - Criterio: Validado contra norma
  - Riesgo: QR rechazado por consulta DGII

- [ ] **Código de seguridad calculado per e-CF**
  - Responsable: Backend
  - Evidencia: security-code.ts
  - Criterio: Algoritmo según norma DGII
  - Riesgo: Código inválido

- [ ] **Fingerprint corto del cert incluido (cuando aplica)**
  - Responsable: Backend
  - Evidencia: QR payload con `fp=<short>`
  - Criterio: Trazabilidad al cert
  - Riesgo: Sin verificación de origen

---

## Checklist 18 — testecf

- [ ] **Postulación testecf aprobada DGII**
  - Responsable: Contable + Cliente
  - Evidencia: Acta SIRTSS
  - Criterio: Estado aprobado
  - Riesgo: 401 al enviar

- [ ] **Rango e-NCF testecf asignado por DGII**
  - Responsable: Contable
  - Evidencia: Comunicación DGII + ecf_sequences row
  - Criterio: Rango activo
  - Riesgo: eNCF rechazado

- [ ] **`DGII_TESTECF_SEND_ENABLED=true` (Preview only, autorizado)**
  - Responsable: DevOps + Orquestador
  - Evidencia: vercel env preview
  - Criterio: Solo cuando todo lo anterior verde
  - Riesgo: Envío sin precondiciones

- [ ] **Dry-run preflight pasa antes de live**
  - Responsable: Backend + QA Manual
  - Evidencia: Preflight result + screenshots
  - Criterio: XSD ✓ + firma ✓ + URLs correctas
  - Riesgo: Live falla en config

---

## Checklist 19 — TrackId / status

- [ ] **Edge Function cron implementada**
  - Responsable: TrackId/Status + DevOps
  - Evidencia: vercel.json cron config
  - Criterio: Cron corre cada N min
  - Riesgo: Status nunca se actualiza

- [ ] **Rate limit por business (max 60/min)**
  - Responsable: Backend
  - Evidencia: Código + test
  - Criterio: DGII 429 evitado
  - Riesgo: DGII bloquea IP

- [ ] **`dgii_status_logs` poblado por consulta**
  - Responsable: Backend + Auditoría
  - Evidencia: row per consulta
  - Criterio: Sin huecos
  - Riesgo: Sin trazabilidad

- [ ] **Mapeo DGII código → status interno documentado**
  - Responsable: Backend + Compliance
  - Evidencia: Tabla en runbook
  - Criterio: Todos los códigos cubiertos
  - Riesgo: Status incorrecto

---

## Checklist 20 — Certificación

- [ ] **N envíos exitosos en testecf por tipo (mínimo recomendado 10/tipo)**
  - Responsable: Cliente + Contable
  - Evidencia: dgii_submissions con status=accepted
  - Criterio: Tasa aceptación > 95%
  - Riesgo: DGII rechaza certificación

- [ ] **Solicitud de transición a certecf enviada a DGII**
  - Responsable: Contable + Cliente
  - Evidencia: Comunicación oficial
  - Criterio: Solicitud registrada
  - Riesgo: Sin trámite

- [ ] **Acta de certificación DGII recibida y archivada**
  - Responsable: Cliente + Compliance
  - Evidencia: PDF acta
  - Criterio: Documento oficial
  - Riesgo: Operación ilegal

- [ ] **`ambiente='certecf'` activado para el cliente**
  - Responsable: Backend + Orquestador
  - Evidencia: dgii_settings + audit log
  - Criterio: Cambio auditado
  - Riesgo: Continuar en testecf perdiendo trazabilidad

---

## Checklist 21 — Producción fiscal

- [ ] **Acta DGII de habilitación producción archivada**
  - Responsable: Cliente + Compliance
  - Evidencia: PDF acta
  - Criterio: Habilitación formal
  - Riesgo: Operación sin habilitación

- [ ] **Rangos e-NCF de producción cargados**
  - Responsable: Contable + Cliente
  - Evidencia: ecf_sequences ambiente='ecf'
  - Criterio: Rango oficial DGII
  - Riesgo: eNCF no fiscal

- [ ] **Checklist go-live 15/15 verde (ver PRD § 31)**
  - Responsable: Orquestador
  - Evidencia: Checklist firmado
  - Criterio: Todos los ítems verdes
  - Riesgo: Activar prematuro

- [ ] **`ambiente='ecf'` + `dgii_enabled_real_send=true` activado**
  - Responsable: Orquestador + Triple autorización
  - Evidencia: dgii_settings + audit log
  - Criterio: Triple firma dueño SaaS + admin cliente + contador
  - Riesgo: Emisión accidental sin certificación completa

- [ ] **Production env vars configuradas (con `--sensitive`)**
  - Responsable: DevOps + Seguridad
  - Evidencia: vercel env ls production
  - Criterio: Solo lo mínimo necesario
  - Riesgo: Leak en prod

---

## Checklist 22 — Seguridad

- [ ] **Audit de secretos en repo (`git log --all -S 'BEGIN PRIVATE'`)**
  - Responsable: Seguridad
  - Evidencia: Output vacío
  - Criterio: Sin material sensible en historial
  - Riesgo: Leak histórico

- [ ] **`.gitignore` cubre `.env`, `.env.local`, `*.p12`, `*.pfx`, `*.key`, `*.pem`, `*.crt`, `*.cer`, `*.der`, `*.cert`, `certificates/`**
  - Responsable: Seguridad
  - Evidencia: `.gitignore`
  - Criterio: Lista completa
  - Riesgo: Subir sensibles

- [ ] **RLS verificada en cada tabla con script CI**
  - Responsable: QA Auto + Supabase
  - Evidencia: Script + reporte
  - Criterio: Sin tabla sin RLS
  - Riesgo: Leak silencioso

- [ ] **`npm audit` mensual**
  - Responsable: Seguridad
  - Evidencia: Output + tickets de parches
  - Criterio: Sin vulns críticas
  - Riesgo: Vuln explotable

- [ ] **OWASP Top 10 cubierto**
  - Responsable: Seguridad
  - Evidencia: Checklist OWASP + pentest
  - Criterio: Sin findings críticos
  - Riesgo: Breach

---

## Checklist 23 — Auditoría

- [ ] **`audit_logs` con INSERT policy aplicada (migración 0007)**
  - Responsable: Supabase + Auditoría
  - Evidencia: Migración 0007 + smoke test
  - Criterio: INSERT funciona con `user_id = auth.uid()`
  - Riesgo: Auditoría falseable

- [ ] **Eventos auditables cubiertos (cert upload/revoke, settings update, invoice sign/send/status, attestation, ambiente switch)**
  - Responsable: Backend + Compliance
  - Evidencia: Lista en runbook + grep en código
  - Criterio: Todos los eventos críticos auditados
  - Riesgo: Sin trazabilidad

- [ ] **Retención 10 años configurada (backup mensual cifrado)**
  - Responsable: DevOps + Compliance
  - Evidencia: Política backup
  - Criterio: Recoverable hasta 10 años atrás
  - Riesgo: Incumplimiento legal

- [ ] **Exportación CSV/JSON por business + período disponible**
  - Responsable: Backend
  - Evidencia: Endpoint `/admin/auditoria/export`
  - Criterio: Output filtrado por business
  - Riesgo: Sin respuesta a auditoría externa

---

## Checklist 24 — QA automatizado

- [ ] **Vitest > 400 tests verdes**
  - Responsable: QA Auto
  - Evidencia: CI output
  - Criterio: 100% pasan
  - Riesgo: Regresión silenciosa

- [ ] **Cobertura > 90% en services (builder, signer, validator, testecf-client)**
  - Responsable: QA Auto
  - Evidencia: Coverage report
  - Criterio: 90%+
  - Riesgo: Bugs no detectados

- [ ] **Spy global de fetch que tira si invocado**
  - Responsable: QA Auto + Seguridad
  - Evidencia: testecf-client.test.ts con vi.spyOn
  - Criterio: 0 invocaciones en CI
  - Riesgo: Test toca red

- [ ] **Tests cross-tenant RLS**
  - Responsable: QA Auto
  - Evidencia: Test con 2 seed users
  - Criterio: A no ve B
  - Riesgo: RLS bypass

- [ ] **Tests anti-leak (no PRIVATE KEY en evidencias)**
  - Responsable: QA Auto + Seguridad
  - Evidencia: Test regex en evidencias
  - Criterio: Sin leak
  - Riesgo: Leak inadvertido

---

## Checklist 25 — QA manual

- [ ] **`docs/dgii/qa-saas-pre-fase-g.md` seguido completo**
  - Responsable: QA Manual + Cliente
  - Evidencia: Reporte 14/14
  - Criterio: Todos los criterios verdes
  - Riesgo: Bugs no detectados pre-prod

- [ ] **Screenshots de cada paso del wizard**
  - Responsable: QA Manual
  - Evidencia: Folder de screenshots
  - Criterio: Cobertura visual
  - Riesgo: Regresión visual

- [ ] **Validación con cliente no-técnico**
  - Responsable: Soporte + Producto
  - Evidencia: Reporte cliente
  - Criterio: Cliente completa wizard sin asistencia
  - Riesgo: UX confusa

---

## Checklist 26 — Soporte cliente

- [ ] **Runbook de soporte publicado**
  - Responsable: Documentación + Soporte
  - Evidencia: `docs/dgii/runbook-soporte.md`
  - Criterio: Cubre 10 errores comunes
  - Riesgo: Soporte improvisa

- [ ] **Soporte L1 capacitado en wizard**
  - Responsable: Capacitación
  - Evidencia: Asistencia + evaluación
  - Criterio: 100% del equipo
  - Riesgo: Escalation excesiva

- [ ] **Escalation matrix definida (L1 → L2 técnico → compliance/contador)**
  - Responsable: Soporte + Orquestador
  - Evidencia: Matriz publicada
  - Criterio: Roles claros
  - Riesgo: Tickets perdidos

- [ ] **SLAs documentados (P0/P1/P2)**
  - Responsable: Producto + Soporte
  - Evidencia: PRD
  - Criterio: SLAs medibles
  - Riesgo: Sin accountability

- [ ] **FAQ pública con 20+ entradas**
  - Responsable: Soporte
  - Evidencia: FAQ.md o página
  - Criterio: Cubre dudas frecuentes
  - Riesgo: Soporte saturado

---

## Checklist 27 — Contador

- [ ] **Las 4 validaciones externas firmadas:**
  - **Acta de designación Usuario Administrador e-CF archivada**
  - **Cert vigente > 60 días + sin revocación CRL/OCSP**
  - **Titular del cert autorizado para representar el RNC**
  - **RNC emisor coincide exactamente con cert + designación DGII**
  - Responsable: Contador + Cliente
  - Evidencia: 4 documentos
  - Criterio: 4/4 firmados
  - Riesgo: Operación sin autoridad fiscal

- [ ] **Capacitación del contador en lectura de logs**
  - Responsable: Capacitación
  - Evidencia: Material + asistencia
  - Criterio: Contador puede diagnosticar rechazos DGII
  - Riesgo: Dependencia técnica permanente

- [ ] **Exportación periódica de XMLs + respuestas DGII**
  - Responsable: Backend + Contador
  - Evidencia: Cron o manual export
  - Criterio: Backup mensual
  - Riesgo: Sin evidencia ante auditoría

---

## Checklist 28 — Go-live

- [ ] **PRD § 31 (15 items) 100% verde**
  - Responsable: Orquestador
  - Evidencia: Checklist firmado
  - Criterio: 15/15
  - Riesgo: Activación prematura

- [ ] **Triple autorización (dueño SaaS + admin cliente + contador)**
  - Responsable: Orquestador
  - Evidencia: Acta firmada
  - Criterio: 3 firmas
  - Riesgo: Sin mandato completo

- [ ] **Plan de rollback documentado y simulado**
  - Responsable: DevOps + Compliance
  - Evidencia: Runbook rollback + simulación stage
  - Criterio: Rollback < 5 min
  - Riesgo: Sin retorno seguro

- [ ] **Comunicación a clientes finales del go-live**
  - Responsable: Producto + Soporte
  - Evidencia: Email + banner
  - Criterio: Cliente final informado
  - Riesgo: Sorpresa fiscal

- [ ] **Oncall asignado primeros 7 días**
  - Responsable: DevOps + Soporte
  - Evidencia: Rotación
  - Criterio: 24/7 cobertura
  - Riesgo: Incidente sin respuesta

---

## Checklist 29 — Post-producción

- [ ] **Monitoreo activo (dashboards + alarmas)**
  - Responsable: Observabilidad
  - Evidencia: Grafana/Vercel dashboards
  - Criterio: KPIs visibles
  - Riesgo: Operación a ciegas

- [ ] **Primer e-CF fiscal real emitido y aceptado**
  - Responsable: Cliente + Soporte
  - Evidencia: TrackId + status=accepted
  - Criterio: Confirmación DGII
  - Riesgo: Producción falla en primer envío

- [ ] **Backup verificado restorable (test mensual)**
  - Responsable: DevOps + Compliance
  - Evidencia: Reporte restore
  - Criterio: Restore < 4h
  - Riesgo: Pérdida de datos

- [ ] **Retención fiscal funcionando (audit_logs + xml_signed_path)**
  - Responsable: Auditoría + DevOps
  - Evidencia: Política aplicada
  - Criterio: 10 años garantizados
  - Riesgo: Incumplimiento legal

- [ ] **Métricas de operación reportadas mensual**
  - Responsable: Observabilidad + Producto
  - Evidencia: Dashboard ejecutivo
  - Criterio: Tasa aceptación, NPS, tickets
  - Riesgo: Operación sin visibilidad

---

## Checklist 30 — Incidentes

- [ ] **Runbook DGII outage**
  - Responsable: Incidentes
  - Evidencia: `docs/dgii/runbook-incidentes.md`
  - Criterio: Pasos claros
  - Riesgo: Caos en outage

- [ ] **Procedimiento cert vencido**
  - Responsable: Soporte + Compliance
  - Evidencia: Runbook + alarmas pre-vencimiento
  - Criterio: 60/30/7 días antes
  - Riesgo: Operación bloqueada

- [ ] **Procedimiento secuencia agotada**
  - Responsable: Soporte + Contable
  - Evidencia: Runbook
  - Criterio: Cliente notificado < 24h del 90%
  - Riesgo: Bloqueo de emisión

- [ ] **Procedimiento breach de seguridad**
  - Responsable: Seguridad + Compliance + Legal
  - Evidencia: IR plan
  - Criterio: Aislar + notificar < 4h
  - Riesgo: Incumplimiento legal + reputación

- [ ] **Post-mortem template + repositorio**
  - Responsable: Incidentes + Orquestador
  - Evidencia: Template + archivo histórico
  - Criterio: Cada incidente P0/P1 con PM
  - Riesgo: Repetir mismos errores

- [ ] **Simulacro de incidente semestral**
  - Responsable: Orquestador + Incidentes
  - Evidencia: Acta del simulacro
  - Criterio: Equipo responde según runbook
  - Riesgo: Runbook obsoleto

---

**Fin del Checklist de Implementación.** Usar este documento + los otros 4 del paquete para implementar el módulo SaaS DGII e-CF en cualquier proyecto.
