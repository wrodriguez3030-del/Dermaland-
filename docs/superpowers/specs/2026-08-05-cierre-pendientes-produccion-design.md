# Cierre de los pendientes de producción — B-01, B-07, B-04

> Cierra los tres puntos que `docs/production-readiness-report.md` dejó abiertos y
> que separan el veredicto **"apto piloto"** del veredicto **"apto producción"**.

**Fecha:** 2026-08-05 · **Estado:** diseño aprobado por el dueño

---

## 1. El hallazgo que cambia el encuadre

La infraestructura de los tres pendientes **ya está construida**. Existen
`scripts/backup/pg-dump-backup.mjs`, `rest-json-backup.mjs`,
`restore-from-json.mjs`, `verify-backup-integrity.mjs`, el workflow
`.github/workflows/backup.yml`, y el flujo 2FA completo
(`/perfil/seguridad`, `/login/mfa`, enforcement en `middleware.ts`).

Lo que falta no es sobre todo código: es **acción del dueño**. Por eso este
diseño no persigue "programar tres cosas", sino **reducir el trabajo manual al
mínimo irreducible** y dejar solo los clics que nadie más puede dar.

| | Falta de código | Falta del dueño |
|---|---|---|
| **B-01** Respaldos | Orquestar el simulacro completo | Nada, si el destino es `supabase-01` |
| **B-07** Migraciones | Auditar objeto por objeto y recuperar 4 archivos perdidos | Autorizar los `repair` |
| **B-04** 2FA | Hacerlo obligatorio para admin | Escanear el QR |

### Estado verificado en vivo (2026-08-05)

- `auth.mfa_factors` está **vacía**: nadie ha enrolado 2FA. El código está
  desplegado y sin uso.
- El historial de migraciones tiene **38 registros** contra **47 archivos
  locales**.
- Producción corre **PostgreSQL 17.6**; `supabase-01` ya tiene la imagen
  `supabase/postgres:17.6.1.132`.
- `public` tiene **84 tablas** (el backup REST cubría 57: solo las expuestas
  por API).
- `public.users`: **2 admin**, 1 cashier.

---

## 2. Decisiones tomadas — no se reabren

- **Destino del simulacro:** Supabase self-hosted en `supabase-01` (tailnet),
  no un segundo proyecto en la nube. Es infraestructura propia y de paso
  demuestra que DermaLand puede vivir fuera de Supabase Cloud.
- **Aislamiento:** contenedor **efímero y dedicado**, no una base dentro del
  cluster existente. Ver §3.
- **Códigos de respaldo de 2FA:** no se implementan. Se usa un *break-glass*
  con `service_role`. Ver §6.

### Lo que NO entra

- **Stack Supabase completo de DR** (kong + rest + auth) para arrancar la app
  contra la copia. El servidor tiene ~4.1 GB libres y el stack pide más de la
  mitad. Queda como mejora posterior, no como el primer simulacro.
- **Subir a Supabase Pro** (PITR, protección de contraseñas filtradas). Es
  decisión comercial del dueño, no técnica.
- **Tocar DGII, testecf, XML o certificados.** Nada de este trabajo los roza.

---

## 3. Parte 0 — Desarmar el arma cargada

`pg-dump-backup.mjs` genera el dump con `--clean --if-exists`. Eso significa que
**el archivo empieza con sentencias `DROP`**. Apuntarlo a la base equivocada no
la ensucia: la vacía. Es exactamente el modo de falla del incidente de Neon
(`alojacontrol-neon-wipe-incident`), y hoy está latente en el repositorio.

Además, `supabase-01` aloja **la producción de csl-app** (`supabase-db`, base
`postgres`, única) y el stack de PalusaApp (`palusa-*`, puerto 8100). Un destino
mal escrito ahí dentro es una pérdida de datos de otro cliente.

**Dos cambios, ambos transversales:**

1. **El dump deja de ser destructivo por defecto.** `pg-dump-backup.mjs` emite
   el dump sin `--clean`. El comportamiento destructivo queda tras un flag
   explícito `--with-drop`, documentado como "solo para restaurar sobre una base
   que ya contiene una versión previa de DermaLand".

2. **Guarda de destino compartida.** Un módulo
   `scripts/backup/lib/assert-safe-target.mjs` que todo script con permiso de
   escritura debe invocar antes de la primera sentencia. Aborta si:
   - el destino coincide con el proyecto de `apps/web/.env.local` (producción);
   - el destino contiene tablas que **no** pertenecen a DermaLand (huella
     esperada: `businesses`, `branches`, `products`, `sales`; huella prohibida:
     cualquier tabla `csl_*` o `palusa*`);
   - la variable de entorno `DERMALAND_DR_CONFIRM` no está presente.

   La guarda es *deny-by-default*: ante duda, aborta.

---

## 4. Parte 1 — B-01: el simulacro que nadie ha corrido

**El bloqueante literal del reporte es "restauración nunca probada".** Un
respaldo que no se ha restaurado es una hipótesis, no un respaldo.

### Componente: `scripts/backup/dr-drill.mjs`

Un solo comando. Seis pasos. No deja rastro.

| # | Paso | Detalle |
|---|---|---|
| 1 | **Respaldo fresco** | `pg_dump` contra producción, **solo lectura**. Reusa `pg-dump-backup.mjs`. |
| 2 | **Levantar el arenero** | `dermaland-dr-db` en `supabase-01` vía SSH: imagen `supabase/postgres:17.6.1.132`, volumen propio, **sin puerto expuesto** (se opera por `docker exec`, así nada externo puede alcanzarlo). |
| 3 | **Restaurar** | El dump entra por `psql`. Se capturan todos los errores, no solo el código de salida. |
| 4 | **Comparar** | Ver §4.1. Es el paso que convierte esto en prueba. |
| 5 | **Veredicto** | `docs/dr-drill-<fecha>.md` con números, no con "salió bien". |
| 6 | **Destruir** | Contenedor y volumen. Se ejecuta también si los pasos 3–4 fallan. |

La imagen `supabase/postgres` (no un Postgres pelado) es obligatoria: trae los
roles `anon`, `authenticated`, `service_role` y `supabase_admin` que el dump
referencia. Sin ellos la restauración falla en cascada y el simulacro mide la
falta de roles, no la calidad del respaldo.

### 4.1 Qué se compara (el corazón del simulacro)

Un respaldo "restaura sin error" y aun así puede estar incompleto. La
comparación es contra producción, objeto por objeto:

- **Filas por tabla** — las 84 tablas de `public`. Cualquier diferencia falla.
- **Funciones** — nombre y firma. Importa especialmente `emit_sale_atomic`,
  `transfer_stock_atomic`, `ar_apply_payments`, `select_lot_for_sale`,
  `reserve_ecf_sequence_number`, `auth_business_id`.
- **Políticas RLS** — conteo por tabla. Una copia sin RLS es una fuga de datos
  esperando ocurrir, y el reporte cuenta 56 tablas con RLS.
- **Índices y restricciones** — presencia por nombre.

**Criterio de éxito:** el simulacro pasa solo si las cuatro comparaciones
cuadran al 100 %. Ante cualquier faltante, **falla ruidosamente** y el reporte
nombra exactamente qué falta. Un simulacro que "casi pasa" es un simulacro
fallido.

### 4.2 Fuera de alcance del simulacro

`pg_dump` no exporta roles del cluster (son objetos globales) ni los archivos de
Storage. El reporte del simulacro debe **decirlo explícitamente** en vez de
dejar creer que la copia es total. Si no, el documento miente por omisión.

---

## 5. Parte 2 — B-07: auditar por objeto, no por nombre

El historial de migraciones **no es fuente de verdad** (registrado en
`dermaland-migration-drift`). Por tanto no se usa como insumo: se usa la base.

### Drift confirmado (2026-08-05)

- **13 archivos locales sin registro:** `0007_audit_logs_insert_policy`,
  `0008_security_advisor_fixes`, `0009_rls_initplan_remaining`,
  `0011_invoice_numberings`, `0015_cash_movements`, `0016_laboratories_seed`,
  `0017_backfill_product_laboratories`, `0018_pos_numbering_wiring`,
  `0019_sale_seller`, `0020_sales_incentives`, `0021_users_vendedor_role`,
  `0022_customer_sales_relations`, `0044_client_phone_uniform_format`.
- **4 registros sin archivo local:** `ai_providers_module`,
  `product_images_storage_bucket`, `ecf_events_fk_restrict`,
  `0042_payments_azul`.
- **Registros con el mismo contenido y distinto nombre:** `0010_inventory_transfers`
  → `create_inventory_transfers_tables`; `0012_purchases` → `purchases_module`;
  `0032_transfer_atomic` → `transfer_stock_atomic`.

### 5.1 El agujero que importa: cuatro migraciones sin archivo

Los 13 archivos sin registro son un problema **de contabilidad**: el objeto
existe en la base, solo que el historial no lo anota. Molesto, no grave.

Los **4 registros sin archivo local** son otra cosa. `ai_providers_module`,
`product_images_storage_bucket`, `ecf_events_fk_restrict` y `0042_payments_azul`
se aplicaron con `apply_migration` del MCP y **nunca dejaron un `.sql` en el
repositorio**. Consecuencia: `supabase/migrations/` **ya no puede reconstruir el
esquema de producción desde cero**. Falta código que solo existe dentro de la
base.

Esto no afecta al simulacro de §4 — `pg_dump` copia el esquema real, no los
archivos — pero sí a cualquier proyecto nuevo, entorno de preview o mudanza de
proveedor.

**El arreglo:** reconstruir esos cuatro archivos a partir de la definición viva
(`pg_dump --schema-only` acotado a los objetos que cada uno introdujo) y
guardarlos con la versión exacta que ya tiene el historial, para que el registro
y el archivo coincidan y no se genere una migración duplicada.

Nota sobre el número `0042`: el archivo local `0042_client_identity_normalized`
**sí está aplicado** (registrado como `client_identity_normalized`). La
duplicación del número con `0042_payments_azul` es de nombre, no de contenido, y
**no se renumera nada** — reescribir números ya registrados es justo el tipo de
cambio que creó este desorden. El archivo reconstruido conserva el nombre con
que la base lo conoce.

### Componente: `scripts/audit-migrations.mjs`

Lee cada `supabase/migrations/*.sql`, extrae los objetos que **declara**
(`CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, `CREATE FUNCTION`,
`CREATE POLICY`, `CREATE INDEX`) y le pregunta a la base si existen. Clasifica:

- **APLICADA** — todos sus objetos existen.
- **NO APLICADA** — ninguno existe.
- **PARCIAL** — unos sí y otros no. Es el caso peligroso y el que justifica
  auditar por objeto: un `repair` marcaría "aplicada" una migración a medias.

**Salida:** tabla legible por archivo, más los comandos
`supabase migration repair --status applied <version>` **ya redactados**.

**El script no ejecuta ningún `repair`.** Los presenta para autorización, según
la política de cambios en producción. Un `repair` sobre una migración PARCIAL
convierte un problema visible en uno invisible.

**Criterio de cierre de B-07:** el pendiente no se da por cerrado cuando el
historial esté ordenado, sino cuando `supabase/migrations/` pueda reconstruir el
esquema de producción desde cero. Un historial prolijo sobre un repositorio
incompleto es cosmética.

---

## 6. Parte 3 — B-04: 2FA que de verdad obliga

### El defecto actual

`middleware.ts` exige el segundo factor solo cuando
`aal.nextLevel === "aal2"`, es decir, **solo a quien ya lo activó**. Un admin
que nunca escaneó el QR nunca ve un solo prompt. Hay además un fail-open
deliberado (`// No bloquear si el chequeo de aal falla`). El resultado es que
2FA existe pero no protege a nadie.

### El cambio

El middleware pasa a distinguir dos cosas que hoy confunde:

- **Tener** un factor verificado (`auth.mfa_factors` con `status = 'verified'`).
- **Haberlo usado** en esta sesión (`currentLevel === 'aal2'`).

Para roles admin se exigen **ambas**. Sin factor verificado → redirección
forzosa a `/perfil/seguridad`. Con factor pero en `aal1` → `/login/mfa` (que ya
funciona). El fail-open deja de aplicar a admins: si el chequeo falla, se niega
el acceso.

`/perfil/seguridad` y `/login/mfa` quedan siempre alcanzables, o el enforcement
se muerde la cola.

**Alcance:** solo `role = 'admin'` (2 usuarios). `cashier` y `vendedor` no
cambian — 2FA sigue siendo opcional para ellos.

### 6.1 El riesgo real: dejar fuera a los dos admins

Son **2 admins y ningún tercero**. Si ambos pierden el teléfono, nadie entra.
Esto no es hipotético y hay que resolverlo antes de activar el enforcement.

**No se implementan códigos de respaldo.** Fabricar un sistema de códigos de
recuperación es criptografía casera con almacenamiento propio, más superficie de
ataque que la que elimina.

En su lugar, `scripts/mfa-break-glass.mjs`:

- Corre **fuera de la app**, con la `service_role` que solo tiene el dueño.
- Retira el factor de **un** usuario nombrado explícitamente (nunca "todos").
- Escribe en `audit_logs` quién, a quién y cuándo — la operación queda visible,
  no silenciosa.
- Exige confirmación interactiva con el correo del usuario objetivo.

### 6.2 Orden de activación (importa)

El enforcement **no se despliega antes** de que al menos un admin tenga factor
verificado. Desplegarlo con `auth.mfa_factors` vacía deja a los dos admins
enrolándose a la fuerza en el mismo instante y sin red. Secuencia:

1. Desplegar `/perfil/seguridad` accesible (ya lo está).
2. Un admin enrola y **se verifica que puede entrar**.
3. Probar `mfa-break-glass.mjs` contra ese admin y confirmar que recupera acceso.
4. Solo entonces, activar el enforcement.

---

## 7. Orden de ejecución

1. **Parte 2 (B-07)** — solo lectura, barata, y su resultado informa lo demás.
2. **Parte 0 + Parte 1 (B-01)** — la guarda de destino se escribe antes que el
   primer script que pueda escribir.
3. **Parte 3 (B-04)** — al final, y siguiendo §6.2.

## 8. Verificación

- `pnpm typecheck` y `pnpm vitest run` verdes (línea base: 446/446).
- Pruebas nuevas: la guarda de §3 rechaza un destino con tablas `csl_*`; el
  comparador de §4.1 falla cuando falta una fila, una función o una política; el
  clasificador de §5 distingue PARCIAL de APLICADA.
- El simulacro de §4 corre de punta a punta y produce
  `docs/dr-drill-<fecha>.md` con veredicto **PASA**.
- La auditoría de §5 produce su tabla sin ejecutar ningún `repair`.
- Los 4 archivos reconstruidos de §5.1 existen en `supabase/migrations/` y
  aplicarlos sobre una base vacía no produce error ni migración duplicada.
- Con el enforcement activo: un admin sin factor no alcanza `/dashboard`;
  `cashier` entra sin cambios; `mfa-break-glass.mjs` devuelve el acceso.

## 9. Qué sigue siendo del dueño

- Escanear el QR en `/perfil/seguridad` (B-04).
- Autorizar los `supabase migration repair` que produzca la auditoría (B-07).
- Poner el secreto `SUPABASE_DB_URL` en GitHub si quiere el respaldo diario
  automático, y `BACKUP_GPG_PASSPHRASE` para que el artifact viaje cifrado
  (contiene datos personales de clientes).
- Decidir sobre Supabase Pro: es lo único que resuelve PITR y la protección de
  contraseñas filtradas (R-SEC-01).
