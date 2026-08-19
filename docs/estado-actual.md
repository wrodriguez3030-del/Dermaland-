# Estado actual — DermaLand

> Snapshot de qué está hecho. Actualizar al cerrar cada cambio
> importante. Léelo después de `CLAUDE.md` y `PROJECT_MEMORY.md`.

**Última actualización:** 2026-08-19

## 2026-08-19 · Checklist del cierre + proformas en el reporte (v0.137.0)

- **Cierre**: sección "Antes de cerrar" — ventas cobradas ✓, borradores ⚠
  (enlace a Ventas), crédito ℹ (queda en CxC), pedidos web sin facturar ⚠.
  Informa, no bloquea. Regla pura `cash-close-checklist.ts` (4 pruebas) +
  `countWebOrdersToInvoice`.
- **Reporte de ventas**: las proformas ahora SALEN por defecto (con e-CF en
  demo, todas las ventas reales son proformas y el reporte salía vacío);
  el checkbox excluye, y la etiqueta avisa "Solo facturas".
- Validación: typecheck ✓ · 2878 tests ✓ (5 nuevos) · build ✓.

## 2026-08-19 · Cierre de caja fácil (v0.136.0)

- Asistente de cierre: conteo por denominaciones (total se suma solo),
  esperado a la vista, diferencia en vivo con color y botón que la nombra;
  al cerrar ofrece el **ticket 80mm** (`/caja/historial/[id]/print`, también
  desde el historial). Lógica pura en `features/sales/cash-count.ts`.
  API sin cambios. Diseño en
  `docs/superpowers/specs/2026-08-19-cierre-caja-facil-design.md`.
- Validación: typecheck ✓ · 2874 tests ✓ (6 nuevos) · build ✓.

## 2026-08-19 · "Tu ubicación" destacada en el checkout (v0.135.1)

- La tarjeta de ubicación del checkout ahora lleva fondo/borde de marca,
  icono en círculo y botón relleno. Typecheck ✓ · 2868 tests ✓ · build ✓.

## 2026-08-19 · Tarjeta OG del pedido compartido (v0.135.0)

- El enlace `/tienda/pedido/[token]` sale en WhatsApp con tarjeta profesional:
  logo del negocio (módulo de marca), nombre de la tienda (configuración),
  número y total del pedido (`opengraph-image.tsx` + `generateMetadata`).
  Token inválido = tarjeta genérica. Typecheck ✓ · 2868 tests ✓ · build ✓.

## 2026-08-19 · Barra de seguimiento en el detalle del ERP (v0.134.0)

- "Mover el pedido" enseña el mismo `OrderTimeline` del cliente encima de los
  botones de estado. Typecheck ✓ · 2868 tests ✓ · build ✓.

## 2026-08-19 · Aviso de pago por WhatsApp y correo (v0.133.0)

- En el detalle del pedido de tarjeta, con el enlace ya pegado, bloque
  **"Avisar al cliente"**: *Enviar por WhatsApp* (`wa.me` al número del
  pedido, mensaje puro probado en
  `features/storefront/order-payment-share.ts`) y *Enviar por correo*
  (`POST /api/pedidos-web/[id]/aviso-pago`, rol + auditoría
  `web_order.azul_link_notice`). Siempre se comparte la página del pedido
  (token firmado), nunca el enlace de Azul suelto.
- Validación: typecheck ✓ · 2868 tests ✓ (4 nuevos) · build ✓.

## 2026-08-19 · El enlace de Azul es POR PEDIDO (v0.132.0)

- **Descubierto:** el Link de Pagos de Azul lleva el monto **fijado al
  crearlo** (no hay parámetro de URL) y caduca; el enlace fijo del comercio
  nació con RD$500 y mandaba a todos a pagar eso.
- **Ahora:** cada pedido de tarjeta lleva su enlace
  (`web_orders.azul_payment_link_url`, mig `20260819180000` en prod). El admin
  lo genera en la App AZUL con el monto exacto (copiable en el detalle) y lo
  pega (`OrderAzulLinkForm` → `POST /api/pedidos-web/[id]/azul-link`, rol +
  validación de dominio + auditoría). Al pegarlo se avisa por correo. El
  cliente **verifica** el monto, ya no lo teclea; sin enlace, aviso honesto.
  El enlace de la configuración queda solo de interruptor del checkout.
- Diseño y plan en `docs/superpowers/{specs,plans}/2026-08-19-azul-enlace-por-pedido*`.
- Validación: typecheck ✓ · 2864 tests ✓ (4 nuevos de `canSetAzulLink`) · build ✓.

## 2026-08-19 · Comprobante con el texto de su método (v0.131.1)

- En el pedido pagado con tarjeta, el subidor decía "Comprobante de la
  transferencia". `ReceiptUpload` ahora recibe `metodo` y con tarjeta dice
  "Comprobante del pago" (captura de la confirmación de Azul). Typecheck ✓ ·
  2860 tests ✓ · build ✓.

## 2026-08-19 · Pago con enlace de Azul + checkout claro (v0.131.0)

- **Tarjeta por enlace de pago de Azul** en la tienda: el enlace del comercio
  se pega en la configuración (`business_web_settings.azul_payment_link_url`,
  migración `20260819120000`, aplicada a prod). Fail-closed y con el dominio
  validado en cliente y servidor. El pago ocurre en la página del pedido
  (`AzulPayBox`: total copiable + número de pedido + comprobante); el admin
  confirma aceptando el comprobante — el mismo riel de la transferencia. El
  POS preselecciona "Tarjeta" al facturar esos pedidos. La pasarela con API
  sigue apagada; ver `docs/pagos-en-linea.md` §0.
- **El checkout marca lo que falta**: botón siempre habilitado; al enviar con
  datos pendientes marca cada campo (aria-invalid + mensaje), resume junto al
  botón y se desplaza al primero. Regla pura probada en
  `features/storefront/checkout-missing-fields.ts`.
- Validación: typecheck ✓ · 2860 tests ✓ · build ✓.

## 2026-08-06 · Cierre de B-01, B-07 y B-04

Cierre de los tres bloqueadores restantes de `docs/production-readiness-report.md`
que dependían de prueba real, no de código sin verificar. Detalle técnico completo
en `.superpowers/sdd/2026-08-05-cierre-pendientes-produccion/task-{7,8,9}-report.md`;
esta entrada es el resumen con los números reales.

### B-01 · Respaldos — CERRADO

- `scripts/backup/dr-drill.mjs`: simulacro de un comando que restaura un respaldo
  fresco de producción en un arenero efímero (contenedor Docker desechable en
  `supabase-01`) y compara **7 dimensiones** contra producción. Veredicto real en
  `docs/dr-drill-20260805.md`: **PASA**.
- Números de la última corrida: **98 tablas rastreadas, 5.900 filas, 106 políticas
  RLS, 15 funciones, 219 índices, 325 restricciones, 0 errores de restauración, 0
  diferencias**.
- Verificado por auditoría independiente con **5 sabotajes distintos** (filas
  borradas, RLS apagada, índice eliminado, política cambiada a `USING (true)`, FK
  eliminada) → **los 5 detectados**. Reproducido con un arenero nuevo cada vez; el
  `system_identifier` del clúster destino cambia en cada corrida — es la prueba de
  que la restauración ocurre de verdad, no un resultado guardado.
- El arenero se autodestruye si el proceso local muere de golpe: verificado con
  `SIGKILL` real, destruido en **35 s** (contrato de 300 s, renovado en cada paso).
- **Lo que NO cubre, dicho a propósito:** `pg_dump` no exporta los roles del
  clúster (haría falta `pg_dumpall -g`) ni los **archivos binarios de Storage** —
  las 642 filas de `storage.objects` son metadatos; las fotos de producto viven
  fuera de la base.
- **El respaldo diario automático sigue DESACTIVADO** (`gh workflow disable`)
  hasta que la versión endurecida de `.github/workflows/backup.yml` llegue a
  `main`. Los secretos `SUPABASE_DB_URL` y `BACKUP_GPG_PASSPHRASE` ya están
  configurados; la passphrase está en el Llavero
  (`security find-generic-password -s dermaland-backup-gpg -w`).

### B-07 · Migraciones — CERRADO

- `scripts/audit-migrations.mjs` audita **por objeto contra la base real**, no
  por el historial de `schema_migrations`.
- Se recuperaron **4 migraciones** aplicadas en su día por `apply_migration` del
  MCP de Supabase que nunca dejaron un `.sql` en el repo (`ai_providers_module`,
  `product_images_storage_bucket`, `ecf_events_fk_restrict`, `0042_payments_azul`),
  reconstruidas **byte a byte** desde `schema_migrations.statements`.
- Se trajeron 2 migraciones de la rama DGII cuyos archivos solo vivían ahí.
- Se renombraron 5 archivos que **la CLI de Supabase saltaba en silencio** —
  `supabase db push` habría reconstruido una base sin las tablas `ai_*`, sin el
  bucket de imágenes, y reventando en `0003_dgii_pos.sql`. Hoy: **51 archivos, 0
  saltados**.
- Reconstrucción desde cero verificada en un PostgreSQL 17.6 vacío y desechable:
  **83 tablas frente a 83 de producción, delta cero**, 106 políticas con md5
  idéntico.
- **Pendiente del dueño:** autorizar `supabase migration repair` para los **14
  archivos «sin registro»** (9 ya `APLICADA`). No es para las 3 PARCIALES: esas
  **ya están registradas** y un `repair` sobre ellas no hace nada — lo que les
  falta son objetos que migraciones posteriores renombraron (verificado en
  producción: `products_barcode_unique` → `products_barcode_live_unique`,
  `businesses_select`/`clients_select` → `*_sel`/`_ins`/`_upd`/`_del`), drift
  cosmético que se revisa a mano. El bloqueo de los 14 es decidir su **versión
  de 14 dígitos**; la auditoría deliberadamente no la inventa.
- **2026-08-06 · Backfill de laboratorios — reducido de 45,1 % a 24,9 %.**
  `0017_backfill_product_laboratories.sql` tenía SQL inválido (`p` referenciado
  dentro del `ON` de un `JOIN` que no la incluía) y nunca corrió en ningún
  entorno; corregido moviendo la condición al `WHERE`. Pero el arreglo de
  sintaxis por sí solo solo cubría 8 de 611 productos: la mayoría de marcas
  reales del catálogo nunca estuvieron en la lista de 30 patrones de texto.
  Migración nueva (`20260806172849_backfill_laboratories_missing_brands.sql`):
  creó 12 laboratorios que faltaban (IDCP, Medihealth, Babé, Sensilis,
  Primaderm, Darrow, EltaMD, Colorescience, Rilastil, Neutrogena, Pilopeptan,
  Abravia) y vinculó `products.laboratory_id` por `brand_id` — dato
  estructurado ya limpio, no por texto del nombre. Resultado real: **1.018 de
  1.356 con laboratorio (75,1 %), 338 sin (24,9 %)**. Los 338 restantes **no
  tienen `brand_id` en absoluto** (ítems como "Melina Loción 100 ML" o
  "Vaseline Blueseal") — no es un problema de mapeo, es catalogación manual
  pendiente, fuera de alcance de un backfill automático.
  `country` y `min_shelf_life_days` de los 12 laboratorios nuevos quedan en
  `NULL` a propósito: es política de negocio (acuerdos de recepción con cada
  proveedor), igual que **67 de los 68** laboratorios ya sembrados en 0016.
  La regla de vencimiento por laboratorio sigue inerte donde no se configure
  el umbral, tengan o no productos vinculados — pendiente del dueño en
  Configuración → Laboratorios.

### B-04 · 2FA — CERRADO EN CÓDIGO, SIN DESPLEGAR

- 2FA obligatorio para `admin`, `super_admin` e `is_platform_admin`; opcional
  para el resto, con fail-open conservado para quien no está obligado.
- `scripts/mfa-break-glass.mjs`: retira el factor de **un** usuario nombrado,
  con confirmación interactiva y rastro en `audit_logs`. Probado contra Supabase
  real con usuarios desechables y TOTP verificado real: **16/16**.
- Durante el trabajo se cerró un **bypass completo del 2FA** (con la contraseña
  robada se podía retirar el factor de la víctima desde `/perfil/seguridad` y
  enrolar el propio) y **tres formas distintas de quedar encerrado fuera del
  sistema**, dos de ellas ya presentes en producción antes de esta tarea.
- **Pendiente del dueño, orden no negociable (spec §6.2):** 1) enrolar su propio
  2FA en `/perfil/seguridad`; 2) probar el break-glass contra su propia cuenta,
  con él presente; 3) autorizar el despliegue (merge `feat/cierre-pendientes-produccion`
  → `main`) en ese mismo momento.
- **Dato corregido respecto al informe anterior: son 3 administradores reales**
  en `auth.users`, no 2 (`wrodriguez3030@gmail.com`, `preview-admin@dermaland.do`,
  `cnttest-ct5jmp@example.com`), todos con `role: admin` en `app_metadata` y
  **ninguno con factor enrolado**. `cnttest-ct5jmp@example.com` es basura de una
  corrida de prueba vieja — decisión del dueño si se borra antes de encender el
  enforcement (ver `docs/riesgos.md`).

### Riesgos nuevos registrados

Ocho hallazgos quedaron como riesgos abiertos en `docs/riesgos.md`
(`R-SEC-02` a `R-SEC-07`, `R-BACKUP-01`, `R-BACKUP-02`): la cuenta de prueba con
rol admin, el preview-admin sin enrolar, la `service_role_key` como punto único
de fallo del 2FA, el enforcement solo en middleware (125 rutas de API y 6
acciones de servidor sin comprobar AAL), el `matcher` que deja pasar rutas con
extensión de imagen, `public.users.two_factor_enabled` sin escribir, el respaldo
diario desactivado, y PITR inexistente en plan Free.

## 2026-08-05 · B-07 — el repositorio vuelve a reconstruir el esquema

- **El agujero:** `supabase/migrations/` tenía **47** archivos, pero el
  historial de producción (`supabase_migrations.schema_migrations`) registraba
  **cuatro migraciones que nunca dejaron un `.sql`**: se aplicaron en su día con
  `apply_migration` del MCP de Supabase. Con ellas fuera del repositorio, el
  repositorio **no reconstruía producción desde cero**: faltaban el módulo de
  Proveedores de IA, el bucket de fotos de producto, la tabla de pagos y el
  `ON DELETE RESTRICT` del historial fiscal.
- **La auditoría por objeto** (`scripts/audit-migrations.mjs` →
  `docs/migration-audit-20260805.md`) las identificó comparando lo que declara
  cada archivo contra lo que existe de verdad en la base, no por nombre.
- **Recuperadas (47 → 51 archivos):**

  | Archivo | Versión en el historial | Qué trae |
  |---|---|---|
  | `20260711182946_ai_providers_module.sql` | `20260711182946` | 4 tablas `ai_*` + 4 índices + RLS por `business_id` |
  | `20260803010512_product_images_storage_bucket.sql` | `20260803010512` | bucket `product-images` (público en lectura) + 4 policies en `storage.objects` |
  | `20260804195156_0042_payments_azul.sql` | `20260804195156` | tabla `payments` + 8 índices + RLS + `revoke` de escritura a `anon`/`authenticated` |
  | `20260805020813_ecf_events_fk_restrict.sql` | `20260805020813` | FK de `ecf_document_events` → `ON DELETE RESTRICT` |

- **De dónde salió el DDL:** de la columna `statements` del propio historial —
  el SQL **literal** que se ejecutó — contrastado después objeto por objeto
  contra el catálogo vivo. No se inventó ni una línea.
- **El nombre lleva delante la versión registrada, y eso NO es renumerar.** La
  CLI de Supabase lista las migraciones locales con `/^([0-9]+)_(.*)\.sql$/` y
  **salta en silencio** (solo aviso por stderr) las que no casan. Con el nombre a
  secas, `supabase db push` —el procedimiento de `docs/supabase-setup.md`, y el
  remedio que el informe de producción nombra para B-07— ignoraba tres de los
  cuatro archivos y reconstruía una base **sin las tablas `ai_*`, sin el bucket
  `product-images` y con el `ON DELETE CASCADE` que `ecf_events_fk_restrict`
  vino a quitar**. El cuarto era peor: `0042_payments_azul.sql` sí casaba, pero
  la CLI derivaba versión `0042` y nombre `payments_azul` —que no existen en el
  historial— así que `db push` lo habría **reaplicado** a producción. Con el
  prefijo `<versión>_`, la CLI deriva exactamente la versión y el nombre que ya
  guarda `schema_migrations`: el viaje de ida y vuelta es exacto y no se inventa
  ningún número.
- **La prueba:** los **51** archivos se aplicaron en orden sobre un PostgreSQL
  **17.6 vacío** (contenedor desechable `supabase/postgres:17.6.1.132`,
  destruido al terminar). **50 de 51 aplican limpio.** La huella de los objetos
  de las cuatro migraciones recuperadas (154 líneas: columnas, índices,
  constraints, policies, RLS, bucket y grants) salió **idéntica** entre la base
  reconstruida y producción.
- **`0002a_clients.sql` caía en la misma trampa — corregido, pero NO con el
  mismo remedio.** La `a` de `0002a` rompía `/^([0-9]+)_/`, así que la CLI
  también lo saltaba; y como crea la tabla `clients`, de la que dependen otras
  **8** migraciones, con `db push` la reconstrucción reventaba en
  `0003_dgii_pos.sql` con un error que no señalaba la causa.
  **Anteponerle su versión registrada (`20260519205927_`) lo empeora:** los
  prefijos de 14 dígitos ordenan después de todos los de 4, así que `clients`
  se iba al final y los fallos pasaban de **1 a 23**. Tampoco sirve ningún
  `0002X_`: cualquier dígito ordena antes del `_` en ASCII (`'9' < '_'`), así
  que `00021_` cae antes de `0002_`. El único prefijo que ordena **entre**
  `0002_` y `0003_` es `00030_`, y ese es el que lleva:
  **`00030_0002a_clients.sql`**. Conserva exacto lo que importa —la CLI deriva
  `name = 0002a_clients`, el nombre con que figura en el historial— y el
  `00030` es de la misma naturaleza que los `0001`…`0046` del resto: ninguno de
  esos 46 números es tampoco la versión registrada.
- **Los 51 archivos son visibles para la CLI.** Barrido de los 51 nombres contra
  `/^([0-9]+)_(.*)\.sql$/`: **0 se saltan** (antes se saltaban 4, y luego 1).
  Es lo único que demuestra que B-07 quedó cerrado por la vía documentada
  (`supabase db push`) y no solo por un bucle de `psql`.
- **La reconstrucción es completa, no solo aplicable:** la base levantada desde
  cero con los 51 archivos tiene **83 tablas en `public`** y producción tiene
  **83**, con **diferencia cero** en ambos sentidos.
- **Hallazgo aparte — `0017_backfill_product_laboratories.sql` NO es aplicable.**
  Su `UPDATE products p ... FROM alias a JOIN laboratories l ON ... = p.business_id`
  es SQL inválido: la tabla objetivo no se puede referenciar desde el `ON` de un
  `JOIN` del `FROM`. Falla siempre, en cualquier base. Encaja con que la
  auditoría la marque `INDETERMINADA` y sin fila en el historial: **nunca corrió
  en ningún sitio**. Es un backfill de datos (asignar laboratorio por el nombre
  del producto), no crea objetos, así que no afecta la reconstrucción del
  esquema — pero el backfill que prometía **no se hizo** (611 de 1356 productos
  siguen sin laboratorio). **Se deja fallando a propósito:** es una decisión de
  negocio del dueño, no técnica, y que la prueba se detenga ahí hace visible un
  problema real en vez de taparlo.
  *(Actualización 2026-08-06: el bug de sintaxis se corrigió en el mismo
  archivo — nunca se había registrado, sin riesgo de desajuste — y se cerró el
  hueco real por otra vía. Ver la entrada de arriba.)*
- **Nota sobre el entorno de prueba:** la imagen `supabase/postgres` trae los
  roles y los esquemas, pero no `auth.jwt()` ni las tablas de `storage` (en la
  nube las crean GoTrue y storage-api). Se añadieron al contenedor como andamio
  con las definiciones oficiales de Supabase, **fuera del repositorio**; sin
  ellas fallaban por entorno seis migraciones ya existentes (0038, 0040, 0041,
  0045, 0046) además de la recuperada `0042_payments_azul`.
- **Sigue pendiente** lo que la auditoría dejó a decisión humana: las
  migraciones `APLICADA` sin fila en el historial necesitan que alguien decida
  su versión de 14 dígitos antes de poder correr `supabase migration repair`.
  Eso es contabilidad del historial, no un agujero de reconstrucción.

## 2026-06-18 · R-SEC-01 Leaked Password Protection — riesgo aceptado (plan Free)

- **Warning Supabase Security Advisor → Auth:** *Leaked password protection is
  currently disabled.* Solo activable en **Supabase Pro+** (cruce HaveIBeenPwned).
  **No se corrige con SQL ni migración** — es una feature de la capa Auth, se
  activa en el Dashboard tras subir a Pro.
- **Control compensatorio implementado:** política de contraseña fuerte
  (`apps/web/src/lib/auth/password-policy.ts`): ≥12 chars, mayúscula, minúscula,
  número, símbolo y rechazo de contraseñas comunes. Cableada en el script
  `scripts/bootstrap-preview-supabase-user.mjs` (valida la password seed, nunca
  la imprime) y disponible para formularios. Aviso interno en
  `/admin/configuracion` (sección Seguridad).
- **Estado:** riesgo aceptado en dev/preview; **bloqueante para producción SaaS
  real** si no se sube a Pro o no se implementa mitigación equivalente.
- **Documentación completa + checklist de upgrade a Pro:** `docs/security.md`.
  No hay formulario de registro/cambio de contraseña en la app todavía (usuarios
  por script); la utilidad queda lista para cuando se agregue.

## 2026-05-29 · Correcciones Supabase Security Advisor (migración 0008)

- **Migración `supabase/migrations/0008_security_advisor_fixes.sql`** —
  100% no destructiva e idempotente. NO toca DGII real, NO testecf,
  NO XML, NO certificados, NO datos. Solo metadatos de objetos y
  reorganización de policies RLS preservando la semántica exacta de
  acceso multi-tenant.
- **Warnings corregidos por SQL:**
  1. **Security Definer View** · `public.inventory_stock_by_lot` →
     `security_invoker = true` (la view ahora respeta la RLS de
     `product_lots` del usuario que consulta; antes la bypaseaba →
     riesgo cross-tenant).
  2. **Auth RLS Initialization Plan** · `public.audit_logs` →
     `auth_business_id()`/`auth.uid()` envueltos en `(select ...)`
     (InitPlan, una sola evaluación por query).
  3. **Function Search Path Mutable** · `select_lot_for_sale`,
     `auth_business_id`, `auth_is_platform_admin`,
     `reserve_ecf_sequence_number` → `set search_path = public, auth,
     extensions` (sin cambiar cuerpo ni security model; siguen
     SECURITY INVOKER).
  4. **Multiple Permissive Policies** · `plans`, `businesses`,
     `branches`, `users`, `clients` → consolidadas a una policy por
     comando (select/insert/update/delete). Unión por OR preserva el
     acceso previo; auth.*() envueltas en `(select ...)`.
- **Warning que requiere acción MANUAL en Dashboard (no por SQL):**
  - **Leaked Password Protection Disabled** → Supabase Dashboard →
    Authentication → Settings → Security → activar "Leaked password
    protection" (HaveIBeenPwned). Ver runbook.
- **Aislamiento multi-tenant confirmado por diseño:** todas las
  policies siguen filtrando por `business_id = auth_business_id()`
  (o `id = auth_business_id()` en `businesses`); platform admin
  mantiene su alcance; ningún cambio abre acceso cross-business.
- **Validaciones:** `typecheck` ✅ · `vitest run` 446/446 ✅ ·
  `build` ✅. Sin referencias en código/tests a los nombres de policy
  renombrados.
- **Migración `0009_rls_initplan_remaining.sql`** (follow-up autorizado
  2026-05-29): envuelve `auth_business_id()`/`auth_is_platform_admin()`
  en `(select ...)` en las **34 policies `_all` restantes** (incl.
  tablas DGII como `dgii_certificates`, `ecf_sequences`,
  `dgii_submissions`). Vía `ALTER POLICY`, behavior-preserving, no
  destructivo, no fiscal. Cierra el resto de warnings "Auth RLS Init
  Plan".
- **APLICADO 2026-05-29** por el dueño vía **SQL Editor** del proyecto
  `sntcvyozbhrgicwmtcoh` (sin credenciales en sesión; el MCP apuntaba a
  otro proyecto y `SUPABASE_DB_URL` estaba en placeholder). Verificación
  SELECT-only confirmada (6/6):
  1. `inventory_stock_by_lot` → `security_invoker=true` ✅
  2. view consultable ✅
  3. 4 funciones con `search_path` fijo ✅
  4. multiple permissive → 0 filas ✅
  5. auth RLS init-plan sin envolver → 0 filas ✅
  6. policies siguen filtrando por `business_id` (sin `qual=true`) ✅
  - **Leaked Password Protection:** NO activable — feature solo en
    Supabase **Pro+**, el proyecto está en **Free**. Aceptado como riesgo
    temporal **R-SEC-01** (`docs/riesgos.md`); mitigación: passwords
    fuertes, no reutilizar, rotar seeds, MFA, y upgrade a Pro antes de
    producción SaaS real. No se crean más migraciones por este warning.
    **Producción Vercel y env intactos.**

## 2026-05-21 · QA SaaS pre-Fase G APROBADO (14/14)

- **Checklist QA browser-based ejecutado manualmente** sobre el
  Preview `https://dermaland-igsr1gdv4-wrodriguez3030-4801s-projects.vercel.app`
  (commit `c02d714`).
- **Resultado: 14/14 criterios técnicos verdes** — login, wizard
  carga, panel "Pendiente antes de enviar a DGII testecf", paso 1
  cert digital (8 steps incluyendo `xsd_valid`), paso 2 config
  fiscal, paso 4 pruebas locales (4 tipos e-CF), paso 8
  autorización representante (banner pre-fill + 9 ítems con
  evidencia + declaración formal), gate `ready_for_testecf`
  bloquea/desbloquea correctamente, CTA "Enviar pruebas a DGII
  testecf" sigue disabled aún con todo verde, mensajes MOCK / NO
  FISCAL visibles, `audit_logs` recibe inserts (migración 0007
  funcionando).
- **Fase G sigue bloqueada por política operativa** hasta confirmar
  formalmente las 4 validaciones externas no técnicas:
  1. Acta / designación oficial Usuario Administrador e-CF.
  2. Certificado vigente y válido (>60 días + sin revocación).
  3. Titular del cert autorizado para representar el RNC.
  4. RNC emisor correcto para el contribuyente.
- **Producción Vercel intacta** · 0 env vars · `DATA_SOURCE=mock`
  por default · sin DGII real · sin testecf · sin envío XML · sin
  consumo de secuencias reales · sin `vercel deploy --prod` · sin
  cambios de DNS.
- **Commit del cierre del QA:** ver branch
  `feature/dgii-module-review-adjustments` (último commit de docs
  documenta esta aprobación).
- **Documentación detallada:**
  - `docs/dgii/qa-saas-pre-fase-g.md` (623 LOC) — checklist 13
    secciones + bloque de aprobación 2026-05-21 al inicio.
  - Resultado por sección: tabla 14×PASS.

**Próximo paso natural:** completar las 4 validaciones externas
(acta firmada por contador, vigencia del cert, autorización del
titular, RNC emisor). Recién con esas 4 + el QA técnico aprobado
tendría sentido conversar sobre autorizar Fase G (envío real a
testecf).

## 2026-05-20 (madrugada) · Preview Supabase QA 11/11 verde

- **QA automatizado del preview**: las 11 rutas del checklist
  devuelven **200** con sesión válida del seed user. Sin sesión las
  rutas protegidas devuelven 307 → `/login`. Middleware Supabase
  comportándose correctamente.
- **`/api/health`** confirma runtime: `env=production`,
  `data_source=supabase`, `integrations.supabase=true`.
- **Login REST** via `POST /auth/v1/token?grant_type=password` →
  JWT con `app_metadata.business_id`,
  `app_metadata.role=admin`,
  `app_metadata.is_platform_admin=false`. Coincide con lo seteado
  en el bootstrap.
- **Cookie `@supabase/ssr`** construida manualmente:
  `sb-<project_ref>-auth-token = "base64-" + base64(JSON.stringify(session))`.
  ~2.1 KB. Usada en curl para superar middleware.
- **Bug fix seed user**: GoTrue requiere strings vacíos (no NULL)
  en columnas de token (`confirmation_token`, `recovery_token`,
  etc.). Inserciones con SQL crudo deben hacer `COALESCE(col, '')`.
  El script `scripts/bootstrap-preview-supabase-user.mjs` no tiene
  ese problema porque Admin SDK setea los defaults.
- **Vercel Protection Bypass**: usado el secret existente del
  proyecto (registrado previamente) en header
  `x-vercel-protection-bypass` para QA via curl. La env var
  `VERCEL_AUTOMATION_BYPASS_SECRET` que agregamos requiere también
  toggle de Dashboard que NO tocamos.
- **Production sin cambios** (0 env vars en Vercel Project).
- **Validaciones locales**: typecheck ✅, build ✅, vitest 382/382.

## 2026-05-19 (noche tarde) · Preview Supabase con auth real

- **Vercel Preview desplegado** con `DATA_SOURCE=supabase` (env vars
  limitadas a la branch `feature/dgii-module-review-adjustments`).
  URL: `https://dermaland-1h96y60m8-wrodriguez3030-4801s-projects.vercel.app`.
  Status: `Ready`, target `preview`, 197 λ functions en `iad1`.
- **Producción intacta**: Vercel Project sigue con **0 env vars** →
  `DATA_SOURCE` defaultea a `mock` por el schema de `lib/env.ts`.
- **Auth Supabase real** con un solo usuario seed:
  `preview-admin@dermaland.do` con `role='admin'`, business y branch
  del seed mock. Claims (`business_id`, `role`, `is_platform_admin`,
  `branch_id`, `branch_ids`, `full_name`) en `raw_app_meta_data` +
  `raw_user_meta_data`. Password generada localmente, persistida
  en `apps/web/.env.local` (gitignored).
- **Migración `0006_auth_helpers_jwt_metadata.sql`** — actualiza
  `auth_business_id()` y `auth_is_platform_admin()` para leer del
  JWT en orden: root → `app_metadata` → `user_metadata`. Sin esto,
  RLS bloquearía todas las queries con `auth_business_id() = null`.
- **Script `scripts/bootstrap-preview-supabase-user.mjs`** —
  idempotente, requiere `SUPABASE_SERVICE_ROLE_KEY` real (no es
  obligatorio para el preview actual, pero queda listo).
- **Validación funcional via curl bloqueada** por Vercel SSO
  Deployment Protection (`set-cookie: _vercel_sso_nonce`). El usuario
  debe abrir el preview en browser autenticado. La app build pasó
  (197 lambdas, typecheck/build/vitest 382/382 localmente).
- **Hallazgo corregido**: el bloqueador "stubs Supabase rompen
  `/pos`/`/caja/cierre`/etc." era falso. Esas rutas son client-only
  + localStorage y no invocan `getRepositories()`. Solo
  `/api/inventory-counts/sync` y la server action de
  `/dgii/configuracion` usan adapters; el primero usa stubs (no
  bloquea preview) y el segundo ya tiene implementación real.

## 2026-05-19 (noche) · Fase C — regen `database.types.ts` + base completa en Supabase

- **Hallazgo:** el proyecto Supabase `sntcvyozbhrgicwmtcoh` (URL
  `https://sntcvyozbhrgicwmtcoh.supabase.co`) estaba realmente
  **vacío** al iniciar la sesión — 0 tablas en `public`, 0
  migrations registradas. La aplicación de Fase C documentada en
  el bloque "tarde" del 2026-05-19 no estaba presente. Posible
  reset del proyecto entre sesiones.
- **Set completo de migraciones re-aplicado** vía
  `mcp__supabase__apply_migration` (Claude Code) en orden:
  `0001 → 0002 → 0002a_clients → 0003 → 0004 → 0005`. MCP
  Supabase autenticado por OAuth.
- **Nueva migración `0002a_clients.sql`** committeada en el
  repo. Define la tabla `clients` (CRM mínimo, RLS por
  business_id) que `proformas.customer_id` y
  `electronic_invoices.customer_id` referencian en 0003. Sin
  esta migración intermedia, un fresh-apply de 0003 fallaba con
  `relation "clients" does not exist`.
- **Fix `0002_phase2_inventory.sql`** en el repo: la vista
  `inventory_stock_by_lot` filtraba por `where deleted_at is
  null` pero `product_lots` no tiene esa columna (el descarte
  lógico vive en `status`). Se quita el `WHERE` para que un
  fresh-apply funcione en cualquier proyecto vacío.
- **Counts post-aplicación:** 43 tablas en `public`, 19
  tablas DGII/POS, 18 permisos, 7 roles, 59 role_permissions —
  coincide con la matriz esperada de Fase C.
- **`database.types.ts` regenerado** desde el proyecto Supabase
  vía `mcp__supabase__generate_typescript_types` — 3.372 líneas,
  103 KB, reemplaza el esqueleto manual previo (sólo
  `businesses`). Commit `0cad04b`.
- **`.mcp.json` en `.gitignore`** — config MCP no se publica a
  GitHub (decisión confirmada por el usuario).
- **`.claude/` en `.gitignore`** — harness local fuera del repo.
- **Validaciones:** `typecheck` ✅, `build` ✅ (78 páginas,
  middleware 89.4 kB), `vitest` ✅ 382/382 en los dos commits.
- **`DATA_SOURCE=mock` intacto** local y en Vercel; Vercel env
  sigue vacío; DGII real no tocado; certificado `.p12` no usado;
  sin deploy producción.

## 2026-05-19 (tarde) · Fase C — migraciones DGII aplicadas en Supabase

- Tres migraciones aplicadas manualmente desde Supabase Dashboard
  SQL Editor (`.scratch-fase-c-combined.sql`, una sola transacción):
  - `0003_dgii_pos.sql` — 19 tablas DGII/POS + función
    `reserve_ecf_sequence_number` + RLS por tenant
    (`business_id = auth_business_id()`).
  - `0004_dgii_permissions_seed.sql` — 18 permisos DGII/cash.
  - `0005_dgii_role_permissions_seed.sql` — 7 roles + 59 pares
    rol→permiso (super_admin 18, admin 18, manager 12, cashier 4,
    inventory 0, supervisor 3, auditor 4).
- Validador in-transaction confirmó los counts exactos antes del
  `COMMIT`; el usuario reportó "aplicado, counts OK".
- **Repo:** working tree limpio en commit `12d7963`. No se generaron
  cambios de código en este paso. `pg` (intentado para apply
  automatizado) y `scripts/apply-fase-c-migrations.mjs` fueron
  removidos al cierre — la ruta automatizada vía Node falló por
  placeholders en `.env.local`.
- **`DATA_SOURCE=mock` intacto** local y en Vercel (project
  `dermaland` sigue con **cero environment variables**).
- **`database.types.ts` NO regenerado** — `SUPABASE_PROJECT_REF` es
  placeholder; pendiente para cuando el usuario llene credenciales
  reales.
- Pendientes documentados para completar Fase C: real
  `SUPABASE_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN` + ejecutar
  `supabase gen types` + commit `"Aplicar tipos Supabase para DGII"`.
- **No se tocó** DGII real, no se usó cert real, no se desplegó a
  producción. Fases G/H siguen bloqueadas.

## 2026-05-19 · Asistente de habilitación DGII (mock)

- Nueva ruta `/dgii/habilitacion` — wizard/checklist vertical con 6
  pasos (postulación, pruebas e-CF, representaciones impresas, URLs de
  servicios, declaración jurada, asignación roles + NCF).
- Cada paso tiene checklist propio, 7 estados (`pending`,
  `in_progress`, `completed`, `blocked`, `requires_user_action`,
  `requires_accountant_validation`, `requires_dgii_validation`),
  estado configurable por el usuario, link a módulo relacionado.
- Persistencia en `localStorage` vía
  `apps/web/src/features/dgii/enablement-store.ts`. Producción: migrar
  a tabla `dgii_enablement_progress` con RLS por business.
- Catálogo declarativo en
  `apps/web/src/lib/mock-data/dgii-enablement.ts` (6 pasos + URLs de
  servicios planificadas + permisos relevantes).
- Componentes nuevos en `apps/web/src/components/dgii/`:
  `enablement-step-card.tsx`, `enablement-status-badge.tsx`.
- Sidebar nav DGII ahora muestra "Habilitación" como primer item.
- 31 tests nuevos (382 totales). Pasos con `requiresDgii=true` quedan
  marcados `blocked` hasta Fase G/H.
- NO toca Supabase real, NO envía a DGII, NO firma con cert real.

## 2026-05-13 · Restauración a versión completa + deploy prod

- Versión completa copiada de `C:\Users\Admin\OneDrive\Escritorio\dermaland\`
  hacia ruta canónica `C:\dev\dermaland\` (228 archivos, 0 secretos).
  Origen intacto.
- Next.js bump 15.1.6 → **15.5.18** (Vercel bloqueaba 15.1.6 por CVE).
- Rama `feature/restore-complete-project` creada y pushada a
  `https://github.com/wrodriguez3030-del/Dermaland-`.
- `main` fast-forward (no `--force`) usando merge `-s ours
  --allow-unrelated-histories` para preservar la Fase 0 como segundo padre.
- Deploy producción en Vercel ✅: `https://dermaland.vercel.app` —
  13/13 rutas devuelven 200, `/` ya no es la landing de Fase 0.
- Detalle del proceso: `docs/deploy-vercel.md`,
  `docs/comparacion-versiones.md`.

**Anterior última actualización:** 2026-05-07

## Fases completadas

| Fase | Descripción | Resultado |
|---|---|---|
| 0 | Scaffold del monorepo pnpm + Next.js 15 + Tailwind 4 | ✅ |
| 1-8 | MVP navegable — 75 rutas con mock data | ✅ |
| P1 | Backend prep — repos + Supabase clients + tipos de dominio | ✅ |
| P2 | Auth prep — server actions + middleware + página `/login` | ✅ |
| P3 | RLS — 2 migraciones + `docs/rls-policy.md` | ✅ |
| P4 | Scanner real — BarcodeDetector + ZXing + Bluetooth | ✅ |
| P5 | Offline PWA — IndexedDB queue + sync + sw.js | ✅ |
| P6 | DGII service stubs + service.ts | ✅ stubs |
| P7 | WhatsApp service stubs + webhook handler | ✅ stubs |
| P8 | IA service — tools registry + bloqueo de agendamiento | ✅ stubs |
| P9 | Tests — vitest unit + Playwright smoke | ✅ |
| P10 | CI/CD — `.github/workflows/ci.yml` | ✅ |
| P11 | Documentación — 8 docs técnicas en `docs/` | ✅ |
| (extra) | Hydration fix de impresión de proformas | ✅ 2026-05-07 |
| (extra) | Sistema de agentes (10 agentes + workflow) | ✅ 2026-05-07 |
| (extra) | Rediseño POS + reglas documentales + selector de pago | ✅ 2026-05-07 |
| (extra) | Memoria persistente del proyecto | ✅ 2026-05-07 |

## Módulos creados

### Tenancy

- `Business` (RNC, plan, estado)
- `Branch` (sucursal con dirección)
- `Warehouse` (almacén dentro de sucursal)

### Usuarios / roles

- `User` con `role`: `super_admin · admin · manager · cashier ·
  inventory · supervisor · auditor`.
- `RoleDefinition`, `Permission`, `AuditLog`.
- Super-Admin shell separada en `(super-admin)/`.

### Catálogo

- `Brand`, `Laboratory`, `Category`.
- `Product` con foto, registro sanitario, ITBIS por producto, forma
  farmacéutica, presentación, ingrediente activo.
- `ProductLot` con vencimiento, cantidad, status.

### Inventario

- `InventoryStockByLot`, `InventoryMovement`.
- Conteo físico: `InventoryCount`, `InventoryCountScan`,
  `InventoryCountItem`.
- FEFO en `selectFefoLot`.
- Lotes vencidos bloqueados en POS.

### CRM

- `Customer` con `defaultBillingType`, `skinType`, `consents`.
- `CustomerNote`.
- Detección de duplicados por documento.

### Ventas

- `Proforma` (con `documentKind`, `ecfType`, `sequenceType`).
- `SaleItem`, `Payment`.
- `CashRegisterSession`.
- `resolveDocumentToIssue` (función pura testeada).

### Recomendaciones

- `SkinType`, `SkinCondition`, `RoutineTemplate`, `Recommendation`.

### SaaS

- `Plan`, `PlanLimits`, `Subscription`, `UsageCounter`.

### Servicios

- `WhatsappTemplate`, `WhatsappConversation`, `WhatsappMessage`.
- `AIAgent`, `AIActionLog`, registry de tools, bloqueo de agendamiento.
- `ApiKey`, `Webhook` (esqueleto API V3).
- `DgiiSequence`, `ElectronicInvoice` (stubs).

## Rutas existentes (78 páginas en build)

### Públicas / auth

- `/login`

### App shell `(app)`

- `/` (dashboard)
- `/admin/auditoria · /admin/configuracion · /admin/empresa ·
   /admin/permisos · /admin/roles · /admin/sucursales · /admin/usuarios`
- `/api-v3 · /api-v3/keys`
- `/caja · /caja/historial`
- `/clientes · /clientes/[id] · /clientes/[id]/editar · /clientes/nuevo`
- `/conteo-fisico · /conteo-fisico/[id] · /conteo-fisico/[id]/movil ·
   /conteo-fisico/nuevo`
- `/devoluciones`
- `/dgii · /dgii/certificado · /dgii/configuracion · /dgii/envios ·
   /dgii/facturas · /dgii/secuencias`
- `/ia · /ia/agentes · /ia/conversaciones · /ia/logs`
- `/inventario · /inventario/almacenes · /inventario/bajo-stock ·
   /inventario/cuarentena · /inventario/movimientos · /inventario/por-lote ·
   /inventario/recall · /inventario/vencimientos`
- `/notas-credito`
- `/pagos`
- `/pos`
- `/productos · /productos/[id] · /productos/[id]/editar ·
   /productos/categorias · /productos/laboratorios · /productos/marcas ·
   /productos/nuevo`
- `/proformas · /proformas/[id]/print`
- `/recomendaciones · /recomendaciones/[id] ·
   /recomendaciones/condiciones · /recomendaciones/nueva ·
   /recomendaciones/rutinas · /recomendaciones/tipos-piel`
- `/reportes · /reportes/caja · /reportes/clientes · /reportes/conteos ·
   /reportes/inventario · /reportes/productos · /reportes/ventas`
- `/ventas`
- `/whatsapp · /whatsapp/conversaciones · /whatsapp/enviados ·
   /whatsapp/plantillas`

### Super-Admin shell `(super-admin)`

- `/super-admin · /super-admin/branding · /super-admin/modulos ·
   /super-admin/negocios · /super-admin/pagos · /super-admin/planes ·
   /super-admin/suscripciones · /super-admin/uso`

### API

- `/api/health`
- `/api/whatsapp/webhook`
- `/api/inventory-counts/sync`

## Componentes importantes

### UI primitives (`apps/web/src/components/ui/`)

- `button`, `card`, `input`, `badge`, `table`, `tabs`,
  `confirm-dialog`, `empty-state`, `filter-bar`, `row-actions`,
  `search-input`, `sortable-table-header`, `stat-card`, `toast`,
  `bar-chart`, `use-local-soft-delete`.

### Layout (`apps/web/src/components/layout/`)

- `AppShell`, `Sidebar`, `Header`, `OfflineStatusPill`, `PageHeader`.

### Features

- `pos/pos-terminal.tsx` — terminal completo, rediseñado.
- `sales/document-resolver.ts` — función pura de reglas documentales.
- `sales/proforma-store.ts` — store en `localStorage`.
- `sales/components/receipt-80mm.tsx` — ticket térmico.
- `customers/customer-store.ts` + `customer-search-select.tsx` +
  `new-customer-form.tsx` + `billing.ts` + `utils/duplicate-detection.ts`
  + `utils/search-clients.ts`.
- `products/product-store.ts` + `components/product-image.tsx`.
- `inventory/lot-badges.tsx`.
- `inventory-counts/mobile-scanner` + hooks + `offline` + `sync`.

### Server

- `server/auth/` — context, actions (`signIn`, `signOut`, MFA), middleware.
- `server/repositories/` — types · mock · supabase · factory.
- `server/services/dgii/` · `whatsapp/` · `ai/` (con tools registry).

### Tipos

- `apps/web/src/types/index.ts` — todos los tipos del dominio.

## Tests existentes

| Archivo | Cubre |
|---|---|
| `apps/web/src/features/customers/customer-store.test.ts` | Persistencia y operaciones del store |
| `apps/web/src/features/customers/utils/duplicate-detection.test.ts` | Detección de duplicados por documento |
| `apps/web/src/features/customers/utils/search-clients.test.ts` | Búsqueda de clientes |
| `apps/web/src/features/sales/document-resolver.test.ts` | Reglas documentales (consumo · crédito fiscal · todos los métodos) |
| (otros) | Hooks, helpers, utilidades — total **111 tests** en 9 archivos |

Smoke browser:

- `apps/web/tests/hydration-proforma-print.mjs` — Playwright headless,
  detecta hydration mismatch en `/proformas/[id]/print`.
- `apps/web/tests/pos-flow-smoke.mjs` — Playwright headless, valida
  selector de pago, indicador de documento, botón dinámico, aviso CF
  sin RNC.

E2E (Playwright `tests/e2e/`):

- Smoke principal pasando en CI.

## Qué funciona en local

```
typecheck  ✅  pnpm --filter web typecheck
build      ✅  pnpm --filter web build  → 78/78 páginas
test       ✅  pnpm --filter web test   → 111 tests pasando
dev        ✅  pnpm --filter web dev    → http://localhost:3031
```

Smoke HTTP a las rutas críticas (todas en 200):

- `/`, `/clientes`, `/clientes/nuevo`, `/productos`, `/productos/nuevo`,
  `/inventario`, `/conteo-fisico`, `/pos`, `/proformas`, `/ventas`,
  `/super-admin`, `/api/health`.

Smoke browser:

- `/proformas/[id]/print` — 0 hydration issues.
- `/pos` — 11/11 checks (sin método pre-seleccionado, indicador
  documento dinámico, botón dinámico, aviso CF sin RNC, 0 hidratación).

## Qué falta para producción

Ver `docs/proximos-pasos.md` para la lista priorizada. Resumen:

1. Conectar Supabase real.
2. Migrar mocks a repositorios Supabase.
3. DGII real (secuencias, certificado, envío).
4. WhatsApp Cloud API real.
5. IA real (OpenAI / Claude).
6. CI/CD verde end-to-end.
7. Cerrar `docs/production-checklist.md`.
