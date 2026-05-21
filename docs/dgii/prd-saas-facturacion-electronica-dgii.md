# PRD — SaaS de Facturación Electrónica DGII para República Dominicana

> **Versión:** 1.0 · **Fecha:** 2026-05-21
> **Estado:** PRD profesional, base para implementación
> **Audiencia:** Producto, ingeniería, contador/asesor fiscal, dueño SaaS, soporte, auditor

---

## 1. Nombre del producto

**SaaS DGII e-CF para RD** — módulo reusable de facturación electrónica que cualquier SaaS dominicano puede integrar para que sus clientes emitan e-CFs con cumplimiento DGII.

**Primera instancia de referencia:** DermaLand (SaaS farmacia/dermocosmética).

---

## 2. Problema

Los SaaS RD que necesitan ofrecer facturación electrónica a sus clientes enfrentan tres problemas simultáneos:

- **Técnico:** XMLDSig, XSD oficial, criptografía PKCS#12, integración HTTP con DGII — todas piezas con potencial de fallo silencioso.
- **Fiscal:** Norma DGII 06-2018, postulación, Usuario Administrador e-CF, rangos e-NCF, ambientes — requieren coordinación con contador y DGII.
- **Operativo:** onboarding del cliente final no-técnico, soporte, conservación 10 años, manejo de errores DGII.

Implementar esto desde cero por proyecto duplica esfuerzo y multiplica riesgo de errores que comprometen cumplimiento fiscal.

---

## 3. Oportunidad

Un módulo reusable bien encapsulado permite:

- Integrar e-CF en un SaaS RD en semanas (no meses).
- Onboarding asistido del cliente sin requerir equipo técnico dedicado.
- Compliance fiscal por diseño con killswitches en capas.
- Auditoría completa con retención 10 años.
- Costos compartidos en mantenimiento de XSDs, normativa, endpoints DGII.

---

## 4. Usuarios objetivo

### 4.1 Dueño del negocio

Responsable del cumplimiento fiscal del contribuyente. No es técnico. Necesita: confianza en que el sistema "no me va a meter en lío con DGII", reportes claros, facilidad para delegar al contador.

### 4.2 Contador / asesor fiscal

Validación fiscal de cada etapa: postulación, designación Usuario Administrador e-CF, configuración de tasas ITBIS, rangos e-NCF. Necesita: visibilidad de la configuración fiscal, exportación de evidencias, capacidad de auditar audit_logs.

### 4.3 Administrador e-CF

Persona física designada formalmente ante DGII para firmar e-CFs. Coincide con el titular del certificado. Necesita: claridad sobre qué se firma con su nombre, capacidad de revocar el cert si pierde la designación.

### 4.4 Cajero

Emite comprobantes desde el POS. No le interesa el detalle DGII. Necesita: emisión rápida, mensajes claros si falla, fallback simple cuando DGII está caída.

### 4.5 Soporte SaaS

Acompaña al cliente durante onboarding y operación. Necesita: acceso de solo-lectura a logs por business, runbook claro, escalation matrix.

### 4.6 Equipo técnico SaaS

Mantenimiento del módulo. Necesita: tests automatizados, documentación, ambientes claros, deploy preview, rollback simple.

### 4.7 Auditor

Verifica cumplimiento fiscal post-hoc. Necesita: acceso completo a audit_logs por business (solo-lectura), exportación inmutable, conservación 10 años.

---

## 5. Jobs to be done

### Por dueño del negocio
1. *"Cuando llegue mi fecha de obligatoriedad DGII, quiero estar emitiendo e-CFs sin haber tocado código."*
2. *"Cuando un cliente me pida una factura, quiero darle un e-CF válido en menos de 30 segundos."*
3. *"Cuando DGII haga una fiscalización, quiero entregar toda la evidencia exportada en una hora."*

### Por contador
1. *"Cuando el dueño me consulte sobre configuración fiscal, quiero ver y validar todo desde una pantalla."*
2. *"Cuando un e-CF sea rechazado por DGII, quiero ver el mensaje exacto de DGII para diagnosticar."*
3. *"Cuando llegue auditoría, quiero exportar todos los XMLs firmados + respuestas DGII del período."*

### Por administrador e-CF
1. *"Cuando se firme un e-CF con mi cert, quiero que quede registro auditable de a qué hora y por qué."*
2. *"Cuando pierda la designación, quiero revocar mi cert con un click."*

### Por cajero
1. *"Cuando emita un comprobante, quiero el ticket impreso con el QR DGII listo."*
2. *"Cuando DGII esté caída, quiero seguir cobrando y que el sistema se encargue después."*

### Por soporte
1. *"Cuando un cliente me llame con un error, quiero ver inmediatamente la última transacción y el error DGII."*

---

## 6. Objetivos de producto

| Objetivo | Métrica | Target |
|---|---|---|
| OP-01 | Tiempo desde signup hasta primer e-CF emitido (sin asistencia técnica) | < 7 días p50 |
| OP-02 | % de clientes que completan habilitación sin abrir ticket | > 60% |
| OP-03 | % de e-CFs aceptados por DGII en primer intento | > 95% |
| OP-04 | Tiempo medio para resolver rechazo DGII | < 4h |
| OP-05 | NPS post-onboarding | > 50 |

---

## 7. Objetivos técnicos

| Objetivo | Métrica | Target |
|---|---|---|
| OT-01 | Disponibilidad del módulo | > 99.5% |
| OT-02 | Latencia p95 del flow `submit` (sin contar DGII) | < 500ms |
| OT-03 | Cobertura tests builder + signer + validator | > 90% |
| OT-04 | Zero data leak cross-tenant en pruebas | 100% |
| OT-05 | Zero secrets en logs / commits / PRs | 100% |

---

## 8. Objetivos fiscales

| Objetivo | Métrica | Target |
|---|---|---|
| OF-01 | Cumplimiento Norma 06-2018 | Auditoría externa anual OK |
| OF-02 | Separación testecf / certecf / ecf | Sin contaminación cruzada |
| OF-03 | Sin emisión fiscal accidental | Cero incidentes |
| OF-04 | Conservación evidencias 10 años | Auditable per business |
| OF-05 | RNC emisor coincide con cert al 100% | Verificación pre-envío |

---

## 9. Métricas de éxito

**North Star:** % de contribuyentes clientes del SaaS que están emitiendo e-CFs en producción fiscal con tasa de aceptación > 95%, sin haber escalado a soporte técnico nivel 2 durante el último mes.

**Secundarias:**
- Time-to-first-e-CF (signup → primer envío aceptado en testecf).
- Time-to-production-fiscal (signup → ambiente=`ecf`).
- MTTR para DGII outage (detección → mitigación).
- % de e-CFs aceptados en primer intento.
- Tickets de soporte por cliente / mes.

---

## 10. Casos de uso

### CU-01 — Cliente nuevo configura su negocio
**Actor:** Dueño del negocio. **Precondición:** signup completado. **Flujo:** entra a `/dgii/habilitacion` → wizard paso 1 → captura RNC, razón social, ambiente=testecf → guarda config → status pasa de `not_started` a `in_preparation`. **Postcondición:** `dgii_settings` poblada para el business.

### CU-02 — Subida de certificado real
**Actor:** Administrador e-CF. **Precondición:** business con config fiscal completa; tiene `.p12` y password. **Flujo:** `/dgii/certificado` → drag&drop `.p12` + password → backend valida + cifra + persiste → metadata visible. **Postcondición:** `dgii_certificates.is_active=true`, audit log `dgii_certificate_upload`.

### CU-03 — Prueba local del certificado
**Actor:** Admin e-CF. **Precondición:** cert activo. **Flujo:** click "Ejecutar prueba local" → backend descifra → build XML demo → firma → verifica → valida XSD oficial → genera QR demo → devuelve evidencia. **Postcondición:** evidencia persistida; usuario ve 8 steps verdes.

### CU-04 — Pre-flight Fase G dry-run
**Actor:** Dueño / Admin e-CF. **Precondición:** cert activo + config fiscal. **Flujo:** click "Verificar pre-flight" en `/dgii/habilitacion` → POST `/api/dgii/invoices/testecf-send {tipoEcf:31}` → backend prepara payload + URLs + razones de bloqueo → UI muestra resultado. **Postcondición:** ninguna llamada DGII; bloqueos visibles.

### CU-05 — Completar autorización del representante
**Actor:** Dueño + contador. **Precondición:** paso 7 wizard avanzado. **Flujo:** abrir paso 8 → confirmar 9 ítems (titular, cédula, RNC, relación, designación, entidad cert, vigencia, CRL, acta) con responsable + fecha + ref documental + nota → aceptar declaración formal. **Postcondición:** `representative_attestations` con 9 filas; declaración aceptada; gate `ready_for_testecf` desbloqueado.

### CU-06 — Envío real a testecf (Fase G)
**Actor:** Sistema (gated por dueño). **Precondición:** postulación + rango + cert + config + 9 ítems + declaración + `DGII_TESTECF_SEND_ENABLED=true`. **Flujo:** POST `/api/dgii/invoices/[id]/send {live:true,...}` → backend: Semilla → ValidarSemilla → multipart submit → recibe TrackId → persiste `dgii_submissions` + audit log. **Postcondición:** `electronic_invoices.track_id` poblado; status=`submitted`.

### CU-07 — Consulta de status (Fase H)
**Actor:** Cron + cliente. **Precondición:** `electronic_invoices.status IN ('submitted','in_process')`. **Flujo:** Edge Function corre cada N min → GET `/consultatrackid/api/TrackIds/Estado` → mapea respuesta DGII → actualiza status → INSERT `dgii_status_logs`. **Postcondición:** status actualizado a `accepted`/`accepted_conditional`/`rejected`.

### CU-08 — DGII rechaza un e-CF
**Actor:** Backend + soporte + cliente. **Precondición:** envío realizado, DGII responde `rejected`. **Flujo:** status=`rejected`, mensaje DGII guardado, alarma a soporte. UI muestra al cliente el mensaje exacto + sugerencias. **Postcondición:** cliente entiende qué falla y puede corregir (re-emitir tras fix).

### CU-09 — DGII caída
**Actor:** Backend. **Precondición:** DGII responde 5xx o timeout > 3 consecutivos. **Flujo:** sistema marca DGII en estado "caída", encola envíos pendientes, UI muestra banner, alarma DevOps. Al volver DGII, queue drena automáticamente. **Postcondición:** sin pérdida de envíos; trazabilidad completa.

### CU-10 — Auditoría externa solicita evidencia
**Actor:** Auditor + dueño. **Precondición:** business con histórico. **Flujo:** `/admin/auditoria/export?from=&to=` → CSV/JSON con audit_logs + XMLs firmados + respuestas DGII → entregado al auditor. **Postcondición:** evidencia exportada inmutable.

---

## 11. User stories

- **US-01:** Como dueño, quiero un wizard guiado para no equivocarme con DGII.
- **US-02:** Como dueño, quiero ver el estado global ("Listo para testecf") para saber dónde estoy.
- **US-03:** Como contador, quiero ver qué configuración fiscal está activa para validarla.
- **US-04:** Como contador, quiero recibir el XML + respuesta DGII de cada e-CF para mi archivo.
- **US-05:** Como admin e-CF, quiero subir mi `.p12` sin que mi password quede en logs.
- **US-06:** Como admin e-CF, quiero ver una prueba local antes de tocar DGII.
- **US-07:** Como cajero, quiero emitir un comprobante en < 30 segundos.
- **US-08:** Como cajero, quiero un mensaje claro si DGII rechaza, sin jerga técnica.
- **US-09:** Como soporte, quiero ver todos los envíos recientes de un cliente filtrados.
- **US-10:** Como soporte, quiero un runbook que cubra los 10 errores más comunes.
- **US-11:** Como dueño, quiero estar seguro de que ningún otro cliente del SaaS ve mis datos.
- **US-12:** Como técnico, quiero tests automatizados que validen RLS cross-tenant.
- **US-13:** Como técnico, quiero killswitches que bloqueen envío real sin autorización.
- **US-14:** Como auditor, quiero acceso de solo-lectura a audit_logs por business.
- **US-15:** Como dueño, quiero alertas si mi certificado vence en < 30 días.
- **US-16:** Como dueño, quiero alertas si mi rango e-NCF está cerca de agotarse.
- **US-17:** Como dueño, quiero un botón "Enviar pruebas a DGII testecf" deshabilitado hasta que esté listo.
- **US-18:** Como contador, quiero ver el RNC del cert y el RNC del emisor para confirmar que coinciden.
- **US-19:** Como técnico, quiero deploy preview sin tocar producción.
- **US-20:** Como dueño, quiero exportar mi histórico cuando deje de usar el SaaS.

---

## 12. Requisitos funcionales

| # | Requisito | Criterio de aceptación |
|---|---|---|
| RF-01 | Wizard /dgii/habilitacion con 10 pasos | Carga con 3 banners + 10 cards en orden |
| RF-02 | Subida cert .p12 cifrada server-side | Blob persistido cifrado AES-256-GCM en Storage |
| RF-03 | Prueba local del cert con 8 steps | Todos los steps son verificables; resultado json |
| RF-04 | Validación XSD oficial e-CF 31/32/33/34 | XSDs en `docs/dgii/xsd/`; validateEcfXml retorna valid:true para XML correcto |
| RF-05 | Firma XMLDSig enveloped RSA-SHA256 | Firma verificable con clave pública; Reference URI vacío |
| RF-06 | Form de evidencia paso 8 (9 ítems) | Cada ítem persiste status + responsable + fecha + ref + nota |
| RF-07 | Declaración formal del responsable | Checkbox + timestamp; bloquea ready_for_testecf si no aceptado |
| RF-08 | Panel "Pendiente antes de enviar a DGII testecf" | Lista gaps dinámicos; badge listo cuando todos verdes |
| RF-09 | CTA "Enviar pruebas a DGII testecf" disabled | Disabled en este wizard; tooltip explica |
| RF-10 | Pre-flight dry-run sin tocar DGII | UI muestra URLs + XSD + firma + bloqueos |
| RF-11 | Envío real testecf (Fase G) | Auth flow + recepción multipart + TrackId guardado |
| RF-12 | Consulta TrackId (Fase H) | Cron polling con rate limit; status actualizado |
| RF-13 | Aislamiento por business_id (RLS) | Tests cross-tenant fallan al insertar/leer ajeno |
| RF-14 | Auditoría INSERT con own user_id | RLS bloquea suplantación |
| RF-15 | Reportes fiscales por período | Filtro fecha + tipo + status; CSV exportable |
| RF-16 | Listado de e-CFs emitidos | Paginado, búsqueda por eNCF / cliente |
| RF-17 | Permisos por rol DGII | dgii:configure / cert:upload / sequences:manage / invoices:* asignables |
| RF-18 | Killswitch DGII_TESTECF_SEND_ENABLED | env flag default false |
| RF-19 | Rate limit interno | máx 60 envíos/min por business |
| RF-20 | Notas de crédito (e-CF 34) | Form que referencia comprobante origen + razón |
| RF-21 | PDF de representación impresa con QR | Template con todos los campos requeridos + advertencia NO FISCAL en demo |
| RF-22 | Manejo errores DGII transparente | Mensaje exacto DGII mostrado al usuario |
| RF-23 | Cola pending_retry | Reintentos automáticos con backoff |
| RF-24 | Alerta cert vencimiento | 60/30/7 días antes |
| RF-25 | Alerta secuencia agotada | < 100 disponibles |
| RF-26 | Exportación auditoría | CSV/JSON por período |
| RF-27 | Roles support read-only | Solo SELECT en audit_logs y submissions |
| RF-28 | Cambio de ambiente requiere autorización | Confirmación + audit log |
| RF-29 | Backup automático Supabase | Diario + retención 10 años |
| RF-30 | Rollback documentado por fase | Procedimiento testeable |

---

## 13. Requisitos no funcionales

- **Performance:** p95 pre-flight < 500ms; p95 send (sin DGII) < 1s; consulta status < 300ms.
- **Disponibilidad:** 99.5% mensual del módulo (excluye outages DGII).
- **Seguridad:** OWASP Top 10 cubierto; auditoría externa anual.
- **Escalabilidad:** 10,000 e-CFs/día por business; 1,000 businesses concurrentes.
- **Mantenibilidad:** typecheck verde; tests > 90% cobertura services puros.
- **Observabilidad:** logs estructurados; métricas por business; dashboards.
- **Compatibilidad:** Chrome, Firefox, Edge, Safari últimas 2 versiones; mobile responsive.
- **Idioma:** español RD por default; código en inglés (variables, funciones).

---

## 14. Requisitos legales / fiscales

- **DGII Norma 06-2018** y actualizaciones vigentes.
- **Postulación oficial** del contribuyente en testecf → certecf → ecf.
- **Usuario Administrador e-CF** designado en SIRTSS DGII.
- **Vigencia del cert** > 60 días para emitir; renovación documentada.
- **Conservación legal** mínima 10 años de XMLs firmados, respuestas DGII, TrackIds, status logs.
- **Inmutabilidad** de los datos de cada e-CF emitido (no editable post-envío).
- **Trazabilidad** completa desde proforma/factura origen → XML → firma → envío → respuesta.

---

## 15. Requisitos de seguridad

- **Cifrado at-rest:** Supabase encrypted storage + AES-256-GCM para blobs sensibles (.p12, password).
- **Cifrado in-transit:** HTTPS obligatorio; HSTS habilitado.
- **RLS:** todas las tablas con `business_id` tienen RLS enable + policy `business_id = auth_business_id()`.
- **Mínimo privilegio:** roles del SaaS con permisos limitados; `service_role` solo para Edge Functions.
- **Secrets management:** env vars sensibles `--sensitive` en Vercel; rotación documentada.
- **OWASP Top 10:** input validation, output encoding, auth/session, CSRF tokens, secure cookies.
- **Pentest:** anual con tester externo.
- **Vulnerabilidad dependencias:** `npm audit` automático en CI; parches dentro de SLA.

---

## 16. Requisitos de auditoría

**Eventos auditables (mínimo):**
- Auth events: login, logout, password change, MFA enable/disable.
- DGII config: cert upload/revoke, settings update, sequence load.
- e-CF lifecycle: generate, sign, send, status check, accept, reject.
- Pre-Fase G: representative_attestation save, declaration accept/revoke.
- Ambiente: switch testecf → certecf → ecf (requiere autorización extra).
- Admin: rol change, permiso assign, business suspend.

**Cada audit_log tiene:** `business_id` (RLS), `user_id` (o NULL system), `user_name`, `action`, `entity`, `entity_id`, `metadata jsonb`, `ip_address`, `created_at`.

**Retención:** 10+ años. Backup inmutable mensual.

**Acceso:** `support` solo lectura; `auditor` lectura + exportación; `admin` ídem.

---

## 17. Requisitos multi-tenant

- **business_id NOT NULL** en todas las tablas del módulo (excepto root `businesses` y globales).
- **RLS por business_id** en todas las tablas — sin excepciones.
- **JWT claims** llevan `business_id`, `role`, `branch_id` para resolver tenant context.
- **Helper auth_business_id()** lee claim en orden: root → app_metadata → user_metadata.
- **Storage por business:** paths siempre prefijo `<business_id>/`.
- **Tests cross-tenant:** smoke con 2 seed users; ninguno ve datos del otro.
- **Billing separado** por business; sin agregaciones cross-tenant en UI.
- **Suspension:** business `status='suspended'` bloquea emisión real DGII pero conserva datos.

---

## 18. Flujos UX

### 18.1 Onboarding
```
Signup → Bienvenida → /dgii (overview) → /dgii/habilitacion (wizard)
        → paso 1 cert → paso 2 config → ... → paso 10 estado final
```

### 18.2 Emisión e-CF (cajero)
```
/pos → seleccionar productos → cliente → /caja/cierre → confirmar
     → emitir e-CF → /dgii/facturas/[id] (status submitted)
     → cron actualiza status → cliente recibe PDF + QR
```

### 18.3 Aprobación comercial (recibido)
```
/dgii/recibidos → ver e-CF de tercero → verificar firma → aceptar / rechazar
                → enviar respuesta firmada al emisor
```

### 18.4 Soporte
```
Cliente reporta → soporte abre /admin/auditoria filtrado por business
              → ve último envío, error DGII, audit log
              → consulta runbook → guía al cliente o escala
```

---

## 19. Estados del proceso

Cada business tiene un estado global computado dinámicamente:

| Estado | Condiciones de entrada | Condiciones de salida | Acciones permitidas |
|---|---|---|---|
| **No iniciado** | business creado, sin nada configurado | cualquier paso del wizard avanza | Configurar pasos 1-9 |
| **En preparación** | algún paso comenzado, no todos completos | todos los pasos clave completed | Continuar wizard |
| **Certificado cargado** | cert activo válido, config fiscal incompleta | config fiscal completed | Completar config |
| **Pendiente configuración fiscal** | cert activo, sin RNC/razón en settings | RNC + razón guardados | Completar config |
| **Pendiente postulación** | técnicamente listo, sin postulación DGII confirmada | postulación confirmada por contador | Gestionar trámite externo |
| **Pendiente secuencias** | postulación OK, sin rangos cargados | rango cargado por tipo | Cargar `/dgii/secuencias` |
| **Listo para testecf** | cert+config+representante+postulación+rango | enviar primer e-CF a testecf | Habilitar `DGII_TESTECF_SEND_ENABLED` |
| **Enviado a testecf** | al menos 1 envío con TrackId | DGII responde aceptado/rechazado | Esperar status |
| **Aprobado testecf** | tasa aceptación > X% en período | solicitar transición a certecf | Iniciar certificación |
| **Rechazado testecf** | rechazos sin resolver | resolver y reenviar | Diagnosticar errores |
| **En certificación** | DGII certifica formalmente | DGII emite acta de certificación | Esperar resolución DGII |
| **Certificado por DGII** | acta recibida | activar producción fiscal | Cambiar ambiente=ecf |
| **Listo para producción fiscal** | acta + checklist § 26 cumplido | autorización dueño + admin + contador | Activar |
| **Producción fiscal activa** | ambiente=ecf + dgii_enabled_real_send=true | suspensión o cancelación | Operación normal |

---

## 20. Requisitos por pantalla

### 20.1 `/dgii` (overview)
- **Propósito:** dashboard DGII del business.
- **Datos:** estado global, próximo paso, métricas (#e-CFs hoy/mes, % aceptados, cert vence en X días).
- **Acciones:** ir al wizard, ir a facturas, ir a configuración.
- **Gates:** rol ≥ cashier para ver; ≥ admin para acciones de config.
- **Errores:** sin DGII configurado → CTA "Empezar habilitación".

### 20.2 `/dgii/habilitacion`
- **Propósito:** wizard SaaS 10 pasos.
- **Datos:** 3 banners (MOCK / SaaS isolation / Pendiente testecf), panel global estado, 10 cards de paso, panel pre-flight runner.
- **Acciones:** click expandir paso, marcar items, completar evidencia, ejecutar pre-flight dry-run.
- **Gates:** auth seed user; rol admin para cambios.
- **Errores:** cert no cargado → paso 1 amber; XSD no encontrado → toast.

### 20.3 `/dgii/certificado`
- **Propósito:** lifecycle del cert.
- **Datos:** estado actual (sin cert / cargado / válido / vencido / inválido), metadata pública (subject, issuer, vigencia, fingerprint).
- **Acciones:** subir `.p12` + password, ejecutar prueba local, revocar.
- **Gates:** rol con `dgii:certificate:upload`.
- **Errores:** password incorrecta → mensaje "Verificá la password del cert (no la imprimimos)"; cert vencido → bloqueo.

### 20.4 `/dgii/configuracion`
- **Propósito:** capturar `dgii_settings` del business.
- **Datos:** form con RNC, razón social, nombre comercial, dirección, provincia/municipio (selectores DGII), correo, teléfono, ambiente.
- **Acciones:** guardar, cambiar ambiente (con confirmación).
- **Gates:** rol con `dgii:configure`.
- **Errores:** RNC inválido (no 9/11 dígitos) → inline; cambio a `ecf` requiere autorización extra.

### 20.5 `/dgii/secuencias`
- **Propósito:** cargar rangos e-NCF por tipo + ambiente.
- **Datos:** tabla con tipo, ambiente, range_start, range_end, next_number, status, expires_at.
- **Acciones:** agregar rango, editar, marcar exhausted.
- **Gates:** rol con `dgii:sequences:manage`.
- **Errores:** range_start > range_end → inline; overlap con rango existente → bloqueo.

### 20.6 `/dgii/certificacion`
- **Propósito:** panel de pre-certificación mock para los 4 tipos.
- **Datos:** botón por tipo (31/32/33/34) + última corrida + evidencia.
- **Acciones:** ejecutar prueba por tipo.
- **Gates:** rol con `dgii:certification:run_tests`.
- **Errores:** XSD rechazo → mostrar primeros 3 errores con línea.

### 20.7 `/dgii/reportes`
- **Propósito:** reportes fiscales.
- **Datos:** filtros (período, tipo, status), totales (#emitidos, total ITBIS, total montos).
- **Acciones:** exportar CSV.
- **Gates:** rol con `dgii:reports:view`.

### 20.8 `/dgii/facturas`
- **Propósito:** listado y detalle de e-CFs.
- **Datos:** lista paginada con eNCF, fecha, cliente, monto, status, ambiente. Detalle: XML, respuesta DGII, TrackId, status_logs.
- **Acciones:** ver detalle, descargar XML/PDF, crear NC.
- **Gates:** rol con visualización.

### 20.9 `/admin/permisos`
- **Propósito:** catálogo y asignación de permisos.
- **Datos:** lista de permisos DGII + asignación por rol.
- **Acciones:** asignar/quitar permiso a rol.
- **Gates:** rol admin.

### 20.10 `/pos`
- **Propósito:** punto de venta.
- **Datos:** productos, carrito, cliente.
- **Acciones:** emitir comprobante (que invoca el flow e-CF si DGII enabled).
- **Errores:** cert vencido en mid-venta → mensaje guiado.

### 20.11 `/caja/cierre`
- **Propósito:** cierre de caja diario.
- **Datos:** ventas del día agrupadas.
- **Acciones:** confirmar cierre.
- **Errores:** envíos DGII pendientes → mostrar antes de cerrar.

---

## 21. Criterios de aceptación por pantalla

Cada pantalla del § 20 debe pasar:
- ✅ Carga < 1s p95 sin DGII en el path.
- ✅ Mobile responsive.
- ✅ Sin errores en consola (production build).
- ✅ Tests unitarios para lógica + integration para flows clave.
- ✅ Mensajes en español RD claros para usuario no-técnico.
- ✅ Logs estructurados server-side; sin secretos.

---

## 22. Criterios de aceptación por fase

Cada estado del § 19 debe cumplir su transición sin atajos:
- ✅ Condiciones de entrada documentadas en evaluator.
- ✅ Tests automatizados para cada transición.
- ✅ UI refleja el estado en < 1s tras cambio.
- ✅ Audit log de la transición.

---

## 23. Casos de error

| Código | Caso | Mensaje usuario final | Acción soporte |
|---|---|---|---|
| ERR-CERT-01 | Password cert incorrecta | "La contraseña del certificado es incorrecta. Probá de nuevo." | Cliente verifica con quien le entregó el cert |
| ERR-CERT-02 | Cert vencido | "Tu certificado venció el DD-MM-YYYY. Renová con tu CA emisora." | Soporte ayuda con CA |
| ERR-CERT-03 | Cert RNC ≠ business RNC | "El RNC del certificado no coincide con tu RNC registrado." | Contador valida designación |
| ERR-XSD-01 | XML rechazado por XSD | "El comprobante no cumple el formato DGII. Revisá <campo>." | Soporte mira detalle XSD |
| ERR-SIGN-01 | Firma falla | "No pudimos firmar el comprobante. Volvé a intentar." | Devops revisa Edge Function |
| ERR-DGII-401 | Token DGII inválido | "DGII no autorizó el envío. Verificá postulación." | Soporte + contador validan SIRTSS |
| ERR-DGII-403 | Contribuyente no autorizado | "Tu RNC no está habilitado para este ambiente DGII." | Soporte + contador |
| ERR-DGII-429 | Rate limit DGII | "Demasiados envíos. Reintentando en 5 min." | Sistema auto-retry |
| ERR-DGII-5XX | DGII caída | "DGII no responde. Tus comprobantes se enviarán cuando vuelva." | DevOps alerta |
| ERR-SEQ-01 | Secuencia agotada | "Se agotó el rango eNCF tipo X. Solicitá nuevo rango a DGII." | Soporte + contador |
| ERR-SEQ-02 | Secuencia no autorizada | "El rango no está activo en DGII para este ambiente." | Contador verifica |
| ERR-AUTH-01 | Sin permisos | "Tu rol no permite esta acción. Pedí a tu admin." | Soporte revisa permisos |
| ERR-RLS-01 | Cross-tenant attempt | (no se muestra; bloqueado por DB) | Alarma de seguridad |
| ERR-STORAGE-01 | Storage Supabase down | "Servicio temporal no disponible. Reintentá en 1 min." | DevOps |
| ERR-FLAG-01 | DGII_TESTECF_SEND_ENABLED off | "Envío real bloqueado. Contactá a tu admin." | Soporte indica activación |

---

## 24. Mensajes para usuario final

- "Tu certificado venció. Renová con tu autoridad certificadora para seguir emitiendo."
- "Tu rango de comprobantes está al 90%. Solicitá uno nuevo a DGII."
- "DGII está temporalmente no disponible. Tus comprobantes se enviarán automáticamente cuando vuelva."
- "Listo. Tu comprobante fue aceptado por DGII (TrackId: XXX)."
- "DGII rechazó tu comprobante: <mensaje DGII>. Hablá con tu contador para resolverlo."
- "Estás en modo prueba (testecf). Estos comprobantes no son fiscales todavía."

---

## 25. Mensajes para contador

- "El RNC del cert (NNN) no coincide con dgii_settings.rncEmisor (MMM). Verificá la designación de Usuario Administrador e-CF."
- "Postulación testecf pendiente para RNC XXX. Iniciá el trámite en SIRTSS antes del envío."
- "Rango eNCF tipo 31 testecf no cargado. Solicitá el rango a DGII y cargalo en /dgii/secuencias."
- "Las 9 evidencias del paso 8 están confirmadas. Archivá el acta firmada con tu evidencia."

---

## 26. Mensajes para soporte

- `error.code=DGII_401 cause=token_expired retry_advice=re-execute_semilla`
- `error.code=XSD_REJECTED cause=missing_FechaVencimientoSecuencia retry_advice=check_settings`
- `error.code=SEQUENCE_EXHAUSTED business_id=XXX tipo=31 next_number=99999 range_end=99999`

---

## 27. Requisitos de documentación

- **Runbook operativo** (`docs/dgii/runbook-fase-f-g-h.md`) actualizado por fase.
- **QA Checklist manual** (`docs/dgii/qa-saas-pre-fase-g.md`) para validación pre-go-live.
- **Plan Maestro** (este paquete).
- **Manual del contador** (subset del plan + glosario fiscal).
- **Training material:** videos cortos por paso del wizard.
- **API docs:** OpenAPI/Swagger interno para los route handlers.

---

## 28. Riesgos y mitigaciones

(Ver § 24 del Plan Maestro — riesgos R-01 a R-15 con probabilidad/impacto/mitigación.)

---

## 29. Dependencias

- **DGII** (`ecf.dgii.gov.do`) — externa, sin SLA público.
- **Supabase** (DB + Auth + Storage + Edge) — 99.9% SLA.
- **Vercel** (hosting + serverless) — 99.99% SLA.
- **Entidad certificadora** (CA INDOTEL: Viafirma, Avansi, Certi-Empresa, GoDaddy DR) — cert se compra offline.
- **Contador / asesor fiscal del cliente** — validaciones externas.

---

## 30. Fuera de alcance

- ERP completo (inventario complejo, RRHH, nómina).
- Contabilidad doble entrada.
- Asesoría fiscal personalizada.
- NCF físicos legados (pre-2019).
- Recuperación de cert perdido.
- Automatizar postulación DGII (trámite externo del cliente).
- Validación de identidad del titular (la CA emisora lo hace).
- Sustituir al contador (auxiliar).

---

## 31. Criterios para go-live

Antes de activar producción fiscal real para un cliente:

- [ ] Cert vigente > 90 días.
- [ ] Postulación DGII aprobada formalmente.
- [ ] Rangos e-NCF de producción asignados por DGII para cada tipo.
- [ ] Margen suficiente: `next_number ≤ range_end - 100`.
- [ ] Acta de habilitación DGII recibida y archivada.
- [ ] Contador firmó declaración jurada interna.
- [ ] 7-30 días de envíos testecf con tasa aceptación > 95%.
- [ ] Backup Supabase del día (restorable).
- [ ] Cron polling status Fase H activo y monitoreado.
- [ ] Alarmas configuradas (rechazo, timeout, secuencia, cert vencimiento).
- [ ] Plan de rollback documentado y simulado.
- [ ] Soporte capacitado para errores comunes.
- [ ] Runbook actualizado para "DGII caída".
- [ ] Política de retención (10 años) implementada.
- [ ] Comunicación a clientes finales: emisión activa.

**Solo con los 15 verdes:** `ambiente='ecf'` + `dgii_enabled_real_send=true` + `DGII_TESTECF_SEND_ENABLED` permanece `false` (eso es solo para testecf).

---

**Fin del PRD.** Ver `agentes-y-skills-saas-dgii.md` para roles operativos.
