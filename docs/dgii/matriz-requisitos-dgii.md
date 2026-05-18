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
| C-12  | Secuencias e-NCF por tipo                            | UI + SQL (no aplicado) | `dgii/secuencias/page.tsx` (mock) + `0003_dgii_pos.sql` `ecf_sequences` + `reserve_ecf_sequence_number()` | parcial                 | Archivo SQL listo, falta aplicar + service                       | Aplicar 0003 + crear `DgiiSequenceService` que use la función                                      | No       | No           | bloqueado_supabase (aplicar) | P0   |
| C-13  | Vencimiento de secuencia                             | UI     | `dgii/secuencias/page.tsx`                          | mock                    | Idem                                                              | Incluir `expires_at` en `dgii_sequences`                                                              | No       | No           | bloqueado_supabase | P1   |
| C-14  | URLs base DGII por ambiente                          | Parcial| `service.ts` hardcoded                              | parcial                 | URLs no por business, ni configurables                            | `dgii_settings.base_url_testecf|certecf|ecf` y resolver en runtime                                   | Sí       | No           | —                  | P1   |
| C-15  | Reglas cierre + % proformas → e-CF                   | No     | —                                                  | pendiente               | No existen campos `default_*_percentage`, autorización, etc.      | Crear UI + columnas en `dgii_settings`                                                                | No       | Sí           | bloqueado_supabase | P0   |

## 2. Tipos e-CF

| ID    | Requisito                          | Existe | Ubicación                              | Estado                       | Brecha                                                                  | Acción                                                                                | Req DGII | Req contador | Bloqueo               | Prio |
|-------|------------------------------------|--------|----------------------------------------|------------------------------|-------------------------------------------------------------------------|----------------------------------------------------------------------------------------|----------|--------------|------------------------|------|
| T-01  | e-CF 31 Crédito Fiscal             | Sí     | `apps/web/src/server/services/dgii/builder.ts` + tests | implementado (estructura)    | Builder XSD-compliant, 31 tests verdes. Falta mapper proforma→input (Fase C) y validador XSD (Fase E) | — | Sí       | Sí           | —                      | —    |
| T-02  | e-CF 32 Consumo                    | Sí     | `builder.ts` + tests + XSD oficial         | implementado (builder + XSD)       | Builder permite consumidor final; emite SIN `FechaVencimientoSecuencia` (XSD 32 lo omite). Validación XSD oficial pasa. Falta reglas RFCE + UI flow | Implementar lógica RFCE para < umbral (D-04) + UI                                    | Sí       | Sí           | —                      | P1   |
| T-03  | e-CF 33 Nota de Débito             | Sí     | `builder.ts` + tests + XSD oficial         | implementado (builder + XSD)       | Builder exige `informacionReferencia`. Validación XSD oficial pasa. Falta workflow de derivación desde e-CF original | UI flow                                                                                | Sí       | Sí           | —                      | P2   |
| T-04  | e-CF 34 Nota de Crédito            | Sí     | `builder.ts` + `source-invoice-to-nc.ts` + UI `/dgii/facturas/[id]` + tests + XSD oficial | implementado (builder + XSD + workflow demo) | UI permite crear NC desde factura origen con motivo + código de modificación; `indicadorNotaCredito` automático según diff de días. Validación XSD oficial pasa. | Workflow real requiere envío DGII (Fases G/H)                                          | Sí       | Sí           | —                      | —    |
| T-05  | e-CF 41 Compras                    | Parcial| Badge en UI                            | no_aplica                    | Fuera de scope inicial                                                  | Preparar enum y dejar planning                                                         | Sí       | Sí           | —                      | P3   |
| T-06  | e-CF 43 Gastos Menores             | Parcial| Badge en UI                            | no_aplica                    | Idem                                                                     | Idem                                                                                    | Sí       | Sí           | —                      | P3   |
| T-07  | e-CF 44/45/46/47                   | Parcial| Badges                                  | no_aplica                    | Idem                                                                     | Idem                                                                                    | Sí       | Sí           | —                      | P3   |

## 3. XML, XSD y firma

| ID    | Requisito                                  | Existe | Ubicación                          | Estado                | Brecha                                                                                 | Acción                                                                                | Req DGII | Req contador | Bloqueo               | Prio |
|-------|--------------------------------------------|--------|------------------------------------|-----------------------|----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|----------|--------------|------------------------|------|
| X-01  | Generación XML con orden exacto del XSD    | Sí     | `builder.ts` + `types.ts`          | implementado          | XSD order enforzado, opcionales omitidos, 31 tests cubren orden y formatos              | — | Sí       | No           | —                      | —    |
| X-02  | Fechas, decimales, sin separador miles     | Sí     | `builder.ts` (`formatDgiiDate`, `formatDgiiAmount`, `formatDgiiPrice`, `formatDgiiDateTime`) | implementado | Helpers centralizados con tests. TODO: TZ-aware (forzar America/Santo_Domingo) — D-03      | Hacer TZ-aware en una iteración menor                                                  | Sí       | No           | —                      | P2   |
| X-03  | Validación XSD                              | Sí     | `validator.ts` + tests             | implementado          | `xmllint-wasm` (libxml2/WASM, sin native deps). 12 tests + roundtrip builder→signer→validator. Patch en memoria del typo XSD oficial. | — | Sí       | No           | —                      | —    |
| X-04  | Firma XMLDSig enveloped RSA-SHA256          | Sí     | `signer.ts` + tests                | implementado          | `isEmptyUri: true` fuerza `URI=""` sin añadir `Id` al ECF; XSD oficial valida el output (verificado con `validator.ts`) — D-11 resuelta | — | Sí       | No           | —                      | —    |
| X-05  | KeyInfo con X509 del cert                   | Sí     | `signer.ts`                        | implementado          | `getKeyInfoContent` emite `<X509Data><X509Certificate>...</X509Certificate></X509Data>` con base64 sin headers | — | Sí       | No           | —                      | —    |
| X-06  | Canonicalización antes de firmar            | Sí     | `signer.ts`                        | implementado          | C14N 20010315 vía xml-crypto                                                              | — | Sí       | No           | —                      | —    |
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
| P-01  | PDF representación impresa     | Sí     | `pdf.ts` + tests | implementado | Layout minimalista con encabezado, comprador, items, totales, footer + QR. Estilo final UI sigue pendiente | — | Sí       | No           | —       | —    |
| P-02  | QR consulta DGII                | Sí     | `qr.ts` + tests  | implementado | URL/path configurables por ambiente. Formato exacto sujeto a D-06 | Validar formato contra DGII oficial cuando llegue certificación | Sí       | No           | —       | P2   |
| P-03  | Código de seguridad             | Sí (parcial) | `security-code.ts` + tests | implementado (heurística) | Default: 8 chars alfanum del SignatureValue. Algoritmo oficial DGII pendiente validar | Validar fórmula contra documentación oficial DGII (D-06) | Sí       | No           | —       | P1   |
| P-04  | Estado DGII visible en PDF      | Sí     | `pdf.ts`         | implementado | Footer del PDF muestra estado + ambiente + TrackId si lo hay | — | No       | No           | —       | —    |

## 6. Ventas, proformas, formas de pago

| ID    | Requisito                                                       | Existe | Ubicación                                            | Estado    | Brecha                                                                          | Acción                                                                            | Req DGII | Req contador | Bloqueo            | Prio |
|-------|----------------------------------------------------------------|--------|------------------------------------------------------|-----------|---------------------------------------------------------------------------------|------------------------------------------------------------------------------------|----------|--------------|--------------------|------|
| V-01  | Regla efectivo/transferencia → proforma                         | OK     | `features/sales/document-resolver.ts`               | implementado | —                                                                              | —                                                                                  | No       | Sí           | —                  | —    |
| V-02  | Regla tarjeta/POS bancario → e-CF inmediato                     | OK     | `features/sales/document-resolver.ts`               | implementado | Aún no genera e-CF real (depende de servicios)                                  | Conectar al `DgiiService` cuando esté listo                                       | No       | Sí           | —                  | P1   |
| V-03  | Proformas no consumen e-NCF                                     | OK     | Lógica del resolver                                  | implementado | —                                                                              | Mantener                                                                            | No       | Sí           | —                  | —    |
| V-04  | Advertencia fiscal en proforma                                  | Parcial| `proformas/[id]/print/page.tsx` (a auditar)          | parcial    | Confirmar texto y visibilidad                                                    | Asegurar leyenda "no sustituye comprobante fiscal cuando legalmente corresponda" | No       | Sí           | —                  | P1   |
| V-05  | Métodos pago: cash, transfer, card, link, POS bancario          | Parcial| `document-resolver.ts` con varios procesadores       | parcial    | Falta tipo `payment_methods` central + flag `requires_immediate_ecf`            | Tabla `payment_methods` + UI                                                       | No       | Sí           | bloqueado_supabase | P1   |
| V-06  | Tabla `sales` / `sale_items`                                    | Parcial| `0003_dgii_pos.sql` unifica venta+proforma en `proformas` con `document_kind` | parcial    | Decisión: una sola tabla con `document_kind ∈ {proforma,invoice}`               | Si se necesita separar, agregar tabla en migración posterior                          | No       | No           | bloqueado_supabase (aplicar) | P1   |
| V-07  | Tabla `proformas` / `proforma_items`                            | Sí (no aplicado) | `0003_dgii_pos.sql`                                  | parcial    | Archivo escrito, NO aplicado a DB                                                | Aplicar con `supabase db push` previa autorización                                  | No       | No           | bloqueado_supabase (aplicar) | P0   |

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
| Z-01  | Verificación prerrequisitos                 | Sí (parcial) | implementado (UI) | Pantalla `/dgii/certificacion` con sección "Pre-requisitos" lista bloqueos por fase | bloqueado_secreto  | P1   |
| Z-02  | Set de pruebas DGII                         | Sí (mock)   | implementado (fixtures internos) | `certification-fixtures.ts` con 4 inputs representativos; reemplazar por set oficial (D-08) | bloqueado_secreto  | P1   |
| Z-03  | Panel de avance                             | Sí          | implementado | Tabla por tipo en `/dgii/certificacion` con estado, eNCF, código seguridad, última ejecución | —                  | —    |
| Z-04  | Evidencias (XML, firmado, PDF, TrackId)     | Sí (mock localStorage) | implementado | `certification-store.ts`. TrackId queda en blanco hasta autorización Fases G/H | bloqueado_supabase (persistencia real) | P2   |
| Z-05  | Bloqueo paso a `ecf` (producción)           | No     | pendiente  | Guard que requiere autorización admin + pruebas verdes              | —                  | P0   |

## 11. Roles y permisos

| ID    | Permiso                                       | Existe | Acción                              | Prio |
|-------|-----------------------------------------------|--------|-------------------------------------|------|
| R-01  | `dgii:configure`                              | Sí (mock) | seed en `allPermissions`, badge mock; RLS activo en Fase C | P1   |
| R-02  | `dgii:certificate:upload`                     | Sí (mock) | seed en `allPermissions`, marcado "alto riesgo"             | P0   |
| R-03  | `dgii:sequences:manage`                       | Sí (mock) | seed (renombrado de `dgii:sequences:import` a `:manage`)    | P1   |
| R-04  | `dgii:invoices:generate_xml` + `validate_xml` + `sign` + `send` + `check_status` + `download_xml` + `download_pdf` | Sí (mock) | 7 seeds en categoría "Facturas electrónicas" | P1   |
| R-05  | `dgii:credit_notes:create`                    | Sí (mock) | seed                                  | P1   |
| R-06  | `dgii:reports:view`                           | Sí (mock) | seed                                  | P2   |
| R-07  | `dgii:certification:run_tests`                | Sí (mock) | seed                                  | P1   |
| R-08  | `cash:open` / `cash:close`                    | Sí (mock) | seeds nuevos; legacy `cash_register:open|close` se conservan | P2   |
| R-09  | `cash:change_closing_percentage`              | Sí (mock) | seed                                  | P1   |
| R-10  | `cash:authorize_below_100_percent`            | Sí (mock) | seed, marcado "alto riesgo"           | P1   |
| R-11  | `cash:reverse_closing`                        | Sí (mock) | seed, marcado "alto riesgo"           | P1   |
| R-12  | Asignación rol → permisos DGII/cash            | Sí (mock) | `roleDefinitions` cubre los 7 roles con segregación de funciones (super_admin/admin: `dgii:*` + `cash:*`; manager: operación; cashier: cobro mínimo; inventory: sin DGII; supervisor: aprobador; auditor: solo-lectura). Matriz visual en `/admin/permisos`. Tests cubren cada asignación. | P1   |

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
- D-11: **RESUELTA** — `URI=""` estricto + ECF sin `Id` auto-generado, vía
  opción `isEmptyUri: true` de xml-crypto v6. El XML firmado pasa el XSD
  oficial DGII (verificado por `validator.ts`). Pendiente todavía la
  pregunta XAdES-BES vs XMLDSig puro: `dgii-setup.md` menciona "XAdES-BES",
  el documento adjunto pide "XMLDSig enveloped". Implementación actual:
  XMLDSig enveloped. Si DGII exige XAdES-BES propiamente dicho, añadir
  `SignedProperties` (SigningTime, SigningCertificate) sin tocar la firma
  ya existente.
- D-12: El XSD oficial DGII de e-CF 31 tiene un typo en línea 476:
  `<xs:simpleType name=" IndicadorServicioTodoIncluidoType">` (espacio
  inicial). `xmllint` rechaza compilar el schema. Aplicamos parche en
  memoria en `validator.patchOfficialDgiiXsd()`. Los XSDs 32/33/34 NO
  tienen este typo (DGII lo corrigió allí pero NO en 31). Los 32/33/34
  traen UTF-8 BOM al inicio que `patchOfficialDgiiXsd` también strippea.
  Pendiente reportar a DGII y rastrear actualización del XSD 31 oficial.
- D-13: **RESUELTA** — XSDs oficiales 32/33/34 descargados del portal DGII
  a `docs/dgii/xsd/`. Diferencias confirmadas y reflejadas en el builder:
    * e-CF 32 omite `<FechaVencimientoSecuencia>` del IdDoc.
    * e-CF 34 reemplaza `<FechaVencimientoSecuencia>` por
      `<IndicadorNotaCredito>` (0/1, obligatorio).
    * e-CF 33 estructura idéntica a 31.
  Builder + validator pasan los XSDs oficiales para los 4 tipos.
- D-14: `CodigoModificacion` (1..5) usado en `<InformacionReferencia>` para
  e-CF 33/34 — los significados exactos por valor (Anulación / Cambios /
  Devolución / Pronto pago / Corrección) son una interpretación común;
  validar contra documentación oficial DGII antes de certificación.

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
