# QA Preview — Módulo DGII (mock)

> **Fecha:** 2026-05-19
> **Preview base:** `https://dermaland-asl5rh5xw-wrodriguez3030-4801s-projects.vercel.app`
> **Branch:** `feature/dgii-module-review-adjustments`
> **Commit antes de QA:** `f4c60e9`
> **Objetivo:** Validar el flujo DGII mock end-to-end antes de
> autorizar Fase C (Supabase) / Fase G (envío real) / Fase H
> (consulta status).

## 1. Rutas revisadas

| #  | Ruta                  | Tipo   | Estado QA | Notas                                                                 |
|----|-----------------------|--------|-----------|-----------------------------------------------------------------------|
| 1  | `/dgii`               | Server | ✅ OK     | Banner "Módulo DGII inactivo" visible; CTAs a configuración/reportes. |
| 2  | `/dgii/habilitacion`  | Client | ✅ OK     | Wizard 6 pasos; banner mock + leyenda 7 estados; progress bar.        |
| 3  | `/dgii/configuracion` | Client | ✅ OK     | Banner "Persistencia preparada"; selector 3 ambientes + warning prod. |
| 4  | `/dgii/secuencias`    | Server | 🛠 Fix    | **No tenía banner mock** — agregado en este QA.                       |
| 5  | `/dgii/facturas`      | Client | 🛠 Fix    | **No tenía banner mock** ni aclaración de "Anular" — agregado.        |
| 6  | `/dgii/certificacion` | Client | ✅ OK     | 3 banners (mock + no fiscal + cert dummy); evidencias listas/pendientes. |
| 7  | `/dgii/reportes`      | Client | ✅ OK     | Multiples menciones MOCK; filtros + agregados; "Datos locales del navegador (demo)". |
| 8  | `/admin/permisos`     | Server | ✅ OK     | Banner "X permisos DGII/caja preparados como MOCK"; matriz roles.     |
| 9  | `/pos`                | Server | ✅ OK     | Sin promesas DGII reales; arranca como proforma. Sin banner explícito (se justifica: POS hoy es 100% proforma). |
| 10 | `/caja/cierre`        | Client | ✅ OK     | Banner "MODO MOCK"; recordatorio fiscal; advertencias % parcial.      |

**Extras observados (no en lista pero accesibles):**

| Ruta              | Estado QA | Notas                                                              |
|-------------------|-----------|--------------------------------------------------------------------|
| `/dgii/envios`    | 🛠 Fix    | **No tenía banner mock** — agregado.                               |
| `/dgii/certificado` | 🛠 Fix  | Form de subida estaba activo sin handler real — **deshabilitado** y badge "Bloqueado · Fase C". |

## 2. Estado de cada ruta (detalle)

### `/dgii` — landing
- Banner amber con `dgii_enabled = false` y explicación POS↔proforma.
- 4 StatCards con `accepted` / `submitted` / `rejected` / sequences `expiring`.
- Badges de tipos e-CF habilitados (31/32/33/34 + tipos de compra).
- CTAs `Pre-certificación`, `Reportes fiscales`, `Configuración fiscal`.

### `/dgii/habilitacion` — wizard nuevo
- Banner mock principal y leyenda con los 7 estados visuales.
- Progress bar global + tarjeta "Próximo paso recomendado".
- 6 step cards con acordeón: checklist por paso, select de estado,
  botón "Ir al módulo", botón "Marcar completado".
- Paneles auxiliares: URLs servicios DGII (planificadas) +
  permisos DGII/caja relevantes (CTA a `/admin/permisos`).
- Persistencia en `localStorage` (`dermaland.dgii-enablement-progress`).
- Botón "Reiniciar" en el header con `confirm()`.

### `/dgii/configuracion` — fiscal settings
- Banner "Persistencia preparada" explica `DATA_SOURCE=mock` (memoria
  proceso) vs `supabase` (futuro UPSERT a `dgii_settings`).
- Form con razón social, RNC, dirección, provincia/municipio
  (selectores), teléfono, email, ambiente (testecf/certecf/ecf).
- Warning rojo cuando se selecciona ambiente `ecf` mencionando la
  columna `dgii_enabled_real_send` (default false).
- Estado del módulo = "Inactivo" hasta cargar cert.

### `/dgii/secuencias` — listado
- **Antes:** Tabla cruda sin banner.
- **Ahora:** Banner amber "Secuencias MOCK / DEMO — no fiscales" +
  explicación de que la carga real se habilita en Fase C.

### `/dgii/facturas` — listado e-CF
- **Antes:** Sin banner. Acción "Anular" con `confirm({ message })`
  prometía "Generará Nota de Crédito (e-CF tipo 34) por el monto
  total" pero solo llamaba un toast.
- **Ahora:** Banner amber explica que el listado es mock y que
  "Anular" solo dispara un toast (no consume secuencia ni envía NC
  a DGII). El confirm dialog del row preserva la explicación.

### `/dgii/certificacion` — pre-certificación
- 3 banners visibles arriba (mock, no fiscal, cert dummy).
- Card "Ambiente activo: testecf (mock)" como recordatorio constante.
- Tabla 31/32/33/34 con run/PDF/XML signed/unsigned/QR.
- Footer técnico explica el endpoint `/api/dgii/certificacion/run-test`
  y declara que Fase G (envío DGII) sigue bloqueada.

### `/dgii/reportes` — reportes
- Header amplio con badge MOCK.
- Filtros (fechas, tipo, estado).
- Agregados, StatCards, tablas por tipo + estado.
- Sección "Datos locales del navegador (demo)" muestra proformas
  + cierres del `localStorage`.
- "Secuencias e-NCF (mock)" con copia "no se consumen en este modo".

### `/admin/permisos` — RBAC
- Banner amber "X permisos DGII / caja preparados como MOCK"
  declarando que **NO se enforcean en runtime** hasta Fase C.
- Catálogo agrupado por módulo; categorías DGII primero.
- Matriz de asignación inicial por rol (los 7 roles × 18 permisos
  DGII/caja con `roleHasPermission()`).
- Sección "Obligatorios cuando Supabase / RLS estén activos" con
  bloques de alta-riesgo bien marcados.

### `/pos` — POS
- Sin promesa de e-CF real. Header explícito: "Toda venta nace como
  proforma. FEFO automático."
- `PosTerminal` no llama DGII; las proformas viven en `localStorage`
  vía `proforma-store`.
- **Recomendación:** No requiere banner adicional — el modelo de
  proforma + comprobante no fiscal está alineado con el resto del
  módulo. La conversión a e-CF ocurre solo desde `/caja/cierre`.

### `/caja/cierre` — cierre fiscal
- Banner amber "Cierre de caja en MODO MOCK. No se envía ningún
  e-CF a DGII".
- Card lateral "Recordatorio fiscal" con badge MOCK y aclaración:
  "las proformas no sustituyen comprobantes fiscales cuando
  legalmente corresponda emitirlos".
- % editable con presets 0/25/50/75/100.
- Comentario **requerido** si % < 100; el botón "Confirmar cierre"
  queda `disabled` hasta cumplir la regla.
- Avisos contextuales para % = 0 y % parcial mencionan validación
  con contador.

## 3. Problemas visuales encontrados

- **PV-01** `/dgii/secuencias` se veía como vista de producción.
  **Resuelto:** banner amber agregado.
- **PV-02** `/dgii/facturas` parecía mostrar facturas reales; la
  descripción del header decía "Cada uno lleva XML firmado, TrackID,
  código QR y representación impresa".
  **Resuelto:** banner amber agregado clarificando que el listado y
  la acción "Anular" son mock.
- **PV-03** `/dgii/envios` mencionaba "Si DGII tarda > 1h se activa
  modo contingencia" sin aclarar que la cola es sintética.
  **Resuelto:** banner amber agregado.
- **PV-04** `/dgii/certificado` mostraba el form de subida **activo**
  (file input + password + botón "Subir") sin handler. Riesgo: un
  usuario podía intentar cargar un `.p12` real, pensar que se guardó
  y que algo ocurrió.
  **Resuelto:** form completo deshabilitado (`disabled`,
  `aria-disabled`) + badge "Bloqueado · Fase C" en el título +
  copy reescrita.

## 4. Problemas funcionales encontrados

- **PF-01** Ningún `fetch` directo a `dgii.gov.do` desde código de
  páginas o server actions (`grep` confirmado: 0 matches en patrón
  `fetch.*dgii.gov.do`). Las únicas referencias son strings/URLs de
  configuración y URLs públicas de QR (`ConsultaTimbre`, que las
  imprime el PDF para que el cliente escanee — no se llaman).
- **PF-02** `service.ts` declara `baseUrl` para DGII pero todos los
  métodos lanzan `DgiiNotConfigured("certificado .p12 no cargado")`.
  Cualquier intento real desde código hoy explota de forma
  predecible — no hay caminos silenciosos.
- **PF-03** No hay handler de upload activo en `/dgii/certificado`
  (el `<form>` original tampoco tenía `onSubmit`). El riesgo era
  visual, no funcional. Cerrado con el `disabled` propagado.

## 5. Textos que deben mejorar (resueltos en este QA)

- `/dgii/secuencias` description: se mantiene "Rangos autorizados
  por DGII…" pero ahora el banner explicita que son **demo**.
- `/dgii/facturas` description sigue describiendo el contenido
  ideal del e-CF; el banner deja claro que el listado es mock.
- `/dgii/envios` description sigue describiendo la cola real; el
  banner declara que los TrackID son sintéticos.
- `/dgii/certificado`: card "Subir certificado" reescrita con copy
  explícita "form deshabilitado hasta autorizar la subida real".

**Pendiente (no aplicado en este QA):** revisar con el contador si
las descripciones del header de cada pantalla deberían cambiar a
versión "futuro condicional" (ej. "Mostrará rangos autorizados…")
en lugar de presente. Por ahora preferimos mantener la descripción
"de producción" + banner mock claro encima, para que el usuario
entienda hacia dónde va el módulo.

## 6. Botones / acciones peligrosas deshabilitadas

| Ubicación              | Acción                  | Estado actual                               |
|------------------------|-------------------------|---------------------------------------------|
| `/dgii/certificado`    | Subir `.p12`            | **Deshabilitado** (`disabled` + badge).     |
| `/dgii/certificado`    | Contraseña / confirmación | **Deshabilitado**.                        |
| `/dgii/configuracion`  | Guardar settings        | Activo, repositorio mock (memoria proceso). |
| `/dgii/configuracion`  | Cambiar ambiente a `ecf` | Activo + warning rojo + nota sobre `dgii_enabled_real_send`. |
| `/dgii/facturas`       | Anular e-CF             | Activo — solo toast, sin efecto fiscal.     |
| `/dgii/habilitacion`   | Marcar paso completado  | Activo, solo afecta `localStorage` local.   |
| `/dgii/habilitacion`   | Reiniciar progreso      | Activo con `confirm()`.                     |
| `/caja/cierre`         | Confirmar cierre        | Activo, requiere comentario si % < 100.     |
| `/dgii/certificacion`  | Run test (31/32/33/34)  | Activo, llama `/api/dgii/certificacion/run-test` (cert dummy). |

**No hay** botones que disparen llamadas reales a DGII. Validado por
ausencia total de `fetch`/`axios` apuntando a `*.dgii.gov.do`.

## 7. Confirmación: todo sigue mock

- `DATA_SOURCE` continúa en `mock` (no autorizado cambiar).
- Stores con persistencia local:
  - `dermaland.proformas` (proforma-store)
  - `dermaland.sales` (sales-store)
  - `dermaland.cash-closings` (cash-closing-store)
  - `dermaland.dgii-certification-evidences` (certification-store)
  - `dermaland.dgii-credit-notes` (credit-note-store)
  - `dermaland.dgii-enablement-progress` (enablement-store ← nuevo)
- Repositorio activo: mocks en memoria + persistencia en proceso
  para `dgii_settings` (se pierde al reiniciar el server).
- Pre-certificación corre offline contra cert dummy generado en
  runtime (`server/services/dgii/demo-cert.ts`).

## 8. Confirmación: no se usa DGII real

- Grep `fetch.*dgii\.gov\.do` → **0 matches** en código de app.
- Grep `axios.*dgii\.gov\.do` → **0 matches**.
- Las únicas apariciones de `ecf.dgii.gov.do` son:
  - URL del QR (texto que se imprime en el PDF para que el cliente
    pueda escanear con su app — no se hace fetch).
  - Configuración de `baseUrl` en `service.ts` que solo se leería
    cuando los métodos no lancen `DgiiNotConfigured`.
- Test guard en `dgii-enablement.test.ts` verifica que la URL base
  del wizard apunta a Vercel y NO a `dgii.gov.do`.

## 9. Confirmación: no se usa certificado real

- Form de subida en `/dgii/certificado` deshabilitado en este QA.
- No existe lectura de archivos `.p12` / `.pfx` en `apps/web/src`:
  - Las únicas menciones son strings descriptivos en UI/copy.
  - `signer.ts` usa `node-forge` con el cert dummy de `demo-cert.ts`.
  - `service.ts` lanza `DgiiNotConfigured("certificado .p12 no
    cargado")` antes de intentar firmar nada real.
- `.gitignore` raíz incluye `*.p12 *.pfx *.key *.pem *.crt *.cer
  *.der *.cert certificates/`.
- Verificación pre-commit: `git ls-files --others --exclude-standard`
  filtrado por estos patrones → 0 matches.

## 10. Confirmación: no se toca Supabase real

- Migraciones SQL en disco (`0003`, `0004`, `0005`) **no aplicadas**.
- `DATA_SOURCE=mock` intacto.
- Server actions usan `getRepository()` que sigue devolviendo el
  mock repository.
- `supabase db push` jamás ejecutado en esta rama.

## 11. Ajustes recomendados antes de Fase C

- **A-01** Cuando Fase C esté autorizada, aplicar migraciones en
  orden: `0003` (core DGII) → `0004` (catálogo `permissions`) →
  `0005` (`roles` + `role_permissions`). El test
  `role-permissions-sync.test.ts` se debe ejecutar contra el schema
  real para detectar drift.
- **A-02** Reemplazar el badge "Persistencia preparada" en
  `/dgii/configuracion` por estado real cuando `DATA_SOURCE=supabase`.
- **A-03** Conectar `/dgii/secuencias` al repo Supabase con
  `UPDATE ... SET next_number = next_number+1 RETURNING` atómico.
- **A-04** Habilitar el form de `/dgii/certificado` con server action
  que cifre el `.p12` con AES-256-GCM antes del INSERT. Requiere
  variable `DGII_CERT_ENCRYPTION_KEY` en Vercel.
- **A-05** Migrar `enablement-store` (hoy localStorage) a tabla
  `dgii_enablement_progress` con `business_id` + RLS por tenant.
- **A-06** Endpoints internos `/api/dgii/{recepcion,aprobacion-comercial,
  status,health}` — implementar handler real cuando Fase G/H se
  autorice; hoy ni siquiera existen como stubs.

## 12. Pendientes para el contador

| ID    | Pregunta                                                                | Origen          |
|-------|-------------------------------------------------------------------------|-----------------|
| C-01  | e-CF 31 vs 32 por defecto en este negocio                                | matriz §15 F-01 |
| C-02  | Plazo legal para convertir proforma → e-CF                              | matriz §15 F-02 |
| C-03  | ¿Es lícito convertir solo un % de proformas? ¿Mínimo legal?              | matriz §15 F-03 |
| C-04  | ¿Quién autoriza % < 100? ¿Doble firma?                                  | matriz §15 F-04 |
| C-05  | ¿Cuándo es legal `closed_without_ecf` o se elimina el estado?            | matriz §15 F-05 |
| C-06  | Redondeo ITBIS por línea vs por totales                                  | matriz §15 F-06 |
| C-07  | Retenciones ITBIS / ISR — ¿aplican al modelo de negocio?                | matriz §15 F-07 |
| C-08  | Plazo y motivos válidos de NC (e-CF 34)                                  | matriz §15 F-08 |
| C-09  | Propinas legales en MontoGravado o impuesto adicional                    | matriz §15 F-09 |
| C-10  | Anulación de e-CF aceptado (proceso ante DGII)                           | matriz §15 F-10 |
| C-11  | Validar matriz rol→permiso DGII/caja (`/admin/permisos` tabla inicial)  | sesión 2026-05-19 |
| C-12  | Validar que la habilitación paso 5 (declaración jurada) cubre el alcance | sesión 2026-05-19 |

## 13. Pendientes para DGII (oficial)

| ID    | Pregunta / acción oficial                                                              | Origen                  |
|-------|----------------------------------------------------------------------------------------|-------------------------|
| D-01  | XAdES-BES vs XMLDSig enveloped — confirmar requerimiento oficial                       | matriz §14 D-11         |
| D-02  | Reportar typo en XSD oficial e-CF 31 línea 476 (`" IndicadorServicio…"`)              | matriz §14 D-12         |
| D-03  | Confirmar significados de `CodigoModificacion` 1..5 para e-CF 33/34                    | matriz §14 D-14         |
| D-04  | Confirmar set oficial de pre-certificación (hoy se corre fixtures internos)            | matriz §10 D-08         |
| D-05  | Confirmar URLs producción del contribuyente (paso 4 del wizard) — se registran formal | habilitación paso 4     |
| D-06  | Confirmar formato/contenido de declaración jurada (paso 5 del wizard)                  | habilitación paso 5     |
| D-07  | Aprobar postulación del contribuyente (paso 1 del wizard)                              | habilitación paso 1     |

## 14. Recomendación final

**✅ LISTO para Fase C** condicional a:

1. Autorización explícita del usuario para correr `supabase db push`
   con migraciones `0003 + 0004 + 0005`.
2. Definición de `DGII_CERT_ENCRYPTION_KEY` en Vercel Env (production
   + preview) antes de habilitar el form de `/dgii/certificado`.
3. Validación contable de los pendientes **C-01 a C-12** o, al
   menos, de C-01/C-04/C-05 (los que cambian el modelo de cierre).
4. Plan de rollback documentado por si la migración produce drift
   con el repo activo.

**❌ Fase G/H — NO listas todavía.**
Requieren la postulación oficial DGII + URLs registradas + cert
real + autorización explícita para llamar a `testecf` (Fase G) y
`status` (Fase H). El wizard ya las deja marcadas como
`requires_dgii_validation` / `blocked`, lo cual está bien.

**Ajustes aplicados en este QA:** 4 (banners en
secuencias/facturas/envios + lockdown del form de cert).
**Ajustes pendientes para usuario/contador:** ver §11 / §12 / §13.
