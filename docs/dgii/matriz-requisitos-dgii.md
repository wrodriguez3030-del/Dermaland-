# Matriz de requisitos DGII — gap matrix

> **Fecha:** 2026-05-17 · Rama: `feature/dgii-module-review-adjustments`.
> Insumo: `requisitos-facturacion-electronica-dgii.md` + `xsd/e-CF-31-v1.0.xsd`.
> Auditoría: `auditoria-modulo-dgii-existente.md`.

## Leyenda

- **Estado** ∈ `implementado · parcial · mock · pendiente · bloqueado_secreto · bloqueado_supabase · requiere_validacion_dgii · requiere_contador · no_aplica`.
- **Prioridad** ∈ `P0` (bloqueante producción) · `P1` (alta) · `P2` (media) · `P3` (baja).

## 1. Configuración fiscal DGII

| ID    | Requisito                                            | Existe | Ubicación                                          | Estado                  | Brecha                                                         | Acción recomendada                                                                                  | Req DGII | Req contador | Bloqueo            | Prio |
|-------|------------------------------------------------------|--------|----------------------------------------------------|-------------------------|----------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|----------|--------------|--------------------|------|
| C-01  | RNC emisor                                           | Sí     | UI `dgii/configuracion`; mock business             | mock                    | No persiste                                                     | Crear tabla `dgii_settings` y CRUD                                                                  | No       | No           | bloqueado_supabase | P1   |
| C-02  | Razón social                                         | Sí     | UI `dgii/configuracion`                             | mock                    | No persiste                                                     | Idem C-01                                                                                            | No       | No           | bloqueado_supabase | P1   |
| C-03  | Nombre comercial                                     | Sí     | UI `dgii/configuracion`                             | mock                    | No persiste                                                     | Idem C-01                                                                                            | No       | No           | bloqueado_supabase | P2   |
| C-04  | Dirección emisor                                     | Sí     | UI `dgii/configuracion`                             | mock                    | No persiste                                                     | Idem C-01                                                                                            | No       | No           | bloqueado_supabase | P1   |
| C-05  | Provincia / Municipio                                | No     | —                                                  | pendiente               | No hay campos en UI                                              | Agregar a `dgii_settings` + UI                                                                       | No       | No           | bloqueado_supabase | P2   |
| C-06  | Teléfono                                             | Sí     | UI `dgii/configuracion`                             | mock                    | No persiste                                                     | Idem C-01                                                                                            | No       | No           | bloqueado_supabase | P3   |
| C-07  | Correo emisor                                        | Sí     | UI `dgii/configuracion`                             | mock                    | No persiste                                                     | Idem C-01                                                                                            | No       | No           | bloqueado_supabase | P3   |
| C-08  | Actividad económica                                  | Sí     | UI `dgii/configuracion`                             | mock                    | No persiste                                                     | Idem C-01                                                                                            | No       | No           | bloqueado_supabase | P3   |
| C-09  | Ambiente: testecf · certecf · ecf                    | Parcial| `env.ts` enum `cert|prod`                          | parcial                 | Faltan tres ambientes según doc                                  | Ampliar enum a `testecf|certecf|ecf` y reflejar en UI                                                | Sí       | No           | —                  | P1   |
| C-10  | Certificado .p12/.pfx                                | UI     | `dgii/certificado/page.tsx`                         | mock                    | Form sin backend, no encripta ni persiste                        | Implementar `DgiiCertificateService` (cifrado AES-256-GCM, almacenamiento Supabase Storage)          | No       | No           | bloqueado_secreto + bloqueado_supabase | P0   |
| C-11  | Password certificado como secreto                    | UI     | `dgii/certificado/page.tsx` + `env.DGII_CERTIFICATE_PASSWORD` | parcial | Está como env, debería ir a Vault y referenciarse por nombre     | Mover a Supabase Vault o Vercel Env Secret + referencia                                              | No       | No           | bloqueado_secreto  | P0   |
| C-12  | Secuencias e-NCF por tipo                            | UI     | `dgii/secuencias/page.tsx` con mock                  | mock                    | No persiste, no atomicidad de `next_number`                       | Crear `dgii_sequences` + `DgiiSequenceService` con UPDATE atómico                                    | No       | No           | bloqueado_supabase | P0   |
| C-13  | Vencimiento de secuencia                             | UI     | `dgii/secuencias/page.tsx`                          | mock                    | Idem                                                              | Incluir `expires_at` en `dgii_sequences`                                                              | No       | No           | bloqueado_supabase | P1   |
| C-14  | URLs base DGII por ambiente                          | Parcial| `service.ts` hardcoded                              | parcial                 | URLs no por business, ni configurables                            | `dgii_settings.base_url_testecf|certecf|ecf` y resolver en runtime                                   | Sí       | No           | —                  | P1   |
| C-15  | Reglas cierre + % proformas → e-CF                   | No     | —                                                  | pendiente               | No existen campos `default_*_percentage`, autorización, etc.      | Crear UI + columnas en `dgii_settings`                                                                | No       | Sí           | bloqueado_supabase | P0   |

## 2. Tipos e-CF

| ID    | Requisito                          | Existe | Ubicación                              | Estado                       | Brecha                                                                  | Acción                                                                                | Req DGII | Req contador | Bloqueo               | Prio |
|-------|------------------------------------|--------|----------------------------------------|------------------------------|-------------------------------------------------------------------------|----------------------------------------------------------------------------------------|----------|--------------|------------------------|------|
| T-01  | e-CF 31 Crédito Fiscal             | Parcial| `DgiiService.generateXml`              | parcial                      | Builder no respeta XSD ni orden; bug `<DetallesItems>` doblado          | Reescribir builder con `xmlbuilder2` siguiendo XSD                                     | Sí       | Sí           | —                      | P0   |
| T-02  | e-CF 32 Consumo                    | Parcial| Solo tipo en UI                        | mock                         | Sin builder específico                                                  | Builder + reglas RFCE                                                                  | Sí       | Sí           | —                      | P1   |
| T-03  | e-CF 33 Nota de Débito             | Parcial| Tipo en UI                             | mock                         | Sin builder                                                              | Builder                                                                                | Sí       | Sí           | —                      | P2   |
| T-04  | e-CF 34 Nota de Crédito            | Parcial| Tipo en UI; "Anular" sólo toast        | mock                         | Sin builder, sin asociar a factura origen                                | Builder + workflow                                                                     | Sí       | Sí           | —                      | P1   |
| T-05  | e-CF 41 Compras                    | Parcial| Badge en UI                            | no_aplica                    | Fuera de scope inicial                                                  | Preparar enum y dejar planning                                                         | Sí       | Sí           | —                      | P3   |
| T-06  | e-CF 43 Gastos Menores             | Parcial| Badge en UI                            | no_aplica                    | Idem                                                                     | Idem                                                                                    | Sí       | Sí           | —                      | P3   |
| T-07  | e-CF 44/45/46/47                   | Parcial| Badges                                  | no_aplica                    | Idem                                                                     | Idem                                                                                    | Sí       | Sí           | —                      | P3   |

## 3. XML, XSD y firma

| ID    | Requisito                                  | Existe | Ubicación                          | Estado                | Brecha                                                                                 | Acción                                                                                | Req DGII | Req contador | Bloqueo               | Prio |
|-------|--------------------------------------------|--------|------------------------------------|-----------------------|----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|----------|--------------|------------------------|------|
| X-01  | Generación XML con orden exacto del XSD    | No     | `DgiiService.generateXml`          | parcial               | Faltan campos obligatorios y opcionales; orden no controlado                            | `xmlbuilder2` + plantilla por tipo + tests contra XSD                                  | Sí       | No           | —                      | P0   |
| X-02  | Fechas, decimales, sin separador miles     | Parcial| `service.ts` usa `toFixed(2)` ad-hoc | parcial             | No hay utilitario central                                                                | Crear `dgii/utils.ts` (`formatDgiiDate`, `formatDgiiAmount`)                           | Sí       | No           | —                      | P0   |
| X-03  | Validación XSD                              | No     | —                                  | pendiente             | No existe validator                                                                      | `libxmljs2` (o equivalente) cargando `docs/dgii/xsd/e-CF-31-v1.0.xsd`                  | Sí       | No           | —                      | P0   |
| X-04  | Firma XMLDSig enveloped RSA-SHA256          | No     | `signXml` stub                     | pendiente             | Sin librería ni implementación                                                            | `xadesjs`/`xmldsigjs`. Backend only.                                                  | Sí       | No           | bloqueado_secreto      | P0   |
| X-05  | KeyInfo con X509 del cert                   | No     | —                                  | pendiente             | Idem                                                                                      | Idem                                                                                    | Sí       | No           | bloqueado_secreto      | P0   |
| X-06  | Canonicalización antes de firmar            | No     | —                                  | pendiente             | Idem                                                                                      | C14N estándar                                                                          | Sí       | No           | —                      | P0   |
| X-07  | No firmar en frontend                       | OK     | `service.ts` con `"server-only"`   | implementado          | —                                                                                         | Mantener                                                                                | Sí       | No           | —                      | —    |

## 4. Autenticación, envío, consulta

| ID    | Requisito                              | Existe | Ubicación                  | Estado     | Brecha                                                  | Acción                                                                  | Req DGII | Req contador | Bloqueo           | Prio |
|-------|----------------------------------------|--------|----------------------------|------------|---------------------------------------------------------|--------------------------------------------------------------------------|----------|--------------|-------------------|------|
| A-01  | GET /api/autenticacion/semilla         | No     | —                          | pendiente  | No existe servicio                                       | Crear `DgiiAuthService`                                                  | Sí       | No           | bloqueado_secreto | P0   |
| A-02  | Firma de semilla                       | No     | —                          | pendiente  | Depende de X-04..X-06                                    | Idem                                                                      | Sí       | No           | bloqueado_secreto | P0   |
| A-03  | POST /api/autenticacion/validarsemilla | No     | —                          | pendiente  | Idem                                                     | Idem                                                                      | Sí       | No           | bloqueado_secreto | P0   |
| A-04  | Cache de token                         | No     | —                          | pendiente  | Idem                                                     | KV cache (Upstash Redis o Vercel Runtime Cache)                          | Sí       | No           | —                 | P1   |
| A-05  | POST recepción multipart               | No     | `submitToDgii` stub        | pendiente  | Idem                                                     | `DgiiReceptionService`                                                    | Sí       | No           | bloqueado_secreto | P0   |
| A-06  | GET consulta TrackId                   | No     | `getTrackStatus` stub      | pendiente  | Idem                                                     | `DgiiStatusService`                                                       | Sí       | No           | bloqueado_secreto | P0   |
| A-07  | Reintentos con cola                    | No     | —                          | pendiente  | Idem                                                     | Vercel Workflow (WDK) o Upstash Redis queue                              | Sí       | No           | —                 | P1   |

## 5. Representación impresa, QR

| ID    | Requisito                       | Existe | Ubicación        | Estado     | Brecha                              | Acción                                                       | Req DGII | Req contador | Bloqueo | Prio |
|-------|--------------------------------|--------|------------------|------------|-------------------------------------|---------------------------------------------------------------|----------|--------------|---------|------|
| P-01  | PDF representación impresa     | No     | —                | pendiente  | Sin servicio                         | `@react-pdf/renderer` server-side                            | Sí       | No           | —       | P1   |
| P-02  | QR consulta DGII                | No     | —                | pendiente  | Falta URL exacta del QR              | `qrcode` + URL DGII confirmada                                | Sí       | No           | —       | P1   |
| P-03  | Código de seguridad             | No     | —                | requiere_validacion_dgii | Algoritmo no claro en doc       | Validar fórmula contra documentación oficial DGII             | Sí       | No           | —       | P0   |
| P-04  | Estado DGII visible en PDF      | No     | —                | pendiente  | —                                    | Inyectar status                                               | No       | No           | —       | P2   |

## 6. Ventas, proformas, formas de pago

| ID    | Requisito                                                       | Existe | Ubicación                                            | Estado    | Brecha                                                                          | Acción                                                                            | Req DGII | Req contador | Bloqueo            | Prio |
|-------|----------------------------------------------------------------|--------|------------------------------------------------------|-----------|---------------------------------------------------------------------------------|------------------------------------------------------------------------------------|----------|--------------|--------------------|------|
| V-01  | Regla efectivo/transferencia → proforma                         | OK     | `features/sales/document-resolver.ts`               | implementado | —                                                                              | —                                                                                  | No       | Sí           | —                  | —    |
| V-02  | Regla tarjeta/POS bancario → e-CF inmediato                     | OK     | `features/sales/document-resolver.ts`               | implementado | Aún no genera e-CF real (depende de servicios)                                  | Conectar al `DgiiService` cuando esté listo                                       | No       | Sí           | —                  | P1   |
| V-03  | Proformas no consumen e-NCF                                     | OK     | Lógica del resolver                                  | implementado | —                                                                              | Mantener                                                                            | No       | Sí           | —                  | —    |
| V-04  | Advertencia fiscal en proforma                                  | Parcial| `proformas/[id]/print/page.tsx` (a auditar)          | parcial    | Confirmar texto y visibilidad                                                    | Asegurar leyenda "no sustituye comprobante fiscal cuando legalmente corresponda" | No       | Sí           | —                  | P1   |
| V-05  | Métodos pago: cash, transfer, card, link, POS bancario          | Parcial| `document-resolver.ts` con varios procesadores       | parcial    | Falta tipo `payment_methods` central + flag `requires_immediate_ecf`            | Tabla `payment_methods` + UI                                                       | No       | Sí           | bloqueado_supabase | P1   |
| V-06  | Tabla `sales` / `sale_items`                                    | No     | —                                                    | pendiente  | No existen                                                                       | Crear migraciones                                                                  | No       | No           | bloqueado_supabase | P0   |
| V-07  | Tabla `proformas` / `proforma_items`                            | No     | —                                                    | pendiente  | Solo en localStorage / mock                                                      | Crear migraciones                                                                  | No       | No           | bloqueado_supabase | P0   |

## 7. Cierre de caja + porcentaje configurable

| ID    | Requisito                                                            | Existe | Ubicación             | Estado     | Brecha                                                                          | Acción                                                              | Req DGII | Req contador | Bloqueo            | Prio |
|-------|----------------------------------------------------------------------|--------|-----------------------|------------|---------------------------------------------------------------------------------|---------------------------------------------------------------------|----------|--------------|--------------------|------|
| K-01  | Stats efectivo/transferencia/tarjeta                                  | OK     | `caja/page.tsx`       | implementado UI | Mock                                                                       | Conectar a fuente real                                              | No       | No           | bloqueado_supabase | P1   |
| K-02  | Selección de proformas a convertir                                    | Parcial| `caja/page.tsx`       | parcial    | Sólo checkboxes manuales, sin % automático                                       | Añadir % + cálculo + selección FIFO + ajuste manual                | No       | Sí           | bloqueado_supabase | P0   |
| K-03  | Porcentaje configurable (default, min, max)                           | No     | —                     | pendiente  | No existe                                                                        | UI + columnas `dgii_settings`                                       | No       | Sí           | bloqueado_supabase | P0   |
| K-04  | Autorización admin si % < 100                                          | No     | —                     | pendiente  | No existe                                                                        | Permiso + UI                                                         | No       | Sí           | bloqueado_supabase | P1   |
| K-05  | Auditoría `cash_closing_percentage_logs`                              | No     | —                     | pendiente  | No existe                                                                        | Migración + insert                                                  | No       | Sí           | bloqueado_supabase | P0   |
| K-06  | Validaciones pre-cierre (pagos completos, sin error DGII)             | Parcial| `caja/page.tsx`       | parcial    | Sólo diferencia de efectivo                                                      | Reglas en `CashClosingEcfService`                                   | No       | Sí           | bloqueado_supabase | P1   |
| K-07  | Estado post-cierre inmutable + flujo reverso                          | No     | —                     | pendiente  | Hoy es free-text                                                                 | `cash_closings.status`/`reverted`/log                              | No       | Sí           | bloqueado_supabase | P1   |
| K-08  | Advertencia fiscal en pantalla cierre                                 | No     | —                     | pendiente  | Falta leyenda                                                                    | Texto fijo + check obligatorio                                      | No       | Sí           | —                  | P1   |

## 8. Estados ventas / proformas / e-CF

| ID    | Estado                            | Existe | Ubicación                              | Estado actual           | Acción                                                                 | Req DGII | Req contador | Prio |
|-------|-----------------------------------|--------|-----------------------------------------|--------------------------|------------------------------------------------------------------------|----------|--------------|------|
| S-01  | `proforma`                        | Sí     | mock + resolver                          | implementado             | —                                                                       | No       | No           | —    |
| S-02  | `pending_cash_closing`            | Parcial| mock `pending_ecf`                       | parcial                  | Renombrar para alinearlo                                                | No       | No           | P2   |
| S-03  | `selected_for_ecf`                | No     | —                                        | pendiente                | Añadir                                                                  | No       | No           | P2   |
| S-04  | `ecf_generation_pending`          | No     | —                                        | pendiente                | Añadir                                                                  | No       | No           | P2   |
| S-05  | `ecf_generated`                   | Sí     | `ElectronicInvoice.status='draft'`?      | parcial                  | Mapear nombre                                                            | No       | No           | P2   |
| S-06  | `ecf_validated`                   | No     | —                                        | pendiente                | Añadir                                                                  | No       | No           | P2   |
| S-07  | `ecf_signed`                      | Sí     | `ElectronicInvoice.status='signed'`      | implementado             | —                                                                       | No       | No           | —    |
| S-08  | `ecf_sent`                        | Sí     | `submitted`                              | implementado             | —                                                                       | No       | No           | —    |
| S-09  | `ecf_in_process`                  | Sí     | `in_process`                             | implementado             | —                                                                       | No       | No           | —    |
| S-10  | `ecf_accepted`                    | Sí     | `accepted`                               | implementado             | —                                                                       | No       | No           | —    |
| S-11  | `ecf_conditionally_accepted`      | Sí     | `accepted_conditional`                   | implementado             | —                                                                       | No       | No           | —    |
| S-12  | `ecf_rejected`                    | Sí     | `rejected`                               | implementado             | —                                                                       | No       | No           | —    |
| S-13  | `closed_without_ecf`              | No     | —                                        | requiere_contador        | NO añadir sin visto bueno contador y DGII                              | Sí       | Sí           | P1   |
| S-14  | `cancelled`                       | Sí     | `cancelled`                              | implementado             | —                                                                       | No       | No           | —    |
| S-15  | `voided`                          | No     | —                                        | pendiente                | Añadir para anulaciones via NC                                          | No       | Sí           | P2   |

## 9. Endpoints internos

| ID    | Endpoint                                          | Existe | Estado     | Acción                                            | Bloqueo            | Prio |
|-------|---------------------------------------------------|--------|------------|---------------------------------------------------|--------------------|------|
| E-01  | POST `/api/dgii/invoices/{id}/generate-xml`       | No     | pendiente  | Crear route handler                                | —                  | P0   |
| E-02  | POST `/api/dgii/invoices/{id}/validate-xml`       | No     | pendiente  | Crear                                              | —                  | P0   |
| E-03  | POST `/api/dgii/invoices/{id}/sign`                | No     | pendiente  | Crear                                              | bloqueado_secreto  | P0   |
| E-04  | POST `/api/dgii/invoices/{id}/send`                | No     | pendiente  | Crear                                              | bloqueado_secreto  | P0   |
| E-05  | GET  `/api/dgii/invoices/{id}/status`              | No     | pendiente  | Crear                                              | bloqueado_secreto  | P1   |
| E-06  | POST `/api/dgii/invoices/{id}/refresh-status`      | No     | pendiente  | Crear                                              | bloqueado_secreto  | P1   |
| E-07  | GET  `/api/dgii/invoices/{id}/pdf`                 | No     | pendiente  | Crear                                              | —                  | P1   |
| E-08  | POST `/api/dgii/auth/refresh-token`                | No     | pendiente  | Crear                                              | bloqueado_secreto  | P1   |
| E-09  | POST `/api/dgii/sequences/import`                  | No     | pendiente  | Crear                                              | bloqueado_supabase | P1   |
| E-10  | GET  `/api/dgii/settings`                          | No     | pendiente  | Crear                                              | bloqueado_supabase | P1   |
| E-11  | POST `/api/pos/cash-sessions/{id}/preview-closing` | No     | pendiente  | Crear                                              | bloqueado_supabase | P1   |
| E-12  | POST `/api/pos/cash-sessions/{id}/close`           | No     | pendiente  | Crear                                              | bloqueado_supabase | P0   |

## 10. Pre-certificación / certificación

| ID    | Requisito                                  | Existe | Estado     | Acción                                                              | Bloqueo            | Prio |
|-------|--------------------------------------------|--------|------------|---------------------------------------------------------------------|--------------------|------|
| Z-01  | Verificación prerrequisitos                 | No     | pendiente  | Pantalla `/dgii/certificacion`                                       | bloqueado_secreto  | P1   |
| Z-02  | Set de pruebas DGII                         | No     | pendiente  | Orquestador de tests por tipo                                        | bloqueado_secreto  | P1   |
| Z-03  | Panel de avance                             | No     | pendiente  | Tabla por tipo con status DGII                                       | —                  | P2   |
| Z-04  | Evidencias (XML, firmado, PDF, TrackId)     | No     | pendiente  | Storage privado + listing                                            | bloqueado_supabase | P2   |
| Z-05  | Bloqueo paso a `ecf` (producción)           | No     | pendiente  | Guard que requiere autorización admin + pruebas verdes              | —                  | P0   |

## 11. Roles y permisos

| ID    | Permiso                                       | Existe | Acción                              | Prio |
|-------|-----------------------------------------------|--------|-------------------------------------|------|
| R-01  | `dgii:configure`                              | No     | Seed                                | P1   |
| R-02  | `dgii:certificate:upload`                     | No     | Seed                                | P0   |
| R-03  | `dgii:sequences:import`                       | No     | Seed                                | P1   |
| R-04  | `dgii:invoices:generate`                      | No     | Seed                                | P1   |
| R-05  | `dgii:invoices:send`                          | No     | Seed                                | P1   |
| R-06  | `dgii:invoices:cancel`                        | No     | Seed                                | P1   |
| R-07  | `cash:open` / `cash:close`                    | Parcial| Confirmar en permissions table       | P2   |
| R-08  | `cash:change_closing_percentage`              | No     | Seed                                | P1   |
| R-09  | `cash:authorize_below_100_percent`            | No     | Seed                                | P1   |
| R-10  | `cash:reverse_closing`                        | No     | Seed                                | P1   |

## 12. Reportes y auditoría

| ID    | Reporte                                | Existe | Acción                          | Prio |
|-------|----------------------------------------|--------|----------------------------------|------|
| L-01  | Ventas por forma de pago               | No     | `reportes/ventas/page.tsx` ya existe — extender | P2 |
| L-02  | Proformas pendientes vs convertidas    | No     | Crear vista                      | P1   |
| L-03  | Comprobantes enviados / aceptados / rechazados | Parcial | UI con stats; falta detalle    | P1   |
| L-04  | Secuencias usadas / disponibles        | Parcial | UI mock                          | P2   |
| L-05  | Porcentajes usados por cierre          | No     | Crear vista                      | P1   |
| L-06  | Errores DGII                           | No     | Crear vista                      | P1   |

## 13. Seguridad

| ID    | Requisito                                    | Existe | Estado          | Acción                                                                                | Prio |
|-------|----------------------------------------------|--------|-----------------|----------------------------------------------------------------------------------------|------|
| Y-01  | `.gitignore` cubre `.env*`                   | OK     | implementado    | —                                                                                       | —    |
| Y-02  | `.gitignore` cubre certificados              | OK (reforzado en este PR) | implementado    | `*.cer/.der/.cert/certificates/` añadidos al `.gitignore` raíz                          | —    |
| Y-03  | Firma sólo backend                            | OK     | implementado    | `service.ts` con `"server-only"`                                                       | —    |
| Y-04  | Cifrado at-rest del cert                      | No     | pendiente       | AES-256-GCM + key en env Secret                                                         | P0   |
| Y-05  | Password de cert nunca en logs                | No     | pendiente       | Pino `redact` config                                                                    | P1   |
| Y-06  | Auditoría de operaciones DGII                 | Parcial| —               | Conectar a `audit_logs`                                                                  | P1   |

## 14. Dudas para DGII (validación oficial)

- D-01: URLs exactas vigentes `testecf`, `certecf`, `ecf`.
- D-02: ¿multipart vs application/xml en recepción?
- D-03: Formato exacto de fechas DGII (`yyyy-MM-dd` vs otro).
- D-04: Umbral RFCE para e-CF 32.
- D-05: Codificaciones `TipoIngresos`, `TipoPago`, `IndicadorEnvioDiferido`, `IndicadorMontoGravado`, `IndicadorServicioTodoIncluido`.
- D-06: Algoritmo del "código de seguridad" y URL exacta del QR.
- D-07: Endpoint Aprobación Comercial: ¿obligatorio?, ¿cuándo?
- D-08: Set de pruebas oficial para certificación.
- D-09: Reuso o no de secuencias rechazadas.
- D-10: Retención mínima de XML.

## 15. Dudas para el contador

- F-01: ¿e-CF 31 vs 32 por defecto en Cibao Spa Láser / DermaLand?
- F-02: ¿Plazo legal para convertir proforma → e-CF?
- F-03: ¿Es lícito convertir sólo un % de proformas? ¿Cuál es el mínimo legal?
- F-04: ¿Quién autoriza % < 100? ¿Requiere doble firma?
- F-05: ¿Cuándo es legal `closed_without_ecf` o se elimina el estado?
- F-06: Redondeo ITBIS por línea vs por totales.
- F-07: Retenciones ITBIS / ISR — ¿aplican al modelo de negocio?
- F-08: Plazo y motivos válidos de NC (e-CF 34).
- F-09: Propinas legales (si aplica) en MontoGravado o como impuesto adicional.
- F-10: Anulación de e-CF aceptado (proceso ante DGII).
