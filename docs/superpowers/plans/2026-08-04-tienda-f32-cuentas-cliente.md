# Tienda F3.2 — cuentas de cliente

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente pueda crearse una cuenta en la tienda y entrar con ella — **sin que eso le abra una sola puerta del ERP**.

**Architecture:** Un cliente web es un usuario de Supabase Auth **sin `business_id` en `app_metadata`**; eso es exactamente lo que lo distingue del personal, y lo que mira el portero. El vínculo con su ficha comercial vive en la tabla puente `client_auth_links`, nunca en el token. Las rutas de `/tienda` siguen siendo públicas y **sin coste de sesión**: solo el subárbol `/tienda/cuenta` comprueba quién eres, y lo hace en la página, no en el middleware.

**Tech Stack:** Next.js 15.5.18 (App Router) · React 19 · TypeScript estricto · Tailwind 4 · Supabase Auth · Zod · Vitest · pnpm.

## Global Constraints

- **La tienda sigue APAGADA.** Ningún paso la enciende. Se prueba en local encendiéndola temporalmente y **devolviéndola siempre al estado seguro**.
- **`auth-claims.ts` NO se toca.** El `?? "cashier"` se queda donde está (`tienda-en-linea.md` §5). El arreglo va en el portero.
- **Orden obligatorio: el portero PRIMERO** (Task 1), con su prueba, antes de que exista un solo formulario de registro. No es una preferencia de estilo: entre abrir el registro y cerrar el portón no puede haber ni un despliegue de distancia.
- **Claims de autorización SIEMPRE en `app_metadata`**, jamás en `user_metadata` — el usuario puede escribir el segundo con `auth.updateUser` y auto-elevarse (SEC-001).
- **RLS deny-by-default** en la tabla nueva, con `enable row level security` en la misma migración que la crea.
- **La migración es 100 % `if not exists`**: el historial de migraciones de este proyecto no es fiable y se verifica por objeto (R-WEB-04).
- **Nada de `NEXT_PUBLIC_` para secretos.** El alta del cliente cruza el servidor con service-role; el navegador nunca ve esa clave.
- **Hidratación segura** (`CLAUDE.md` regla 6) y **táctil ≥ 44 px**.
- **Contraste AA:** texto pequeño con `--brand-primary`.
- **Etiquetas legibles:** ni UUID ni claves crudas de cara al cliente.
- Comandos: `pnpm --filter web test <patrón>` · `pnpm --filter web typecheck` · `pnpm --filter web build` · `pnpm --filter web dev` (puerto 3031).

## Lo que este incremento NO hace

- **No hay "Mis pedidos".** Los pedidos son F3.3; una pantalla que hoy solo podría decir "no tienes pedidos" no se construye.
- **No hay "Mis direcciones".** Solo hay retiro en sucursal.
- **No se refresca la sesión en las rutas del catálogo.** Hacerlo obligaría a una llamada a Supabase en cada visita a una página pública que hoy sale de caché. La sesión del cliente se refresca al entrar en `/tienda/cuenta`.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0037_client_auth_links.sql` | Tabla puente + RLS deny-by-default. |
| `features/storefront/account/registration.ts` | Validación pura del alta (zod + normalización de teléfono). |
| `features/storefront/account/registration.test.ts` | Sus pruebas. |
| `server/services/storefront/customer-account.ts` | Alta y resolución de la cuenta: `signUpCustomer`, `resolveCustomerAccount`. |
| `app/tienda/cuenta/entrar/page.tsx` | Entrar. |
| `app/tienda/cuenta/registro/page.tsx` | Crear cuenta. |
| `app/tienda/cuenta/page.tsx` | Mi cuenta (requiere sesión de cliente). |
| `features/storefront/components/account-nav.tsx` | Enlace de cuenta en el encabezado. |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `middleware.ts` | **El portero:** exige `business_id` para el ERP. Y `/tienda/cuenta/*` a `PUBLIC_PATHS`. |
| `middleware.test.ts` | Pruebas del portero, en los dos sentidos. |
| `server/auth/actions.ts` | `signOut` acepta a dónde volver: el cliente vuelve a `/tienda`, no a `/login`. |
| `app/tienda/layout.tsx` | Enlace de cuenta junto al carrito. |
| `server/db/database.types.ts` | Tipos de la tabla nueva. |

**No se toca:** `auth-claims.ts`, `context.ts`, `catalog.ts`, `tenant.ts`, `cart.ts`, el POS, el killswitch de DGII.

---

### Task 1: El portero

**La tarea más importante del incremento.** Hoy `middleware.ts:95` pregunta una sola cosa: *"¿hay un usuario?"*. Eso alcanza porque **la única forma de existir como usuario es que un administrador te cree**. Abrir el registro público invierte esa premisa.

Comprobado en la base antes de tocar nada: los tres usuarios que existen tienen `business_id` y ninguno es `is_platform_admin`, así que el portón nuevo no deja fuera a nadie de hoy. Aun así la condición contempla al súper admin, porque es personal por definición y `/super-admin` ya tiene su propio control.

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/middleware.test.ts`

**Interfaces:**
- Produces: `isBusinessUser(appMetadata): boolean`, exportada para poder probarla.

- [ ] **Step 1: Write the failing test**

Al final de `apps/web/src/middleware.test.ts`, antes del cierre del archivo:

```ts
describe("isBusinessUser", () => {
  /**
   * El portero pregunta hoy "¿hay un usuario?", y eso alcanza sólo porque los
   * usuarios los crea un administrador. Con el registro de clientes abierto,
   * cualquiera que se inscriba en la tienda pasaría hacia /inventario y /ventas.
   * Lo que distingue al personal es tener `business_id` en `app_metadata`.
   */
  it("deja pasar a quien tiene business_id", () => {
    expect(
      isBusinessUser({ business_id: "00000000-0000-0000-0000-00000000d001" }),
    ).toBe(true);
  });

  it("NO deja pasar a un cliente de la tienda", () => {
    // Así queda un usuario recién creado por `auth.signUp`: sin claims.
    expect(isBusinessUser({})).toBe(false);
    expect(isBusinessUser(undefined)).toBe(false);
    expect(isBusinessUser(null)).toBe(false);
  });

  it("no acepta un business_id que no sea texto con contenido", () => {
    expect(isBusinessUser({ business_id: "" })).toBe(false);
    expect(isBusinessUser({ business_id: "   " })).toBe(false);
    expect(isBusinessUser({ business_id: true })).toBe(false);
    expect(isBusinessUser({ business_id: 1 })).toBe(false);
  });

  it("el súper admin es personal aunque no tenga negocio asignado", () => {
    expect(isBusinessUser({ is_platform_admin: true })).toBe(true);
  });

  it("un is_platform_admin que no sea exactamente true no cuenta", () => {
    // Que un valor de texto "true" elevara a nadie sería la puerta de atrás.
    expect(isBusinessUser({ is_platform_admin: "true" })).toBe(false);
    expect(isBusinessUser({ is_platform_admin: 1 })).toBe(false);
  });
});
```

Y amplía el import de la cabecera: `import { isBusinessUser, isPublic } from "./middleware";`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/middleware.test.ts`
Expected: FAIL — `isBusinessUser is not a function`.

- [ ] **Step 3: Write the guard**

En `apps/web/src/middleware.ts`, justo debajo de la definición de `isPublic`:

```ts
/**
 * ¿Este usuario es PERSONAL del negocio, o un cliente de la tienda?
 *
 * Hasta ahora la pregunta no hacía falta: los usuarios sólo los creaba un
 * administrador, así que "hay sesión" y "es del negocio" eran lo mismo. Con el
 * registro de clientes abierto dejan de serlo, y `middleware` es el único sitio
 * donde la diferencia se puede aplicar ANTES de que se sirva una página del ERP.
 *
 * La marca es `business_id` en `app_metadata` —escribible sólo por service_role
 * (SEC-001)—. Un cliente recién registrado no la tiene y nunca la tendrá: su
 * vínculo con la ficha comercial vive en `client_auth_links`, no en el token.
 *
 * `is_platform_admin === true` (comparación estricta: un `"true"` de texto no
 * eleva a nadie) también entra, porque el súper admin es personal por
 * definición y puede no tener un negocio asignado. `/super-admin` conserva
 * además su propio control más abajo.
 */
export const isBusinessUser = (
  appMetadata: Record<string, unknown> | null | undefined,
): boolean => {
  const m = appMetadata ?? {};
  if (m.is_platform_admin === true) return true;
  const businessId = m.business_id;
  return typeof businessId === "string" && businessId.trim().length > 0;
};
```

Y en el cuerpo de `middleware`, justo después del bloque `if (!user) { … }` y **antes** del enforcement de 2FA:

```ts
  // Un cliente de la tienda tiene sesión válida pero NO es del negocio: se le
  // devuelve a la tienda, no a `/login` —ya está autenticado, mandarlo al login
  // sería pedirle que arregle algo que no está roto—.
  if (!isBusinessUser(user.app_metadata)) {
    const url = request.nextUrl.clone();
    url.pathname = "/tienda";
    url.search = "";
    return NextResponse.redirect(url);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/middleware.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify nothing else broke**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/middleware.ts apps/web/src/middleware.test.ts
git commit -m "fix(seguridad): el portero exige ser del negocio, no solo tener sesión"
```

---

### Task 2: La tabla puente

**Files:**
- Create: `supabase/migrations/0037_client_auth_links.sql`
- Modify: `apps/web/src/server/db/database.types.ts`

- [ ] **Step 1: Write the migration**

```sql
-- 0037_client_auth_links.sql
-- Puente entre la cuenta web de un cliente y su ficha comercial.
--
-- Por qué una tabla y no una columna en `clients`: un cliente del mostrador
-- existe sin cuenta web (es el caso normal), y una cuenta web puede existir
-- antes de que nadie le abra ficha. Son dos ciclos de vida distintos.
--
-- Por qué NO va en el token: `app_metadata` es la marca de que alguien es
-- PERSONAL del negocio, y el middleware la usa para decidir el acceso al ERP.
-- Meter ahí el `client_id` mezclaría "quién eres" con "qué puedes".
--
-- Idempotente de principio a fin: el historial de migraciones de este proyecto
-- no es fiable y se verifica por objeto (R-WEB-04).

create table if not exists public.client_auth_links (
  -- Una cuenta de Supabase = un cliente. Si se borra la cuenta, se borra el
  -- vínculo, nunca la ficha comercial ni su historial de compras.
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  client_id    uuid not null references public.clients (id) on delete cascade,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  created_at   timestamptz not null default now()
);

-- Un cliente no puede tener dos cuentas web en el mismo negocio.
create unique index if not exists client_auth_links_cliente_unico
  on public.client_auth_links (business_id, client_id);

create index if not exists client_auth_links_business_idx
  on public.client_auth_links (business_id);

alter table public.client_auth_links enable row level security;

-- Deny-by-default: sin políticas nadie lee ni escribe. Se añade EXACTAMENTE
-- una, de lectura, y sólo sobre la fila propia.
drop policy if exists client_auth_links_propia on public.client_auth_links;
create policy client_auth_links_propia
  on public.client_auth_links
  for select
  using (auth_user_id = auth.uid());

-- El alta la hace el servidor con service_role (que salta RLS): que un cliente
-- pudiera insertar aquí sería dejarle elegir a qué ficha comercial se engancha,
-- y con ella al historial de compras de otra persona.
revoke insert, update, delete on public.client_auth_links from anon, authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply it**

Aplicar con `mcp__supabase-dermaland__apply_migration` (nombre `0037_client_auth_links`).

- [ ] **Step 3: Verify by object, not by history**

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='client_auth_links') as tabla,
  (select relrowsecurity from pg_class where relname='client_auth_links') as rls,
  (select count(*) from pg_policies
    where tablename='client_auth_links') as politicas;
```
Expected: `tabla=1`, `rls=true`, `politicas=1`.

- [ ] **Step 4: Add the types**

En `apps/web/src/server/db/database.types.ts`, junto a las demás tablas añadidas a mano (`business_web_settings`, `product_web_meta`), añade `client_auth_links` con `Row`, `Insert` y `Update`:

```ts
      client_auth_links: {
        Row: {
          auth_user_id: string;
          client_id: string;
          business_id: string;
          created_at: string;
        };
        Insert: {
          auth_user_id: string;
          client_id: string;
          business_id: string;
          created_at?: string;
        };
        Update: {
          auth_user_id?: string;
          client_id?: string;
          business_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter web typecheck`
Expected: PASS.

```bash
git add supabase/migrations/0037_client_auth_links.sql apps/web/src/server/db/database.types.ts
git commit -m "feat(tienda): tabla puente client_auth_links con RLS deny-by-default"
```

---

### Task 3: Validación del alta

Función pura, aparte del servidor, para poder probar las reglas del formulario sin base de datos ni Supabase.

**Files:**
- Create: `apps/web/src/features/storefront/account/registration.ts`
- Test: `apps/web/src/features/storefront/account/registration.test.ts`

**Interfaces:**
- Produces: `parseRegistration(raw): { ok: true; value: RegistrationInput } | { ok: false; error: string }` y `RegistrationInput { email, password, firstName, lastName, phone }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/storefront/account/registration.test.ts
import { describe, expect, it } from "vitest";
import { parseRegistration } from "./registration";

const VALIDO = {
  email: "  Ana.Perez@Example.COM ",
  password: "unaclavelarga1",
  firstName: " Ana ",
  lastName: " Pérez ",
  phone: "809-555-1234",
};

describe("parseRegistration", () => {
  it("normaliza correo, nombre y teléfono", () => {
    const r = parseRegistration(VALIDO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.email).toBe("ana.perez@example.com");
    expect(r.value.firstName).toBe("Ana");
    expect(r.value.lastName).toBe("Pérez");
    // El teléfono se guarda en dígitos: así casa con el dedup, que compara
    // contra teléfonos tecleados de mil maneras distintas en el mostrador.
    expect(r.value.phone).toBe("8095551234");
  });

  it("exige un correo con forma de correo", () => {
    const r = parseRegistration({ ...VALIDO, email: "ana@" });
    expect(r.ok).toBe(false);
  });

  it("exige una clave de al menos 8 caracteres", () => {
    const r = parseRegistration({ ...VALIDO, password: "corta" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("8");
  });

  it("exige nombre y apellido", () => {
    expect(parseRegistration({ ...VALIDO, firstName: "  " }).ok).toBe(false);
    expect(parseRegistration({ ...VALIDO, lastName: "" }).ok).toBe(false);
  });

  it("exige un teléfono dominicano marcable", () => {
    expect(parseRegistration({ ...VALIDO, phone: "123" }).ok).toBe(false);
    expect(parseRegistration({ ...VALIDO, phone: "" }).ok).toBe(false);
  });

  it("acepta el teléfono escrito de cualquier manera", () => {
    for (const escrito of ["8095551234", "(809) 555-1234", "809 555 1234"]) {
      const r = parseRegistration({ ...VALIDO, phone: escrito });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.phone).toBe("8095551234");
    }
  });

  it("los mensajes de error son para una persona, no un volcado de zod", () => {
    const r = parseRegistration({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).not.toContain("invalid_type");
    expect(r.error.length).toBeLessThan(120);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/storefront/account/registration.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/features/storefront/account/registration.ts
// Reglas del alta de un cliente en la tienda.
//
// Aparte del servidor y sin Supabase para poder probarlas enteras. Y con
// mensajes escritos para una persona: quien se está registrando en una tienda
// no tiene por qué leer "invalid_type: expected string, received undefined".
//
// El teléfono se normaliza a dígitos porque es la llave con la que se busca si
// esa persona YA existe como cliente del mostrador, donde se ha tecleado de
// todas las formas posibles.

import { z } from "zod";

export interface RegistrationInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Sólo dígitos, 10 posiciones (formato dominicano sin código de país). */
  phone: string;
}

/** Mínimo de Supabase Auth; subirlo aquí no sube la seguridad real. */
const MIN_CLAVE = 8;

/** Teléfono dominicano sin código de país. */
const LARGO_TELEFONO = 10;

const Esquema = z.object({
  email: z
    .string({ message: "Escribe tu correo." })
    .trim()
    .toLowerCase()
    .email("Ese correo no parece válido."),
  password: z
    .string({ message: "Escribe una contraseña." })
    .min(MIN_CLAVE, `La contraseña necesita al menos ${MIN_CLAVE} caracteres.`),
  firstName: z
    .string({ message: "Escribe tu nombre." })
    .trim()
    .min(1, "Escribe tu nombre."),
  lastName: z
    .string({ message: "Escribe tu apellido." })
    .trim()
    .min(1, "Escribe tu apellido."),
  phone: z
    .string({ message: "Escribe tu teléfono." })
    .transform((v) => v.replace(/\D/g, ""))
    .refine(
      (v) => v.length === LARGO_TELEFONO,
      "El teléfono debe tener 10 dígitos.",
    ),
});

export type RegistrationResult =
  | { ok: true; value: RegistrationInput }
  | { ok: false; error: string };

export function parseRegistration(raw: unknown): RegistrationResult {
  const r = Esquema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  // El primer problema y nada más: una lista de seis errores a la vez no ayuda
  // a nadie a arreglar el formulario.
  const primero = r.error.issues[0];
  return { ok: false, error: primero?.message ?? "Revisa los datos." };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/storefront/account/registration.test.ts`
Expected: PASS — 7 pruebas.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/storefront/account
git commit -m "feat(tienda): reglas del alta de cliente como función pura"
```

---

### Task 4: Alta y resolución de la cuenta

**Files:**
- Create: `apps/web/src/server/services/storefront/customer-account.ts`
- Modify: `apps/web/src/server/auth/actions.ts`

**Interfaces:**
- Consumes: `parseRegistration` (Task 3), `resolveStorefrontTenant`.
- Produces: `signUpCustomer(raw): Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }>`, `resolveCustomerAccount(): Promise<CustomerAccount | null>` con `CustomerAccount { email, firstName, lastName, phone }`.

- [ ] **Step 1: Write the service**

```ts
// apps/web/src/server/services/storefront/customer-account.ts
import "server-only";
import { parseRegistration } from "@/features/storefront/account/registration";
import { createServer, createServiceRoleClient } from "@/lib/supabase/server";
import { resolveStorefrontTenant } from "./tenant";

/**
 * Alta y lectura de la cuenta web de un cliente.
 *
 * Lo que hace que esto NO abra el ERP: el usuario se crea con `app_metadata`
 * VACÍO. Sin `business_id`, el portero del middleware lo devuelve a `/tienda`
 * antes de servirle una sola página interna. Aquí no se escribe `app_metadata`
 * en ningún momento, y si alguien lo intentara en el futuro, esa línea sería el
 * fallo de seguridad — no el formulario.
 *
 * El vínculo con la ficha comercial va a `client_auth_links` con service-role,
 * no al token: que el cliente pudiera insertar ahí sería dejarle elegir a qué
 * historial de compras se engancha.
 */

export interface CustomerAccount {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface SignUpResult {
  ok: boolean;
  error?: string;
  /** Supabase exige confirmar el correo antes de dar sesión. */
  needsConfirmation?: boolean;
}

/** Valor de `clients.source` para las altas que entran por la web. */
const FUENTE_TIENDA = "tienda_web";

/**
 * ¿Esta persona ya tiene ficha en el mostrador?
 *
 * Tres consultas con `.eq()` en vez de un `.or()` con la cadena montada a mano.
 * `.or("email.eq." + email)` sería construir un filtro concatenando texto que
 * escribió un desconocido: una coma dentro del valor abre una condición nueva.
 * `.eq()` va parametrizado y no hay nada que escapar.
 */
async function buscarClienteExistente(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  businessId: string,
  datos: { email: string; phone: string },
): Promise<string | undefined> {
  const columnas: Array<"email" | "phone" | "whatsapp"> = [
    "email",
    "phone",
    "whatsapp",
  ];
  for (const columna of columnas) {
    const valor = columna === "email" ? datos.email : datos.phone;
    const { data } = await admin
      .from("clients")
      .select("id")
      .eq("business_id", businessId)
      .eq(columna, valor)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return undefined;
}

export async function signUpCustomer(raw: unknown): Promise<SignUpResult> {
  const parsed = parseRegistration(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const tenant = await resolveStorefrontTenant();
  // Sin tienda encendida no hay a qué negocio enganchar la cuenta. Fail-closed.
  if (!tenant) return { ok: false, error: "La tienda no está disponible." };

  const sb = await createServer();
  const admin = createServiceRoleClient();
  if (!sb || !admin) return { ok: false, error: "Cuentas no disponibles." };

  const { email, password, firstName, lastName, phone } = parsed.value;

  // `signUp` NO recibe `app_metadata`: no se puede escribir desde el cliente, y
  // aquí tampoco se escribe desde el servidor. El cliente web nace sin claims.
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) {
    // El mensaje de Supabase viene en inglés y a veces revela si el correo ya
    // existe. Se responde siempre lo mismo para no convertir el formulario en
    // un comprobador de qué correos están registrados.
    return {
      ok: false,
      error: "No pudimos crear la cuenta. Revisa el correo e inténtalo de nuevo.",
    };
  }
  const authUserId = data.user?.id;
  if (!authUserId) return { ok: false, error: "No pudimos crear la cuenta." };

  // ¿Ya compraba en el mostrador? Se reutiliza su ficha en vez de duplicarla.
  //
  // Consultas separadas con `.eq()` y NO un `.or()` con la cadena montada a
  // mano: `.or("email.eq." + email)` es construir un filtro concatenando texto
  // que escribió un desconocido —una coma dentro del correo abre un filtro
  // nuevo—. `.eq()` va parametrizado y no hay nada que escapar.
  const clientId = await buscarClienteExistente(admin, tenant.businessId, {
    email,
    phone,
  });

  let idFinal = clientId;
  if (!idFinal) {
    const { data: creado, error: errorCliente } = await admin
      .from("clients")
      .insert({
        business_id: tenant.businessId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        whatsapp: phone,
        source: FUENTE_TIENDA,
      })
      .select("id")
      .single();
    if (errorCliente || !creado) {
      return { ok: false, error: "No pudimos crear la cuenta." };
    }
    idFinal = creado.id;
  }

  const { error: errorVinculo } = await admin
    .from("client_auth_links")
    .upsert(
      {
        auth_user_id: authUserId,
        client_id: idFinal,
        business_id: tenant.businessId,
      },
      { onConflict: "auth_user_id" },
    );
  if (errorVinculo) return { ok: false, error: "No pudimos crear la cuenta." };

  // Sin sesión devuelta = Supabase está exigiendo confirmar el correo.
  return { ok: true, needsConfirmation: !data.session };
}

/**
 * La cuenta de quien está mirando, o `null`.
 *
 * Devuelve `null` también para el PERSONAL del negocio: alguien con
 * `business_id` no es un cliente de la tienda, y enseñarle "Mi cuenta" con la
 * ficha de otro sería mezclar dos identidades distintas.
 */
export async function resolveCustomerAccount(): Promise<CustomerAccount | null> {
  const sb = await createServer();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  if (user.app_metadata?.business_id) return null;

  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data: vinculo } = await admin
    .from("client_auth_links")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!vinculo) return null;

  const { data: cliente } = await admin
    .from("clients")
    .select("first_name, last_name, email, phone")
    .eq("id", vinculo.client_id)
    .maybeSingle();
  if (!cliente) return null;

  return {
    email: cliente.email ?? user.email ?? "",
    firstName: cliente.first_name,
    lastName: cliente.last_name,
    phone: cliente.phone ?? undefined,
  };
}
```

- [ ] **Step 2: Let sign-out come back to the right place**

En `apps/web/src/server/auth/actions.ts`, cambia la firma de `signOut`:

```ts
/**
 * Logout. `volverA` decide dónde aterriza el usuario: el personal vuelve al
 * login del ERP y un cliente de la tienda vuelve a la tienda — mandarlo a
 * `/login` sería ofrecerle una puerta que no es la suya.
 */
export async function signOut(volverA = "/login"): Promise<void> {
  // Sólo rutas internas: un `next` externo aquí sería un open redirect
  // (misma regla que DL-12 en la página de login).
  const destino =
    volverA.startsWith("/") &&
    !volverA.startsWith("//") &&
    !volverA.startsWith("/\\")
      ? volverA
      : "/login";

  if (env.DATA_SOURCE === "mock" || !isSupabaseConfigured()) {
    const c = await cookies();
    c.delete("dl-mock-session");
    redirect(destino);
  }
  const sb = await createServer();
  await sb?.auth.signOut();
  redirect(destino);
}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: PASS. `signOut()` sin argumentos sigue yendo a `/login`, así que ninguna llamada existente cambia de comportamiento.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/server/services/storefront/customer-account.ts apps/web/src/server/auth/actions.ts
git commit -m "feat(tienda): alta de cliente web sin claims de negocio"
```

---

### Task 5: Las pantallas de cuenta

**Files:**
- Create: `apps/web/src/app/tienda/cuenta/registro/page.tsx`
- Create: `apps/web/src/app/tienda/cuenta/entrar/page.tsx`
- Create: `apps/web/src/app/tienda/cuenta/page.tsx`
- Create: `apps/web/src/features/storefront/components/account-nav.tsx`
- Modify: `apps/web/src/middleware.ts` (`/tienda/cuenta` ya entra por el prefijo `/tienda`; se añade una prueba que lo fija)
- Modify: `apps/web/src/middleware.test.ts`
- Modify: `apps/web/src/app/tienda/layout.tsx`

**Interfaces:**
- Consumes: `signUpCustomer`, `resolveCustomerAccount` (Task 4), `signIn`, `signOut`.
- Produces: `<AccountNav account>`.

- [ ] **Step 1: Pin the public paths with a test**

En `apps/web/src/middleware.test.ts`, en el `it.each` de rutas que pasan:

```ts
    // Cuenta del cliente: entrar y registrarse tienen que ser accesibles SIN
    // sesión. `/tienda/cuenta` comprueba la sesión en la página, no aquí.
    "/tienda/cuenta",
    "/tienda/cuenta/entrar",
    "/tienda/cuenta/registro",
```

Run: `pnpm --filter web test src/middleware.test.ts`
Expected: PASS ya, porque el prefijo `/tienda` las cubre. La prueba existe para que nadie las rompa al reordenar `PUBLIC_PATHS`.

- [ ] **Step 2: Write the sign-in page**

```tsx
// apps/web/src/app/tienda/cuenta/entrar/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signIn } from "@/server/auth/actions";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

/** Sin `searchParams` propios: sin esto saldría como ruta estática (§4.1). */
export const dynamic = "force-dynamic";

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  async function action(formData: FormData): Promise<void> {
    "use server";
    const res = await signIn(formData);
    // A la tienda, no a `/`: quien entra por aquí es un cliente, y `/` es el
    // panel del ERP —del que el portero lo devolvería igualmente—.
    if (res.ok) redirect("/tienda/cuenta");
    redirect(
      `/tienda/cuenta/entrar?error=${encodeURIComponent(res.error ?? "No pudimos entrar.")}`,
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)]">
        Entrar
      </h1>
      <p className="mt-2 text-sm text-[color:var(--brand-fg)]/70">
        Con tu cuenta guardas tus datos y no tienes que repetirlos en cada
        pedido.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-[color:var(--brand-warn)]/10 px-4 py-3 text-sm text-[color:var(--brand-fg)]/80"
        >
          {error}
        </p>
      ) : null}

      <form action={action} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="text-sm font-medium text-[color:var(--brand-fg)]"
          >
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="text-sm font-medium text-[color:var(--brand-fg)]"
          >
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[color:var(--brand-primary)] px-6 text-base font-semibold text-white hover:bg-[color:var(--brand-accent)]"
        >
          Entrar
        </button>
      </form>

      <p className="mt-6 text-sm text-[color:var(--brand-fg)]/70">
        ¿No tienes cuenta?{" "}
        <Link
          href="/tienda/cuenta/registro"
          className="font-semibold text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
        >
          Créala aquí
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Write the registration page**

```tsx
// apps/web/src/app/tienda/cuenta/registro/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signUpCustomer } from "@/server/services/storefront/customer-account";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

export const metadata: Metadata = {
  title: "Crear cuenta",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const CAMPOS = [
  { name: "firstName", label: "Nombre", type: "text", autoComplete: "given-name" },
  { name: "lastName", label: "Apellido", type: "text", autoComplete: "family-name" },
  { name: "phone", label: "Teléfono", type: "tel", autoComplete: "tel" },
  { name: "email", label: "Correo", type: "email", autoComplete: "email" },
  {
    name: "password",
    label: "Contraseña (mínimo 8 caracteres)",
    type: "password",
    autoComplete: "new-password",
  },
] as const;

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; confirmar?: string }>;
}) {
  const sp = await searchParams;
  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  async function action(formData: FormData): Promise<void> {
    "use server";
    const res = await signUpCustomer({
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (res.ok) {
      redirect(
        res.needsConfirmation
          ? "/tienda/cuenta/registro?confirmar=1"
          : "/tienda/cuenta",
      );
    }
    redirect(
      `/tienda/cuenta/registro?error=${encodeURIComponent(res.error ?? "No pudimos crear la cuenta.")}`,
    );
  }

  if (sp.confirmar) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)]">
          Revisa tu correo
        </h1>
        <p className="mt-3 text-sm text-[color:var(--brand-fg)]/70">
          Te enviamos un enlace para confirmar tu cuenta. Ábrelo y ya podrás
          entrar.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)]">
        Crear cuenta
      </h1>
      <p className="mt-2 text-sm text-[color:var(--brand-fg)]/70">
        Si ya compraste con nosotros, usa el mismo teléfono o correo y
        reconoceremos tu ficha.
      </p>

      {sp.error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-[color:var(--brand-warn)]/10 px-4 py-3 text-sm text-[color:var(--brand-fg)]/80"
        >
          {sp.error}
        </p>
      ) : null}

      <form action={action} className="mt-6 space-y-4">
        {CAMPOS.map((campo) => (
          <div key={campo.name}>
            <label
              htmlFor={campo.name}
              className="text-sm font-medium text-[color:var(--brand-fg)]"
            >
              {campo.label}
            </label>
            <input
              id={campo.name}
              name={campo.name}
              type={campo.type}
              required
              autoComplete={campo.autoComplete}
              className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
            />
          </div>
        ))}
        <button
          type="submit"
          className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[color:var(--brand-primary)] px-6 text-base font-semibold text-white hover:bg-[color:var(--brand-accent)]"
        >
          Crear cuenta
        </button>
      </form>

      <p className="mt-6 text-sm text-[color:var(--brand-fg)]/70">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/tienda/cuenta/entrar"
          className="font-semibold text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
        >
          Entra aquí
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Write "Mi cuenta"**

```tsx
// apps/web/src/app/tienda/cuenta/page.tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { signOut } from "@/server/auth/actions";
import { resolveCustomerAccount } from "@/server/services/storefront/customer-account";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

export const metadata: Metadata = {
  title: "Mi cuenta",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Mi cuenta.
 *
 * La sesión se comprueba AQUÍ y no en el middleware: `/tienda` entero es
 * público, y meter una llamada a Supabase en el middleware costaría un viaje de
 * red en cada visita a una página de catálogo que hoy sale de caché.
 *
 * No hay "Mis pedidos" todavía: los pedidos son F3.3, y una pantalla que sólo
 * puede decir "no tienes pedidos" no se construye.
 */
export default async function CuentaPage() {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  const cuenta = await resolveCustomerAccount();
  if (!cuenta) redirect("/tienda/cuenta/entrar");

  async function salir(): Promise<void> {
    "use server";
    await signOut("/tienda");
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)]">
        Mi cuenta
      </h1>

      <dl className="mt-6 divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
        {[
          ["Nombre", `${cuenta.firstName} ${cuenta.lastName}`],
          ["Correo", cuenta.email],
          ["Teléfono", cuenta.phone ?? "—"],
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-[color:var(--brand-fg)]/60">
              {etiqueta}
            </dt>
            <dd className="text-sm font-medium text-[color:var(--brand-fg)]">
              {valor}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-sm text-[color:var(--brand-fg)]/60">
        Para cambiar tus datos, escríbenos por WhatsApp y los actualizamos.
      </p>

      <form action={salir} className="mt-8">
        <button
          type="submit"
          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-black/10 bg-white px-5 text-sm font-medium text-[color:var(--brand-fg)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-primary)]"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Put the account link in the header**

```tsx
// apps/web/src/features/storefront/components/account-nav.tsx
import Link from "next/link";
import { User } from "lucide-react";

/**
 * Acceso a la cuenta desde el encabezado.
 *
 * Server Component a propósito: quién eres lo resuelve el servidor, así que no
 * hay nada que hidratar ni ningún parpadeo de "entrar" a "mi cuenta".
 */
export function AccountNav({ nombre }: { nombre?: string }) {
  return (
    <Link
      href={nombre ? "/tienda/cuenta" : "/tienda/cuenta/entrar"}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-2 text-sm font-medium text-[color:var(--brand-fg)] transition-colors hover:bg-[color:var(--brand-primary)]/5 hover:text-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
    >
      <User aria-hidden className="h-5 w-5" />
      <span className="hidden lg:inline">{nombre ?? "Entrar"}</span>
      <span className="sr-only lg:hidden">
        {nombre ? `Mi cuenta, ${nombre}` : "Entrar a mi cuenta"}
      </span>
    </Link>
  );
}
```

En `apps/web/src/app/tienda/layout.tsx`:

1. Añade los imports:

```ts
import { AccountNav } from "@/features/storefront/components/account-nav";
import { resolveCustomerAccount } from "@/server/services/storefront/customer-account";
```

2. Junto a la carga de categorías:

```ts
  const cuenta = await resolveCustomerAccount();
```

3. Dentro del `<div className="flex shrink-0 items-center gap-1 sm:gap-2">`, antes de `<CartBadge />`:

```tsx
              <AccountNav nombre={cuenta?.firstName} />
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: PASS. **Ninguna ruta de `/tienda` debe salir estática (`○`).**

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/tienda/cuenta \
        apps/web/src/features/storefront/components/account-nav.tsx \
        apps/web/src/app/tienda/layout.tsx apps/web/src/middleware.test.ts
git commit -m "feat(tienda): registro, entrada y mi cuenta para clientes"
```

---

### Task 6: Prueba en caliente y documentación

- [ ] **Step 1: Test it live**

```bash
pnpm --filter web dev
```

Enciende la tienda **temporalmente**:

```sql
update business_web_settings set storefront_enabled = true
where business_id = '00000000-0000-0000-0000-00000000d001';
```

Comprueba, en este orden:

1. `/tienda/cuenta/registro` → crear una cuenta de prueba con un correo desechable.
2. **La prueba que importa:** ya con esa sesión de cliente, pedir `/inventario`,
   `/ventas`, `/reportes` y `/super-admin`. Todas deben **redirigir a `/tienda`**.
3. `/tienda/cuenta` → enseña nombre, correo y teléfono. "Cerrar sesión" devuelve
   a `/tienda`, **no** a `/login`.
4. Entrar de nuevo desde `/tienda/cuenta/entrar`.
5. Con la MISMA cuenta, comprobar en la base que hay **una** fila en
   `client_auth_links` y **una** en `clients` (no dos).
6. Registrarse con el teléfono de un cliente que YA exista en el mostrador: debe
   enlazarse a esa ficha en vez de crear otra.
7. Entrar con la cuenta de PERSONAL (`wrodriguez3030@gmail.com`) y comprobar que
   el ERP sigue funcionando con normalidad — el portero no puede dejar fuera a
   quien sí es del negocio.

**Borra la cuenta de prueba y devuelve la tienda al estado seguro** (obligatorio):

```sql
delete from auth.users where email = '<el correo de prueba>';
update business_web_settings set storefront_enabled = false;
```

- [ ] **Step 2: Bump version and document**

1. `package.json` → `"version": "0.116.0"`.
2. `CHANGELOG.md` → entrada `## [0.116.0]` describiendo el portero, la tabla puente y las pantallas de cuenta.
3. `docs/tienda-en-linea.md` → fila `| F3.2 | Cuentas de cliente (portero + client_auth_links) | **Hecho** |`.
4. `docs/security.md` → apuntar el portero nuevo: qué distingue a un cliente de un usuario del negocio y por qué se resuelve en el middleware.

- [ ] **Step 3: Final verification**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(tienda): F3.2 — cuentas de cliente (v0.116.0)"
```

---

## Riesgos que este incremento abre

| ID | Riesgo | Mitigación |
|---|---|---|
| R-F32-01 | El registro público es una superficie de spam en `auth.users` | Supabase limita el ritmo por IP de serie; si aparece abuso, activar confirmación de correo (el código ya la contempla con `needsConfirmation`) |
| R-F32-02 | Un cliente web accede al ERP | El portero (Task 1), con prueba en los dos sentidos; `context.ts:55` sigue de red |
| R-F32-03 | El formulario delata qué correos están registrados | El error del alta es siempre el mismo, gane o pierda |
| R-F32-04 | Cliente duplicado con el del mostrador | Se busca por correo, teléfono y whatsapp antes de crear ficha |
| R-F32-05 | Alguien inserta en `client_auth_links` y se engancha a la ficha de otro | RLS deny-by-default + `revoke` explícito a `anon` y `authenticated`; el alta va con service-role |

## Verificación final del plan

- **El portero va primero**, con su prueba, antes de que exista un formulario de registro.
- **`auth-claims.ts` no se toca.**
- **La tienda sigue apagada.** El único paso que la enciende la apaga en el mismo paso.
- **Las rutas del catálogo no pagan una llamada a Supabase**: la sesión se comprueba en la página de cuenta, no en el middleware.
