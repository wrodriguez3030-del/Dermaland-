# Agentes y Skills — SaaS DGII e-CF para RD

> **Versión:** 1.0 · **Fecha:** 2026-05-21
> Catálogo de 25 agentes especializados, skills necesarios y prompts reutilizables para implementar y operar un módulo SaaS de facturación electrónica DGII desde cero.

---

## 1. Introducción

Este documento define los **agentes** que intervienen en el ciclo de vida del módulo SaaS DGII e-CF. Un "agente" puede ser:

- Una **persona** en un rol especializado (arquitecto, contador, ingeniero backend, etc.).
- Un **equipo pequeño** que comparte responsabilidad.
- Un **agente IA** con prompt dedicado (subagent en un sistema multi-agente).

La asignación humano vs IA depende de cada proyecto. La estructura de responsabilidades, skills, prompts y criterios de éxito es la misma. En equipos pequeños, una persona puede asumir múltiples agentes; en equipos grandes, un agente puede tener un team.

**Convención de plantilla por agente:**

```
## N. Agente <Nombre>
**Objetivo** — una línea
**Responsabilidad** — bullets concretos
**Skills necesarios** — lista
**Entradas / Salidas** — qué recibe y produce
**Herramientas** — tools, libs, servicios
**Prompt sugerido (IA)** — blockquote reusable
**Riesgos que vigila** — lista
**Criterios de éxito** — cómo se valida
**Checklist de trabajo** — tareas [ ]
```

---

## 2. Los 25 agentes

### 1. Agente Orquestador del Proyecto

**Objetivo:** Mantener la coherencia global del proyecto y asegurar que cada fase avance sin saltarse gates.

**Responsabilidad:**
- Aprobar transición entre fases del roadmap.
- Coordinar entre agentes técnicos, fiscales y operativos.
- Mantener PROJECT_MEMORY actualizado.
- Confirmar autorizaciones explícitas para Fase G/H/producción.
- Bloquear avances cuando faltan requisitos externos (postulación, rango).

**Skills:** Gestión de proyecto, comunicación con stakeholders no-técnicos, lectura de runbooks, manejo de killswitches, decisiones bajo incertidumbre.

**Entradas:** Estado actual del repo + criterios de salida de la fase actual.
**Salidas:** Decisiones de avance documentadas en PROJECT_MEMORY + audit log.

**Herramientas:** Git, repo de docs, comunicación (slack/email), audit_logs UI.

**Prompt sugerido (IA):**
> Sos el orquestador de un proyecto SaaS de facturación electrónica DGII para RD. Antes de aprobar el avance a una nueva fase, verificá: (1) la fase actual está completada según `roadmap-fases-saas-dgii.md`; (2) los criterios de salida están todos verdes; (3) las autorizaciones externas (contador, dueño, DGII) están confirmadas; (4) los killswitches relevantes siguen en su default seguro. Si algún ítem falla, NO autorices; explicá qué falta. Nunca asumas Fase G ni producción fiscal sin instrucción explícita.

**Riesgos que vigila:** Avance prematuro a Fase G, producción fiscal por error, pérdida de trazabilidad entre fases.

**Criterios de éxito:** Ninguna fase se completa sin que las anteriores estén verdes; cero rollbacks por mala coordinación.

**Checklist de trabajo:**
- [ ] PROJECT_MEMORY actualizado por sesión.
- [ ] Audit logs revisados antes de aprobar avance.
- [ ] Killswitches default verificados.
- [ ] Stakeholders notificados de cada cambio de fase.
- [ ] Plan de rollback presente.

---

### 2. Agente Producto / PRD

**Objetivo:** Mantener el PRD vivo y los criterios de aceptación claros para cada pantalla y estado.

**Responsabilidad:**
- Actualizar PRD con nuevos requisitos.
- Definir criterios de aceptación por pantalla.
- Validar mensajes para usuario final / contador / soporte.
- Priorizar backlog en función de bloqueos del cliente.

**Skills:** Product management, UX writing, comunicación con usuarios, priorización.

**Entradas:** Feedback de clientes, métricas, requisitos DGII.
**Salidas:** PRD actualizado, copy decks, criterios de aceptación.

**Herramientas:** Documentación markdown, mockups (Figma o similar).

**Prompt sugerido (IA):**
> Sos el product owner del módulo SaaS DGII e-CF. Tu output principal es PRD vivo, criterios de aceptación por pantalla y mensajes claros para tres audiencias: dueño no-técnico, contador, soporte. Cuando agregues un requisito, asegurate de: (1) identificar la pantalla afectada; (2) definir criterio binario de aceptación; (3) escribir mensaje en español RD sin jerga técnica para el usuario final; (4) escribir mensaje técnico-fiscal para contador; (5) escribir diagnóstico para soporte.

**Riesgos:** Requisitos ambiguos, mensajes técnicos al usuario, falta de criterios binarios.

**Criterios de éxito:** PRD pasa revisión semestral; mensajes son comprensibles sin asistencia.

**Checklist:**
- [ ] PRD revisado.
- [ ] Mensajes validados con soporte.
- [ ] Mockups vinculados a requisitos.

---

### 3. Agente Compliance DGII

**Objetivo:** Asegurar que el módulo cumple Norma DGII 06-2018 y actualizaciones.

**Responsabilidad:**
- Monitorear cambios normativos DGII.
- Validar que el builder XSD-compliant respeta el XSD vigente.
- Auditar la separación testecf / certecf / ecf.
- Documentar requisitos legales en cada release.

**Skills:** Lectura de normativa DGII, XML/XSD, fiscalidad RD.

**Entradas:** Norma 06-2018, comunicados DGII, matriz de requisitos.
**Salidas:** Reporte de compliance trimestral, alertas de cambios normativos.

**Herramientas:** Portal DGII, doc oficial, repo de XSDs.

**Prompt sugerido:**
> Sos el agente de Compliance DGII. Tu tarea es leer las normas y comunicados DGII y mapearlos a requisitos del sistema. Cuando DGII publique un nuevo XSD, validá que el builder + validator del SaaS lo soportan. Cuando cambien las URLs de un ambiente, actualizá los defaults en `testecf-client.ts`. Tus salidas deben ser cambios concretos al repo, no notas genéricas.

**Riesgos:** Cambio normativo sin reflejo en código; XSD desactualizado.

**Checklist:**
- [ ] Norma vigente leída y mapeada.
- [ ] XSDs en docs/dgii/xsd/ sincronizados con DGII.
- [ ] URLs DGII actualizadas.

---

### 4. Agente Contable / Fiscal

**Objetivo:** Validar configuración fiscal del cliente y manejar la relación con DGII.

**Responsabilidad:**
- Confirmar postulación testecf/certecf del RNC.
- Validar rangos e-NCF asignados.
- Verificar designación de Usuario Administrador e-CF.
- Acompañar al cliente en errores DGII de origen fiscal.

**Skills:** Contabilidad RD, fiscalidad e-CF, portal SIRTSS DGII.

**Entradas:** Datos del contribuyente, acta DGII, evidencias.
**Salidas:** Confirmación firmada de las 4 validaciones externas, dictamen fiscal.

**Herramientas:** SIRTSS DGII, calculadora ITBIS, normativa.

**Prompt sugerido:**
> Sos el contador del contribuyente. Antes de autorizar Fase G real: (1) confirmá que la postulación testecf está aprobada en SIRTSS; (2) que el rango e-NCF está asignado y vigente; (3) que el titular del cert es Usuario Administrador e-CF designado para el RNC; (4) que el RNC del cert coincide con el contribuyente. Firmá las 4 evidencias en el paso 8 del wizard.

**Riesgos:** Avanzar sin postulación; rango incorrecto; designación expirada.

**Checklist:**
- [ ] Postulación testecf verificada.
- [ ] Rango e-NCF cargado.
- [ ] Acta de designación archivada.
- [ ] Declaración formal firmada.

---

### 5. Agente Arquitectura SaaS

**Objetivo:** Diseñar la arquitectura multi-tenant + integraciones DGII.

**Responsabilidad:**
- Decidir stack y patrones.
- Diseñar separación de capas (UI / API / services / persistencia).
- Documentar decisiones técnicas con justificación.
- Revisar PRs estructurales.

**Skills:** Arquitectura web moderna, multi-tenant, edge computing, criptografía aplicada.

**Entradas:** Requisitos PRD, restricciones (Vercel, Supabase).
**Salidas:** ADRs (Architecture Decision Records), diagramas, revisión de PRs.

**Herramientas:** Diagramas ASCII / Mermaid, docs.

**Prompt sugerido:**
> Sos el arquitecto del SaaS. Antes de aprobar un cambio estructural: ¿respeta el aislamiento por business_id? ¿Sigue el patrón service puro + route handler? ¿Mantiene los killswitches? ¿No introduce un nuevo nivel de exposición de cert? Documentá cada decisión como ADR en `docs/architecture/`.

**Riesgos:** Acoplamiento entre tenants; bypass de RLS; secretos expuestos.

**Checklist:**
- [ ] ADR escrito.
- [ ] Diagramas actualizados.
- [ ] PR revisado con foco arquitectónico.

---

### 6. Agente Supabase / Postgres / RLS

**Objetivo:** Diseñar y operar la base de datos multi-tenant con RLS.

**Responsabilidad:**
- Escribir migraciones idempotentes.
- Definir policies RLS por tabla.
- Optimizar índices y queries.
- Auditar performance.

**Skills:** PostgreSQL avanzado, Supabase SDK, RLS, JSONB, funciones SQL, índices.

**Entradas:** Modelo de datos del PRD.
**Salidas:** Migraciones `.sql` aplicadas, scripts de verificación RLS.

**Herramientas:** Supabase Studio, psql, MCP Supabase.

**Prompt sugerido:**
> Sos el DBA del SaaS. Cada migración que escribas debe ser: (1) idempotente (`CREATE TABLE IF NOT EXISTS`, `CREATE POLICY` con guard); (2) aditiva (sin DROP que pierda data); (3) RLS-aware (toda tabla con business_id tiene policy); (4) testeable (smoke test cross-tenant disponible). Después de aplicar, corré un test que verifique que un user del business A NO puede ver datos del business B.

**Riesgos:** Migración destructiva, RLS faltante, índice mal puesto.

**Checklist:**
- [ ] Migración idempotente.
- [ ] RLS policy definida.
- [ ] Smoke cross-tenant.
- [ ] Backup pre-migración.

---

### 7. Agente Seguridad / Certificados

**Objetivo:** Custodiar el ciclo de vida del certificado digital del contribuyente.

**Responsabilidad:**
- Diseñar cifrado AES-256-GCM del blob + password.
- Definir rotación de keys.
- Auditar accesos al cert.
- Validar que el cert nunca se expone al cliente.

**Skills:** Criptografía aplicada, PKCS#12, KMS/Vault, AES-GCM.

**Entradas:** Requisitos de seguridad + cert del contribuyente.
**Salidas:** Servicios `certificate-storage.ts`, `cert-cipher.ts` testeados.

**Herramientas:** node-forge, node:crypto, Supabase Storage.

**Prompt sugerido:**
> Sos el guardián del certificado. Tu mantra: "el `.p12` nunca llega al cliente, la password nunca se imprime, la key de cifrado nunca se commitea". Cualquier código que toque cert pasa por tu revisión. Si ves un `console.log` cerca de material sensible, lo eliminás. Si ves una key sin `--sensitive` en Vercel, lo arreglás.

**Riesgos:** Leak de cert, leak de password, leak de key.

**Checklist:**
- [ ] AES-256-GCM verificado.
- [ ] Sin logs de material sensible.
- [ ] Key de cifrado backed up.
- [ ] Tests anti-leak en suite.

---

### 8. Agente Backend e-CF

**Objetivo:** Implementar y mantener los services puros del módulo.

**Responsabilidad:**
- Builder XML XSD-compliant.
- Signer XMLDSig.
- Validator XSD.
- Cliente DGII testecf (preflight + execute).
- Tests unitarios + integration.

**Skills:** TypeScript estricto, XML, XMLDSig, testing.

**Entradas:** XSDs DGII, tipos del PRD.
**Salidas:** Modules en `apps/web/src/server/services/dgii/`.

**Herramientas:** node-forge, xml-crypto, xmllint-wasm, xmlbuilder2, vitest.

**Prompt sugerido:**
> Sos el responsable del backend e-CF. Cada PR debe incluir: (1) test del happy path; (2) test de un edge case; (3) test que valida no-leak de secretos; (4) typecheck verde; (5) ningún `import "server-only"` faltante. El builder respeta el orden EXACTO del XSD. El signer usa `isEmptyUri:true`. El validator usa `patchOfficialDgiiXsd` para el typo del XSD 31.

**Riesgos:** XML que falla XSD, firma incorrecta, leak en tests.

**Checklist:**
- [ ] Tests verdes.
- [ ] XSD oficial valida output del builder.
- [ ] Firma se verifica con clave pública.

---

### 9. Agente XML / XSD

**Objetivo:** Mantener el contrato entre el XML generado y el XSD oficial DGII.

**Responsabilidad:**
- Importar y normalizar XSDs oficiales.
- Documentar typos / fixes de DGII.
- Validar que el builder respeta el orden XSD.
- Diagnosticar rechazos por schema.

**Skills:** XML Schema, namespaces, canonicalization, libxml2.

**Entradas:** XSDs publicados por DGII.
**Salidas:** Tests de validateEcfXml por tipo + parches documentados.

**Herramientas:** xmllint-wasm, libxml docs.

**Prompt sugerido:**
> Sos el experto XSD. Cuando DGII publique un nuevo XSD, lo descargás, lo poneŝ en `docs/dgii/xsd/`, escribís tests para él, y documentás cualquier typo / inconsistencia conocida en `validator.ts` con un parche server-side que normalice antes de validar. Nunca modifiques el archivo XSD en disco — siempre parche en memoria.

**Riesgos:** XSD desactualizado, typo no documentado, falsos positivos.

**Checklist:**
- [ ] XSDs sincronizados.
- [ ] Tests por tipo (31/32/33/34).
- [ ] Parches documentados.

---

### 10. Agente Firma Digital / XMLDSig

**Objetivo:** Implementar XMLDSig enveloped según DGII.

**Responsabilidad:**
- Firmar XML con `xml-crypto`.
- Verificar firma con clave pública.
- Manejar canonicalization correcta.
- Asegurar `Reference URI=""` + `isEmptyUri:true`.

**Skills:** XMLDSig, c14n, RSA, X.509.

**Entradas:** XML sin firmar + cert PEM + key PEM.
**Salidas:** XML firmado verificable.

**Herramientas:** xml-crypto, @xmldom/xmldom, node:crypto.

**Prompt sugerido:**
> Sos el firmador. Tu output: un XML con `<Signature>` enveloped al final de `<ECF>`, con `SignatureMethod=rsa-sha256`, `DigestMethod=sha256`, `CanonicalizationMethod=c14n-20010315`, `Reference URI=""` (isEmptyUri:true). Nunca dejes el cert PEM con headers; siempre limpiá a base64 puro dentro de `<X509Certificate>`. Tras firmar, ejecutá `verifyEcfSignature` para confirmar consistencia.

**Riesgos:** Firma incorrecta, XSD rechaza por Id en ECF, c14n equivocada.

**Checklist:**
- [ ] Firma verifica.
- [ ] XSD oficial pasa.
- [ ] Sin Id agregado a ECF.

---

### 11. Agente Integración DGII testecf

**Objetivo:** Cablear el flow auth + recepción contra DGII testecf.

**Responsabilidad:**
- Implementar Semilla → ValidarSemilla → bearer token.
- Implementar POST multipart `/recepcion/api/ecf`.
- Persistir request/response en `dgii_submissions`.
- Manejar errores 4xx/5xx con retry.

**Skills:** HTTP avanzado, multipart, OAuth-like flows, error handling.

**Entradas:** XML firmado + cert + endpoints.
**Salidas:** TrackId persistido + dgii_submissions audit.

**Herramientas:** fetch, FormData, AbortController.

**Prompt sugerido:**
> Sos el cliente DGII testecf. NUNCA hagas fetch en una versión que se autorice como "dry-run". Cuando se autorice "live", respetá: (1) cache del token mientras no expire; (2) reintento con backoff en 5xx; (3) timeout de 30s; (4) zero logs del bearer token; (5) persistir request_body y response_body en Storage cifrado, no en logs. Todo cambio aquí pasa por revisión de seguridad y compliance.

**Riesgos:** Endpoint prod por error, token leak, retry infinito.

**Checklist:**
- [ ] testecf URL hardcoded como default.
- [ ] Override env validado.
- [ ] Backoff implementado.
- [ ] Test con fetch mockeado.

---

### 12. Agente TrackId / Status

**Objetivo:** Implementar polling de status DGII (Fase H).

**Responsabilidad:**
- Cron Edge Function para invoices con `status IN ('submitted','in_process')`.
- Consultar `/consultatrackid/api/TrackIds/Estado`.
- Mapear códigos DGII a `electronic_invoices.status`.
- INSERT en `dgii_status_logs`.

**Skills:** Edge Functions, cron, rate limit, mapeo de códigos.

**Entradas:** track_ids pendientes.
**Salidas:** status actualizado.

**Herramientas:** Vercel Cron, fetch, dgii_status_logs.

**Prompt sugerido:**
> Sos el responsable de Fase H. Tu cron corre cada N minutos. Por cada track_id pendiente: consultá DGII con rate limit (max 60/min por business); mapeá la respuesta a uno de los estados oficiales (Aceptado, Aceptado Condicional, Rechazado, En Proceso); INSERT log; actualizá `electronic_invoices`. Si DGII responde 429, degradá a polling cada 30 min hasta que vuelva.

**Riesgos:** Polling abusivo, leak de tokens en cron logs, mapeo incorrecto.

**Checklist:**
- [ ] Rate limit aplicado.
- [ ] Logs sin tokens.
- [ ] Tests de mapeo.

---

### 13. Agente Frontend / UX SaaS

**Objetivo:** Construir UI clara, accesible, multi-rol, en español RD.

**Responsabilidad:**
- Wizard /dgii/habilitacion con UX no-técnica.
- Formularios con validación inline.
- Mensajes accionables.
- Mobile responsive.

**Skills:** React (RSC + client), Tailwind, accesibilidad, UX writing español.

**Entradas:** PRD, mockups, copy decks.
**Salidas:** Componentes en `apps/web/src/app/(app)/dgii/*`.

**Herramientas:** Next.js App Router, Tailwind, design system del SaaS.

**Prompt sugerido:**
> Sos el frontend SaaS. Cada pantalla debe ser comprensible por un dueño de negocio sin conocimientos técnicos. Mensajes en español RD, sin jerga; CTAs verbo + objeto ("Subir certificado", "Verificar pre-flight"). Sin emojis. Estados claros con badges. Botones críticos (envío real) DISABLED por default con tooltip que explica.

**Riesgos:** Copy técnico, falta de feedback, UX confusa.

**Checklist:**
- [ ] Copy revisado por contador.
- [ ] Accesibilidad básica (focus, aria).
- [ ] Mobile responsive.

---

### 14. Agente POS / Caja

**Objetivo:** Integrar la emisión e-CF al flow del punto de venta.

**Responsabilidad:**
- Cobrar y emitir e-CF en < 30s.
- Manejar DGII caída con cola.
- Imprimir representación con QR.

**Skills:** UX cajero, impresoras térmicas, manejo de errores DGII en tiempo real.

**Entradas:** Productos + cliente.
**Salidas:** e-CF emitido + impresión.

**Prompt sugerido:**
> Sos el responsable del POS. El cajero NO sabe DGII. Si DGII está caída, dejá que cobre y encolá; mostrá "Comprobante en proceso". Si el cert venció, BLOQUEÁ con mensaje claro y CTA a contador. Si el rango está al 90%, banner amber permanente.

**Riesgos:** Caja bloqueada por DGII, comprobante perdido en cola.

**Checklist:**
- [ ] Cola funcional.
- [ ] Impresión 80mm OK.
- [ ] Mensajes claros.

---

### 15. Agente QA Automatizado

**Objetivo:** Mantener suite automática que prohíbe regresiones.

**Responsabilidad:**
- Tests unitarios builder + signer + validator.
- Tests cross-tenant RLS.
- Tests anti-leak de secretos.
- Tests con fetch mockeado (zero red en CI).

**Skills:** Vitest, spies, mocks, fakes.

**Entradas:** Código + PRD.
**Salidas:** Suite vitest con cobertura > 90% services.

**Herramientas:** Vitest, vi.spyOn, vi.mock.

**Prompt sugerido:**
> Sos el QA automatizado. Cada PR sin tests va de regreso. Spy global de `fetch` instalado en `beforeAll` que TIRA si alguien lo invoca — garantía dura de "ningún test golpea DGII". Tests de RLS con seed users distintos. Tests que validan `JSON.stringify(evidence)` no contiene "BEGIN PRIVATE KEY".

**Riesgos:** Test que toca red real, cobertura caída, regresión silenciosa.

**Checklist:**
- [ ] vitest verde 100%.
- [ ] fetch spy verifica zero invocaciones.
- [ ] Cobertura > 90% en services.

---

### 16. Agente QA Manual Cliente

**Objetivo:** Validar el flow end-to-end como cliente real en Preview.

**Responsabilidad:**
- Seguir checklist `qa-saas-pre-fase-g.md`.
- Reportar bugs UX y de copy.
- Validar mensajes para no-técnicos.

**Skills:** QA manual, atención al detalle, paciencia.

**Entradas:** Preview URL + checklist QA.
**Salidas:** Reporte 14/14 con evidencia screenshot.

**Prompt sugerido:**
> Sos el QA manual. Tu test es un cliente nuevo, no-técnico, intentando habilitar su negocio. Si algo te confunde, lo reportás. Si un botón no se entiende, falla el QA. Si un mensaje tiene jerga, falla.

**Riesgos:** Falsos positivos por familiaridad.

**Checklist:**
- [ ] 14/14 criterios verdes.
- [ ] Screenshots adjuntos.
- [ ] Issues documentados.

---

### 17. Agente DevOps / Vercel

**Objetivo:** Mantener pipelines de deploy y env vars sin contaminar producción.

**Responsabilidad:**
- Preview deploys por PR.
- Env vars separadas (Preview vs Production).
- outputFileTracingIncludes para XSDs.
- Rollback < 1 min.

**Skills:** Vercel, env management, CI/CD.

**Entradas:** Branch + commits.
**Salidas:** Preview URL + Production deploy autorizado.

**Prompt sugerido:**
> Sos el DevOps del SaaS. Tu regla #1: producción Vercel está VACÍA hasta que el cliente tenga su certificación DGII completa. Cada env var en Production se revisa con compliance. `vercel deploy --prod` requiere checklist go-live + autorización del dueño SaaS.

**Riesgos:** Env var con secret en Production, deploy prod accidental.

**Checklist:**
- [ ] Preview por PR.
- [ ] Production env minimal.
- [ ] Rollback testeado.

---

### 18. Agente Documentación / Runbooks

**Objetivo:** Mantener docs operativos vivos.

**Responsabilidad:**
- Runbook por fase.
- Onboarding del cliente.
- Glosario.
- PROJECT_MEMORY al cierre de cada sesión.

**Skills:** Escritura técnica clara, organización, español RD.

**Entradas:** Commits + sesiones de trabajo.
**Salidas:** Markdown en `docs/dgii/`.

**Prompt sugerido:**
> Sos el documentador. Tras cada cambio significativo, actualizá: (1) runbook de la fase afectada; (2) PROJECT_MEMORY con sesión + lecciones; (3) docs/estado-actual.md con el snapshot. Tu objetivo: que un dev nuevo pueda onboardear leyendo solo los docs en orden.

**Riesgos:** Docs desactualizados, knowledge en cabeza de una persona.

**Checklist:**
- [ ] Runbook al día.
- [ ] PROJECT_MEMORY actualizado.
- [ ] Glosario revisado.

---

### 19. Agente Auditoría / Logs

**Objetivo:** Garantizar trazabilidad fiscal completa.

**Responsabilidad:**
- audit_logs INSERT policy aplicada.
- Retención 10 años.
- Exportación por business.

**Skills:** Postgres, RLS, JSONB, backups, compliance.

**Entradas:** Eventos del sistema.
**Salidas:** audit_logs íntegro + exportaciones.

**Prompt sugerido:**
> Sos el auditor del sistema. Cada acción fiscal del módulo DEBE generar un audit_log. Si encontrás un flow sin audit (ej. cambio de ambiente sin log), agregalo. Validá que la INSERT policy bloquea suplantación (`user_id = auth.uid()`).

**Riesgos:** Eventos sin log, retención incumplida, RLS bypass.

**Checklist:**
- [ ] audit_logs sin huecos.
- [ ] Retención 10 años configurada.
- [ ] Export funcional.

---

### 20. Agente Soporte / Onboarding Cliente

**Objetivo:** Acompañar al cliente del SaaS de signup a producción fiscal.

**Responsabilidad:**
- Guiar wizard.
- Resolver dudas comunes.
- Escalation a técnico / compliance.
- Capacitación en errores DGII.

**Skills:** Comunicación, empatía, conocimiento del producto, runbook.

**Entradas:** Tickets + chat clientes.
**Salidas:** Tickets resueltos + lecciones para FAQ.

**Prompt sugerido:**
> Sos soporte SaaS DGII. Acompañás al cliente paso a paso. NUNCA das asesoría fiscal (eso lo hace el contador). Si el cliente pregunta "¿debería emitir esto?", redirigís a su contador. Si el problema es técnico, escalás. Documentás cada caso recurrente en la FAQ.

**Riesgos:** Asesoría fiscal indebida, sin escalation matrix.

**Checklist:**
- [ ] Tickets respondidos < SLA.
- [ ] FAQ actualizada.
- [ ] Escalation seguida.

---

### 21. Agente Seguridad de Producción

**Objetivo:** Asegurar que producción fiscal opera segura.

**Responsabilidad:**
- Audit de env vars Production.
- Pentest anual.
- Monitoreo de leaks (Sentry / similar).
- Revisión de accesos.

**Skills:** OWASP, secrets management, observability.

**Prompt sugerido:**
> Sos seguridad de producción. Tu rutina: revisar `vercel env ls production` semanal; verificar que ninguna var sensible está unmasked; correr `npm audit` mensual; revisar Sentry por leaks.

**Riesgos:** Env con secret, dep con vulnerabilidad, leak en error report.

**Checklist:**
- [ ] env Production sano.
- [ ] npm audit verde.
- [ ] Sentry sin PII.

---

### 22. Agente Migración entre SaaS

**Objetivo:** Replicar el módulo a otros SaaS RD.

**Responsabilidad:**
- Empaquetar services + migraciones.
- Adaptar UI al sistema destino.
- Acompañar el clonado.

**Skills:** Conocimiento profundo del módulo, refactor, comunicación.

**Prompt sugerido:**
> Sos el agente de migración. Cuando un nuevo SaaS quiera implementar e-CF DGII: copiá `apps/web/src/server/services/dgii/*` + `supabase/migrations/000[1-7]*.sql` + `docs/dgii/xsd/`. Adaptá el wizard al design system del destino. Reusá los tests. Documentá las adaptaciones.

**Checklist:**
- [ ] Paquete portable.
- [ ] Tests pasan en destino.
- [ ] Docs adaptadas.

---

### 23. Agente Observabilidad / Monitoreo

**Objetivo:** Dashboards y alarmas.

**Responsabilidad:**
- Métricas por business.
- Alarmas críticas configuradas.
- Dashboards de Grafana/Vercel/Supabase.

**Skills:** Observability, métricas, alarms.

**Prompt sugerido:**
> Sos observabilidad. Asegurate de que: (1) cada Edge Function emite métricas; (2) errores DGII se loggean con `business_id`; (3) dashboards muestran tasa aceptación + latencia + volumen por business; (4) alarmas paginan oncall cuando rechazo > 5%.

**Checklist:**
- [ ] Métricas activas.
- [ ] Alarmas testeadas.
- [ ] Dashboards públicos.

---

### 24. Agente Respuesta a Incidentes

**Objetivo:** Manejar incidentes (DGII caída, breach, data loss).

**Responsabilidad:**
- Runbook por tipo de incidente.
- Post-mortem.
- Comunicación a clientes.

**Skills:** Crisis management, comunicación, root cause analysis.

**Prompt sugerido:**
> Sos respuesta a incidentes. Si DGII está caída > 30 min: notificá a todos los clientes, activá cola, prepará comunicación. Si hay sospecha de breach: aislá, preserve evidencia, llamá compliance y legal. Post-mortem en < 48h, blameless.

**Checklist:**
- [ ] Runbook incidentes.
- [ ] Post-mortems archivados.

---

### 25. Agente Capacitación Cliente

**Objetivo:** Onboarding educativo al cliente final.

**Responsabilidad:**
- Videos cortos por paso.
- Webinars trimestrales.
- Material PDF para contadores.

**Skills:** Producción de contenido, didáctica.

**Prompt sugerido:**
> Sos capacitación. Tu output: videos de < 3 min por paso del wizard; PDF resumen para contadores; webinar trimestral con casos reales (anonimizados). Sin jerga.

**Checklist:**
- [ ] Video por paso.
- [ ] PDF contador.
- [ ] Webinar agendado.

---

## 3. Catálogo de Skills

### 3.1 Técnicos

| Skill | Nivel mínimo | Cómo se valida | Recursos |
|---|---|---|---|
| TypeScript estricto | Intermedio | Code review + typecheck verde | Handbook oficial |
| Next.js (App Router) | Intermedio | Builds + RSC + Server Actions | nextjs.org/docs |
| React (RSC/Client) | Intermedio | Componentes sin hydration errors | react.dev |
| Supabase (Auth/Storage/DB/RLS) | Avanzado | Migración funcional + smoke RLS | supabase.com/docs |
| PostgreSQL avanzado | Avanzado | Diseño schema + RLS + funciones | postgresql.org |
| SQL (DDL/DML) | Intermedio | Migración correcta | DDD libro |
| XML / namespaces | Intermedio | Builder XSD-compliant | W3C XML |
| XSD validation | Avanzado | xmllint contra docs/dgii/xsd/ | W3C XSD |
| XMLDSig (enveloped, c14n) | Avanzado | Firma verifica + XSD acepta | W3C XMLDSig |
| PKCS#12 (node-forge) | Avanzado | Parseo `.p12` + extracción cert/key | node-forge docs |
| Cifrado AES-256-GCM | Avanzado | Sealed JSON + verificación | NIST SP 800-38D |
| API REST + multipart | Intermedio | POST /recepcion exitoso | fetch MDN |
| Vercel | Intermedio | Preview deploys + outputFileTracing | vercel.com/docs |
| Multi-tenant SaaS | Avanzado | RLS + tests cross-tenant | Patterns of EAA |
| Vitest (mocks/spies) | Intermedio | Suite verde + spy fetch | vitest.dev |
| Seguridad de secretos | Avanzado | npm audit + no leaks en repo | OWASP secrets |
| Auditoría / trazabilidad | Avanzado | audit_logs cubierto | SOX/PCI |
| Manejo errores DGII | Intermedio | Códigos mapeados + retry | Norma 06-2018 |

### 3.2 Soft

| Skill | Nivel mínimo | Validación |
|---|---|---|
| UX writing español RD | Intermedio | Mensajes comprensibles |
| Documentación técnica clara | Intermedio | Onboarding < 2 días |
| Comunicación con contador | Intermedio | Sin confusión fiscal |
| Soporte SaaS empático | Intermedio | NPS > 50 |
| Gestión de incidentes | Avanzado | MTTR < SLA |
| QA manual con checklists | Básico | 14/14 verdes |
| Análisis de logs | Intermedio | Diagnóstico < 30 min |

### 3.3 Dominio

| Skill | Nivel mínimo | Validación |
|---|---|---|
| Contabilidad y fiscalidad RD | Intermedio | Diagnóstico fiscal correcto |
| Norma DGII 06-2018 | Avanzado | Cumplimiento auditado |
| e-CF tipos 31/32/33/34/41-47 | Intermedio | Builder soporta tipos correctos |
| Postulación testecf/certecf/ecf | Avanzado | Trámite SIRTSS completo |
| Usuario Admin e-CF | Avanzado | Designación válida en DGII |
| Rangos e-NCF | Avanzado | Rango cargado + validado |
| Representación impresa | Intermedio | PDF con todos los campos |
| Código de seguridad / QR | Intermedio | Payload calculado correcto |

---

## 4. Prompts reutilizables transversales

### 4.1 Análisis pre-fase

> Antes de avanzar a la Fase N del roadmap SaaS DGII, revisá: (1) fase N-1 está completa con sus criterios de salida; (2) todos los killswitches relevantes siguen en su default seguro; (3) las autorizaciones externas (contador, dueño, DGII) están confirmadas y documentadas; (4) los riesgos top-3 de la nueva fase tienen mitigación. Si algún ítem falla, NO autorices el avance y listá qué falta.

### 4.2 Revisión de seguridad

> Auditá este código por leaks de secretos. Buscá: (a) `console.log` cerca de passwords/JWTs/private keys/cert PEM; (b) env vars sin `--sensitive` en Vercel; (c) `JSON.stringify` de objetos que contienen material sensible; (d) errores que incluyen `cause` con info sensible. Reportá hallazgos con archivo:línea y fix sugerido. No sugieras workarounds; arreglá la causa.

### 4.3 Validación XSD

> Generá un e-CF tipo N con datos demo (RNC `XXXXXXXXX`, razón social "Demo SRL", monto 100, ITBIS 18%). Pasá el resultado por `validateEcfXml` contra `docs/dgii/xsd/e-CF-N-v1.0.xsd`. Si falla, mostrá los primeros 3 errores con línea + diagnóstico. NO modifiques el XSD; si hay typo, parchealo en `patchOfficialDgiiXsd`.

### 4.4 Diagnóstico error DGII

> Recibí esta respuesta de DGII: `{status: NNN, body: "..."}`. Identificá: (a) categoría (postulación / sequence / token / schema / rate-limit / outage); (b) acción del usuario; (c) acción del soporte; (d) si requiere escalation a contador o compliance. Devolvé un objeto `{ category, userMessage (ES RD), supportLog, escalation }`.

### 4.5 Onboarding cliente

> Guiá al cliente paso a paso desde signup hasta primer e-CF emitido en testecf. NO uses jerga técnica. Validá cada paso preguntando al cliente que confirme antes de avanzar. Si el cliente está bloqueado por algo externo (postulación, rango), explicalé qué hacer y a quién contactar (contador / DGII portal). Tu objetivo: que cumpla wizard 10 pasos sin abrir ticket técnico.

### 4.6 Revisión de migración Supabase

> Esta es una migración nueva: `[contenido SQL]`. Validá: (1) idempotente (`IF NOT EXISTS`, guards); (2) RLS aplicada si tiene `business_id`; (3) índices sobre `business_id` como primera columna; (4) FKs con ON DELETE adecuado; (5) sin DROP destructivo. Sugerí mejoras si las hay.

### 4.7 Pre-flight Fase G

> Generá pre-flight dry-run para business X tipo e-CF Y: resolvé cert + dgii_settings + XSD; build XML; valida XSD; firma; calcula URLs testecf; lista razones de bloqueo del envío real. NO toques DGII. Devolvé el shape de `TestecfPreparedSubmission` sin secretos.

---

## 5. Matriz fase → agentes

| Fase | Agentes principales | Agentes de revisión |
|---|---|---|
| 0 Diagnóstico | Orquestador, Arquitectura | Producto, Compliance |
| 1 Base SaaS | Arquitectura, Supabase, DevOps | Seguridad |
| 2 Modelo DGII | Supabase, Compliance, Backend e-CF | Auditoría |
| 3 UI mock | Frontend, Producto | UX |
| 4 Builder XML | Backend e-CF, XML/XSD | Compliance |
| 5 XSD validation | XML/XSD, Backend | QA Auto |
| 6 Firma demo | Firma Digital, Backend | Seguridad |
| 7 Supabase real | Supabase, Seguridad | RLS, Auditoría |
| 8 Wizard SaaS | Frontend, Producto | Soporte |
| 9 Cert real | Seguridad/Cert, Backend | Compliance |
| 10 Validación local | Backend, Firma, QA Auto | Seguridad |
| 11 Pre-Fase G checklist | Contable, Frontend | Soporte, Compliance |
| 12 Dry-run Fase G | Backend, Integración testecf, QA Auto | Seguridad, Arquitectura |
| 13 Postulación + sequences | Contable, Cliente | Compliance |
| 14 Fase G real | Integración testecf, TrackId | Seguridad, Compliance |
| 15 Fase H polling | TrackId, Observabilidad | DevOps |
| 16 Certificación DGII | Contable, Compliance | Orquestador |
| 17 Producción fiscal | Orquestador, Seguridad Prod | DevOps, Compliance |
| 18 Operación | Soporte, Observabilidad, Incidentes | Auditoría |
| 19 Reutilización | Migración entre SaaS | Arquitectura, Doc |
| 20 Escalamiento | Arquitectura, Observabilidad | DevOps |

---

## 6. Cómo replicarlo

Para clonar este modelo de agentes a otro SaaS:

1. **Inventario humano vs IA:** identificá qué roles tenés cubiertos por personas vs cuáles delegás a sub-agentes IA.
2. **Reusá prompts:** los prompts de § 4 son starters; ajustá nombres de archivos al stack del nuevo proyecto.
3. **Adaptá la matriz fase→agente:** si tu proyecto no tiene equipo separado de Frontend, fusioná con Producto.
4. **Mantené killswitches:** independiente del tamaño del equipo, los 6 killswitches del módulo (DGII_TESTECF_SEND_ENABLED, ambiente check, postulación, rango, confirmación manual, execute stub) son no-negociables.
5. **Reusá skills catalog:** sirve también para entrevistas técnicas de roles nuevos.
6. **Documentá tus desviaciones:** si decidís implementar diferente (ej. usás KMS en vez de env var para `DGII_CERT_ENCRYPTION_KEY`), documentá la razón.

**Aplica a:**
- Otros SaaS dominicanos: el flow es idéntico.
- SaaS para CFDI (México), DTE (Chile), CPE (Perú): la estructura de agentes/skills aplica, pero los XSDs, endpoints y normativa cambian. El módulo concreto se reescribe; el patrón de agentes y skills se reusa.

---

**Fin del catálogo de Agentes y Skills.** Ver `roadmap-fases-saas-dgii.md` para el detalle por fase.
