# Fase C — Checklist para aplicar migraciones Supabase

> **Fecha:** 2026-05-19
> **Branch:** `feature/dgii-module-review-adjustments`
> **Commit base de la rama:** `4d9dd96` (QA mock aprobado).
> **Estado actual:** ✅ **Paso 1 completado** — migraciones aplicadas
> manualmente desde Dashboard SQL Editor el 2026-05-19. Pasos
> restantes (regen tipos, `DATA_SOURCE=supabase`, Vercel env) siguen
> **bloqueados** hasta autorización explícita.

## Cierre del Paso 1 — 2026-05-19

| Item                                       | Resultado                       |
|--------------------------------------------|---------------------------------|
| Método usado                               | Dashboard SQL Editor (Ruta B)   |
| `0003_dgii_pos.sql`                        | ✅ aplicada                     |
| `0004_dgii_permissions_seed.sql`           | ✅ aplicada                     |
| `0005_dgii_role_permissions_seed.sql`      | ✅ aplicada                     |
| Validador in-transaction                   | ✅ pasó (19/18/7/59)            |
| Tablas DGII creadas                        | 19                              |
| Permisos DGII/cash insertados              | 18 (`dgii:*` + `cash:*`)        |
| Roles insertados                           | 7                               |
| Pares `role_permissions`                   | 59                              |
| Working tree del repo                      | Limpio en commit `12d7963`      |
| `DATA_SOURCE` local                        | `mock` (sin cambio)             |
| Variables en Vercel                        | Ninguna (sin cambio)            |
| `database.types.ts` regenerado             | ❌ No (placeholders en .env)    |
| Tipos pendientes                           | `SUPABASE_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN` reales para correr `supabase gen types` |
| DGII real (HTTP testecf / ecf)             | ❌ NO tocado                    |
| Certificado real                           | ❌ NO subido                    |
| Deploy producción                          | ❌ NO realizado                 |

**Comando de verificación (Dashboard SQL Editor) para auditar más tarde:**

```sql
select 'permissions'      as t, count(*) from public.permissions where code like 'dgii:%' or code like 'cash:%'
union all select 'roles',              count(*) from public.roles
union all select 'role_permissions',   count(*) from public.role_permissions
union all select 'dgii_settings',      count(*) from public.dgii_settings
union all select 'electronic_invoices', count(*) from public.electronic_invoices;
-- Esperado: 18, 7, 59, 0, 0
```

**Snapshot Supabase recomendado:** confirmar que existe el backup
"pre-fase-c-2026-05-19" en Database → Backups.

## 0. Resúmenes ejecutivos

### 0003_dgii_pos.sql (767 líneas)

- **Crea 18 tablas / 1 función** (`reserve_ecf_sequence_number`):
  - `dgii_settings` (settings fiscales por business; 1:1 con businesses)
  - `dgii_certificates` (metadata cert, blob cifrado o path Storage)
  - `ecf_sequences` (rangos NCF autorizados)
  - `payment_methods` (catálogo formas de pago)
  - `cash_registers`, `cash_register_sessions` (caja física)
  - `proformas`, `proforma_items`, `proforma_payments`
  - `cash_closings`, `cash_closing_sales`,
    `cash_closing_percentage_logs` (cierre + auditoría %)
  - `proforma_to_ecf_logs` (trazabilidad inmutable)
  - `electronic_invoices`, `electronic_invoice_items`
  - `dgii_submissions`, `dgii_status_logs`
  - `dgii_received_ecf`, `dgii_commercial_approvals`
- **RLS:** activada en las 18 tablas con políticas
  `business_id = auth_business_id()` (función definida en 0001).
- **FKs circulares:** `proformas.electronic_invoice_id`,
  `cash_closing_sales.electronic_invoice_id`,
  `proforma_to_ecf_logs.electronic_invoice_id` declaradas
  `DEFERRABLE INITIALLY DEFERRED` para insertar en misma transacción.
- **No-destructivo:** todo `create table if not exists` + `add
  constraint`. **No** hay `DROP`, `DELETE`, `TRUNCATE` ni
  modificación de columnas existentes.
- **Idempotencia:** parcial. `create table if not exists` es idempotente,
  pero `alter table add constraint` **fallará si la constraint ya
  existe** (PostgreSQL no soporta `IF NOT EXISTS` en `add
  constraint` para FKs nombradas). Si necesitas re-aplicar,
  envuelve los `alter table` en `do $$ ... exception when
  duplicate_object then null; end $$;` o usa migración separada.
- **Seeds:** ninguno (lo dice la "Nota 1" al final del archivo).
- **Depende de:** `0001_phase1_core.sql` (tablas `businesses`,
  `branches`, `users`, `clients`, `products`, `product_lots` +
  funciones `auth_business_id()`, `auth_is_platform_admin()`).
- **Riesgo:** medio. Sumar 18 tablas a una DB con datos en vivo es
  100% aditivo; el único riesgo real es que las FKs hacia tablas de
  0001/0002 (e.g. `products`, `product_lots`, `clients`) requieran
  que esas tablas ya estén pobladas si el seed posterior referencia
  algo — pero 0003 no inserta nada.

### 0004_dgii_permissions_seed.sql (68 líneas)

- **Crea 1 tabla** (`permissions`) si no existe + activa RLS +
  política de lectura abierta (`for select using (true)`).
- **Inserta 18 permisos DGII/caja** con `on conflict (code) do
  nothing`. Idempotente.
- **No-destructivo.** No toca usuarios, no toca roles, no cambia
  `dgii_enabled` en `businesses`. No inserta datos reales (RNC,
  certs, secuencias).
- **Depende de:** la tabla `permissions` (la crea defensivamente).
  No depende de 0003 — puede aplicarse en cualquier orden relativo
  a 0003, pero **el código TS asume 0003 ya aplicado** (no es bloqueo
  SQL, es UX).
- **Seeds:** los 18 codes en `DGII_RBAC_PENDING_KEYS` del repo TS.
  Sincronización custodiada por `users.test.ts`.
- **Rollback:** ver bloque comentado al final:
  ```sql
  DELETE FROM permissions WHERE code LIKE 'dgii:%' OR code IN
    ('cash:open','cash:close','cash:change_closing_percentage',
     'cash:authorize_below_100_percent','cash:reverse_closing');
  -- opcional:
  DROP TABLE IF EXISTS permissions CASCADE;
  ```

### 0005_dgii_role_permissions_seed.sql (184 líneas)

- **Crea 2 tablas** (`roles`, `role_permissions`) si no existen +
  RLS + policy read-all.
- **FK** `role_permissions.permission_code → permissions(code)` —
  requiere 0004 aplicada antes (si no, falla con "relation
  permissions does not exist").
- **Inserta 7 roles** (`super_admin`, `admin`, `manager`, `cashier`,
  `inventory`, `supervisor`, `auditor`) con `on conflict (code) do
  nothing`.
- **Inserta 59 pares** rol→permiso con `on conflict do nothing`.
  Distribución: super_admin 18 · admin 18 · manager 12 · cashier 4 ·
  inventory 0 · supervisor 3 · auditor 4.
- **No-destructivo.** No modifica `users`, no cambia `users.role`.
- **Depende de:** 0004 (FK a `permissions`).
- **Test de drift:** `apps/web/src/lib/mock-data/role-permissions-sync.test.ts`
  parsea este SQL y verifica byte-a-byte que coincida con
  `roleDefinitions` de `users.ts`.

## 1. Orden correcto de aplicación

```
0001 (ya aplicada)    → core + auth helpers
0002 (ya aplicada)    → inventario
0003_dgii_pos.sql     ← aplicar primero
0004_dgii_permissions_seed.sql ← luego
0005_dgii_role_permissions_seed.sql ← último
```

El orden importa por las FKs:
`role_permissions.permission_code → permissions.code` (0005 → 0004).
0003 es independiente de 0004/0005 a nivel SQL, pero **aplícalo
primero** para que las repositorios TS sigan funcionando coherentes.

## 2. Estado actual del entorno

| Item                              | Estado                       |
|-----------------------------------|------------------------------|
| Supabase CLI instalado            | **No global**, sí vía `npx supabase` (v2.100.1) |
| `supabase init` ejecutado         | **No** (sin `supabase/config.toml`, sin `.temp/`) |
| `supabase link --project-ref`     | **No** (sin `.temp/project-ref`) |
| `NEXT_PUBLIC_SUPABASE_URL` local  | `<set>` en `apps/web/.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | `<set>` en `apps/web/.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY`       | `<set>` en `apps/web/.env.local` |
| `SUPABASE_DB_URL`                 | `<set>` en `apps/web/.env.local` |
| `SUPABASE_PROJECT_REF`            | `<set>` en `apps/web/.env.local` |
| `DGII_CERT_ENCRYPTION_KEY`        | `<set>` en `apps/web/.env.local` |
| `DATA_SOURCE` local               | `<NOT set>` (= default `mock`)  |
| Variables en Vercel project       | **NINGUNA** (verificado: `vercel env ls` → "No Environment Variables found") |

**Implicación clave:** los preview deploys actuales (incluido el QA
aprobado) corren con `DATA_SOURCE=mock`. Para probar Fase C en preview
hay que añadir las variables al proyecto Vercel antes del próximo
deploy.

## 3. Riesgo de aplicar

| Riesgo                                                          | Nivel | Mitigación                                                                 |
|-----------------------------------------------------------------|-------|----------------------------------------------------------------------------|
| FKs hacia tablas de 0001/0002 que no existan                    | Bajo  | 0001/0002 ya aplicadas según el snapshot del repo.                         |
| `add constraint` no idempotente en 0003 (re-run falla)          | Medio | Si se re-aplica, usar el rollback documentado o ignorar el error de `42710`. |
| RLS bloquea queries existentes que iban contra `mock`            | Nulo  | `DATA_SOURCE=mock` no toca la DB; estos repos no se invocan hasta cambiar el flag. |
| Drift TS↔SQL después de aplicar                                  | Medio | `role-permissions-sync.test.ts` lo detecta inmediatamente.                 |
| Política de Storage para `certificates/` no creada              | Medio | 0003 referencia `pkcs12_storage_bucket='certificates'` pero **no** crea el bucket. Crear bucket privado antes de habilitar uploads reales (no en este checklist). |
| Función `auth_business_id()` espera JWT con `business_id`        | Bajo  | Sólo afecta cuando llegue tráfico autenticado real; mocks no la invocan.   |

**Veredicto:** riesgo **bajo-medio** si se aplica en orden + se
acepta el rollback documentado.

## 4. Rollback recomendado

### 4.1 Si falla 0005 (más probable: drift sync)
```sql
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
```
Y corregir el SQL/TS para restaurar la sincronización antes de
re-aplicar.

### 4.2 Si falla 0004
```sql
DELETE FROM permissions WHERE code LIKE 'dgii:%' OR code IN
  ('cash:open','cash:close','cash:change_closing_percentage',
   'cash:authorize_below_100_percent','cash:reverse_closing');
-- y opcional:
DROP TABLE IF EXISTS permissions CASCADE;
```

### 4.3 Si falla 0003 (peor caso — 18 tablas)
No hay script automático; las tablas son aditivas pero el rollback
manual requiere drops en orden inverso a las FKs. Plantilla:

```sql
-- En orden inverso a la creación
DROP TABLE IF EXISTS dgii_commercial_approvals CASCADE;
DROP TABLE IF EXISTS dgii_received_ecf CASCADE;
DROP TABLE IF EXISTS dgii_status_logs CASCADE;
DROP TABLE IF EXISTS dgii_submissions CASCADE;
DROP TABLE IF EXISTS electronic_invoice_items CASCADE;
-- (las 3 FK circulares se eliminan con CASCADE de electronic_invoices)
DROP TABLE IF EXISTS electronic_invoices CASCADE;
DROP TABLE IF EXISTS proforma_to_ecf_logs CASCADE;
DROP TABLE IF EXISTS cash_closing_percentage_logs CASCADE;
DROP TABLE IF EXISTS cash_closing_sales CASCADE;
DROP TABLE IF EXISTS cash_closings CASCADE;
DROP TABLE IF EXISTS proforma_payments CASCADE;
DROP TABLE IF EXISTS proforma_items CASCADE;
DROP TABLE IF EXISTS proformas CASCADE;
DROP TABLE IF EXISTS cash_register_sessions CASCADE;
DROP TABLE IF EXISTS cash_registers CASCADE;
DROP TABLE IF EXISTS payment_methods CASCADE;
DROP TABLE IF EXISTS ecf_sequences CASCADE;
DROP TABLE IF EXISTS dgii_certificates CASCADE;
DROP TABLE IF EXISTS dgii_settings CASCADE;
DROP FUNCTION IF EXISTS public.reserve_ecf_sequence_number(uuid, text, text);
```

**Recomendación:** snapshot/branch del proyecto Supabase **antes**
de aplicar (en Dashboard → Database → Backups → On-demand).

## 5. Métodos de aplicación

### 5.1 Recomendado: Dashboard SQL Editor (manual, paso a paso)

1. Abrir [Supabase Dashboard](https://supabase.com/dashboard) →
   proyecto del workspace → Database → SQL Editor.
2. Crear un snapshot "pre-fase-c" en Database → Backups antes de
   ejecutar nada.
3. Pegar y ejecutar **una migración a la vez**, en orden 0003 → 0004
   → 0005. Esperar el "Success. No rows returned" entre cada una.
4. Después de cada ejecución, validar en Table Editor que las tablas
   nuevas aparecen y que la lista de policies muestra las creadas.

### 5.2 Alternativa: Supabase CLI (`supabase db push`)

Requiere setup previo, **no autorizado hoy**:

```powershell
# 1. Inicializar (solo primera vez en este repo):
npx supabase init   # crea supabase/config.toml

# 2. Linkear al proyecto remoto:
npx supabase link --project-ref <ref>   # ref viene de SUPABASE_PROJECT_REF

# 3. Verificar plan sin aplicar:
npx supabase db diff --schema public

# 4. (Cuando estés listo y con autorización)
npx supabase db push
```

**Notas:**
- `supabase db push` aplica TODAS las migraciones pendientes (0003 +
  0004 + 0005 en este caso). Si querés ejecutar una sola usá
  SQL Editor + transacción manual.
- El CLI requiere `SUPABASE_ACCESS_TOKEN` (token personal del
  dashboard) en el shell, **no** la `SUPABASE_SERVICE_ROLE_KEY`.

### 5.3 Alternativa: `psql` directo

```powershell
# Con la URL en SUPABASE_DB_URL (NO la pegues en chat)
psql $env:SUPABASE_DB_URL -f supabase/migrations/0003_dgii_pos.sql
psql $env:SUPABASE_DB_URL -f supabase/migrations/0004_dgii_permissions_seed.sql
psql $env:SUPABASE_DB_URL -f supabase/migrations/0005_dgii_role_permissions_seed.sql
```

Útil para CI o para validar en local con `npx supabase start` (no
autorizado tampoco — implica levantar Docker).

## 6. Datos que necesitas tener listos antes de aplicar

- [ ] Snapshot "pre-fase-c" tomado en Dashboard → Backups.
- [ ] Una ventana del Dashboard SQL Editor abierta con permiso de
      escritura (rol `service_role` o admin del proyecto).
- [ ] Backup local del repo en este commit (`git rev-parse HEAD`).
- [ ] Acceso a `apps/web/.env.local` para alternar `DATA_SOURCE=mock|supabase`
      cuando vayas a probar.
- [ ] (Si querés probar en preview) acceso a Vercel project settings
      para añadir las env vars listadas en §10.

## 7. Verificación en Table Editor (post-aplicar)

Después de cada migración, Dashboard → Table Editor debe mostrar:

**Tras 0003:**
- `dgii_settings`, `dgii_certificates`, `ecf_sequences`,
  `payment_methods`, `cash_registers`, `cash_register_sessions`,
  `proformas`, `proforma_items`, `proforma_payments`,
  `cash_closings`, `cash_closing_sales`,
  `cash_closing_percentage_logs`, `proforma_to_ecf_logs`,
  `electronic_invoices`, `electronic_invoice_items`,
  `dgii_submissions`, `dgii_status_logs`, `dgii_received_ecf`,
  `dgii_commercial_approvals`.
- Cada una con el ícono de RLS activado.

**Tras 0004:**
- `permissions` con 18 filas (16 `dgii:*` + 2 `cash:*` aparte… en
  realidad 13 `dgii:*` + 5 `cash:*` = 18 filas).

**Tras 0005:**
- `roles` con 7 filas (super_admin … auditor).
- `role_permissions` con 59 filas.

Query de verificación rápida (Dashboard SQL Editor):

```sql
select 'permissions' as t, count(*) from permissions
union all select 'roles', count(*) from roles
union all select 'role_permissions', count(*) from role_permissions
union all select 'dgii_settings', count(*) from dgii_settings
union all select 'electronic_invoices', count(*) from electronic_invoices;
-- Esperado:
-- permissions = 18, roles = 7, role_permissions = 59, dgii_settings = 0, electronic_invoices = 0
```

## 8. Regenerar tipos TypeScript

`apps/web/src/server/db/database.types.ts` se generó cuando las
tablas DGII no existían. Después de aplicar 0003/0004/0005:

```powershell
# Sin Docker local (recomendado):
npx supabase gen types typescript --project-id <ref> --schema public > apps/web/src/server/db/database.types.ts

# Con CLI linkeado:
npx supabase gen types typescript --linked --schema public > apps/web/src/server/db/database.types.ts
```

Después correr:
```powershell
pnpm --filter web exec tsc --noEmit
pnpm --filter web exec vitest run
```

Si el typecheck rompe, los repositorios Supabase del DGII fueron
escritos contra una database.types vieja. Ajustar mappers en
`apps/web/src/server/repositories/supabase/dgii.ts`.

## 9. Probar en preview con `DATA_SOURCE=supabase`

Solo después de §7 + §8 verdes.

### 9.1 Local
```powershell
# En apps/web/.env.local — añadir o cambiar:
DATA_SOURCE=supabase

pnpm --filter web dev   # http://localhost:3031
# Probar /dgii/configuracion (form persiste a Supabase),
# /dgii/secuencias (vacío), /dgii/facturas (vacío), etc.
```

### 9.2 Preview Vercel
1. Vercel Dashboard → Project `dermaland` → Settings → Environment
   Variables → añadir para "Preview":
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (encrypted)
   - `DATA_SOURCE=supabase`
   - `DGII_CERT_ENCRYPTION_KEY` (encrypted) — opcional hasta Fase G.
   - `JWT_SECRET` (encrypted)
2. Push cualquier cambio o re-deployar: `vercel deploy --yes`
3. Validar las mismas rutas del QA mock — esta vez deberían persistir.

## 10. Variables Supabase necesarias

| Variable                              | Donde                | Para qué                              | Hoy            |
|---------------------------------------|----------------------|---------------------------------------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL`            | Server + Client      | Endpoint del proyecto                  | local set      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`       | Server + Client      | JWT anon para auth.users               | local set      |
| `SUPABASE_SERVICE_ROLE_KEY`           | Server-only          | Bypassa RLS para admin tasks           | local set      |
| `SUPABASE_DB_URL`                     | psql + CLI           | Connection string Postgres directa     | local set      |
| `SUPABASE_PROJECT_REF`                | CLI                  | `--project-ref` para link/gen types    | local set      |
| `DATA_SOURCE=supabase`                | Server-only          | Alterna repo mock → supabase           | local **NO**, Vercel **NO** |
| `JWT_SECRET`                          | Server-only          | `auth_business_id()` lee del JWT       | local set      |
| `DGII_CERT_ENCRYPTION_KEY`            | Server-only          | AES-256-GCM del `.p12`                 | local set      |

**Pendiente para Vercel:** todas las anteriores aún **no** existen en
el proyecto Vercel. Hay que añadirlas antes de hacer un preview con
`DATA_SOURCE=supabase`.

## 11. Volver a `DATA_SOURCE=mock` si algo falla

### Local
```powershell
# En apps/web/.env.local — quitar la línea o cambiar a:
DATA_SOURCE=mock

pnpm --filter web dev
```

Los repos mock no leen las tablas DGII, así que aunque las
migraciones estén aplicadas el sistema vuelve a comportarse como
siempre. El stack es seguro.

### Vercel preview
Settings → Environment Variables → editar `DATA_SOURCE` a `mock` o
borrarlo. Re-deploy.

### Reversión completa
Si decidís deshacer las migraciones, ejecutar los rollbacks de §4 en
Dashboard SQL Editor. **Antes** restaurar el snapshot "pre-fase-c"
del paso §5.1.

## 12. Pendiente para contador / DGII (heredados del QA)

Ver `docs/dgii/qa-preview-dgii-mock.md` §12 y §13. Items críticos a
resolver antes de habilitar Fase G/H:

- C-01..C-12: validación contable del modelo de cierre + roles
  permisos.
- D-01..D-07: postulación oficial, set de pruebas, URLs registradas
  ante DGII.

## 13. Checklist de pre-vuelo (marcar antes de pedir autorización)

- [x] 3 migraciones revisadas (§0).
- [x] Orden definido (§1).
- [x] Riesgo evaluado (§3).
- [x] Rollback documentado (§4).
- [x] Métodos de aplicación claros (§5).
- [x] Pasos de verificación (§7).
- [x] Regen tipos TS planificada (§8).
- [x] Plan de rollback a mock (§11).
- [ ] Snapshot Supabase tomado **antes** de aplicar.
- [ ] Variables Vercel añadidas al ambiente Preview.
- [x] Autorización explícita del usuario para ejecutar `supabase
      db push` o pegar los SQL en el Dashboard.
      **— Autorizado y aplicado el 2026-05-19 (Dashboard SQL Editor).**

## 14. Veredicto

**✅ PASO 1 COMPLETADO — DB Supabase con Fase C aplicada.**

Lo que se hizo:
1. Migraciones 0003 + 0004 + 0005 aplicadas manualmente en
   Dashboard SQL Editor (`.scratch-fase-c-combined.sql`, una sola
   transacción).
2. Validador in-transaction confirmó counts exactos
   (19 tablas / 18 permisos / 7 roles / 59 role_permissions).
3. Repo restaurado a working tree limpio en commit `12d7963`
   (intento de aplicación vía script Node + `pg` revertido al
   limpiar después).
4. Tipos TypeScript **no** regenerados — `.env.local` tiene
   placeholders en `SUPABASE_PROJECT_REF`. Los repos Supabase
   castean cliente como `any`, así que typecheck (382/382) sigue
   verde.

**Siguen bloqueados (no autorizados todavía):**
- Cambiar `DATA_SOURCE` a `supabase` (local + Vercel).
- Llenar `apps/web/.env.local` con credenciales reales.
- Variables en Vercel project.
- Regenerar `database.types.ts`.
- Fase G (envío real DGII testecf) / Fase H (status / TrackId).
- Subir certificado real `.p12`.
- Deploy producción / DNS.

**Siguientes pasos posibles (esperan autorización del usuario):**
1. **Completar Fase C – tipos TS:** llenar
   `SUPABASE_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN` reales en
   `apps/web/.env.local`; ejecutar `npx supabase gen types
   typescript --project-id <ref> > apps/web/src/server/db/database.types.ts`;
   commit `"Aplicar tipos Supabase para DGII"`.
2. **Smoke local con Supabase:** cambiar `DATA_SOURCE=supabase` en
   `apps/web/.env.local`, levantar dev server y validar que las
   pantallas DGII leen/escriben de las tablas reales. Volver a
   `mock` después.
3. **Preview Vercel con Supabase:** añadir env vars al proyecto
   Vercel + deploy preview.
4. **Fases G/H:** requieren postulación oficial DGII + cert real.
