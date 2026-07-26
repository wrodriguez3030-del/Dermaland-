# DermaLand · Backup y Restauración (DR)

> **Estado (2026-07-26):** proyecto Supabase `sntcvyozbhrgicwmtcoh` aún en **plan
> Free** → **sin backups automáticos ni PITR**. PERO se tomó y **verificó un
> respaldo lógico manual**:
> - **Backup:** `backups/rest-20260726-1432/` — **57/57 tablas, 3,168 filas**
>   (`rest-json-backup.mjs`).
> - **Verificado restaurable:** integridad referencial **11/11 OK, 0 FKs rotas**
>   (`verify-backup-integrity.mjs`).
> - ⚠️ **Acción del usuario:** copiar esa carpeta a **almacenamiento EXTERNO
>   cifrado** (contiene PII); está en `backups/` (gitignored, solo local).
>
> **Pendiente para DR pleno (elige uno):** (A) subir a **Supabase Pro** (backups
> diarios + PITR + desbloquea leaked-password) — recomendado; o (B) activar el
> **backup diario automático** ya creado en `.github/workflows/backup.yml`
> (solo falta el secreto `SUPABASE_DB_URL`). Y hacer **1 drill end-to-end** a un
> proyecto destino (Opción B0 abajo). Hoy el respaldo es manual, no recurrente.

## RPO / RTO objetivo del piloto

| Métrica | Objetivo piloto | Cómo se logra |
|---|---|---|
| **RPO** (dato máx. que se puede perder) | ≤ 24 h | Backup lógico diario (`pg_dump`) a almacenamiento externo |
| **RTO** (tiempo de recuperación) | ≤ 4 h | Restaurar el último dump a un proyecto Supabase nuevo + repuntar Vercel |
| **RPO con Supabase Pro** | ≤ 24 h (daily) o ≤ 2 min (PITR add-on) | Upgrade a Pro |

## Opción A — recomendada: subir a Supabase Pro (US$25/mes)

Habilita **backups diarios automáticos con 7 días de retención** y permite el
add-on **PITR** (Point-In-Time Recovery, RPO ~2 min). Es la vía de menor esfuerzo
y mayor garantía.

1. Dashboard → Project → Settings → Subscription → **Upgrade to Pro**.
2. Settings → Database → **Backups**: confirmar "Daily backups" activo.
3. (Opcional recomendado) Add-on **Point in Time Recovery**.
4. Activar además *Leaked Password Protection* (queda desbloqueado en Pro).

## Opción B0 — backup de DATOS por REST (funciona YA, sin pg_dump) ✅ PROBADO

`scripts/backup/rest-json-backup.mjs` exporta **todas las tablas de `public` a JSON**
usando el `service_role` (REST) — no requiere `pg_dump`, CLI ni el password de la BD.
Combinado con las migraciones del repo (esquema + funciones + RLS) da una ruta de
recuperación completa.

```bash
node scripts/backup/rest-json-backup.mjs
# → backups/rest-YYYYMMDD-HHMM/<tabla>.json + manifest.json  (backups/ está gitignored)
```

**Verificado en vivo (2026-07-26): 57/57 tablas, 3168 filas** (1358 productos, 1371
lotes, 22 ventas, 2 clientes, 3 usuarios, 2 sucursales, etc.). Solo imprime conteos; los datos (con PII) van a
`backups/` (ignorado por git). **Limitaciones vs pg_dump:** no captura `auth.users`
(cuentas de login), Storage, ni el estado exacto de secuencias — para el piloto
preserva todos los datos de negocio. **Correr AHORA como respaldo inmediato** y copiar
la carpeta cifrada a almacenamiento externo (NAS/S3/Backblaze).

### Verificar que el backup es RESTAURABLE (sin destino, gratis) ✅ PROBADO
`scripts/backup/verify-backup-integrity.mjs` comprueba la **integridad referencial**
del backup (todas las FKs resuelven dentro del export) → garantiza que el import en
orden de FKs no violará constraints. **Verificado (2026-07-26): 11/11 checks, 0
referencias rotas — el último backup ES restaurable.**
```bash
node scripts/backup/verify-backup-integrity.mjs
```

### Drill de restauración GRATIS (segundo proyecto Free)
El drill end-to-end necesita un **proyecto Supabase DESTINO**. La vía sin costo es un
**segundo proyecto Free** (la org permite 2). Pasos:
1. **(Usuario, ~2 min)** Dashboard Supabase → New project (Free) → anotar su URL y su
   `service_role key`. *No se puede crear por API/MCP; requiere el dashboard.*
2. Aplicar el esquema: correr TODAS las migraciones en el destino
   (`supabase/migrations/00*.sql`) vía SQL Editor o `psql`.
3. Importar los datos (idempotente, auto-ordenante por reintentos de FK):
   ```bash
   export TARGET_SUPABASE_URL="https://<nuevo-ref>.supabase.co"
   export TARGET_SERVICE_ROLE_KEY="<service_role del DESTINO>"
   node scripts/backup/restore-from-json.mjs
   ```
   (El script se **niega a escribir sobre el proyecto de producción**.)
4. Verificar conteos del destino contra `manifest.json`. Opcional: apuntar la app al
   destino y probar login + una consulta con RLS.
5. Pausar/borrar el proyecto destino. **Registrar el tiempo total = RTO real.**

## Opción B — backup COMPLETO (pg_dump) — automático en CI

Mientras se sigue en Free (o como respaldo redundante en Pro), correr un
`pg_dump` diario a almacenamiento externo. Script provisto:
`scripts/backup/pg-dump-backup.mjs`.

### Requisitos

- La **connection string** de la BD (Dashboard → Settings → Database →
  *Connection string* → **URI**, modo *Session pooler* o directo). Guardarla como
  variable de entorno **local/servidor de backup**, NUNCA en el repo:
  ```
  export SUPABASE_DB_URL="postgresql://postgres.[ref]:[password]@aws-...pooler.supabase.com:5432/postgres"
  ```
- `pg_dump` v15+ instalado (viene con PostgreSQL client tools).

### Backup manual (correr AHORA, antes del go-live)

```bash
node scripts/backup/pg-dump-backup.mjs
# genera backups/dermaland-YYYYMMDD-HHMM.sql.gz  (comprimido, cifrado opcional)
```

### Backup diario automático

Elegir uno:

- **GitHub Actions** (recomendado, gratis) — **YA CREADO**: `.github/workflows/backup.yml`
  corre el script diario (3 AM RD) y sube el `.sql.gz` como *artifact* (retención
  14 días), cifrado con GPG si defines `BACKUP_GPG_PASSPHRASE`. **Solo falta que
  agregues el secreto `SUPABASE_DB_URL`** en Settings → Secrets → Actions; luego
  se puede disparar a mano desde la pestaña *Actions* → *Run workflow*.
- **Tarea programada** en un servidor propio (la infra Cibao Cloud / NAS ya tiene
  cron de backups de csl-app; añadir DermaLand ahí).
- **Vercel Cron** llamando a un endpoint interno protegido (patrón ya usado en
  AlojaControl: `GET /api/cron/backup`).

### Retención

- Diarios: 14 días.
- Semanales: 8 semanas.
- Antes de CADA migración o deploy crítico: un dump etiquetado
  `dermaland-premig-<version>.sql.gz` (ver Opción C).

## Opción C — snapshot antes de cada cambio de esquema

**Obligatorio** antes de aplicar cualquier migración a producción:

```bash
node scripts/backup/pg-dump-backup.mjs --label premig-0028
```

Guardar el archivo fuera del entorno de la BD. Si la migración corrompe datos, se
restaura este snapshot.

## Procedimiento de RESTAURACIÓN (probar en aislado, NO en prod)

1. Crear un **proyecto Supabase nuevo** (o una branch) — nunca restaurar encima de
   la prod viva sin autorización.
2. Restaurar el dump:
   ```bash
   gunzip -c backups/dermaland-YYYYMMDD-HHMM.sql.gz | psql "$TARGET_DB_URL"
   ```
3. Verificar conteos clave contra lo esperado:
   ```sql
   select count(*) from products;      -- 1358 (baseline 2026-07-26)
   select count(*) from product_lots;  -- 1371
   select count(*) from proformas;     -- 22
   ```
4. Correr el smoke test de la app apuntando al proyecto restaurado
   (`DATA_SOURCE=supabase`, `NEXT_PUBLIC_SUPABASE_URL` del proyecto nuevo).
5. Verificar login + una consulta con RLS (que el usuario solo vea su empresa).
6. Documentar tiempo total (mide el RTO real).

> **Regla:** el sistema NO se considera "con backup" hasta que una restauración
> se haya probado de punta a punta al menos una vez.
> **Estado 2026-07-26:** el último backup está **verificado como RESTAURABLE** por
> integridad referencial (11/11 FKs OK) — validación sin destino. El **drill
> end-to-end** (importar a un proyecto destino y arrancar la app) sigue pendiente
> porque necesita que crees el proyecto destino (Opción B0 → paso 1).

## Reproducibilidad del esquema desde cero

El esquema completo está en `supabase/migrations/0001…0027`. **Advertencia:** la
tabla de rastreo `supabase_migrations.schema_migrations` solo registra 13 de los
27 archivos — los `0007…0022` se aplicaron vía SQL Editor (fuera de banda). Para
reconstruir en una BD limpia de forma confiable:

```bash
# aplicar TODOS los archivos en orden lexicográfico
for f in supabase/migrations/00*.sql; do psql "$TARGET_DB_URL" -f "$f"; done
```

Remediación recomendada (con autorización, no destructiva): `supabase migration
repair` para reconciliar el historial de rastreo con los archivos del repo.

## Responsable

- **Responsable del backup diario:** (asignar — dueño técnico del piloto).
- **Verificación semanal** de que el último backup existe y pesa lo esperado.
- **Prueba de restauración:** trimestral como mínimo, y obligatoria antes de
  escalar a una 2ª empresa.
