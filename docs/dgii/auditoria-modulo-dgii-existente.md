# Auditoría del módulo DGII existente en DermaLand

> **Branch:** `feature/dgii-module-review-adjustments`
> **Fecha:** 2026-05-17
> **Estado del repo:** main fast-forwarded a `403b2e5` (restauración completa
> + bump Next 15.5.18). DATA_SOURCE=mock. No se tocó producción.
> **Objetivo:** documentar qué hay del módulo DGII, qué es mock, qué falta
> contra el documento `requisitos-facturacion-electronica-dgii.md`.

## 1. Confirmación de que el módulo existe

Sí. Reside en `apps/web/src/app/(app)/dgii/...` y se ve en producción
(`https://dermaland.vercel.app/dgii`). Pages encontradas:

| Ruta                              | Archivo                                                          | Tipo de página     |
|-----------------------------------|------------------------------------------------------------------|--------------------|
| `/dgii`                           | `app/(app)/dgii/page.tsx`                                        | Landing + stats    |
| `/dgii/configuracion`             | `app/(app)/dgii/configuracion/page.tsx`                          | Form contribuyente |
| `/dgii/secuencias`                | `app/(app)/dgii/secuencias/page.tsx`                             | Tabla secuencias   |
| `/dgii/facturas`                  | `app/(app)/dgii/facturas/page.tsx`                               | Tabla comprobantes |
| `/dgii/envios`                    | `app/(app)/dgii/envios/page.tsx`                                 | Cola de envíos     |
| `/dgii/certificado`               | `app/(app)/dgii/certificado/page.tsx`                            | Upload .p12 (UI)   |

**No se duplica.** Esta auditoría conserva la ruta `/dgii` y todos sus
subpages.

## 2. Servicios, tipos y datos

### 2.1 Servicio `DgiiService`

`apps/web/src/server/services/dgii/service.ts`. Marcado con `import "server-only"`.

- **Interface completa**: `generateXml`, `signXml`, `submitToDgii`, `getTrackStatus`,
  `cancelInvoice`, `createCreditNote`.
- **Errores tipados**: `DgiiNotConfigured`, `DgiiNotImplemented`.
- **`generateXml`**: emite un esqueleto XML simplificado. NO cumple XSD: faltan
  `IndicadorEnvioDiferido`, `TipoIngresos`, `TipoPago`, `FechaVencimientoSecuencia`
  con valor real, `<Emisor>` sólo con RNC/razón social como `__PENDING__`,
  `<Totales>` muy reducido (sólo `MontoTotal` y `TotalITBIS`), no incluye
  `FechaHoraFirma`, `NumeroLinea` real ni `IndicadorFacturacion`. Estructura
  además tiene `<DetallesItems>` repetido dentro del map (bug: arma items dentro
  de `<DetallesItems>` y luego envuelve todo en otro `<DetallesItems>`).
- **`signXml`, `submitToDgii`, `getTrackStatus`, `cancelInvoice`, `createCreditNote`**:
  lanzan `DgiiNotImplemented` (stubs).
- **`baseUrl`**: hardcodea dos URLs y elige según `env.DGII_ENVIRONMENT`. La
  enum del env sólo soporta `"cert"|"prod"` — el documento DGII pide tres
  ambientes: `testecf`, `certecf`, `ecf`.

### 2.2 Variables de entorno

`apps/web/src/lib/env.ts`:

- `DGII_ENVIRONMENT: z.enum(["cert","prod"])` ← **brecha**. Falta `testecf|certecf|ecf`.
- `DGII_CERTIFICATE_PATH: optional` ← parte de mock; en producción debe ser
  referencia a Supabase Storage cifrado, no path local.
- `DGII_CERTIFICATE_PASSWORD: optional` ← **riesgo**: el nombre sugiere
  almacenamiento en env; debe quedar claro que esa variable es **solo**
  para inyectar la password en runtime desde Vault/Secret y nunca aparece
  hardcodeada.
- `isDgiiConfigured()` valida ambos campos. OK como guard.

### 2.3 Document resolver (regla forma de pago → comprobante)

`apps/web/src/features/sales/document-resolver.ts`. Implementa:

| billingType    | paymentMethod                       | Resultado                  |
|----------------|-------------------------------------|----------------------------|
| consumo        | cash · transfer · paypal · manual · other · null | **Proforma**         |
| consumo        | card · azul · cardnet · visanet     | **e-CF 32 Consumo**        |
| credito_fiscal | cualquiera                          | **e-CF 31 Crédito Fiscal** |

Bien estructurado, con `R-FIS-01` marcado como riesgo abierto pendiente de
validar con contador. **Coincide con la regla del documento DGII** (efectivo
y transferencia → proforma; tarjeta → e-CF inmediato).

### 2.4 Tipos compartidos

- `Proforma`, `ElectronicInvoice`, `DgiiSequence` viven en `apps/web/src/types/`.
- `EcfType = "31"|"32"|"33"|"34"|"41"|"43"|"44"|"45"` en `dgii/service.ts`.
- Estado de `ElectronicInvoice.status`: `draft|signed|submitted|in_process|accepted|accepted_conditional|rejected|cancelled|error` (visto en `facturas/page.tsx`).

### 2.5 Mocks

`apps/web/src/lib/mock-data/integrations.ts`:

- `mockDgiiSequences` (4 secuencias: 31, 32, 33, 34).
- `mockElectronicInvoices` (3 entradas con TrackId, status, totales).
- `mockProformas` viven en `lib/mock-data/sales.ts` (no leído en detalle aquí).

### 2.6 Caja / cierre

`apps/web/src/app/(app)/caja/page.tsx`:

- Stats por método de pago (efectivo / tarjeta / transferencia).
- Tabla de proformas con checkboxes para seleccionar manualmente cuáles
  convertir a e-CF.
- Campo "Efectivo contado" + diferencia.
- Historial de sesiones cerradas.
- **No tiene** campo de porcentaje configurable, ni cálculo automático de
  monto objetivo, ni selección FIFO. Sólo selección manual completa.
- **No marca** `applies_to_payment_methods`, `minimum_closing_ecf_percentage`,
  `require_admin_authorization_below_100_percent`, ni nada de `closed_without_ecf`.

## 3. Migraciones (Supabase)

- `supabase/migrations/0001_phase1_core.sql` — businesses, branches, users,
  business_roles, permissions, role_permissions, audit_logs, clients.
- `supabase/migrations/0002_phase2_inventory.sql` — brands, laboratories,
  product_categories, products (con `itbis_rate` ya), product_lots,
  inventory_movements, inventory_counts, inventory_count_scans,
  inventory_count_items, inventory_count_evidence, inventory_count_sync_logs,
  lot_quarantine, lot_recalls + función FEFO.

**No existen aún migraciones para:**

- `dgii_settings`
- `dgii_certificates`
- `dgii_sequences` (mencionada en `dgii-setup.md` como `ecf_sequences`, no creada)
- `electronic_invoices` / `electronic_invoice_items`
- `dgii_submissions` / `dgii_status_logs`
- `dgii_received_ecf` / `dgii_commercial_approvals`
- `proformas` / `proforma_items` / `proforma_to_ecf_logs`
- `payment_methods` / `taxes`
- `sales` / `sale_items`
- `cash_registers` / `cash_register_sessions` / `cash_closings` /
  `cash_closing_sales` / `cash_closing_percentage_logs`

## 4. Estado consolidado por pantalla

| Pantalla              | UI         | Datos              | Backend             | Comentario                                                                        |
|-----------------------|------------|--------------------|---------------------|------------------------------------------------------------------------------------|
| `/dgii`               | OK         | Mock               | —                   | Banner correcto de "módulo inactivo". Tipos 31..45 listados como badges.           |
| `/dgii/configuracion` | OK         | Defaults estáticos | **No persiste**     | Falta tabla `dgii_settings`, falta selector de tercer ambiente.                    |
| `/dgii/secuencias`    | OK         | Mock               | **No persiste**     | Falta import de secuencias DGII y atomicidad de `next_number`.                     |
| `/dgii/facturas`      | OK         | Mock               | **Stub**            | Tabla con TrackId mock. "Anular" sólo toast — no genera NC.                        |
| `/dgii/envios`        | OK         | Mock               | **Stub**            | Stats correctas. No hay cola real ni reintentos.                                   |
| `/dgii/certificado`   | OK         | UI placeholder     | **No persiste**     | Form de upload + password con explicación de cifrado, pero acción no implementada. |
| `/caja`               | OK parcial | Mock               | **No persiste**     | Falta porcentaje configurable, selección FIFO, autorización admin, auditoría.      |

## 5. Estado consolidado por servicio

| Servicio                 | Existe                  | Funcional             | Brechas                                                                |
|--------------------------|-------------------------|-----------------------|-------------------------------------------------------------------------|
| `DgiiXmlBuilder`         | Sí (en `service.ts`)    | **Esqueleto**         | Falta orden XSD, ~40 campos obligatorios/opcionales, bug `<DetallesItems>` doblado. |
| `DgiiXmlValidator`       | No                      | —                     | Falta cargar XSD y validar.                                            |
| `DgiiXmlSigner`          | Stub                    | No                    | Falta carga de .p12 cifrado, descifrar password, firmar XAdES-BES.     |
| `DgiiAuthService` semilla| **No existe**           | —                     | Falta GET semilla + POST validarsemilla + cache token.                  |
| `DgiiReceptionService`   | Stub (`submitToDgii`)   | No                    | Falta multipart + Authorization Bearer.                                |
| `DgiiStatusService`      | Stub (`getTrackStatus`) | No                    | Falta GET por TrackId y persistencia.                                  |
| `DgiiPdfService`         | No                      | —                     | Falta render PDF.                                                       |
| `DgiiQrService`          | No                      | —                     | Falta URL QR DGII.                                                      |
| `DgiiSequenceService`    | No                      | —                     | Falta import + next_number atómico.                                     |
| `DgiiSettingsService`    | No                      | —                     | Falta CRUD `dgii_settings`.                                             |
| `DgiiCertificateService` | No                      | —                     | Falta upload cifrado y storage.                                         |
| `DgiiCertificationService`| No                     | —                     | Falta panel pre-certificación.                                          |
| `CashClosingEcfService`  | No                      | —                     | Falta porcentaje configurable + selección + auditoría.                  |

## 6. Seguridad de secretos

- **Root `.gitignore`**: estado tras pull cubría `.env*`, `.vercel`, `.scratch-*`,
  `*.p12`, `*.pfx`, `*.key`, `*.pem`, `*.crt`. **Faltaban** `*.cer`, `*.der`,
  `*.cert`, `certificates/`. **Reforzado en este PR** — se añaden las cuatro
  entradas faltantes. Único `.gitignore` del repo (no hay uno propio en
  `apps/web/` ni en `packages/`).
- **Service `import "server-only"`**: ✅ ya tiene el guard que impide bundlear el certificado al cliente.
- **`isDgiiConfigured()`**: ✅ valida path y password antes de operar.

## 7. Estado general

- `DATA_SOURCE=mock` por defecto en `env.ts` (zod default).
- `dgii_enabled = false` en businesses.
- Banner visible y honesto en `/dgii` indica que el módulo está inactivo.
- Ningún servicio realiza llamadas reales a DGII todavía.
- El stub está bien organizado para evolucionar sin tocar la UI.

## 8. Resumen de brechas (orden de severidad)

1. **`DgiiXmlBuilder`** no cumple XSD ni orden de tags — bloqueante para Fase 3.
2. **`DgiiXmlValidator`** inexistente — bloqueante para Fase 4.
3. **`DgiiXmlSigner`** stub — bloqueante para Fase 5.
4. **`DgiiAuthService` semilla** inexistente — bloqueante para Fase 6.
5. **Envío + status** stubs — bloqueante para Fase 7.
6. **PDF + QR** inexistentes — bloqueante para Fase 8.
7. **Tres ambientes (`testecf|certecf|ecf`)** — `env.ts` sólo tiene dos.
8. **Tablas DB** inexistentes para todo lo DGII y POS fiscal.
9. **Porcentaje configurable en cierre de caja** inexistente.
10. **`dgii_settings`, `dgii_certificates`, `dgii_sequences`** sólo UI, no persisten.
11. **Pre-certificación / panel certificación** inexistente.
12. **`.gitignore` de `apps/web/`** sin certs (root cubre, pero conviene reforzar).
13. **`closed_without_ecf` / `pending_cash_closing`** estados ausentes en tipos.
14. **Reportes fiscales** inexistentes (sólo stats en cards).
15. **Aprobación comercial e-CF recibidos** inexistente.

## 9. Lo que NO se debe tocar todavía

- El service `DgiiService` para escribir lógica real (firma, envío, status).
- El form de carga de certificado.
- Ningún cambio que persista en Supabase real (`DATA_SOURCE=mock` permanece).
- El stub `signXml` debe seguir lanzando `DgiiNotImplemented` hasta Fase 5 con certificado.
- Las URLs DGII no se invocan (ni `testecf` siquiera).
- No se mueve el `dgii_enabled` flag.

## 10. Lo que SÍ se ajusta en esta rama (cambios seguros)

Quedan documentados como tareas; sólo los pequeños se aplican aquí mismo:

- ✅ Crear `docs/dgii/` con: este reporte, `plan-integracion-dgii.md`,
  `matriz-requisitos-dgii.md`, `requisitos-facturacion-electronica-dgii.md`,
  `xsd/e-CF-31-v1.0.xsd`.
- ✅ Reforzar `.gitignore` del root con `*.cer`, `*.der`, `*.cert`,
  `certificates/` que faltaban tras el pull.
- 📝 Documentar las brechas en la matriz y dejarlas como TODOs para PRs
  futuros.

Todo lo demás se deja para PRs subsiguientes con autorización explícita.
