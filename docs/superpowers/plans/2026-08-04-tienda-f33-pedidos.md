# Tienda F3.3 — el pedido dentro del ERP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el carrito deje de terminar en un WhatsApp y pase a ser un **pedido** que cae dentro del ERP, con su número, su estado y su pantalla para que el negocio lo prepare.

**Architecture:** El pedido es su propio documento en `web_orders` / `web_order_items`, con los precios en **instantánea**. No es una proforma y **no mueve inventario**: la venta se cobra en el POS cuando el cliente llega a retirar, que es donde ya viven la caja, el cajero y las reglas documentales. El cliente consulta su pedido por **token firmado**, reutilizando el mismo mecanismo de `/factura/[token]`.

**Tech Stack:** Next.js 15.5.18 (App Router) · React 19 · TypeScript estricto · Tailwind 4 · Supabase Postgres + RLS · Zod · Vitest · pnpm.

## Global Constraints

- **La tienda sigue APAGADA.** Ningún paso la enciende; se prueba encendiéndola en local y **devolviéndola siempre al estado seguro**.
- **El pedido NO mueve inventario.** Ni reserva, ni descuenta, ni toca lotes. La existencia que ve el visitante es informativa y quien confirma valida la real.
- **No se toca el POS** ni sus motores (`cart-line.ts`, `pricing.ts`, `emit_sale_atomic`), ni el killswitch de DGII, ni las secuencias fiscales.
- **Precios en INSTANTÁNEA** en `web_order_items`: los precios cambian y el pedido tiene que recordar lo que se ofreció. Mismo criterio que `sales_incentives`.
- **Entrega: solo RETIRO EN SUCURSAL.** Sin direcciones, sin envío, sin coste de reparto.
- **RLS deny-by-default** en las dos tablas nuevas, activado en la misma migración que las crea, y `if not exists` de principio a fin (R-WEB-04).
- **La consulta pública del pedido va por TOKEN**, nunca por número: `WEB-000123` es correlativo y adivinable.
- **Paginación server-side con `.range()`** en la pantalla del ERP: el tope silencioso de 1000 filas de PostgREST aplica igual aquí.
- **`RowActions` con iconos** en la columna de acciones, nunca texto. **Etiquetas legibles**, nunca claves ni UUID.
- **Táctil ≥ 44 px**; texto pequeño con `--brand-primary`.
- Comandos: `pnpm --filter web test <patrón>` · `pnpm --filter web typecheck` · `pnpm --filter web build` · `pnpm --filter web dev` (3031).

## Una corrección al diseño de la Fase 3

El diseño decía *"un pedido web genera proforma, igual que el POS"*. Al implementarlo se comprueba que **eso duplicaría el documento**: con retiro en sucursal y pago al recoger, la venta se cobra en el POS cuando el cliente llega — y ahí nace la proforma o la factura, con su caja, su cajero y sus reglas documentales.

Además `proformas.cashier_id` y `cashier_name` son **NOT NULL** (`cash_register_session_id` sí admite nulo, al contrario de lo que se supuso), y `number` gastaría un número de documento en un pedido que puede cancelarse.

Así que **el pedido no genera proforma**. La pantalla del pedido dice qué hay que cobrar y el cajero lo pasa por el POS como cualquier otra venta. `web_orders.proforma_id` queda en el modelo para el día que el pago en línea (F3.5) haga que el documento deba nacer antes.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0038_web_orders.sql` | Las dos tablas, la secuencia del número y RLS. |
| `features/storefront/orders/status.ts` | Máquina de estados pura: transiciones válidas y etiquetas legibles. |
| `features/storefront/orders/status.test.ts` | Sus pruebas. |
| `features/storefront/orders/types.ts` | `WebOrder`, `WebOrderItem`, `WebOrderStatus`. |
| `server/services/storefront/orders.ts` | `createWebOrder`, `findWebOrderByToken`, `listWebOrders`, `advanceWebOrder`. |
| `app/tienda/checkout/page.tsx` | Confirmar datos y sucursal, y enviar el pedido. |
| `features/storefront/components/checkout-view.tsx` | El formulario (cliente). |
| `app/api/storefront/orders/route.ts` | `POST` público que crea el pedido. |
| `app/tienda/pedido/[token]/page.tsx` | El pedido visto por el cliente, sin sesión. |
| `app/(app)/pedidos-web/page.tsx` | Lista en el ERP. |
| `app/(app)/pedidos-web/[id]/page.tsx` | Detalle y acciones de estado. |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `middleware.ts` | `/api/storefront/orders` y `/tienda/pedido` a `PUBLIC_PATHS`. |
| `middleware.test.ts` | En los dos sentidos. |
| `features/storefront/components/cart-view.tsx` | El botón lleva al checkout; WhatsApp queda de respaldo. |
| `server/db/database.types.ts` | Tipos de las tablas nuevas. |
| `components/layout/nav-items.ts` (o equivalente) | Entrada "Pedidos web". |

---

### Task 1: Las tablas

**Files:**
- Create: `supabase/migrations/0038_web_orders.sql`
- Modify: `apps/web/src/server/db/database.types.ts`

- [ ] **Step 1: Write the migration**

```sql
-- 0038_web_orders.sql
-- El pedido de la tienda en línea.
--
-- Por qué NO es una proforma: `proformas.cashier_id` y `cashier_name` son NOT
-- NULL, y a las once de la noche no hay cajero; `number` gastaría además un
-- número de documento en un pedido que puede cancelarse. La venta se cobra en el
-- POS cuando el cliente llega a retirar, que es donde viven la caja y las reglas
-- documentales.
--
-- El pedido NO mueve inventario. Reservar exigiría tocar lotes y FEFO, que es
-- justo lo que esta fase no puede permitirse.

create sequence if not exists public.web_order_number_seq;

create table if not exists public.web_orders (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  -- Sucursal de RETIRO. No hay envío a domicilio.
  branch_id     uuid not null references public.branches (id),
  number        text not null unique,
  client_id     uuid references public.clients (id) on delete set null,
  auth_user_id  uuid references auth.users (id) on delete set null,

  -- Contacto en INSTANTÁNEA: el pedido debe recordar a quién se le vendió
  -- aunque el cliente cambie de teléfono la semana que viene.
  contact_name  text not null,
  contact_phone text not null,
  contact_email text,

  fulfillment   text not null default 'pickup'
                check (fulfillment in ('pickup', 'delivery')),

  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  itbis    numeric(12,2) not null default 0,
  total    numeric(12,2) not null default 0,

  status text not null default 'recibido'
    check (status in ('recibido','confirmado','preparando','listo','entregado','cancelado')),
  payment_status text not null default 'pendiente'
    check (payment_status in ('pendiente','pagado','reembolsado')),

  -- Para el día que el pago en línea obligue a emitir el documento antes (F3.5).
  proforma_id uuid references public.proformas (id) on delete set null,
  cancel_reason text,
  notes text,
  -- Un doble clic en "Enviar pedido" no puede crear dos pedidos.
  idempotency_key text unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.web_order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.web_orders (id) on delete cascade,
  -- Repetido a propósito: permite una política RLS sin salto a la tabla padre.
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id  uuid not null references public.products (id),

  -- INSTANTÁNEA: los precios cambian y el pedido tiene que recordar lo que se
  -- ofreció. Mismo criterio que `sales_incentives`.
  product_name text not null,
  unit_price   numeric(12,2) not null,
  qty          integer not null check (qty > 0),
  line_total   numeric(12,2) not null,

  created_at timestamptz not null default now()
);

create index if not exists web_orders_business_idx
  on public.web_orders (business_id, created_at desc);
create index if not exists web_orders_status_idx
  on public.web_orders (business_id, status);
create index if not exists web_orders_auth_user_idx
  on public.web_orders (auth_user_id);
create index if not exists web_order_items_order_idx
  on public.web_order_items (order_id);

alter table public.web_orders enable row level security;
alter table public.web_order_items enable row level security;

-- Deny-by-default. El personal lee lo de SU negocio; el cliente, lo suyo.
-- Nadie escribe desde el navegador: el alta y los cambios de estado van por
-- rutas de servidor con rol comprobado, con service-role (que salta RLS).
drop policy if exists web_orders_personal on public.web_orders;
create policy web_orders_personal on public.web_orders for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);

drop policy if exists web_orders_propio on public.web_orders;
create policy web_orders_propio on public.web_orders for select
  using (auth_user_id = auth.uid());

drop policy if exists web_order_items_personal on public.web_order_items;
create policy web_order_items_personal on public.web_order_items for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);

drop policy if exists web_order_items_propio on public.web_order_items;
create policy web_order_items_propio on public.web_order_items for select
  using (exists (
    select 1 from public.web_orders o
    where o.id = web_order_items.order_id and o.auth_user_id = auth.uid()
  ));

revoke insert, update, delete on public.web_orders from anon, authenticated;
revoke insert, update, delete on public.web_order_items from anon, authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply and verify BY OBJECT**

Aplicar con `mcp__supabase-dermaland__apply_migration` (nombre `0038_web_orders`), y después:

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name in ('web_orders','web_order_items')) as tablas,
  (select count(*) from pg_class where relname in ('web_orders','web_order_items') and relrowsecurity) as con_rls,
  (select count(*) from pg_policies where tablename in ('web_orders','web_order_items')) as politicas,
  (select count(*) from information_schema.role_table_grants
    where table_name in ('web_orders','web_order_items')
      and grantee in ('anon','authenticated')
      and privilege_type in ('INSERT','UPDATE','DELETE')) as escrituras_publicas;
```
Expected: `tablas=2`, `con_rls=2`, `politicas=4`, `escrituras_publicas=0`.

- [ ] **Step 3: Add the types and commit**

Añadir `web_orders` y `web_order_items` a `database.types.ts` junto a las demás tablas puestas a mano, con `Row`/`Insert`/`Update`.

Run: `pnpm --filter web typecheck` → PASS.

```bash
git add supabase/migrations/0038_web_orders.sql apps/web/src/server/db/database.types.ts
git commit -m "feat(tienda): tablas web_orders y web_order_items con RLS deny-by-default"
```

---

### Task 2: La máquina de estados

**Files:**
- Create: `apps/web/src/features/storefront/orders/types.ts`
- Create: `apps/web/src/features/storefront/orders/status.ts`
- Test: `apps/web/src/features/storefront/orders/status.test.ts`

**Interfaces:**
- Produces: `WEB_ORDER_STATUSES`, `WebOrderStatus`, `webOrderStatusLabel(s)`, `canTransition(from, to)`, `nextStatuses(from)`, `isFinalStatus(s)`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/storefront/orders/status.test.ts
import { describe, expect, it } from "vitest";
import {
  canTransition,
  isFinalStatus,
  nextStatuses,
  WEB_ORDER_STATUSES,
  webOrderStatusLabel,
} from "./status";

describe("estados del pedido", () => {
  it("avanza por el camino normal", () => {
    expect(canTransition("recibido", "confirmado")).toBe(true);
    expect(canTransition("confirmado", "preparando")).toBe(true);
    expect(canTransition("preparando", "listo")).toBe(true);
    expect(canTransition("listo", "entregado")).toBe(true);
  });

  it("no retrocede: deshacer un estado se hace cancelando, no marcha atrás", () => {
    expect(canTransition("confirmado", "recibido")).toBe(false);
    expect(canTransition("entregado", "listo")).toBe(false);
  });

  it("no salta pasos", () => {
    expect(canTransition("recibido", "listo")).toBe(false);
    expect(canTransition("recibido", "entregado")).toBe(false);
  });

  it("se puede cancelar mientras no se haya entregado", () => {
    for (const s of ["recibido", "confirmado", "preparando", "listo"] as const) {
      expect(canTransition(s, "cancelado")).toBe(true);
    }
  });

  it("lo entregado y lo cancelado ya no se mueven", () => {
    expect(isFinalStatus("entregado")).toBe(true);
    expect(isFinalStatus("cancelado")).toBe(true);
    expect(nextStatuses("entregado")).toEqual([]);
    expect(nextStatuses("cancelado")).toEqual([]);
    expect(canTransition("cancelado", "recibido")).toBe(false);
  });

  it("quedarse donde está no es una transición", () => {
    expect(canTransition("recibido", "recibido")).toBe(false);
  });

  it("cada estado tiene etiqueta en español y ninguna es la clave cruda", () => {
    for (const s of WEB_ORDER_STATUSES) {
      const etiqueta = webOrderStatusLabel(s);
      expect(etiqueta.length).toBeGreaterThan(0);
      expect(etiqueta).not.toBe(s);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/features/storefront/orders`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write types and the machine**

```ts
// apps/web/src/features/storefront/orders/types.ts
import type { WebOrderStatus } from "./status";

export interface WebOrderItem {
  productSlug?: string;
  /** Nombre tal como se ofreció, no el de hoy. */
  productName: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface WebOrder {
  id: string;
  /** `WEB-000123`. Para hablar con el cliente, nunca para dar acceso. */
  number: string;
  status: WebOrderStatus;
  branchName: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  total: number;
  items: WebOrderItem[];
  notes?: string;
  createdAt: string;
}
```

```ts
// apps/web/src/features/storefront/orders/status.ts
// Por dónde puede pasar un pedido y por dónde no.
//
// Función pura y en un solo sitio: el estado lo cambian la pantalla del ERP y
// una ruta de servidor, y si cada una llevara su propia idea de qué es válido,
// acabarían discrepando. Aquí se prueba entera sin base de datos.
//
// No hay marcha atrás a propósito: deshacer se hace CANCELANDO, que deja rastro,
// no retrocediendo, que lo borra.

export const WEB_ORDER_STATUSES = [
  "recibido",
  "confirmado",
  "preparando",
  "listo",
  "entregado",
  "cancelado",
] as const;

export type WebOrderStatus = (typeof WEB_ORDER_STATUSES)[number];

const ETIQUETAS: Record<WebOrderStatus, string> = {
  recibido: "Recibido",
  confirmado: "Confirmado",
  preparando: "Preparando",
  listo: "Listo para retirar",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/** A dónde puede ir cada estado. Lo final no lleva a ninguna parte. */
const TRANSICIONES: Record<WebOrderStatus, WebOrderStatus[]> = {
  recibido: ["confirmado", "cancelado"],
  confirmado: ["preparando", "cancelado"],
  preparando: ["listo", "cancelado"],
  listo: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

export function webOrderStatusLabel(status: WebOrderStatus): string {
  return ETIQUETAS[status];
}

export function nextStatuses(from: WebOrderStatus): WebOrderStatus[] {
  return TRANSICIONES[from];
}

export function canTransition(
  from: WebOrderStatus,
  to: WebOrderStatus,
): boolean {
  return TRANSICIONES[from].includes(to);
}

export function isFinalStatus(status: WebOrderStatus): boolean {
  return TRANSICIONES[status].length === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/features/storefront/orders`
Expected: PASS — 7 pruebas.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/storefront/orders
git commit -m "feat(tienda): máquina de estados del pedido"
```

---

### Task 3: Crear el pedido

**Files:**
- Create: `apps/web/src/server/services/storefront/orders.ts`
- Create: `apps/web/src/app/api/storefront/orders/route.ts`
- Modify: `apps/web/src/middleware.ts`, `apps/web/src/middleware.test.ts`

**Interfaces:**
- Consumes: `buildCartSummary`, `parseCartItems` (F3.1), `signDocumentShareToken` / `verifyDocumentShareToken` de `server/services/sales/share-token`, `resolveStorefrontTenant`, `resolveCustomerAccount`.
- Produces: `createWebOrder(input): Promise<{ ok: true; token: string; number: string } | { ok: false; error: string }>` y `findWebOrderByToken(token): Promise<WebOrder | null>`.

- [ ] **Step 1: Open exactly two paths, with tests both ways**

En `middleware.test.ts`, al `it.each` de rutas que pasan:

```ts
    // Crear pedido y consultarlo: la tienda no tiene sesión. El acceso al
    // pedido ya creado lo da un TOKEN firmado, nunca el número.
    "/api/storefront/orders",
    "/tienda/pedido/abc123",
```

Y al de rutas que NO pasan:

```ts
    // Cambiar el estado de un pedido es del NEGOCIO, no del cliente.
    "/api/storefront/orders/9f0c2f5e-1111-2222-3333-444455556666/estado",
    "/pedidos-web",
```

**Nota:** `/api/storefront/orders` como entrada de `PUBLIC_PATHS` cubriría por
segmento a `/api/storefront/orders/<id>/estado`. Por eso el cambio de estado
**no** vive bajo esa ruta: va en `/api/pedidos-web/[id]/estado`, fuera del
prefijo público. La prueba de arriba lo fija.

En `middleware.ts`, dentro de `PUBLIC_PATHS`:

```ts
  // Alta de pedido desde la tienda (sin sesión) y consulta del pedido por token
  // firmado. El CAMBIO DE ESTADO no vive aquí debajo a propósito: está en
  // `/api/pedidos-web/...`, que exige sesión del negocio.
  "/api/storefront/orders",
  "/tienda/pedido",
```

Run: `pnpm --filter web test src/middleware.test.ts` → PASS.

- [ ] **Step 2: Write the service**

```ts
// apps/web/src/server/services/storefront/orders.ts
import "server-only";
import { buildCartSummary, parseCartItems } from "@/features/storefront/cart";
import type { WebOrder } from "@/features/storefront/orders/types";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  signDocumentShareToken,
  verifyDocumentShareToken,
} from "@/server/services/sales/share-token";
import { loadPublishedCatalog } from "./catalog";
import { resolveCustomerAccount } from "./customer-account";
import { resolveStorefrontTenant } from "./tenant";

/**
 * Alta y consulta de pedidos de la tienda.
 *
 * El TOTAL lo calcula el servidor contra el catálogo publicado, igual que en el
 * carrito: lo que llega del navegador son slugs y cantidades, nunca importes.
 * Y se guarda en INSTANTÁNEA, porque el precio de mañana no es el que se ofreció.
 *
 * El pedido NO mueve inventario. La existencia que vio el visitante es
 * informativa; quien confirma valida la real y puede cancelar.
 */

export interface CreateWebOrderInput {
  items: unknown;
  branchSlug: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  notes?: string;
  idempotencyKey: string;
}

export type CreateWebOrderResult =
  | { ok: true; token: string; number: string }
  | { ok: false; error: string };

/** `WEB-000123`. Para hablar con el cliente; el acceso lo da el token. */
async function siguienteNumero(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
): Promise<string | null> {
  const { data, error } = await admin.rpc("nextval_web_order_number");
  if (error || data == null) return null;
  return `WEB-${String(data).padStart(6, "0")}`;
}

export async function createWebOrder(
  input: CreateWebOrderInput,
): Promise<CreateWebOrderResult> {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) return { ok: false, error: "La tienda no está disponible." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "No se pudo registrar el pedido." };

  const sucursal = tenant.branches.find((b) => b.slug === input.branchSlug);
  if (!sucursal) return { ok: false, error: "Elige una sucursal para retirar." };

  const { products } = await loadPublishedCatalog(tenant.businessId);
  const resumen = buildCartSummary(parseCartItems(input.items), products);
  if (resumen.lines.length === 0) {
    return { ok: false, error: "Tu carrito está vacío." };
  }

  // El `branch_id` real sale del slug, resuelto en el servidor: si viniera del
  // navegador, un visitante podría mandar el de otro negocio.
  const { data: branchRow } = await admin
    .from("branches")
    .select("id")
    .eq("business_id", tenant.businessId)
    .eq("show_on_website", true)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("code", sucursal.slug)
    .maybeSingle();

  const branchId = branchRow?.id ?? (await primeraSucursalWeb(admin, tenant.businessId));
  if (!branchId) return { ok: false, error: "No hay sucursal disponible." };

  const cuenta = await resolveCustomerAccount();
  const numero = await siguienteNumero(admin);
  if (!numero) return { ok: false, error: "No se pudo registrar el pedido." };

  const { data: pedido, error } = await admin
    .from("web_orders")
    .insert({
      business_id: tenant.businessId,
      branch_id: branchId,
      number: numero,
      contact_name: input.contactName,
      contact_phone: input.contactPhone,
      contact_email: input.contactEmail ?? null,
      fulfillment: "pickup",
      subtotal: resumen.total,
      itbis: 0,
      total: resumen.total,
      notes: input.notes ?? null,
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();

  if (error || !pedido) {
    return { ok: false, error: "No se pudo registrar el pedido." };
  }

  const { error: errorLineas } = await admin.from("web_order_items").insert(
    resumen.lines.map((l) => ({
      order_id: pedido.id,
      business_id: tenant.businessId,
      product_id: l.product.slug,
      product_name: l.product.title,
      unit_price: l.product.price,
      qty: l.qty,
      line_total: l.lineTotal,
    })),
  );
  if (errorLineas) return { ok: false, error: "No se pudo registrar el pedido." };

  return {
    ok: true,
    number: numero,
    token: signDocumentShareToken(tenant.businessId, pedido.id),
  };
}
```

**Nota para quien lo implemente:** `product_id` es una FK a `products.id`, y
`PublicProduct` **no expone el UUID** a propósito. Hay dos salidas y sólo una es
aceptable: **resolver el `product_id` en el servidor** a partir del slug, con una
consulta contra `product_web_meta` (que tiene `slug` y `product_id`). **No** se
añade el UUID a `PublicProduct`: ese tipo es la lista blanca de lo que puede
llegar al HTML, y ampliarlo por comodidad es exactamente lo que R-WEB-01 evita.

- [ ] **Step 3: Add the sequence function to the migration**

En `0038_web_orders.sql`, antes del `notify`:

```sql
-- Envuelve la secuencia en una función para poder llamarla por RPC desde
-- PostgREST. `security definer` con `search_path` fijado: DL-14.
create or replace function public.nextval_web_order_number()
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$ select nextval('public.web_order_number_seq') $$;

revoke execute on function public.nextval_web_order_number() from anon, authenticated;
```

- [ ] **Step 4: Write the public route**

`app/api/storefront/orders/route.ts`: `POST` con zod (mismos topes que el carrito: `MAX_LINES`, `MAX_QTY_PER_LINE`), 404 con la tienda apagada, 422 si el cuerpo no valida, y devuelve `{ number, token }`. `Cache-Control: no-store`.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter web typecheck && pnpm --filter web test` → PASS.

```bash
git add apps/web/src/server/services/storefront/orders.ts apps/web/src/app/api/storefront/orders \
        apps/web/src/middleware.ts apps/web/src/middleware.test.ts supabase/migrations/0038_web_orders.sql
git commit -m "feat(tienda): alta de pedido con total calculado en el servidor"
```

---

### Task 4: El checkout y el pedido del cliente

**Files:**
- Create: `apps/web/src/app/tienda/checkout/page.tsx`
- Create: `apps/web/src/features/storefront/components/checkout-view.tsx`
- Create: `apps/web/src/app/tienda/pedido/[token]/page.tsx`
- Modify: `apps/web/src/features/storefront/components/cart-view.tsx`

- [ ] **Step 1: Checkout**

`/tienda/checkout` (`force-dynamic`) recoge nombre, teléfono, correo opcional, sucursal y una nota; si hay cuenta iniciada, los campos vienen rellenos con `resolveCustomerAccount()`. Al enviar llama a `/api/storefront/orders` y lleva a `/tienda/pedido/[token]`. El `idempotencyKey` lo genera el cliente **una sola vez por carrito** (`crypto.randomUUID()` guardado en el estado) para que un doble clic no cree dos pedidos.

- [ ] **Step 2: El pedido del cliente**

`/tienda/pedido/[token]` verifica el token con `verifyDocumentShareToken` y enseña número, estado con su etiqueta legible, líneas, total y en qué sucursal se retira. Token inválido o caducado → `notFound()`, nunca un mensaje que distinga "no existe" de "no es tuyo". `robots: noindex`.

- [ ] **Step 3: El carrito lleva al checkout**

En `cart-view.tsx`, el botón principal pasa a ser **"Continuar con el pedido"** hacia `/tienda/checkout`, y el de WhatsApp queda como secundario ("Preguntar por WhatsApp"), porque sigue siendo útil para dudas.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build` → PASS, ninguna ruta de `/tienda` estática.

```bash
git commit -am "feat(tienda): checkout y consulta del pedido por token"
```

---

### Task 5: La pantalla del ERP

**Files:**
- Create: `apps/web/src/app/(app)/pedidos-web/page.tsx`
- Create: `apps/web/src/app/(app)/pedidos-web/[id]/page.tsx`
- Create: `apps/web/src/app/api/pedidos-web/[id]/estado/route.ts`
- Modify: la navegación del ERP

- [ ] **Step 1: Lista**

Tabla con número, fecha, cliente, sucursal, total y estado (`Badge`), **paginada server-side con `.range()`** y filtro por estado. Acciones con `RowActions` de iconos, nunca texto.

- [ ] **Step 2: Detalle y cambio de estado**

Detalle con las líneas y los botones de los estados que permita `nextStatuses`. La ruta `/api/pedidos-web/[id]/estado` comprueba rol con `requireRole` (los mismos que gestionan ventas), valida la transición con `canTransition` —el servidor no se fía del botón— y escribe en `audit_logs` con etiqueta legible.

Al llegar a **"Listo para retirar"**, el detalle enseña un aviso: *el cobro se hace en el POS cuando el cliente venga*. No se crea proforma (ver la corrección al diseño arriba).

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build` → PASS.

---

### Task 6: Prueba en caliente y documentación

- [ ] **Step 1: Recorrido completo** con la tienda encendida temporalmente: agregar al carrito → checkout → pedido creado → verlo por su token → verlo en `/pedidos-web` → avanzar estados → comprobar en `audit_logs`. Probar además: doble envío con la misma `idempotencyKey` crea **un** pedido; token manipulado da 404; un cliente **no** puede abrir `/pedidos-web`.
- [ ] **Step 2: Borrar los pedidos de prueba y apagar la tienda.** Obligatorio.
- [ ] **Step 3:** versión `0.117.0`, CHANGELOG, `docs/tienda-en-linea.md` (fila F3.3) y la corrección al spec de la Fase 3 sobre la proforma.

---

## Verificación final del plan

- **El pedido no mueve inventario** y **no genera proforma**: la venta se cobra en el POS, donde ya viven la caja y las reglas documentales.
- **El total lo calcula el servidor**, igual que en el carrito, y se guarda en instantánea.
- **El acceso público al pedido va por token firmado**, nunca por número.
- **Cambiar de estado NO es público**: vive fuera del prefijo `/api/storefront`, y hay prueba que lo fija.
- **La tienda sigue apagada.**
