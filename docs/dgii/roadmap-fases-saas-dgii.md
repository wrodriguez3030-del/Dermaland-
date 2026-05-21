# Roadmap por Fases — SaaS DGII e-CF para RD

> **Versión:** 1.0 · **Fecha:** 2026-05-21
> 20 fases con objetivo, entregables, criterios de salida, bloqueos y qué NO hacer.

---

## Tabla resumen de las 20 fases

| # | Fase | Objetivo | Estado DermaLand | Bloqueos para empezar | Duración estimada |
|---|---|---|---|---|---|
| 0 | Diagnóstico | Auditar sistema existente | ✅ Completo | — | 2-5 días |
| 1 | Base SaaS multi-tenant | Tenancy + auth + roles | ✅ Completo | Fase 0 | 1-2 semanas |
| 2 | Modelo DGII/e-CF | Schema DB DGII | ✅ Completo | Fase 1 | 1 semana |
| 3 | UI mock/demo | Pantallas con datos fake | ✅ Completo | Fase 2 | 1-2 semanas |
| 4 | Builder XML e-CF | XSD-compliant tipos 31/32/33/34 | ✅ Completo | Fase 2 | 1-2 semanas |
| 5 | XSD validation | xmllint-wasm contra XSDs oficiales | ✅ Completo | Fase 4 | 3-5 días |
| 6 | Firma digital demo | XMLDSig con cert dummy | ✅ Completo | Fase 4 | 1 semana |
| 7 | Supabase real + RLS | Migraciones 0001-0006 aplicadas | ✅ Completo | Fase 1 | 1-2 semanas |
| 8 | Wizard habilitación SaaS | 10 pasos con evidencia | ✅ Completo | Fase 3, 7 | 2 semanas |
| 9 | Certificado real en Preview | Upload + cifrado .p12 | ✅ Completo | Fase 7 | 1 semana |
| 10 | Validación local certificado | runLocalCertTest + XSD | ✅ Completo | Fase 9 | 3-5 días |
| 11 | Pre-Fase G checklist | 9 ítems + declaración | ✅ Completo | Fase 8, 10 | 1 semana |
| 12 | Dry-run Fase G | prepareTestecfSubmission sin HTTP | ✅ Completo | Fase 11 | 1 semana |
| 13 | Postulación + sequences | Trámite DGII + rangos | ⏳ Externo cliente | Cliente real | Variable |
| 14 | Fase G testecf real | POST real a testecf | 🔒 Bloqueada | Fase 13 + autorización | 2-3 semanas |
| 15 | Fase H TrackId/status | Polling DGII | 🔒 Bloqueada | Fase 14 | 1-2 semanas |
| 16 | Certificación DGII | DGII certifica formalmente | 🔒 Bloqueada | Fase 14-15 estables | 4-8 semanas |
| 17 | Producción fiscal | ambiente=ecf | 🔒 Bloqueada | Fase 16 | 1-2 semanas |
| 18 | Operación + soporte | Monitoreo + runbooks | 🔒 Bloqueada | Fase 17 | Continuo |
| 19 | Reutilización | Empaquetar para otros SaaS | 🔒 Pendiente | Fase 18 estable | 2-3 semanas |
| 20 | Escalamiento | Multi-cliente robusto | 🔒 Pendiente | Fase 18 + N clientes | Continuo |

---

## Detalle por fase

### Fase 0 — Diagnóstico del sistema existente

**Objetivo:** auditar el sistema actual del SaaS (si existe) para identificar qué se aprovecha y qué se construye.

**Descripción:** Antes de codear nada DGII, hay que entender qué tiene el SaaS: auth, multi-tenant, POS, productos, clientes, persistencia. Esto evita duplicación y permite integrar el módulo en arquitectura existente.

**Qué se construye:** Un informe de gaps + plan de integración + ADR de decisiones técnicas. No hay código aún.

**Módulos involucrados:** N/A (solo análisis).
**Archivos típicos:** `docs/dgii/auditoria-sistema-existente.md`, `docs/dgii/plan-integracion-dgii.md`.
**Tablas típicas:** N/A.
**Variables:** N/A.
**Agentes:** Orquestador, Arquitectura, Producto, Compliance.
**Skills:** Lectura de código, comunicación con stakeholders, análisis arquitectónico.
**Dependencias:** Acceso al repo y a los stakeholders.
**Riesgos:** Asumir sin validar lo que tiene el sistema; faltar entrevistas a contador.
**Validaciones:** Informe leído y firmado por arquitectura + producto.
**Pruebas:** N/A.
**Criterios de salida:** Informe completo; gaps documentados; ADR aprobado.
**Qué NO hacer todavía:** Codear migración; instalar deps DGII.
**Autorización:** Lead técnico.
**Entregables:** Informe + ADR.
**Checklist de cierre:**
- [ ] Repo auditado.
- [ ] Stakeholders entrevistados.
- [ ] ADR firmado.
- [ ] Plan aprobado.

---

### Fase 1 — Base SaaS multi-tenant

**Objetivo:** Tener `businesses`, `users`, auth, roles, RLS básico funcionando.

**Descripción:** El módulo DGII opera sobre un SaaS multi-tenant. Si no existe, hay que construirlo primero. Si existe, validar que tiene business_id por tenant y RLS.

**Qué se construye:** Migración base; `auth_business_id()` SQL function; helper `getSession()` que lee JWT.

**Archivos típicos:** `supabase/migrations/0001_phase1_core.sql`, `apps/web/src/server/auth/context.ts`.
**Tablas:** `businesses`, `branches`, `users`, `plans`.
**Variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
**Agentes:** Arquitectura, Supabase/RLS, DevOps, Seguridad.
**Skills:** PostgreSQL, RLS, Supabase Auth, Next.js middleware.
**Dependencias:** Fase 0.
**Riesgos:** RLS faltante en una tabla; JWT no llega a server; cross-tenant leak.
**Validaciones:** Smoke con 2 seed users (business A y B); A no ve B.
**Pruebas:** Test E2E de tenant isolation.
**Criterios de salida:** RLS activa en todas las tablas; 2 seed users probados; auth_business_id() responde claims correctos.
**Qué NO hacer todavía:** Tablas DGII (Fase 2); pantallas DGII.
**Autorización:** Arquitectura.
**Entregables:** Migración 0001 aplicada; tests cross-tenant verdes.
**Checklist:**
- [ ] RLS verificada.
- [ ] Helper auth_business_id() funciona.
- [ ] Seed users creados.
- [ ] Tests cross-tenant.

---

### Fase 2 — Modelo DGII/e-CF

**Objetivo:** Schema completo de tablas DGII con RLS.

**Descripción:** `dgii_settings`, `dgii_certificates`, `ecf_sequences`, `electronic_invoices`, `electronic_invoice_items`, `dgii_submissions`, `dgii_status_logs`, `audit_logs`. Todas con `business_id` + RLS.

**Qué se construye:** Migración(es) DDL aditivas; función `reserve_next_encf` atómica.

**Archivos:** `supabase/migrations/0002_phase2_inventory.sql`, `0003_dgii_pos.sql`.
**Tablas:** todas las DGII.
**Variables:** ninguna nueva.
**Agentes:** Supabase/RLS, Compliance, Backend e-CF.
**Skills:** Postgres avanzado, RLS, JSONB.
**Dependencias:** Fase 1.
**Riesgos:** FK incorrecta, RLS faltante, índice missing.
**Validaciones:** `SELECT * FROM pg_policies WHERE schemaname='public'` revisa cada tabla DGII.
**Pruebas:** Smoke INSERT/SELECT con seed users.
**Criterios de salida:** Todas las tablas tienen RLS; función reserve_next_encf testeada (atómica bajo concurrencia).
**Qué NO hacer:** Subir cert real; cargar sequences reales.
**Autorización:** Supabase agent.
**Entregables:** Migraciones aplicadas + tests.
**Checklist:**
- [ ] Migración aplicada.
- [ ] RLS verificada en cada tabla.
- [ ] Función reserve_next_encf testeada.
- [ ] Smoke cross-tenant.

---

### Fase 3 — UI mock/demo

**Objetivo:** Pantallas DGII funcionando con datos fake.

**Descripción:** /dgii overview, /dgii/habilitacion (wizard inicial), /dgii/certificado (form mock), /dgii/configuracion, /dgii/secuencias, /dgii/certificacion (pre-cert mock con 4 tipos).

**Qué se construye:** Componentes React, mocks `lib/mock-data/*`, stores localStorage.

**Archivos:** `apps/web/src/app/(app)/dgii/**`, `apps/web/src/features/dgii/*-store.ts`.
**Tablas:** ninguna real; localStorage.
**Variables:** `DATA_SOURCE=mock`.
**Agentes:** Frontend/UX, Producto.
**Skills:** React RSC + client, Tailwind, UX writing.
**Dependencias:** Fase 0 (PRD).
**Riesgos:** UX confusa, copy técnico, falta de mensajes de error.
**Validaciones:** QA manual sigue mockups.
**Pruebas:** Test de render + interacción básica.
**Criterios de salida:** Todas las pantallas DGII cargan; flujo wizard 100% navegable.
**Qué NO hacer:** Conectar Supabase real (Fase 7); cert real (Fase 9).
**Autorización:** Producto + Frontend.
**Entregables:** UI completa modo mock.
**Checklist:**
- [ ] Wizard navegable.
- [ ] Mensajes en español RD.
- [ ] Mobile responsive.
- [ ] Sin errores en consola.

---

### Fase 4 — Builder XML e-CF

**Objetivo:** `buildEcfXml(input)` que produce XML XSD-compliant para tipos 31/32/33/34.

**Descripción:** Service puro TypeScript que recibe `EcfBuilderInput` (RNC, razón social, items, totales, etc.) y devuelve XML válido contra XSD oficial.

**Qué se construye:** `apps/web/src/server/services/dgii/builder.ts` + tests exhaustivos.

**Archivos:** `builder.ts`, `builder.test.ts`, `types.ts`.
**Tablas:** ninguna.
**Variables:** ninguna.
**Agentes:** Backend e-CF, XML/XSD, Compliance.
**Skills:** XML/XSD, xmlbuilder2, TypeScript.
**Dependencias:** XSDs oficiales en `docs/dgii/xsd/`.
**Riesgos:** Orden de elementos incorrecto, encoding mal, regex de validación off.
**Validaciones:** Tests por tipo con XSD oficial.
**Pruebas:** Vitest > 100 cases (input válido / inválido / edge cases).
**Criterios de salida:** Tests verdes para 4 tipos; XSD oficial valida output.
**Qué NO hacer:** Firmar (Fase 6); enviar a DGII (Fase 14).
**Autorización:** Backend.
**Entregables:** builder.ts + builder.test.ts.
**Checklist:**
- [ ] 4 tipos soportados.
- [ ] XSD oficial valida.
- [ ] Tests > 100.
- [ ] Errores tipados (EcfBuilderInvalidInput, EcfBuilderUnsupported).

---

### Fase 5 — XSD validation

**Objetivo:** `validateEcfXml({xml, xsd})` que valida un XML contra XSD oficial vía xmllint-wasm.

**Descripción:** Wrapper alrededor de xmllint-wasm que normaliza XSD oficial (typo del XSD 31 conocido) y devuelve `{valid, errors[]}`.

**Qué se construye:** `validator.ts` + `validator.test.ts`.

**Archivos:** `validator.ts`, `validator.test.ts`.
**Variables:** ninguna.
**Agentes:** XML/XSD, Backend.
**Skills:** XSD, xmllint, WebAssembly.
**Dependencias:** xmllint-wasm dep + Fase 4.
**Riesgos:** XSD desactualizado, parche en disco (mal — debe ser en memoria).
**Validaciones:** XML firmado del builder pasa; XML mal-formado falla con error específico.
**Pruebas:** Tests por tipo + cases de error.
**Criterios de salida:** validateEcfXml estable; XSDs no modificados en disco.
**Qué NO hacer:** Validar XMLs externos sin sanitize.
**Autorización:** Backend.
**Entregables:** validator.ts.
**Checklist:**
- [ ] xmllint-wasm instalado.
- [ ] Tests por tipo.
- [ ] patchOfficialDgiiXsd para typo XSD 31.

---

### Fase 6 — Firma digital demo

**Objetivo:** `signEcfXml({xml, certPem, privateKeyPem})` que firma con XMLDSig enveloped.

**Descripción:** Wrapper de xml-crypto con configuración DGII: enveloped, c14n, RSA-SHA256, KeyInfo X509, Reference URI vacío con isEmptyUri.

**Qué se construye:** `signer.ts` + `signer.test.ts` + `verifyEcfSignature`.

**Archivos:** `signer.ts`, `signer.test.ts`.
**Agentes:** Firma Digital, Backend, Seguridad.
**Skills:** XMLDSig, c14n, RSA, X.509.
**Dependencias:** xml-crypto, @xmldom/xmldom.
**Riesgos:** Id agregado al ECF (rechaza XSD), c14n incorrecta.
**Validaciones:** XSD oficial valida XML firmado; verifyEcfSignature retorna true.
**Pruebas:** Roundtrip sign + verify; XSD post-firma.
**Criterios de salida:** XSD oficial acepta XML firmado.
**Qué NO hacer:** Usar cert real (Fase 9); enviar a DGII (Fase 14).
**Autorización:** Backend + Seguridad.
**Entregables:** signer.ts.
**Checklist:**
- [ ] isEmptyUri:true.
- [ ] XSD post-firma OK.
- [ ] verifyEcfSignature implementado.

---

### Fase 7 — Supabase real + RLS

**Objetivo:** Conectar el SaaS a Supabase Preview con RLS.

**Descripción:** `DATA_SOURCE=supabase` activado en Preview env vars. Auth real con seed user. Helper `auth_business_id()` lee JWT claims.

**Qué se construye:** Migraciones aplicadas + scripts bootstrap seed user + env vars Preview.

**Archivos:** `scripts/bootstrap-preview-supabase-user.mjs`.
**Variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATA_SOURCE=supabase` (Preview only).
**Agentes:** Supabase, Seguridad, DevOps.
**Skills:** Supabase Auth, JWT claims, RLS, Vercel env.
**Dependencias:** Fase 2.
**Riesgos:** JWT claims faltantes; RLS rota; service_role expuesto.
**Validaciones:** /api/health responde data_source=supabase; smoke 11/11 rutas verdes.
**Pruebas:** Test cross-tenant con seed users distintos.
**Criterios de salida:** Auth real funciona; RLS aplica; 11/11 rutas en preview verdes.
**Qué NO hacer:** Activar DATA_SOURCE=supabase en Production (sigue mock).
**Autorización:** DevOps + Seguridad.
**Entregables:** Preview operativo con Supabase real.
**Checklist:**
- [ ] Seed user creado.
- [ ] /api/health verde.
- [ ] 11/11 rutas verdes.
- [ ] Production env intacto.

---

### Fase 8 — Wizard habilitación SaaS

**Objetivo:** /dgii/habilitacion con 10 pasos, panel global, banner Modo SaaS.

**Descripción:** Wizard completo con `enablement-store` (localStorage), evaluator con 8 estados globales, EnablementStepCard, paso "Autorización del representante e-CF" con form de evidencia rica + declaración.

**Qué se construye:** Múltiples componentes y stores.

**Archivos:** `app/(app)/dgii/habilitacion/page.tsx`, `features/dgii/enablement-store.ts`, `features/dgii/enablement-evaluator.ts`, `components/dgii/enablement-step-card.tsx`, `components/dgii/representante-evidence-form.tsx`, `components/dgii/testecf-preflight-runner.tsx`.
**Tablas:** localStorage (futuro: tabla Supabase).
**Agentes:** Frontend, Producto, Soporte.
**Skills:** React avanzado, UX, accesibilidad.
**Dependencias:** Fase 3, 7.
**Riesgos:** UX confusa al cliente; evaluator con gates flojos.
**Validaciones:** QA manual completo del wizard.
**Pruebas:** Vitest del store + evaluator + form de evidencia.
**Criterios de salida:** Wizard navegable; evaluator con anti-bypass; tests verdes.
**Qué NO hacer:** Tocar DGII real (Fase 12+); usar cert real (Fase 9).
**Autorización:** Producto + Frontend.
**Entregables:** Wizard completo.
**Checklist:**
- [ ] 10 pasos visibles.
- [ ] Form evidencia funcional.
- [ ] Declaración formal.
- [ ] Anti-bypass tested.

---

### Fase 9 — Certificado real en Preview

**Objetivo:** Subir un `.p12` real cifrado a Supabase Storage en Preview.

**Descripción:** Endpoint `/api/dgii/certificate/upload` que recibe FormData, valida MIME, parsea con node-forge, cifra blob+password con AES-256-GCM, persiste en Storage + dgii_certificates.

**Qué se construye:** Endpoint, service `certificate-storage.ts`, helper `cert-cipher.ts`.

**Archivos:** `app/api/dgii/certificate/upload/route.ts`, `server/services/certificate-storage.ts`, `server/crypto/cert-cipher.ts`.
**Tablas:** `dgii_certificates`, `audit_logs`.
**Variables:** `DGII_CERT_ENCRYPTION_KEY` (32 bytes random base64).
**Agentes:** Seguridad/Certificados, Backend, Compliance.
**Skills:** PKCS#12, AES-GCM, Supabase Storage.
**Dependencias:** Fase 7.
**Riesgos:** Leak de password, blob no cifrado, key expuesta.
**Validaciones:** dgii_certificates fila creada con `pkcs12_encrypted_blob` cifrado; audit log presente.
**Pruebas:** Smoke con cert dummy.
**Criterios de salida:** Cert real subido y persistido; sin leak en logs.
**Qué NO hacer:** Subir a Production env (Preview only); enviar a DGII (Fase 14).
**Autorización:** Seguridad + cliente del SaaS.
**Entregables:** Endpoint + service.
**Checklist:**
- [ ] AES-256-GCM funciona.
- [ ] Sin leak en logs.
- [ ] Cert persistido.
- [ ] Audit log.

---

### Fase 10 — Validación local certificado

**Objetivo:** `runLocalCertTest` que valida cert real con XSD oficial + firma + verificación.

**Descripción:** Service async que: descifra cert, parsea metadata, build XML demo, firma RSA-SHA256, verifica, valida estructura, XSD oficial, QR demo. 8 steps verdes.

**Qué se construye:** `local-cert-test.ts` + tests + endpoint POST + UI `certificado-real.tsx`.

**Archivos:** `server/services/local-cert-test.ts`, `app/api/dgii/certificate/test-local/route.ts`, `features/dgii/components/certificado-real.tsx`.
**Agentes:** Backend, Seguridad, QA Auto.
**Skills:** PKCS#12, XMLDSig, XSD.
**Dependencias:** Fase 4, 5, 6, 9.
**Riesgos:** Leak en evidencia, XSD path no encontrado en Vercel.
**Validaciones:** 8 steps verdes con cert real; sin password en evidence.
**Pruebas:** Test con cert generado dinámicamente.
**Criterios de salida:** Prueba local funciona; XSD step pasa con cert real.
**Qué NO hacer:** Llamar DGII (Fase 14).
**Autorización:** Backend.
**Entregables:** Service + endpoint + UI.
**Checklist:**
- [ ] 8 steps verdes.
- [ ] XSD valida.
- [ ] Sin leak.
- [ ] outputFileTracingIncludes para XSDs.

---

### Fase 11 — Pre-Fase G checklist cliente/contador

**Objetivo:** Paso 8 wizard con 9 ítems de evidencia + declaración formal del responsable.

**Descripción:** UI `RepresentanteEvidenceForm` permite registrar por ítem: estado tri-state, responsable, fecha, ref documental, nota. Declaración bloquea `ready_for_testecf`.

**Qué se construye:** `representante-evidence-form.tsx`, extensión de `enablement-store` con `ChecklistItemEvidence` y `declarationAccepted`, evaluator estricto.

**Archivos:** `components/dgii/representante-evidence-form.tsx`, `features/dgii/enablement-store.ts`, `features/dgii/enablement-evaluator.ts`.
**Agentes:** Frontend, Producto, Contable, Soporte.
**Skills:** UX para checklists, React forms, persistence.
**Dependencias:** Fase 8.
**Riesgos:** Bypass del gate; UX confusa.
**Validaciones:** Test anti-bypass (Select=completed sin evidence → in_progress).
**Pruebas:** Vitest store + evaluator + UI.
**Criterios de salida:** Anti-bypass funciona; declaración requerida.
**Qué NO hacer:** Avanzar Fase G sin esto.
**Autorización:** Producto.
**Entregables:** Paso 8 completo.
**Checklist:**
- [ ] 9 ítems con evidencia.
- [ ] Declaración formal.
- [ ] Anti-bypass.
- [ ] QA manual 14/14.

---

### Fase 12 — Dry-run Fase G

**Objetivo:** `prepareTestecfSubmission` que arma payload completo sin tocar DGII.

**Descripción:** Service async puro que valida ambiente, build XML, valida XSD, firma, computa URLs testecf, devuelve evidencia + razones de bloqueo. `executeTestecfSubmission` stub que siempre tira `TestecfSendDisabled`. Endpoint POST + UI.

**Qué se construye:** `testecf-client.ts`, `testecf-preflight.ts`, endpoint, UI `testecf-preflight-runner.tsx`, tests con `vi.spyOn(fetch)` que tira.

**Archivos:** `server/services/dgii/testecf-client.ts`, `testecf-preflight.ts`, `app/api/dgii/invoices/testecf-send/route.ts`, `components/dgii/testecf-preflight-runner.tsx`.
**Variables:** `DGII_BASE_URL_TESTECF` (default hardcoded), `DGII_TESTECF_SEND_ENABLED=false`.
**Agentes:** Backend, Integración testecf, QA Auto, Seguridad.
**Skills:** HTTP design, killswitches, testing avanzado.
**Dependencias:** Fase 10, 11.
**Riesgos:** Fetch accidental, leak en preflight evidence.
**Validaciones:** Test fetchSpy.not.toHaveBeenCalled; refuse ambiente !== testecf; refuse override /ecf/.
**Pruebas:** Vitest 11+ tests del cliente + tests guards.
**Criterios de salida:** Dry-run funciona end-to-end; zero fetch en suite; killswitches operan.
**Qué NO hacer:** Implementar fetch real (Fase 14).
**Autorización:** Backend + Seguridad.
**Entregables:** Cliente dry-run + UI + tests.
**Checklist:**
- [ ] prepareTestecfSubmission OK.
- [ ] executeTestecfSubmission stub tira siempre.
- [ ] killswitch flag funciona.
- [ ] Guard global fetch.

---

### Fase 13 — Postulación + secuencias e-NCF

**Objetivo:** Cliente / contador completan trámite DGII y cargan rangos.

**Descripción:** El cliente entra a SIRTSS DGII, postula al ambiente testecf con sus URLs internas, recibe rangos e-NCF asignados por DGII. El sistema solo gestiona el alta del rango en `ecf_sequences`.

**Qué se construye:** UI `/dgii/secuencias` con form para alta del rango; validaciones; función SQL `reserve_next_encf` ya implementada en Fase 2.

**Archivos:** `app/(app)/dgii/secuencias/page.tsx`.
**Tablas:** `ecf_sequences`.
**Agentes:** Contable, Cliente, Frontend.
**Skills:** SIRTSS DGII, validación de rangos.
**Dependencias:** Postulación aprobada DGII (externo).
**Riesgos:** Cliente carga rango incorrecto; rango expira.
**Validaciones:** Validación range_start < range_end; alarma 90%.
**Pruebas:** Smoke de reserva atómica.
**Criterios de salida:** Rango cargado y `status='active'`; postulación documentada.
**Qué NO hacer:** Continuar Fase 14 sin esto.
**Autorización:** Contador + dueño.
**Entregables:** ecf_sequences poblada.
**Checklist:**
- [ ] Postulación DGII aprobada.
- [ ] Rango cargado por tipo.
- [ ] expires_at registrado.
- [ ] Alarmas configuradas.

---

### Fase 14 — Fase G testecf real

**Objetivo:** Implementar HTTP real del cliente DGII testecf y enviar primer e-CF.

**Descripción:** `executeTestecfSubmission` deja de ser stub; implementa Semilla → ValidarSemilla → token → POST multipart recepción. Persiste `dgii_submissions`. Confirma TrackId.

**Qué se construye:** Cuerpo HTTP del client, token cache, persistencia, error handling, retry policy.

**Archivos:** `testecf-client.ts` (extender), `server/services/dgii/testecf-auth.ts`, route `/api/dgii/invoices/[id]/send`.
**Variables:** `DGII_TESTECF_SEND_ENABLED=true` (Preview only, autorizado).
**Agentes:** Integración testecf, Backend, Seguridad, Compliance.
**Skills:** HTTP avanzado, multipart, error handling, OAuth-like.
**Dependencias:** Fase 12 + Fase 13 + autorización per-tipo.
**Riesgos:** Endpoint prod accidental, leak token, rate limit DGII.
**Validaciones:** Tests con fetch mockeado para cada error 4xx/5xx; primer envío real con tipo 31.
**Pruebas:** Vitest + smoke testecf real.
**Criterios de salida:** TrackId guardado para tipo 31; cero leak de tokens; persistencia en dgii_submissions.
**Qué NO hacer:** Fase H polling sin autorización separada; certecf.
**Autorización:** EXPLÍCITA per-tipo del dueño + contador.
**Entregables:** Cliente real + primer envío exitoso.
**Checklist:**
- [ ] Auth flow Semilla → ValidarSemilla.
- [ ] POST multipart implementado.
- [ ] TrackId recibido.
- [ ] dgii_submissions poblada.
- [ ] Audit log.

---

### Fase 15 — Fase H TrackId/status

**Objetivo:** Polling de status de DGII para invoices con TrackId.

**Descripción:** Edge Function cron consulta `/consultatrackid/api/TrackIds/Estado` cada N min para `electronic_invoices.status IN ('submitted','in_process')`. Actualiza status + INSERT `dgii_status_logs`.

**Qué se construye:** Edge Function cron, status client, mapeo DGII → status interno.

**Archivos:** `app/api/dgii/invoices/[id]/status/route.ts` + Edge Function de cron.
**Tablas:** `dgii_status_logs`, update `electronic_invoices`.
**Variables:** Vercel Cron config.
**Agentes:** TrackId/Status, Observabilidad, DevOps.
**Skills:** Edge Functions, cron, rate limit.
**Dependencias:** Fase 14.
**Riesgos:** Polling abusivo (DGII 429), leak token en cron logs.
**Validaciones:** Rate limit testeado; logs sin tokens.
**Pruebas:** Mock DGII responses (Aceptado/Rechazado/EnProceso); test rate limit.
**Criterios de salida:** Status sincronizado < 10 min de envío; cron operativo.
**Qué NO hacer:** Polling masivo (max 60/min por business).
**Autorización:** Backend + DevOps.
**Entregables:** Cron + status client.
**Checklist:**
- [ ] Cron activo.
- [ ] Rate limit aplicado.
- [ ] Mapeo DGII → status correcto.
- [ ] dgii_status_logs poblada.

---

### Fase 16 — Certificación DGII

**Objetivo:** DGII certifica formalmente al contribuyente para emitir en ambiente certecf.

**Descripción:** Cliente / contador envía X comprobantes de cada tipo en testecf, DGII evalúa, emite certificación formal con acta. El SaaS cambia `ambiente='certecf'` para ese business.

**Qué se construye:** UI para cambiar ambiente con doble confirmación + audit; documentación de la transición.

**Archivos:** `app/(app)/dgii/configuracion/page.tsx` (extender).
**Tablas:** update `dgii_settings.ambiente`.
**Agentes:** Contable, Compliance, Orquestador.
**Skills:** SIRTSS DGII, normativa, gestión documental.
**Dependencias:** Fase 14, 15 estables con tasa aceptación > 95%.
**Riesgos:** Transición prematura; acta no archivada; rangos certecf distintos.
**Validaciones:** Acta DGII subida al sistema; audit log de la transición.
**Pruebas:** Smoke en certecf (con autorización explícita).
**Criterios de salida:** Acta DGII archivada; ambiente=certecf; certificación en curso.
**Qué NO hacer:** Saltar a producción (Fase 17) sin acta DGII.
**Autorización:** EXPLÍCITA del dueño + contador + DGII (acta).
**Entregables:** Acta DGII + UI ambiente switcher.
**Checklist:**
- [ ] Acta archivada.
- [ ] Ambiente switcheado.
- [ ] Audit log.
- [ ] Rangos certecf cargados.

---

### Fase 17 — Producción fiscal

**Objetivo:** Activar `ambiente='ecf'` + `dgii_enabled_real_send=true` para el cliente.

**Descripción:** Cambio final a producción fiscal después de certificación DGII formal. Comprobantes emitidos son fiscalmente válidos. Backups, alarmas, retención y plan de rollback activos.

**Qué se construye:** UI de activación con triple confirmación (dueño + admin + contador); checklist § 26 del PRD verificado.

**Archivos:** UI; runbook producción.
**Tablas:** update `dgii_settings`.
**Variables:** `DGII_BASE_URL_ECF` configurada en Vercel Production (per cliente).
**Agentes:** Orquestador, Seguridad Producción, DevOps, Compliance.
**Skills:** Cambio de producción, monitoreo.
**Dependencias:** Fase 16 + checklist go-live verde (15 items PRD § 31).
**Riesgos:** Activación prematura; emisión fiscal incorrecta; rollback complicado.
**Validaciones:** Checklist go-live 15/15 verde; backup verificado restorable; alarmas testeadas.
**Pruebas:** Smoke fiscal con 1 comprobante real + reversal documentado.
**Criterios de salida:** Producción fiscal activa para el cliente; primer e-CF fiscal emitido y aceptado.
**Qué NO hacer:** Activar para múltiples clientes a la vez (uno por uno).
**Autorización:** EXPLÍCITA triple (dueño SaaS + admin cliente + contador) + verificación compliance.
**Entregables:** Cliente en producción fiscal.
**Checklist:**
- [ ] Checklist go-live 15/15.
- [ ] Backup restorable.
- [ ] Alarmas activas.
- [ ] Primer e-CF fiscal aceptado.

---

### Fase 18 — Operación, soporte y monitoreo

**Objetivo:** Operación continua estable: cliente emitiendo, soporte resolviendo, monitoreo activo.

**Descripción:** Monitoreo de KPIs (tasa aceptación, latencia, cert vencimiento), alarmas, runbooks de incidentes, soporte L1/L2 capacitado.

**Qué se construye:** Dashboards, alarmas, runbooks de soporte, FAQs.

**Archivos:** `docs/dgii/runbook-soporte.md`, `docs/dgii/runbook-incidentes.md`, FAQ.
**Agentes:** Soporte, Observabilidad, Incidentes, Capacitación.
**Skills:** Observability, comunicación, gestión de crisis.
**Dependencias:** Fase 17.
**Riesgos:** Soporte no capacitado, alarmas ruidosas, MTTR alto.
**Validaciones:** SLA cumplidos; NPS clientes > 50.
**Pruebas:** Simulacro DGII outage.
**Criterios de salida:** Operación estable 30 días sin incidentes P0; SLA cumplidos.
**Qué NO hacer:** Avanzar a Fase 19 sin operación estable.
**Autorización:** Continuo.
**Entregables:** Dashboards + runbooks + FAQ.
**Checklist:**
- [ ] Dashboards activos.
- [ ] Alarmas testeadas.
- [ ] Runbooks publicados.
- [ ] Soporte capacitado.

---

### Fase 19 — Reutilización en otros SaaS

**Objetivo:** Empaquetar el módulo para integrarlo en otros SaaS RD.

**Descripción:** Refactor del módulo a paquete portable (services + migraciones + UI templates + tests). Doc de adaptación. Caso piloto en SaaS distinto.

**Qué se construye:** Paquete npm interno o estructura de copy-paste documentada.

**Archivos:** `packages/saas-dgii/` (si monorepo) o `docs/dgii/portable-package.md`.
**Agentes:** Migración entre SaaS, Arquitectura, Documentación.
**Skills:** Refactor avanzado, design system agnostic.
**Dependencias:** Fase 18 estable.
**Riesgos:** Acoplamiento residual con DermaLand; tests que no portan.
**Validaciones:** Caso piloto en SaaS B funciona.
**Pruebas:** Tests del paquete sin deps de DermaLand específicas.
**Criterios de salida:** Segundo SaaS usando el módulo.
**Qué NO hacer:** Romper DermaLand al refactorear.
**Autorización:** Orquestador.
**Entregables:** Paquete + segundo SaaS piloto.
**Checklist:**
- [ ] Paquete portable.
- [ ] Tests verdes en piloto.
- [ ] Docs de adaptación.

---

### Fase 20 — Escalamiento multi-cliente

**Objetivo:** Operar el módulo con N clientes simultáneos sin degradación.

**Descripción:** Optimización de queries por business, índices, caching, edge functions paralelas, observabilidad multi-tenant.

**Qué se construye:** Optimizaciones de performance, caching, dashboards multi-tenant.

**Archivos:** Refactor de queries; índices DB; caching.
**Agentes:** Arquitectura, Observabilidad, DevOps.
**Skills:** Performance, caching, observability avanzada.
**Dependencias:** Fase 18 + Fase 19.
**Riesgos:** Cuello de botella en cron; tenant ruidoso afecta a otros.
**Validaciones:** Carga simulada con 100 businesses concurrentes.
**Pruebas:** Load testing.
**Criterios de salida:** SLA mantenido a 100+ businesses.
**Qué NO hacer:** Multi-region sin compliance review.
**Autorización:** Arquitectura.
**Entregables:** Sistema escalado.
**Checklist:**
- [ ] Performance OK a 100 tenants.
- [ ] Cron sin colisiones.
- [ ] Tenant isolation bajo carga.

---

## 3. Reglas de transición entre fases

- **No se salta una fase.** Si Fase N-1 no está verde, no se empieza N.
- **Cada fase requiere autorización explícita.** Documentada en commit o PROJECT_MEMORY.
- **Killswitches se mantienen entre fases.** No se desactiva un killswitch porque "ya estamos en la fase siguiente".
- **Producción Vercel intacta hasta Fase 17.** Cero env vars de Production hasta certificación DGII formal.
- **Cada transición se audita.** audit_log con `action='dgii_phase_transition'`.
- **Rollback documentado por fase.** Antes de avanzar, se valida que se puede rollback.

---

## 4. Adaptación a otro SaaS

**Otro SaaS RD empezando desde cero:** seguir las 20 fases tal cual.

**Otro SaaS RD con sistema multi-tenant existente:** saltar Fase 1; auditar en Fase 0 que tiene RLS + business_id; continuar desde Fase 2.

**SaaS para otro país (México CFDI, Chile DTE, Perú CPE):** la estructura aplica; los XSDs, endpoints y normativa cambian. Reusar:
- Patrón multi-tenant + RLS.
- Estructura de fases.
- Killswitches + dry-run.
- Cifrado de cert.
- UX del wizard.

Reescribir:
- Builder XML específico del país.
- XSDs del país.
- Endpoints HTTP del país.
- Roles fiscales (Usuario Admin e-CF es específico de DGII RD).

---

**Fin del Roadmap.** Ver `checklist-implementacion-saas-dgii.md` para tareas concretas.
