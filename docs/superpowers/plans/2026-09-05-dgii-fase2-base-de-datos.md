# DGII Fase 2 — Base de datos

> **Para quien ejecute esto:** usa `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ir tarea por tarea. Los pasos llevan casilla (`- [ ]`).

**Objetivo:** dejar en la base de DermaLand las 17 tablas fiscales de agendapp, la función
`reserve_next_encf` tal cual, y las funciones transaccionales que permiten preparar un e-CF sin
quemar un número fiscal cuando algo falla — retirando antes las 13 tablas del módulo viejo sin
borrarlas.

**Arquitectura:** una sola migración en tres partes (retirada → tablas → funciones), aplicada
por el dueño con `scripts/db/apply-migration.mjs --apply`. Las funciones siguen el patrón que
DermaLand ya usa para operaciones atómicas (`emit_sale_atomic`): PL/pgSQL invocada por RPC. La
capa TypeScript se limita a repositorios; la lógica fiscal no entra aquí, entra en la fase 3.

**Stack:** Postgres 15 (Supabase `sntcvyozbhrgicwmtcoh`), PostgREST, `pg` para aplicar y
verificar, vitest para las guardas.

## Restricciones globales

- **`~/Projects/agendapp` es SOLO LECTURA.** Referencia: commit `8dbda0f6`. Al cerrar la fase,
  `git -C ~/Projects/agendapp status --porcelain src/lib/dgii docs/dgii prisma` debe dar cero.
- **Nada destructivo.** La migración no lleva `DROP TABLE` ni `DROP COLUMN`. Las tablas viejas
  se **renombran** a `*_legacy_20260906`. Se borrarán en una migración posterior, cuando el
  módulo nuevo lleve tiempo funcionando.
- **Idempotente.** `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
  `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`, renombrados guardados con `DO $$`.
- **RLS en todas las tablas nuevas**, sin excepción, con `auth_business_id()` — el ayudante de
  DermaLand (25 migraciones lo usan), **no** `current_user_business_id()` de agendapp.
- **`business_id` en toda tabla con datos de inquilino**, y en toda política.
- **El dueño aplica.** Ningún paso de este plan ejecuta `--apply`. Se entrega el dry-run y el
  dueño lo corre con `!`.
- **Tablas intocables:** `invoice_numberings`, `reserve_invoice_number`, `proformas`,
  `proforma_items`, `proforma_payments`, `cash_closings`, `cash_closing_sales`,
  `billing_settings`, `proforma_counters`, `next_proforma_number`, `payment_methods`,
  `cash_registers`, `cash_register_sessions`.
- **Esta fase no cambia el comportamiento de la aplicación.** No toca el punto de venta ni
  ninguna pantalla. Al terminar, la aplicación se comporta exactamente igual que hoy.

---

## Contexto que hace falta entender antes de empezar

### El problema que esta fase resuelve de verdad

agendapp prepara un e-CF **dentro de una transacción de Prisma de 20 segundos**
(`src/lib/dgii/invoice-prepare.ts:270-628`). Dentro de esa transacción: bloquea la venta,
re-comprueba idempotencia, comprueba el saldo de la nota, **reserva el e-NCF**, construye el
XML, **lo firma**, lo sube al almacenamiento, y recién entonces inserta la factura, sus líneas
y el envío. Si algo revienta, la transacción entera se deshace y **el número fiscal no se
consume**.

DermaLand no puede hacer eso: la aplicación habla con la base por PostgREST y no abre
transacciones desde el servidor web (`pg` es solo `devDependency`, la usan los guiones). Una
secuencia de llamadas REST no es atómica.

**El diseño aprobado decía envolver «la preparación completa» en una función PL/pgSQL.** Eso no
se puede: la firma XMLDSig necesita `xml-crypto` y `node-forge`, y el almacenamiento necesita
una llamada HTTP. Ninguna de las dos cosas ocurre dentro de Postgres. Es un hueco real del
diseño, y este plan lo cierra así:

### La solución: reservar por comparación e intercambio

En vez de reservar-firmar-guardar, se hace **firmar-y-después-reservar**, con una comprobación
atómica de que el número sigue siendo nuestro:

1. `peek_next_encf(business, tipo, ambiente)` → dice **qué número tocaría**, sin consumir nada
   y sin bloquear.
2. La aplicación construye el XML con ese número, **lo firma** y lo sube al almacenamiento.
3. `prepare_ecf_invoice(..., p_expected_encf)` → en **una** transacción: bloquea la secuencia,
   **comprueba que el próximo número sigue siendo el esperado**; si lo es, lo consume e inserta
   la factura y sus líneas; si no lo es (otro cobro se adelantó), devuelve `ENCF_TOMADO` sin
   consumir nada y la aplicación firma otra vez con el número nuevo.

Qué se gana: **un fallo al firmar no quema un número**, porque en ese momento todavía no se ha
consumido nada. Qué cuesta: si dos cajas cobran a la vez, una firma dos veces. Firmar es
milisegundos de CPU local; DermaLand es una farmacia con dos terminales.

Esto es una **desviación deliberada de agendapp**, la única de la fase, y hay que anotarla en
`docs/decisiones.md`. La lógica fiscal — el orden de las comprobaciones, los gates, qué se
guarda — no cambia; cambia dónde está el límite de la transacción, porque no había alternativa.

> La alternativa descartada era reservar primero y marcar la factura como `failed` si la firma
> fallaba. Es más simple, pero cada fallo quema un número que luego hay que declarar anulado
> ante la DGII. agendapp perdió entre 6 y 10 números por algo así (su v550), y fue bastante
> molesto como para arreglarlo. No lo repetimos.

### Lo que ya está en su sitio

- **Fase 1 cerrada** (v0.143.0): el núcleo puro está en `apps/web/src/features/dgii/core/`.
- `auth_business_id()` existe (`supabase/migrations/0001_phase1_core.sql:15`) y lee el
  `business_id` del JWT.
- Existen `businesses(id)`, `clients(id)`, `users(id)`, `branches(id)` y `audit_logs` — los
  mismos nombres que usa el SQL de agendapp. **La traducción es casi directa.**
- `proformas.electronic_invoice_id` ya existe (`0003_dgii_pos.sql:328`) y es lo que en agendapp
  es `sales.electronic_invoice_id`.
- Precedente de función atómica: `public.emit_sale_atomic`
  (`supabase/migrations/0029_atomic_sale_and_void.sql:28`).

### Las 13 tablas que se retiran (verificado contra producción hoy)

| Tabla | Filas |
|---|---:|
| `dgii_settings` | 0 |
| `dgii_certificates` | **4** |
| `ecf_sequences` | 0 |
| `electronic_invoices` | 0 |
| `electronic_invoice_items` | 0 |
| `dgii_submissions` | 0 |
| `dgii_status_logs` | 0 |
| `dgii_received_ecf` | 0 |
| `dgii_commercial_approvals` | 0 |
| `proforma_to_ecf_logs` | 0 |
| `dgii_logs` | 0 |
| `ecf_document_events` | 0 |
| `cash_closing_ecf_items` | 0 |

Los 4 certificados **no se migran**: están cifrados con otro formato de sobre y tres están
revocados. El dueño vuelve a subir el `.p12` por la pantalla nueva en la fase 6. Se conservan
en `dgii_certificates_legacy_20260906` por si acaso.

**Tres claves foráneas apuntan a `electronic_invoices`** (`0003_dgii_pos.sql:597-614`):
`proformas`, `cash_closing_sales` y `proforma_to_ecf_logs`. Las dos primeras hay que soltarlas
y volver a crearlas apuntando a la tabla nueva; la tercera se va con su tabla al renombrado.

### Las 17 tablas que entran, y de dónde sale cada una

Todas de `~/Projects/agendapp/prisma/migrations/applied/`:

| Tabla | Fichero fuente | Línea |
|---|---|---:|
| `dgii_settings` | `20260609_dgii_phase2_core_tables.sql` | 41 |
| `dgii_certificates` | `20260609_dgii_phase2_core_tables.sql` | 58 |
| `ecf_sequences` | `20260609_dgii_phase2_core_tables.sql` | 79 |
| `electronic_invoices` | `20260609_dgii_phase2_core_tables.sql` | 99 |
| `electronic_invoice_items` | `20260609_dgii_phase2_core_tables.sql` | 132 |
| `dgii_submissions` | `20260609_dgii_phase2_core_tables.sql` | 146 |
| `dgii_status_logs` | `20260609_dgii_phase2_core_tables.sql` | 165 |
| `dgii_enablement_progress` | `20260609_dgii_phase2_core_tables.sql` | 177 |
| `dgii_representative_attestations` | `20260609_dgii_phase2_core_tables.sql` | 188 |
| `received_ecf` | `20260707_dgii_b2b_received_ecf.sql` | 26 |
| `received_commercial_approvals` | `20260709_dgii_received_commercial_approvals.sql` | 29 |
| `dgii_certification_datasets` | `20260716_dgii_certification_dataset.sql` | 31 |
| `dgii_certification_cases` | `20260716_dgii_certification_dataset.sql` | 65 |
| `dgii_simulation_ranges` | `20260723_dgii_simulation_ranges.sql` | 30 |
| `dgii_certification_applications` | `20260727_dgii_certification_workflow.sql` | 36 |
| `dgii_certification_events` | `20260727_dgii_certification_workflow.sql` | 79 |
| `dgii_certification_evidence` | `20260727_dgii_certification_workflow.sql` | 118 |

**No entran** (y por qué): `foreign_payments` y `petty_expenses` (tipos 41/43/47, DermaLand no
los emite), `dgii_rnc_padron` y `dgii_rnc_padron_cargas` (el padrón de RNC es un servicio de
agendapp que DermaLand no necesita), `cash_register_session_ecf_items` (es el modelo de cierre
de caja de agendapp; DermaLand tiene `cash_closing_sales`, y el enganche del cierre es de la
fase 5).

### Las 6 sustituciones al copiar el DDL

Se aplican **a todo** el SQL portado, sin excepción:

| En agendapp | En DermaLand | Por qué |
|---|---|---|
| `current_user_business_id()` | `auth_business_id()` | El ayudante de RLS de esta casa |
| `sales(id)` / `sales.` | `proformas(id)` / `proformas.` | Aquí la venta es una proforma |
| `CREATE TABLE IF NOT EXISTS x` | `create table if not exists public.x` | Las migraciones de DermaLand cualifican el esquema |
| `SET search_path = public` | `set search_path = public, auth, extensions` | Lo que hace `0008_security_advisor_fixes.sql` |
| Mayúsculas del DDL | minúsculas | Estilo de las migraciones de DermaLand |
| Comentarios con «v3xx», «PENDING», «CLAUDE.md §2» | Se reescriben | Son del historial de agendapp, no del nuestro |

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260906090000_dgii_fase2_retirada_legacy.sql` | Renombra las 13 viejas y suelta las 2 FK. Solo eso. |
| `supabase/migrations/20260906090100_dgii_fase2_tablas.sql` | Las 17 tablas nuevas, índices y RLS. |
| `supabase/migrations/20260906090200_dgii_fase2_funciones.sql` | `reserve_next_encf`, `peek_next_encf`, `prepare_ecf_invoice`, `finalize_ecf_invoice`, `fail_ecf_invoice` y las 2 FK recreadas. |
| `apps/web/src/features/dgii/db/migracion-fase2.test.ts` | Guardas de texto sobre las tres migraciones. |
| `apps/web/src/features/dgii/db/tablas.ts` | Las listas canónicas (17 nuevas, 13 viejas) en un solo sitio. |
| `apps/web/src/features/dgii/db/tablas.test.ts` | Que esas listas no se desincronicen del SQL. |
| `scripts/db/verificar-dgii-fase2.mjs` | Verificador contra la base REAL, dentro de una transacción que **siempre** se deshace. |
| `apps/web/src/server/repositories/supabase/dgii-sequences.ts` | Lectura y escritura de `ecf_sequences` y las llamadas RPC. |

Tres migraciones separadas y no una, a propósito: si el renombrado sale bien y las tablas
fallan, el dueño ve exactamente dónde se quedó. `apply-migration.mjs` aplica una por llamada.

---

## Tarea 1: las listas canónicas y su guarda

Antes de escribir una línea de SQL, fijar **en TypeScript** qué tablas entran y cuáles se
retiran. Todo lo demás se comprueba contra esta lista, así que si alguien añade una tabla al
SQL y se olvida de la lista, la prueba lo caza.

**Ficheros:**
- Crear: `apps/web/src/features/dgii/db/tablas.ts`
- Crear: `apps/web/src/features/dgii/db/tablas.test.ts`

**Interfaces:**
- Produce: `TABLAS_NUEVAS: readonly string[]` (17), `TABLAS_LEGACY: readonly string[]` (13),
  `SUFIJO_LEGACY: "_legacy_20260906"`, `nombreLegacy(tabla: string): string`.
- Lo consumen: las tareas 2, 3, 4 y 8.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/dgii/db/tablas.test.ts
import { describe, it, expect } from "vitest";
import { TABLAS_NUEVAS, TABLAS_LEGACY, SUFIJO_LEGACY, nombreLegacy } from "./tablas";

describe("listas canónicas de tablas fiscales", () => {
  it("entran las 17 tablas del módulo de agendapp", () => {
    expect(TABLAS_NUEVAS).toHaveLength(17);
    // Las cuatro que sostienen la emisión: si falta una, no se factura.
    for (const t of ["ecf_sequences", "electronic_invoices", "electronic_invoice_items", "dgii_submissions"]) {
      expect(TABLAS_NUEVAS, `falta ${t}`).toContain(t);
    }
  });

  it("se retiran las 13 del módulo viejo, y `dgii_certificates` es la única con datos", () => {
    expect(TABLAS_LEGACY).toHaveLength(13);
    expect(TABLAS_LEGACY).toContain("dgii_certificates");
    expect(TABLAS_LEGACY).toContain("ecf_document_events");
  });

  it("las que comparten nombre son las que obligan a renombrar antes de crear", () => {
    const chocan = TABLAS_NUEVAS.filter((t) => (TABLAS_LEGACY as readonly string[]).includes(t));
    expect(chocan.sort()).toEqual([
      "dgii_certificates", "dgii_settings", "dgii_status_logs", "dgii_submissions",
      "ecf_sequences", "electronic_invoice_items", "electronic_invoices",
    ]);
  });

  it("el sufijo lleva la fecha: un renombrado sin fecha no se sabe de cuándo es", () => {
    expect(SUFIJO_LEGACY).toBe("_legacy_20260906");
    expect(nombreLegacy("ecf_sequences")).toBe("ecf_sequences_legacy_20260906");
  });

  it("ninguna tabla intocable está en ninguna de las dos listas", () => {
    const intocables = ["invoice_numberings", "proformas", "proforma_items", "proforma_payments",
      "cash_closings", "cash_closing_sales", "billing_settings", "proforma_counters",
      "payment_methods", "cash_registers", "cash_register_sessions"];
    for (const t of intocables) {
      expect(TABLAS_NUEVAS, `${t} es intocable`).not.toContain(t);
      expect(TABLAS_LEGACY, `${t} es intocable`).not.toContain(t);
    }
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/db/tablas.test.ts
```
Esperado: FAIL — `Cannot find module './tablas'`.

- [ ] **Paso 3: escribir el módulo**

```ts
// apps/web/src/features/dgii/db/tablas.ts
/**
 * Las listas canónicas del módulo fiscal. Un solo sitio: las migraciones, el
 * verificador y las guardas se comprueban todos contra esto.
 *
 * `TABLAS_LEGACY` son las 13 del módulo que DermaLand tenía y que nunca emitió un
 * comprobante. No se borran: se renombran con fecha, para poder volver atrás.
 */

/** Las 17 que trae el módulo de agendapp. Orden: emisión, recepción, certificación. */
export const TABLAS_NUEVAS = [
  "dgii_settings",
  "dgii_certificates",
  "ecf_sequences",
  "electronic_invoices",
  "electronic_invoice_items",
  "dgii_submissions",
  "dgii_status_logs",
  "dgii_enablement_progress",
  "dgii_representative_attestations",
  "received_ecf",
  "received_commercial_approvals",
  "dgii_certification_datasets",
  "dgii_certification_cases",
  "dgii_simulation_ranges",
  "dgii_certification_applications",
  "dgii_certification_events",
  "dgii_certification_evidence",
] as const;

/** Las 13 del módulo viejo. Todas vacías salvo `dgii_certificates` (4 filas, 3 revocadas). */
export const TABLAS_LEGACY = [
  "dgii_settings",
  "dgii_certificates",
  "ecf_sequences",
  "electronic_invoices",
  "electronic_invoice_items",
  "dgii_submissions",
  "dgii_status_logs",
  "dgii_received_ecf",
  "dgii_commercial_approvals",
  "proforma_to_ecf_logs",
  "dgii_logs",
  "ecf_document_events",
  "cash_closing_ecf_items",
] as const;

/** La fecha va en el nombre: un `_legacy` a secas no dice de qué retirada es. */
export const SUFIJO_LEGACY = "_legacy_20260906";

export function nombreLegacy(tabla: string): string {
  return `${tabla}${SUFIJO_LEGACY}`;
}
```

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/db/tablas.test.ts
```
Esperado: PASS, 5 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/dgii/db/
git commit -m "dgii fase 2: listas canónicas de tablas fiscales"
```

---

## Tarea 2: la migración de retirada

Renombra las 13 viejas y suelta las 2 claves foráneas que apuntan a `electronic_invoices`.
Nada más. Sin `DROP TABLE`.

**Ficheros:**
- Crear: `supabase/migrations/20260906090000_dgii_fase2_retirada_legacy.sql`
- Crear: `apps/web/src/features/dgii/db/migracion-fase2.test.ts`

**Interfaces:**
- Consume: `TABLAS_LEGACY`, `nombreLegacy` de la tarea 1.
- Produce: las tablas `*_legacy_20260906`, y los nombres viejos libres para la tarea 3.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/dgii/db/migracion-fase2.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TABLAS_LEGACY, nombreLegacy } from "./tablas";

const MIGRACIONES = resolve(process.cwd(), "..", "..", "supabase", "migrations");
const leer = (f: string) => readFileSync(resolve(MIGRACIONES, f), "utf8");
const RETIRADA = "20260906090000_dgii_fase2_retirada_legacy.sql";

describe("fase 2 — migración de retirada", () => {
  const sql = leer(RETIRADA);
  const codigo = sql.replace(/--.*$/gm, "");

  it("renombra las 13 tablas viejas, ni una menos", () => {
    // El renombrado va en un bucle con `format()`, así que el nombre nuevo no
    // aparece literal en el fichero: lo que se comprueba es que las 13 estén en
    // la lista y que el `format` construya el sufijo con fecha.
    const bloque = codigo.slice(codigo.indexOf("viejas text[]"), codigo.indexOf("end $$;"));
    for (const t of TABLAS_LEGACY) {
      expect(bloque, `no renombra ${t}`).toMatch(new RegExp(`'${t}'`));
    }
    expect(bloque).toMatch(/format\('alter table public\.%I rename to %I'/);
    expect(bloque).toMatch(/'_legacy_20260906'/);
    expect(nombreLegacy("dgii_logs")).toBe("dgii_logs_legacy_20260906");
  });

  it("NO borra nada: un módulo que nunca emitió puede hacer falta para explicar el pasado", () => {
    expect(codigo).not.toMatch(/drop\s+table/i);
    expect(codigo).not.toMatch(/truncate/i);
    expect(codigo).not.toMatch(/drop\s+column/i);
    expect(codigo).not.toMatch(/delete\s+from/i);
  });

  it("suelta las dos claves foráneas de tablas VIVAS, que si no bloquean el renombrado", () => {
    expect(codigo).toMatch(/alter table public\.proformas\s+drop constraint if exists proformas_electronic_invoice_fk/i);
    expect(codigo).toMatch(/alter table public\.cash_closing_sales\s+drop constraint if exists cash_closing_sales_electronic_invoice_fk/i);
  });

  it("no toca ninguna tabla intocable", () => {
    for (const t of ["invoice_numberings", "proforma_items", "proforma_payments", "cash_registers"]) {
      expect(codigo, `toca ${t}`).not.toMatch(new RegExp(`alter table[^;]*\\b${t}\\b`, "i"));
    }
  });

  it("es idempotente: correrla dos veces no puede reventar", () => {
    // Cada renombrado va dentro de un `do $$ ... if exists ... end $$`.
    const renombrados = codigo.match(/rename to/gi) ?? [];
    const guardas = codigo.match(/to_regclass/gi) ?? [];
    expect(guardas.length, "cada renombrado necesita su guarda to_regclass").toBeGreaterThanOrEqual(renombrados.length);
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/db/migracion-fase2.test.ts
```
Esperado: FAIL — `ENOENT ... 20260906090000_dgii_fase2_retirada_legacy.sql`.

- [ ] **Paso 3: escribir la migración**

```sql
-- supabase/migrations/20260906090000_dgii_fase2_retirada_legacy.sql
--
-- DGII fase 2, parte 1 de 3: retirar el módulo fiscal viejo SIN borrarlo.
--
-- El módulo que DermaLand tenía nunca emitió un comprobante, ni al ambiente de
-- pruebas. Sus 13 tablas están vacías salvo `dgii_certificates` (4 filas, 3 de
-- ellas revocadas). Aun así no se borran: se renombran con la fecha de la
-- retirada, de modo que volver atrás sea renombrar de vuelta. Se borran de
-- verdad en una migración posterior, cuando el módulo nuevo lleve tiempo
-- funcionando.
--
-- Siete de esos nombres los reutiliza el módulo nuevo (parte 2), así que este
-- renombrado es requisito para el siguiente fichero.
--
-- Idempotente: cada renombrado comprueba con `to_regclass` que la tabla existe
-- con el nombre viejo y que el nombre nuevo está libre.

-- ── 1) Soltar las claves foráneas que salen de tablas VIVAS ──────────────────
-- `proformas` y `cash_closing_sales` se quedan; solo pierden el enganche, que se
-- vuelve a crear en la parte 3 apuntando a la tabla nueva. Sin esto, el
-- renombrado arrastraría la FK a la tabla legacy y las proformas nuevas
-- quedarían apuntando al módulo retirado.
alter table public.proformas
  drop constraint if exists proformas_electronic_invoice_fk;
alter table public.cash_closing_sales
  drop constraint if exists cash_closing_sales_electronic_invoice_fk;

-- ── 2) Renombrar las 13 ──────────────────────────────────────────────────────
do $$
declare
  t text;
  viejas text[] := array[
    'dgii_settings','dgii_certificates','ecf_sequences','electronic_invoices',
    'electronic_invoice_items','dgii_submissions','dgii_status_logs',
    'dgii_received_ecf','dgii_commercial_approvals','proforma_to_ecf_logs',
    'dgii_logs','ecf_document_events','cash_closing_ecf_items'
  ];
begin
  foreach t in array viejas loop
    if to_regclass('public.' || t) is not null
       and to_regclass('public.' || t || '_legacy_20260906') is null then
      execute format('alter table public.%I rename to %I', t, t || '_legacy_20260906');
      raise notice 'retirada: % -> %_legacy_20260906', t, t;
    end if;
  end loop;
end $$;
```

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/db/migracion-fase2.test.ts
```
Esperado: PASS, 5 pruebas.

> Si tocas esa prueba, no la relajes a `expect(sql).toContain("rename")`: eso pasa con
> cualquier cosa y deja de vigilar nada.

- [ ] **Paso 5: dry-run contra la base real**

```bash
node scripts/db/apply-migration.mjs supabase/migrations/20260906090000_dgii_fase2_retirada_legacy.sql
```
Esperado: imprime el fichero y **no ejecuta**. No pasar `--apply`: lo corre el dueño.

- [ ] **Paso 6: commit**

```bash
git add supabase/migrations/20260906090000_dgii_fase2_retirada_legacy.sql apps/web/src/features/dgii/db/migracion-fase2.test.ts
git commit -m "dgii fase 2: retirada del módulo fiscal viejo (renombra, no borra)"
```

---

## Tarea 3: las 17 tablas

Copia el DDL de agendapp aplicando las 6 sustituciones, y le pone RLS a todo.

**Ficheros:**
- Crear: `supabase/migrations/20260906090100_dgii_fase2_tablas.sql`
- Modificar: `apps/web/src/features/dgii/db/migracion-fase2.test.ts` (añadir un `describe`)

**Interfaces:**
- Consume: `TABLAS_NUEVAS` de la tarea 1; los nombres liberados por la tarea 2.
- Produce: las 17 tablas con RLS, para las funciones de la tarea 4.

- [ ] **Paso 1: escribir la prueba que falla**

Añadir a `migracion-fase2.test.ts`:

```ts
import { TABLAS_NUEVAS } from "./tablas";

describe("fase 2 — migración de tablas", () => {
  const sql = leer("20260906090100_dgii_fase2_tablas.sql");
  const codigo = sql.replace(/--.*$/gm, "");

  it("crea las 17 tablas", () => {
    for (const t of TABLAS_NUEVAS) {
      expect(codigo, `falta ${t}`).toMatch(
        new RegExp(`create table if not exists public\\.${t}\\s*\\(`, "i"),
      );
    }
  });

  it("TODAS llevan RLS: una tabla fiscal sin RLS es una fuga entre empresas", () => {
    for (const t of TABLAS_NUEVAS) {
      expect(codigo, `${t} sin enable row level security`).toMatch(
        new RegExp(`alter table public\\.${t} enable row level security`, "i"),
      );
      expect(codigo, `${t} sin política`).toMatch(
        new RegExp(`create policy \\w+ on public\\.${t}`, "i"),
      );
    }
  });

  it("las políticas filtran por business_id con el ayudante de DermaLand", () => {
    const politicas = codigo.match(/create policy[\s\S]*?;/gi) ?? [];
    expect(politicas.length).toBeGreaterThanOrEqual(TABLAS_NUEVAS.length);
    for (const p of politicas) {
      expect(p, `política sin business_id: ${p.slice(0, 70)}`).toMatch(/business_id\s*=\s*auth_business_id\(\)/i);
    }
    // agendapp usa otro ayudante; si se cuela, la política no filtra nada aquí.
    expect(codigo).not.toMatch(/current_user_business_id/i);
  });

  it("el e-NCF lleva su forma en la base, no solo en el código", () => {
    expect(codigo).toMatch(/e_ncf\s+varchar\(13\)\s+not null\s+check\s*\(e_ncf ~ '\^\[A-Z\]\[0-9\]\{12\}\$'\)/i);
    expect(codigo).toMatch(/constraint electronic_invoices_encf_uniq unique \(business_id, ambiente, e_ncf\)/i);
  });

  it("el ambiente entra en la llave única: probar un e-NCF no puede impedir emitirlo", () => {
    // Sin `ambiente` en el UNIQUE, emitir E320000000001 en testecf bloquearía
    // emitirlo de verdad en ecf. Es el error que agendapp documentó.
    const uniq = codigo.match(/unique \(business_id, ambiente, e_ncf\)/i);
    expect(uniq, "la llave única de e_ncf debe incluir el ambiente").not.toBeNull();
  });

  it("los 11 tipos de e-CF son los mismos que conoce el constructor portado", () => {
    expect(codigo).toMatch(/tipo_ecf in \('31','32','33','34','41','42','43','44','45','46','47'\)/i);
  });

  it("no crea nada con el nombre de una tabla intocable", () => {
    for (const t of ["invoice_numberings", "proformas", "cash_closing_sales"]) {
      expect(codigo).not.toMatch(new RegExp(`create table if not exists public\\.${t}\\b`, "i"));
    }
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/db/migracion-fase2.test.ts
```
Esperado: FAIL — `ENOENT ... 20260906090100_dgii_fase2_tablas.sql`.

- [ ] **Paso 3: escribir la migración**

Procedimiento, tabla por tabla, en el orden de la tabla de la sección «Las 17 tablas que
entran»: abrir el fichero fuente en la línea indicada, copiar el bloque
`CREATE TABLE ... );` completo **con sus índices**, y aplicar las 6 sustituciones.

La cabecera y el patrón de RLS, que es igual para las 17:

```sql
-- supabase/migrations/20260906090100_dgii_fase2_tablas.sql
--
-- DGII fase 2, parte 2 de 3: las 17 tablas del módulo fiscal de agendapp.
--
-- Portadas de ~/Projects/agendapp/prisma/migrations/applied/ (commit 8dbda0f6),
-- con seis sustituciones y ninguna más: `current_user_business_id()` ->
-- `auth_business_id()`, `sales` -> `proformas`, esquema cualificado, search_path
-- de esta casa, minúsculas, y comentarios reescritos.
--
-- Requiere la parte 1 aplicada: siete de estos nombres los ocupaba el módulo
-- viejo.
--
-- Material sensible: `dgii_certificates.pkcs12_encrypted_blob` y
-- `.password_secret_ref` son sobres AES-256-GCM. NUNCA texto plano. El XML y las
-- respuestas de la DGII se guardan como RUTAS a un bucket privado, no como
-- contenido en columnas de log. `dgii_submissions.request_headers` no puede
-- llevar Authorization ni token.

-- ── ejemplo del patrón, tabla por tabla ─────────────────────────────────────
create table if not exists public.ecf_sequences (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  tipo_ecf     text not null
                 check (tipo_ecf in ('31','32','33','34','41','42','43','44','45','46','47')),
  ambiente     text not null check (ambiente in ('testecf','certecf','ecf')),
  range_start  bigint not null check (range_start > 0),
  range_end    bigint not null check (range_end >= range_start),
  next_number  bigint not null,
  status       text not null default 'active'
                 check (status in ('active','exhausted','expired','revoked')),
  authorized_at timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ecf_sequences_next_dentro_del_rango
    check (next_number >= range_start and next_number <= range_end + 1)
);
create index if not exists ecf_sequences_activa
  on public.ecf_sequences (business_id, tipo_ecf, ambiente, range_start)
  where status = 'active';

alter table public.ecf_sequences enable row level security;
drop policy if exists ecf_sequences_all on public.ecf_sequences;
create policy ecf_sequences_all on public.ecf_sequences for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());
```

Repetir el bloque de tres líneas de RLS (`enable row level security` + `drop policy if exists`
+ `create policy`) **para las 17**, con el nombre `<tabla>_all`.

> `ecf_sequences_next_dentro_del_rango` no está en agendapp. Se añade porque `next_number` es
> el estado que se mueve en cada cobro, y si alguna vez sale del rango la base debe negarse
> antes que emitir un número fuera de lo autorizado. Anotar en `docs/decisiones.md`.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/db/migracion-fase2.test.ts
```
Esperado: PASS, 12 pruebas (5 de la tarea 2 + 7 de ésta).

- [ ] **Paso 5: dry-run**

```bash
node scripts/db/apply-migration.mjs supabase/migrations/20260906090100_dgii_fase2_tablas.sql
```
Esperado: imprime y no ejecuta.

- [ ] **Paso 6: commit**

```bash
git add supabase/migrations/20260906090100_dgii_fase2_tablas.sql apps/web/src/features/dgii/db/migracion-fase2.test.ts
git commit -m "dgii fase 2: las 17 tablas fiscales, con RLS en todas"
```

---

## Tarea 4: `reserve_next_encf`, portada tal cual

La función que reserva el próximo e-NCF. Se copia de agendapp
(`20260609_dgii_phase2_core_tables.sql:267-331`) **sin cambiarle la lógica**: bloquea la fila
con `FOR UPDATE`, valida vigencia y rango, incrementa y devuelve el número.

**Ficheros:**
- Crear: `supabase/migrations/20260906090200_dgii_fase2_funciones.sql`
- Modificar: `apps/web/src/features/dgii/db/migracion-fase2.test.ts`

**Interfaces:**
- Consume: `public.ecf_sequences` de la tarea 3.
- Produce: `reserve_next_encf(p_business_id uuid, p_tipo_ecf text, p_ambiente text) returns text`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
describe("fase 2 — reserve_next_encf", () => {
  const sql = leer("20260906090200_dgii_fase2_funciones.sql");
  const codigo = sql.replace(/--.*$/gm, "");

  it("bloquea la fila antes de tocarla: sin FOR UPDATE dos cajas sacan el mismo número", () => {
    const fn = codigo.slice(codigo.indexOf("function reserve_next_encf"));
    expect(fn.slice(0, fn.indexOf("$$;"))).toMatch(/for update/i);
  });

  it("valida ambiente y tipo antes de mirar la secuencia", () => {
    expect(codigo).toMatch(/p_ambiente not in \('testecf','certecf','ecf'\)/i);
    expect(codigo).toMatch(/p_tipo_ecf not in \('31','32'/i);
  });

  it("da error distinto para cada motivo: sin secuencia, vencida y agotada", () => {
    expect(codigo).toMatch(/errcode = 'P0002'/);  // no hay secuencia activa
    expect(codigo).toMatch(/errcode = 'P0003'/);  // vencida
    expect(codigo).toMatch(/errcode = 'P0004'/);  // rango agotado
  });

  it("marca la secuencia vencida o agotada en vez de dejarla activa mintiendo", () => {
    expect(codigo).toMatch(/set status = 'expired'/i);
    expect(codigo).toMatch(/status\s*=\s*'exhausted'/i);
  });

  it("arma el e-NCF con el formato que valida el XSD: E + tipo + 10 dígitos", () => {
    expect(codigo).toMatch(/'E' \|\| p_tipo_ecf \|\| lpad\(v_next::text, 10, '0'\)/);
  });

  it("no la puede llamar un usuario del navegador: quemar números sería un ataque trivial", () => {
    expect(codigo).toMatch(/security definer/i);
    expect(codigo).toMatch(/revoke execute on function reserve_next_encf\(uuid, text, text\) from public, anon, authenticated/i);
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/db/migracion-fase2.test.ts
```
Esperado: FAIL — `ENOENT ... 20260906090200_dgii_fase2_funciones.sql`.

- [ ] **Paso 3: escribir la función**

Copiar de `~/Projects/agendapp/prisma/migrations/applied/20260609_dgii_phase2_core_tables.sql`
líneas 267-331, en minúsculas, con `set search_path = public, auth, extensions` y las
referencias cualificadas con `public.`. La lógica no se toca.

```sql
-- supabase/migrations/20260906090200_dgii_fase2_funciones.sql
--
-- DGII fase 2, parte 3 de 3: las funciones y las dos claves foráneas recreadas.
--
-- `reserve_next_encf` es de agendapp, literal. `peek_next_encf`,
-- `prepare_ecf_invoice`, `finalize_ecf_invoice` y `fail_ecf_invoice` son nuevas:
-- agendapp hace todo eso dentro de una transacción de Prisma, y DermaLand no
-- abre transacciones desde el servidor web. Ver la sección «reservar por
-- comparación e intercambio» del plan y `docs/decisiones.md`.
--
-- SECURITY DEFINER + REVOKE, a diferencia de `emit_sale_atomic` que es INVOKER:
-- consumir un número fiscal no es una acción de cajero, y un `authenticated`
-- llamando a la RPC en bucle agotaría el rango autorizado por la DGII. El
-- business_id entra como parámetro y lo pone el servidor, nunca el navegador.

create or replace function public.reserve_next_encf(
  p_business_id uuid,
  p_tipo_ecf    text,
  p_ambiente    text
) returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_seq_id    uuid;
  v_next      bigint;
  v_range_end bigint;
  v_status    text;
  v_expires   timestamptz;
  v_encf      text;
begin
  if p_ambiente not in ('testecf','certecf','ecf') then
    raise exception 'reserve_next_encf: ambiente inválido %', p_ambiente using errcode = '22023';
  end if;
  if p_tipo_ecf not in ('31','32','33','34','41','42','43','44','45','46','47') then
    raise exception 'reserve_next_encf: tipo_ecf inválido %', p_tipo_ecf using errcode = '22023';
  end if;

  select id, next_number, range_end, status, expires_at
    into v_seq_id, v_next, v_range_end, v_status, v_expires
  from public.ecf_sequences
  where business_id = p_business_id
    and tipo_ecf    = p_tipo_ecf
    and ambiente    = p_ambiente
    and status      = 'active'
  order by range_start asc
  for update
  limit 1;

  if v_seq_id is null then
    raise exception 'reserve_next_encf: no hay secuencia activa para business=% tipo=% ambiente=%',
      p_business_id, p_tipo_ecf, p_ambiente using errcode = 'P0002';
  end if;

  if v_expires is not null and v_expires < now() then
    update public.ecf_sequences set status = 'expired', updated_at = now() where id = v_seq_id;
    raise exception 'reserve_next_encf: secuencia vencida (id=%)', v_seq_id using errcode = 'P0003';
  end if;

  if v_next > v_range_end then
    update public.ecf_sequences set status = 'exhausted', updated_at = now() where id = v_seq_id;
    raise exception 'reserve_next_encf: rango agotado (id=%)', v_seq_id using errcode = 'P0004';
  end if;

  v_encf := 'E' || p_tipo_ecf || lpad(v_next::text, 10, '0');

  update public.ecf_sequences
     set next_number = v_next + 1,
         status      = case when v_next + 1 > v_range_end then 'exhausted' else status end,
         updated_at  = now()
   where id = v_seq_id;

  return v_encf;
end;
$$;

revoke execute on function public.reserve_next_encf(uuid, text, text) from public, anon, authenticated;
```

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/db/migracion-fase2.test.ts
```
Esperado: PASS, 18 pruebas.

- [ ] **Paso 5: commit**

```bash
git add supabase/migrations/20260906090200_dgii_fase2_funciones.sql apps/web/src/features/dgii/db/migracion-fase2.test.ts
git commit -m "dgii fase 2: reserve_next_encf portada de agendapp sin tocar la lógica"
```

---

## Tarea 5: preparar sin quemar números

Las cuatro funciones nuevas. Es la parte que no existe en agendapp y donde está el riesgo de
la fase.

**Ficheros:**
- Modificar: `supabase/migrations/20260906090200_dgii_fase2_funciones.sql`
- Modificar: `apps/web/src/features/dgii/db/migracion-fase2.test.ts`

**Interfaces:**
- Consume: `reserve_next_encf` de la tarea 4, las tablas de la tarea 3.
- Produce:
  - `peek_next_encf(p_business_id uuid, p_tipo_ecf text, p_ambiente text) returns text`
  - `prepare_ecf_invoice(p_business_id uuid, p_expected_encf text, p_factura jsonb, p_items jsonb) returns jsonb`
    → `{"ok":true,"invoice_id":"…","e_ncf":"E32…"}` o `{"ok":false,"motivo":"ENCF_TOMADO","e_ncf_actual":"E32…"}`
  - `finalize_ecf_invoice(p_business_id uuid, p_invoice_id uuid, p_datos jsonb) returns jsonb`
  - `fail_ecf_invoice(p_business_id uuid, p_invoice_id uuid, p_motivo text) returns jsonb`

- [ ] **Paso 1: escribir la prueba que falla**

```ts
describe("fase 2 — preparar sin quemar números", () => {
  const codigo = leer("20260906090200_dgii_fase2_funciones.sql").replace(/--.*$/gm, "");

  it("peek NO consume: si mirara y consumiera, firmar mal quemaría el número", () => {
    const fn = codigo.slice(codigo.indexOf("function public.peek_next_encf"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));
    expect(cuerpo).not.toMatch(/update\s+public\.ecf_sequences/i);
    expect(cuerpo).not.toMatch(/for update/i);   // ni siquiera bloquea
  });

  it("prepare comprueba que el número sigue siendo el nuestro ANTES de consumirlo", () => {
    const fn = codigo.slice(codigo.indexOf("function public.prepare_ecf_invoice"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));
    expect(cuerpo).toMatch(/for update/i);
    expect(cuerpo).toMatch(/p_expected_encf/);
    expect(cuerpo).toMatch(/ENCF_TOMADO/);
    // El orden manda: bloquear, comparar, y sólo entonces reservar.
    expect(cuerpo.indexOf("for update")).toBeLessThan(cuerpo.indexOf("reserve_next_encf"));
    expect(cuerpo.indexOf("p_expected_encf")).toBeLessThan(cuerpo.indexOf("reserve_next_encf"));
  });

  it("una carrera devuelve un no, no una excepción: la aplicación tiene que reintentar", () => {
    const fn = codigo.slice(codigo.indexOf("function public.prepare_ecf_invoice"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));
    const bloque = cuerpo.slice(cuerpo.indexOf("ENCF_TOMADO") - 400, cuerpo.indexOf("ENCF_TOMADO") + 200);
    expect(bloque).toMatch(/return jsonb_build_object/i);
    expect(bloque).not.toMatch(/raise exception/i);
  });

  it("idempotencia por proforma: dos cobros de la misma proforma no sacan dos comprobantes", () => {
    const fn = codigo.slice(codigo.indexOf("function public.prepare_ecf_invoice"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));
    expect(cuerpo).toMatch(/from public\.proformas[\s\S]{0,200}for update/i);
    expect(cuerpo).toMatch(/IDEMPOTENT_PROFORMA_YA_FACTURADA/);
    expect(cuerpo.indexOf("IDEMPOTENT_PROFORMA_YA_FACTURADA")).toBeLessThan(cuerpo.indexOf("reserve_next_encf"));
  });

  it("la factura nace en `draft` y sólo finalize la pasa a `signed`", () => {
    const prep = codigo.slice(codigo.indexOf("function public.prepare_ecf_invoice"));
    expect(prep.slice(0, prep.indexOf("$$;"))).toMatch(/'draft'/);
    const fin = codigo.slice(codigo.indexOf("function public.finalize_ecf_invoice"));
    expect(fin.slice(0, fin.indexOf("$$;"))).toMatch(/status\s*=\s*'signed'/i);
  });

  it("fail deja el motivo escrito: un comprobante que falló sin motivo no se puede resolver", () => {
    const fn = codigo.slice(codigo.indexOf("function public.fail_ecf_invoice"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));
    expect(cuerpo).toMatch(/status\s*=\s*'error'/i);
    expect(cuerpo).toMatch(/dgii_status_message/);
  });

  it("las cuatro filtran por business_id: ninguna puede tocar otra empresa", () => {
    for (const f of ["peek_next_encf", "prepare_ecf_invoice", "finalize_ecf_invoice", "fail_ecf_invoice"]) {
      const fn = codigo.slice(codigo.indexOf(`function public.${f}`));
      expect(fn.slice(0, fn.indexOf("$$;")), `${f} no filtra por business_id`).toMatch(/business_id\s*=\s*p_business_id/);
    }
  });

  it("ninguna es llamable desde el navegador", () => {
    for (const f of ["peek_next_encf(uuid, text, text)", "prepare_ecf_invoice(uuid, text, jsonb, jsonb)",
                     "finalize_ecf_invoice(uuid, uuid, jsonb)", "fail_ecf_invoice(uuid, uuid, text)"]) {
      expect(codigo, `falta el revoke de ${f}`).toMatch(
        new RegExp(`revoke execute on function public\\.${f.replace(/[()]/g, "\\$&")} from public, anon, authenticated`, "i"),
      );
    }
  });

  it("las dos claves foráneas vuelven, apuntando a la tabla NUEVA", () => {
    expect(codigo).toMatch(/alter table public\.proformas[\s\S]{0,200}references public\.electronic_invoices\(id\)/i);
    expect(codigo).toMatch(/alter table public\.cash_closing_sales[\s\S]{0,200}references public\.electronic_invoices\(id\)/i);
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/db/migracion-fase2.test.ts
```
Esperado: FAIL — 9 pruebas nuevas en rojo (las funciones no existen en el fichero).

- [ ] **Paso 3: escribir las cuatro funciones**

Añadir al final de `20260906090200_dgii_fase2_funciones.sql`:

```sql
-- ── peek_next_encf: qué número tocaría, sin consumir ni bloquear ─────────────
-- La aplicación firma el XML con este número. Si entre el peek y el prepare
-- otro cobro se lo lleva, `prepare_ecf_invoice` lo detecta y devuelve
-- ENCF_TOMADO; entonces se vuelve a firmar. Firmar cuesta milisegundos de CPU
-- local; quemar un número fiscal cuesta un trámite ante la DGII.
create or replace function public.peek_next_encf(
  p_business_id uuid,
  p_tipo_ecf    text,
  p_ambiente    text
) returns text
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  v_next bigint;
begin
  select next_number into v_next
  from public.ecf_sequences
  where business_id = p_business_id
    and tipo_ecf    = p_tipo_ecf
    and ambiente    = p_ambiente
    and status      = 'active'
    and next_number <= range_end
    and (expires_at is null or expires_at >= now())
  order by range_start asc
  limit 1;

  if v_next is null then
    raise exception 'peek_next_encf: no hay secuencia utilizable para business=% tipo=% ambiente=%',
      p_business_id, p_tipo_ecf, p_ambiente using errcode = 'P0002';
  end if;

  return 'E' || p_tipo_ecf || lpad(v_next::text, 10, '0');
end;
$$;

revoke execute on function public.peek_next_encf(uuid, text, text) from public, anon, authenticated;

-- ── prepare_ecf_invoice: consume el número e inserta la factura, atómico ─────
-- p_factura: {tipo_ecf, ambiente, proforma_id, customer_id, customer_rnc,
--             subtotal_gravado, total_itbis, total, xml_generated_path}
-- p_items:   [{line_no, name_item, quantity, unit_price, itbis_rate, monto_item}, …]
create or replace function public.prepare_ecf_invoice(
  p_business_id   uuid,
  p_expected_encf text,
  p_factura       jsonb,
  p_items         jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_tipo      text := p_factura->>'tipo_ecf';
  v_ambiente  text := p_factura->>'ambiente';
  v_proforma  uuid := nullif(p_factura->>'proforma_id', '')::uuid;
  v_next      bigint;
  v_actual    text;
  v_encf      text;
  v_seq_id    uuid;
  v_encf_num  bigint;
  v_invoice   uuid;
  v_ya        uuid;
  it          jsonb;
begin
  -- 1) Idempotencia. Se bloquea la proforma y se re-comprueba DENTRO de la
  --    transacción: sin esto, dos cobros a la vez de la misma proforma sacaban
  --    dos comprobantes con dos números.
  if v_proforma is not null then
    select electronic_invoice_id into v_ya
    from public.proformas
    where id = v_proforma and business_id = p_business_id
    for update;
    if v_ya is not null then
      return jsonb_build_object('ok', false, 'motivo', 'IDEMPOTENT_PROFORMA_YA_FACTURADA',
                                'invoice_id', v_ya);
    end if;
  end if;

  -- 2) Bloquear la secuencia y comprobar que el número esperado sigue libre.
  select id, next_number into v_seq_id, v_next
  from public.ecf_sequences
  where business_id = p_business_id
    and tipo_ecf    = v_tipo
    and ambiente    = v_ambiente
    and status      = 'active'
  order by range_start asc
  for update
  limit 1;

  if v_seq_id is null then
    raise exception 'prepare_ecf_invoice: no hay secuencia activa' using errcode = 'P0002';
  end if;

  v_actual := 'E' || v_tipo || lpad(v_next::text, 10, '0');
  if v_actual is distinct from p_expected_encf then
    -- Otro cobro se adelantó. No se consume nada: la aplicación vuelve a firmar
    -- con `e_ncf_actual` y llama otra vez. Es un no, no un error.
    return jsonb_build_object('ok', false, 'motivo', 'ENCF_TOMADO', 'e_ncf_actual', v_actual);
  end if;

  -- 3) Ahora sí, consumir. Reusa la función portada: una sola implementación
  --    del incremento, la que agendapp lleva meses corriendo en producción.
  v_encf := public.reserve_next_encf(p_business_id, v_tipo, v_ambiente);
  v_encf_num := (substring(v_encf from 4))::bigint;

  select id into v_seq_id
  from public.ecf_sequences
  where business_id = p_business_id and tipo_ecf = v_tipo and ambiente = v_ambiente
    and range_start <= v_encf_num and range_end >= v_encf_num
  limit 1;

  -- 4) La factura nace en `draft`: todavía no está firmada.
  insert into public.electronic_invoices (
    business_id, tipo_ecf, e_ncf, secuencia_id, status, ambiente,
    customer_id, customer_rnc, subtotal_gravado, total_itbis, total,
    xml_generated_path, generated_at
  ) values (
    p_business_id, v_tipo, v_encf, v_seq_id, 'draft', v_ambiente,
    nullif(p_factura->>'customer_id','')::uuid,
    nullif(p_factura->>'customer_rnc',''),
    coalesce((p_factura->>'subtotal_gravado')::numeric, 0),
    coalesce((p_factura->>'total_itbis')::numeric, 0),
    coalesce((p_factura->>'total')::numeric, 0),
    nullif(p_factura->>'xml_generated_path',''),
    now()
  ) returning id into v_invoice;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.electronic_invoice_items (
      business_id, electronic_invoice_id, line_no, name_item,
      quantity, unit_price, itbis_rate, monto_item
    ) values (
      p_business_id, v_invoice,
      (it->>'line_no')::int, it->>'name_item',
      coalesce((it->>'quantity')::numeric, 1),
      (it->>'unit_price')::numeric,
      coalesce((it->>'itbis_rate')::numeric, 0),
      (it->>'monto_item')::numeric
    );
  end loop;

  if v_proforma is not null then
    update public.proformas set electronic_invoice_id = v_invoice
    where id = v_proforma and business_id = p_business_id;
  end if;

  return jsonb_build_object('ok', true, 'invoice_id', v_invoice, 'e_ncf', v_encf);
end;
$$;

revoke execute on function public.prepare_ecf_invoice(uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- ── finalize_ecf_invoice: la firma ya está hecha y subida ────────────────────
-- p_datos: {xml_signed_path, xml_sha256, security_code}
create or replace function public.finalize_ecf_invoice(
  p_business_id uuid,
  p_invoice_id  uuid,
  p_datos       jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_filas int;
begin
  update public.electronic_invoices
     set status          = 'signed',
         xml_signed_path = nullif(p_datos->>'xml_signed_path',''),
         signed_at       = now(),
         updated_at      = now()
   where id = p_invoice_id
     and business_id = p_business_id
     and status = 'draft';
  get diagnostics v_filas = row_count;

  if v_filas = 0 then
    -- O no es nuestra, o ya no estaba en draft. Las dos cosas son un no.
    return jsonb_build_object('ok', false, 'motivo', 'NO_ESTABA_EN_DRAFT');
  end if;

  return jsonb_build_object('ok', true, 'invoice_id', p_invoice_id);
end;
$$;

revoke execute on function public.finalize_ecf_invoice(uuid, uuid, jsonb) from public, anon, authenticated;

-- ── fail_ecf_invoice: falló después de consumir el número ────────────────────
-- El número queda gastado, pero con nombre y motivo. Un número gastado que nadie
-- puede explicar es lo que hay que evitar: la DGII pregunta por el rango entero.
create or replace function public.fail_ecf_invoice(
  p_business_id uuid,
  p_invoice_id  uuid,
  p_motivo      text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  update public.electronic_invoices
     set status              = 'error',
         dgii_status_message = left(coalesce(p_motivo, 'sin motivo'), 500),
         updated_at          = now()
   where id = p_invoice_id and business_id = p_business_id;

  return jsonb_build_object('ok', true, 'invoice_id', p_invoice_id);
end;
$$;

revoke execute on function public.fail_ecf_invoice(uuid, uuid, text) from public, anon, authenticated;

-- ── Las dos claves foráneas, ahora apuntando a la tabla nueva ────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'proformas_electronic_invoice_fk') then
    alter table public.proformas
      add constraint proformas_electronic_invoice_fk
      foreign key (electronic_invoice_id) references public.electronic_invoices(id)
      on delete set null deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cash_closing_sales_electronic_invoice_fk') then
    alter table public.cash_closing_sales
      add constraint cash_closing_sales_electronic_invoice_fk
      foreign key (electronic_invoice_id) references public.electronic_invoices(id)
      on delete set null deferrable initially deferred;
  end if;
end $$;
```

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/db/migracion-fase2.test.ts
```
Esperado: PASS, 27 pruebas.

- [ ] **Paso 5: commit**

```bash
git add supabase/migrations/20260906090200_dgii_fase2_funciones.sql apps/web/src/features/dgii/db/migracion-fase2.test.ts
git commit -m "dgii fase 2: preparar un e-CF sin quemar el número si falla la firma"
```

---

## Tarea 6: el verificador que corre de verdad

Las guardas de las tareas 2-5 leen texto. Esta tarea comprueba **comportamiento**, contra la
base real, **dentro de una transacción que siempre se deshace**. Sin `ROLLBACK` esto dejaría
secuencias falsas en producción.

**Ficheros:**
- Crear: `scripts/db/verificar-dgii-fase2.mjs`

**Interfaces:**
- Consume: la migración aplicada (tarea 8).
- Produce: un informe por consola; sale con código 1 si algo no cuadra.

- [ ] **Paso 1: escribir el verificador**

```js
#!/usr/bin/env node
/**
 * Comprueba que la fase 2 quedó bien en la base REAL.
 *
 * Todo ocurre dentro de una transacción que SIEMPRE termina en ROLLBACK: crea un
 * negocio y una secuencia de mentira, reserva números, provoca las carreras, y
 * lo deshace. No deja una fila.
 *
 *   node scripts/db/verificar-dgii-fase2.mjs
 *
 * Requiere SUPABASE_DB_URL (se lee de apps/web/.env.local si no está en el entorno),
 * igual que scripts/db/apply-migration.mjs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");

function urlDeLaBase() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const env = readFileSync(path.join(RAIZ, "apps/web/.env.local"), "utf8");
  const m = env.match(/^SUPABASE_DB_URL=(.*)$/m);
  if (!m) throw new Error("Falta SUPABASE_DB_URL en el entorno y en apps/web/.env.local");
  return m[1].replace(/^"|"$/g, "");
}

const TABLAS_NUEVAS = [
  "dgii_settings","dgii_certificates","ecf_sequences","electronic_invoices",
  "electronic_invoice_items","dgii_submissions","dgii_status_logs",
  "dgii_enablement_progress","dgii_representative_attestations","received_ecf",
  "received_commercial_approvals","dgii_certification_datasets",
  "dgii_certification_cases","dgii_simulation_ranges",
  "dgii_certification_applications","dgii_certification_events",
  "dgii_certification_evidence",
];

const fallos = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const mal = (msg) => { fallos.push(msg); console.log(`  ✗ ${msg}`); };

async function main() {
  const cliente = new pg.Client({
    connectionString: urlDeLaBase(),
    ssl: { ca: readFileSync(path.join(RAIZ, "supabase/certs/supabase-root-2021-ca.crt"), "utf8") },
  });
  await cliente.connect();

  console.log("\n1) Estructura\n");
  for (const t of TABLAS_NUEVAS) {
    const r = await cliente.query("select to_regclass($1) as x", [`public.${t}`]);
    r.rows[0].x ? ok(`existe ${t}`) : mal(`FALTA la tabla ${t}`);
  }
  const sinRls = await cliente.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any($1) and c.relrowsecurity = false`,
    [TABLAS_NUEVAS],
  );
  sinRls.rows.length === 0
    ? ok("las 17 tienen RLS activo")
    : mal(`sin RLS: ${sinRls.rows.map((x) => x.relname).join(", ")}`);

  const legacy = await cliente.query(
    `select count(*)::int as n from information_schema.tables
     where table_schema = 'public' and table_name like '%\\_legacy\\_20260906'`,
  );
  legacy.rows[0].n === 13
    ? ok("las 13 viejas están retiradas, no borradas")
    : mal(`se esperaban 13 tablas *_legacy_20260906 y hay ${legacy.rows[0].n}`);

  console.log("\n2) Comportamiento (todo dentro de una transacción que se deshace)\n");
  await cliente.query("begin");
  try {
    const { rows: [neg] } = await cliente.query(
      `insert into public.businesses (name) values ('VERIFICADOR FASE 2 — se deshace')
       returning id`,
    );
    const biz = neg.id;

    await cliente.query(
      `insert into public.ecf_sequences
         (business_id, tipo_ecf, ambiente, range_start, range_end, next_number, status, expires_at)
       values ($1, '32', 'testecf', 1, 3, 1, 'active', now() + interval '1 year')`,
      [biz],
    );

    const peek1 = await cliente.query("select public.peek_next_encf($1,'32','testecf') as e", [biz]);
    const peek2 = await cliente.query("select public.peek_next_encf($1,'32','testecf') as e", [biz]);
    peek1.rows[0].e === "E320000000001" && peek2.rows[0].e === peek1.rows[0].e
      ? ok("peek no consume: dos miradas seguidas dan el mismo número")
      : mal(`peek consumió algo: ${peek1.rows[0].e} luego ${peek2.rows[0].e}`);

    const r1 = await cliente.query("select public.reserve_next_encf($1,'32','testecf') as e", [biz]);
    const r2 = await cliente.query("select public.reserve_next_encf($1,'32','testecf') as e", [biz]);
    r1.rows[0].e === "E320000000001" && r2.rows[0].e === "E320000000002"
      ? ok("reserve da números consecutivos")
      : mal(`números no consecutivos: ${r1.rows[0].e}, ${r2.rows[0].e}`);

    const conflicto = await cliente.query(
      `select public.prepare_ecf_invoice($1, 'E320000000001',
         jsonb_build_object('tipo_ecf','32','ambiente','testecf','total',100),
         '[]'::jsonb) as r`,
      [biz],
    );
    conflicto.rows[0].r.motivo === "ENCF_TOMADO"
      ? ok("prepare con un número ya tomado devuelve ENCF_TOMADO sin consumir")
      : mal(`se esperaba ENCF_TOMADO y vino ${JSON.stringify(conflicto.rows[0].r)}`);

    const antes = await cliente.query(
      "select next_number from public.ecf_sequences where business_id = $1", [biz]);
    const bien = await cliente.query(
      `select public.prepare_ecf_invoice($1, 'E320000000003',
         jsonb_build_object('tipo_ecf','32','ambiente','testecf','total',100),
         jsonb_build_array(jsonb_build_object(
           'line_no',1,'name_item','Prueba','quantity',1,'unit_price',100,
           'itbis_rate',0.18,'monto_item',100))) as r`,
      [biz],
    );
    bien.rows[0].r.ok === true && bien.rows[0].r.e_ncf === "E320000000003"
      ? ok("prepare con el número correcto crea la factura y sus líneas")
      : mal(`prepare falló: ${JSON.stringify(bien.rows[0].r)}`);

    const agotada = await cliente.query(
      "select status from public.ecf_sequences where business_id = $1", [biz]);
    agotada.rows[0].status === "exhausted"
      ? ok("al gastar el último número la secuencia queda `exhausted`, no `active` mintiendo")
      : mal(`estado tras agotar: ${agotada.rows[0].status}`);

    const items = await cliente.query(
      "select count(*)::int as n from public.electronic_invoice_items where business_id = $1", [biz]);
    items.rows[0].n === 1 ? ok("la línea se guardó") : mal(`líneas guardadas: ${items.rows[0].n}`);

    const vacia = await cliente.query(
      `select public.reserve_next_encf($1,'32','testecf') as e`, [biz]).catch((e) => e);
    vacia instanceof Error && /P0002|no hay secuencia activa/.test(vacia.message)
      ? ok("sin secuencia utilizable, reserve falla en vez de inventar un número")
      : mal("reserve devolvió algo con la secuencia agotada");
  } finally {
    await cliente.query("rollback");
    console.log("\n  (transacción deshecha: no quedó ninguna fila)");
  }

  await cliente.end();
  console.log(fallos.length === 0 ? "\n✓ fase 2 verificada\n" : `\n✗ ${fallos.length} fallos\n`);
  process.exit(fallos.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error("\n✗ Error:", e); process.exit(1); });
```

- [ ] **Paso 2: comprobar que falla ANTES de aplicar la migración**

```bash
node scripts/db/verificar-dgii-fase2.mjs
```
Esperado: sale con código 1, «FALTA la tabla dgii_settings» y las demás. Eso demuestra que el
verificador de verdad mira la base y no se lo inventa.

- [ ] **Paso 3: commit**

```bash
git add scripts/db/verificar-dgii-fase2.mjs
git commit -m "dgii fase 2: verificador contra la base real, siempre con rollback"
```

---

## Tarea 7: los repositorios

La capa de datos que usará la fase 3. Nada de lógica fiscal aquí.

**Ficheros:**
- Crear: `apps/web/src/server/repositories/supabase/dgii-sequences.ts`
- Crear: `apps/web/src/server/repositories/supabase/dgii-sequences.test.ts`

**Interfaces:**
- Consume: las RPC de las tareas 4 y 5.
- Produce: `crearRepositorioSecuencias(cliente, businessId)` con `peekNextEncf`,
  `prepararFactura`, `finalizarFactura` y `marcarFallo`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/server/repositories/supabase/dgii-sequences.test.ts
import { describe, it, expect, vi } from "vitest";
import { crearRepositorioSecuencias } from "./dgii-sequences";

/** Cliente de mentira: solo registra qué RPC se llamó y con qué. */
function clienteFalso(respuesta: unknown, error: unknown = null) {
  const llamadas: Array<{ fn: string; args: unknown }> = [];
  return {
    llamadas,
    rpc: vi.fn(async (fn: string, args: unknown) => {
      llamadas.push({ fn, args });
      return { data: respuesta, error };
    }),
  };
}

describe("repositorio de secuencias fiscales", () => {
  it("peek pide el número sin consumirlo", async () => {
    const c = clienteFalso("E320000000007");
    const repo = crearRepositorioSecuencias(c as never, "biz-1");
    expect(await repo.peekNextEncf("32", "testecf")).toBe("E320000000007");
    expect(c.llamadas[0]).toEqual({
      fn: "peek_next_encf",
      args: { p_business_id: "biz-1", p_tipo_ecf: "32", p_ambiente: "testecf" },
    });
  });

  it("preparar devuelve el conflicto tal cual, sin convertirlo en excepción", async () => {
    // Una carrera NO es un error: la fase 3 tiene que poder reintentar.
    const c = clienteFalso({ ok: false, motivo: "ENCF_TOMADO", e_ncf_actual: "E320000000008" });
    const repo = crearRepositorioSecuencias(c as never, "biz-1");
    const r = await repo.prepararFactura("E320000000007", { tipo_ecf: "32" }, []);
    expect(r).toEqual({ ok: false, motivo: "ENCF_TOMADO", e_ncf_actual: "E320000000008" });
  });

  it("un error de la base SÍ es excepción, y no se traga", async () => {
    const c = clienteFalso(null, { message: "no hay secuencia activa", code: "P0002" });
    const repo = crearRepositorioSecuencias(c as never, "biz-1");
    await expect(repo.peekNextEncf("32", "testecf")).rejects.toThrow(/no hay secuencia activa/);
  });

  it("el business_id lo pone el repositorio, nunca quien llama", async () => {
    const c = clienteFalso({ ok: true, invoice_id: "f-1", e_ncf: "E320000000007" });
    const repo = crearRepositorioSecuencias(c as never, "biz-1");
    // Aunque el llamador meta otro business_id en la factura, gana el del repositorio.
    await repo.prepararFactura("E320000000007", { tipo_ecf: "32", business_id: "OTRA" } as never, []);
    expect((c.llamadas[0].args as { p_business_id: string }).p_business_id).toBe("biz-1");
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/server/repositories/supabase/dgii-sequences.test.ts
```
Esperado: FAIL — `Cannot find module './dgii-sequences'`.

- [ ] **Paso 3: escribir el repositorio**

```ts
// apps/web/src/server/repositories/supabase/dgii-sequences.ts
/**
 * Acceso a las secuencias fiscales y a la preparación de comprobantes.
 *
 * Solo traduce llamadas: la lógica fiscal vive en `features/dgii/core` y la
 * orquestación llega en la fase 3. El `business_id` lo pone SIEMPRE este
 * repositorio, nunca quien llama.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FacturaAPreparar {
  tipo_ecf: string;
  ambiente: string;
  proforma_id?: string | null;
  customer_id?: string | null;
  customer_rnc?: string | null;
  subtotal_gravado?: number;
  total_itbis?: number;
  total?: number;
  xml_generated_path?: string | null;
}

export interface LineaAPreparar {
  line_no: number;
  name_item: string;
  quantity: number;
  unit_price: number;
  itbis_rate: number;
  monto_item: number;
}

export type ResultadoPreparar =
  | { ok: true; invoice_id: string; e_ncf: string }
  | { ok: false; motivo: "ENCF_TOMADO"; e_ncf_actual: string }
  | { ok: false; motivo: "IDEMPOTENT_PROFORMA_YA_FACTURADA"; invoice_id: string };

function desenvolver<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
}

export function crearRepositorioSecuencias(cliente: SupabaseClient, businessId: string) {
  return {
    async peekNextEncf(tipoEcf: string, ambiente: string): Promise<string> {
      return desenvolver(
        await cliente.rpc("peek_next_encf", {
          p_business_id: businessId, p_tipo_ecf: tipoEcf, p_ambiente: ambiente,
        }),
        "peek_next_encf",
      ) as string;
    },

    async prepararFactura(
      encfEsperado: string, factura: FacturaAPreparar, items: LineaAPreparar[],
    ): Promise<ResultadoPreparar> {
      return desenvolver(
        await cliente.rpc("prepare_ecf_invoice", {
          p_business_id: businessId,
          p_expected_encf: encfEsperado,
          p_factura: factura,
          p_items: items,
        }),
        "prepare_ecf_invoice",
      ) as ResultadoPreparar;
    },

    async finalizarFactura(
      invoiceId: string, datos: { xml_signed_path: string },
    ): Promise<{ ok: boolean; motivo?: string }> {
      return desenvolver(
        await cliente.rpc("finalize_ecf_invoice", {
          p_business_id: businessId, p_invoice_id: invoiceId, p_datos: datos,
        }),
        "finalize_ecf_invoice",
      ) as { ok: boolean; motivo?: string };
    },

    async marcarFallo(invoiceId: string, motivo: string): Promise<void> {
      desenvolver(
        await cliente.rpc("fail_ecf_invoice", {
          p_business_id: businessId, p_invoice_id: invoiceId, p_motivo: motivo,
        }),
        "fail_ecf_invoice",
      );
    },
  };
}

export type RepositorioSecuencias = ReturnType<typeof crearRepositorioSecuencias>;
```

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/server/repositories/supabase/dgii-sequences.test.ts
```
Esperado: PASS, 4 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/server/repositories/supabase/dgii-sequences.ts apps/web/src/server/repositories/supabase/dgii-sequences.test.ts
git commit -m "dgii fase 2: repositorio de secuencias fiscales"
```

---

## Tarea 8: aplicar y cerrar

**Ficheros:**
- Modificar: `CHANGELOG.md`, `docs/estado-actual.md`, `docs/decisiones.md`, `package.json`

- [ ] **Paso 1: comprobar que todo está verde antes de tocar la base**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json && npx vitest run
cd /Users/willianrodriguez/Projects/dermaland && pnpm --filter web build
```
Esperado: 0 errores de tipos, todas las pruebas en verde, build ✓.

- [ ] **Paso 2: dry-run de las tres migraciones, en orden**

```bash
for m in 20260906090000_dgii_fase2_retirada_legacy 20260906090100_dgii_fase2_tablas 20260906090200_dgii_fase2_funciones; do
  node scripts/db/apply-migration.mjs "supabase/migrations/$m.sql"
done
```
Esperado: imprime las tres y **no ejecuta ninguna**.

- [ ] **Paso 3: pedirle al dueño que aplique**

Esto **no lo ejecuta el agente**. Se le entrega al dueño, para que lo corra con `!`:

```
! node scripts/db/apply-migration.mjs supabase/migrations/20260906090000_dgii_fase2_retirada_legacy.sql --apply
! node scripts/db/apply-migration.mjs supabase/migrations/20260906090100_dgii_fase2_tablas.sql --apply
! node scripts/db/apply-migration.mjs supabase/migrations/20260906090200_dgii_fase2_funciones.sql --apply
```

En orden y una a una: si la primera falla, las otras dos no se corren.

- [ ] **Paso 4: verificar contra la base**

```bash
node scripts/db/verificar-dgii-fase2.mjs
node scripts/audit-migrations.mjs
```
Esperado: el primero termina en «✓ fase 2 verificada» y sale con 0. El segundo no reporta
objetos faltantes de estas tres migraciones.

- [ ] **Paso 5: comprobar que el punto de venta sigue cobrando**

La fase no toca el POS, pero las claves foráneas de `proformas` se soltaron y se recrearon, así
que hay que verlo con los ojos:

1. `pnpm --filter web dev` → http://localhost:3031
2. Cobrar una venta de prueba en efectivo (sale proforma) y otra con tarjeta.
3. Comprobar que la proforma se crea, el stock baja y el ticket imprime.
4. Borrar las dos con `scripts/borrar-ventas-de-prueba.mts --apply`.

- [ ] **Paso 6: comprobar que agendapp sigue intacto**

```bash
git -C ~/Projects/agendapp status --porcelain src/lib/dgii docs/dgii prisma | wc -l
```
Esperado: `0`.

- [ ] **Paso 7: documentar**

- `CHANGELOG.md`: entrada `[0.144.0]` con qué tablas entran, cuáles se retiran y la desviación
  de la transacción.
- `docs/estado-actual.md`: bloque nuevo al principio.
- `docs/decisiones.md`: **dos** decisiones — (1) por qué se firma antes de consumir el número
  en vez de envolverlo todo en una transacción como agendapp; (2) por qué se añadió el CHECK
  `ecf_sequences_next_dentro_del_rango` que agendapp no tiene.
- `package.json`: versión a `0.144.0`.

- [ ] **Paso 8: commit y push a Gitea**

```bash
git add -A
git commit -m "v0.144.0 — DGII fase 2: base de datos"
git push gitea main
```

**No** se hace `git push origin main`: eso despliega a producción y esta fase no cambia el
comportamiento de la aplicación. El despliegue lo pide el dueño cuando quiera.

---

## Verificación de la fase

- `cd apps/web && npx vitest run` — todas en verde, incluidas las 36 nuevas.
- `npx tsc --noEmit -p tsconfig.json` — sin errores.
- `pnpm --filter web build` — compila.
- `node scripts/db/verificar-dgii-fase2.mjs` — sale con 0.
- `node scripts/audit-migrations.mjs` — sin objetos faltantes.
- El punto de venta cobra en efectivo y con tarjeta (comprobación manual del paso 5).
- `git -C ~/Projects/agendapp status --porcelain src/lib/dgii docs/dgii prisma` — cero líneas.

## Lo que esta fase NO hace

- No emite ni un comprobante. No hay ruta, ni pantalla, ni servicio que llame a estas
  funciones: eso es la fase 3.
- No carga secuencias reales. Los rangos los autoriza la DGII y los carga el dueño por la
  pantalla de la fase 6.
- No migra los 4 certificados viejos. El dueño vuelve a subir el `.p12` en la fase 6.
- No toca la numeración del punto de venta. El adaptador que enruta `ecf_31/32/34` a
  `reserve_next_encf` es la fase 4.
