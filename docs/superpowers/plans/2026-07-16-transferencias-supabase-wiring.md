# Transferencias → Supabase (datos reales + RPC atómico) — Implementation Plan

**Goal:** Conectar el módulo de Transferencias de inventario a Supabase (hoy 100% mock/localStorage), de modo que lea/escriba el inventario REAL y mueva stock atómicamente entre sucursales.

**Architecture:** RPC atómico `transfer_stock_atomic` (SECURITY INVOKER, `auth_business_id()`) que descuenta el lote origen y crea/suma el lote destino registrando `transfer_out`/`transfer_in`, replicando `emit_sale_atomic`. Repositorio + ruta `/api/transfers` + wiring cliente gateado por `NEXT_PUBLIC_DATA_SOURCE`. Las pantallas leen lotes/productos reales (`useAllLots`/`useProducts`). Los helpers puros existentes (`applyTransferScan`, `matchesTransferSearch`, `resolveTransferPrefill`) NO cambian: solo se les alimenta data real.

**Tech Stack:** Postgres/plpgsql (Supabase), Next.js API routes, TypeScript, repositorios Supabase, Vitest, script e2e Node con `@supabase/supabase-js`.

## Global Constraints

- Trabajar en `C:\dev\dermaland`; rama `feat/transferencias-supabase`.
- DDL a prod: **solo el usuario** lo aplica vía SQL Editor de Supabase (política DermaLand). El MCP de Supabase apunta a otro proyecto → no aplicar DDL por MCP.
- Tenant SIEMPRE de `auth_business_id()` (RPC) y `ctx.businessId` (repo); NUNCA del body.
- `warehouse_id` real se resuelve SOLO en el server con `resolveBranchWarehouseId`/`ensureDefaultWarehouseForBranch`; la UI no conoce UUIDs de almacén.
- Constraint `unique(business_id, product_id, lot_number, warehouse_id)` en `product_lots`: el lote destino con mismo `(product, lot_number, warehouse)` se SUMA (upsert), no se inserta duplicado.
- `transfer_out`/`transfer_in` ya válidos en el `check` de `inventory_movements` (mig 0002). No hace falta tocar ese constraint.

---

## File Structure

- **Create** `supabase/migrations/0032_transfer_atomic.sql` — RPC `transfer_stock_atomic` (+ `void_transfer_atomic` opcional).
- **Modify** `apps/web/src/server/repositories/supabase/mappers.ts` — `inventoryTransferRowToTs`, `inventoryTransferItemRowToTs`.
- **Create** `apps/web/src/server/repositories/supabase/transfers.ts` — `inventoryTransferRepository` (list/byId/create).
- **Modify** `apps/web/src/server/repositories/types.ts` — interfaz `InventoryTransferRepository` + agregar a `Repositories`.
- **Modify** `apps/web/src/server/repositories/supabase/index.ts` — registrar `inventoryTransfer`.
- **Modify** `apps/web/src/server/repositories/mock/index.ts` — stub mock `inventoryTransfer` (usa el transfer-store local).
- **Create** `apps/web/src/app/api/transfers/route.ts` — GET (list) + POST (create).
- **Create** `apps/web/src/app/api/transfers/[id]/route.ts` — GET (byId).
- **Modify** `apps/web/src/features/inventory/transfer-store.ts` — `TRANSFER_BACKEND`, `createTransferOnServer`, `fetchTransfersFromServer`, hooks `useTransfers`/`useTransfer`; `createTransfer` gateado.
- **Modify** `apps/web/src/app/(app)/inventario/transferencias/nueva/page.tsx` — lotes/productos reales + create gateado.
- **Modify** `apps/web/src/app/(app)/inventario/transferencias/page.tsx` — lista real + lookup de nombre con productos reales.
- **Modify** `apps/web/src/app/(app)/inventario/transferencias/[id]/page.tsx` — detalle real.
- **Create** `scripts/test/transfer-atomic-test.mjs` — e2e en vivo del RPC.
- **Create** `apps/web/src/features/inventory/transfer-payload.ts` (+ test) — armado puro del payload del RPC (testeable).

---

## Task 1: Migración `0032_transfer_atomic.sql` (RPC atómico)

**Files:** Create `supabase/migrations/0032_transfer_atomic.sql`

Contenido (replica `emit_sale_atomic`; SECURITY INVOKER; jsonb params):

```sql
-- =============================================================================
-- DermaLand · Transferencia de stock ATÓMICA entre sucursales
-- =============================================================================
-- Descuenta del lote origen y crea/suma el lote destino (mismo lote+vencimiento),
-- registra inventory_transfers + items + dos movimientos (transfer_out/transfer_in)
-- con la misma referencia. Todo en una transacción. SECURITY INVOKER → RLS aplica.
-- p_header: { transfer_number, origin_branch_id, origin_warehouse_id,
--             destination_branch_id, destination_warehouse_id, transfer_date, notes }
-- p_items:  [ { lot_id, qty } ]
create or replace function public.transfer_stock_atomic(
  p_header jsonb,
  p_items jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_biz uuid := auth_business_id();
  v_user uuid := auth.uid();
  v_transfer_id uuid;
  v_number text := p_header->>'transfer_number';
  v_dest_branch uuid := (p_header->>'destination_branch_id')::uuid;
  v_dest_wh uuid := (p_header->>'destination_warehouse_id')::uuid;
  v_origin_wh uuid := (p_header->>'origin_warehouse_id')::uuid;
  v_date date := coalesce((p_header->>'transfer_date')::date, current_date);
  v_notes text := p_header->>'notes';
  v_it jsonb;
  v_qty int;
  v_lot public.product_lots%rowtype;
  v_dest_lot_id uuid;
  v_total int := 0;
begin
  if v_biz is null then
    raise exception 'No autenticado (sin business_id)' using errcode = '28000';
  end if;
  if v_number is null or v_number = '' then
    raise exception 'Falta transfer_number' using errcode = 'P0001';
  end if;
  if v_dest_wh = v_origin_wh then
    raise exception 'Origen y destino no pueden ser el mismo almacén' using errcode = 'P0001';
  end if;

  insert into public.inventory_transfers (
    business_id, transfer_number, origin_warehouse_id, destination_warehouse_id,
    transfer_date, notes, status, created_by
  ) values (
    v_biz, v_number, v_origin_wh, v_dest_wh, v_date, v_notes, 'completed', v_user
  ) returning id into v_transfer_id;

  for v_it in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_it->>'qty')::int;
    if v_qty is null or v_qty <= 0 then continue; end if;

    -- Descontar del lote origen (guarda de stock atómica).
    update public.product_lots
      set current_quantity = current_quantity - v_qty, updated_at = now()
      where id = (v_it->>'lot_id')::uuid
        and business_id = v_biz
        and status = 'available'
        and current_quantity >= v_qty
      returning * into v_lot;
    if not found then
      raise exception 'STOCK_INSUFICIENTE: lote % (se pidió %)', v_it->>'lot_id', v_qty
        using errcode = 'P0001';
    end if;

    -- Crear/sumar el lote destino (respeta unique(business,product,lot_number,warehouse)).
    select id into v_dest_lot_id
      from public.product_lots
      where business_id = v_biz and product_id = v_lot.product_id
        and lot_number = v_lot.lot_number and warehouse_id = v_dest_wh
      for update;
    if found then
      update public.product_lots
        set current_quantity = current_quantity + v_qty, updated_at = now()
        where id = v_dest_lot_id;
    else
      insert into public.product_lots (
        business_id, branch_id, product_id, warehouse_id, lot_number,
        manufactured_at, expires_at, received_at, initial_quantity,
        current_quantity, unit_cost, status, notes
      ) values (
        v_biz, v_dest_branch, v_lot.product_id, v_dest_wh, v_lot.lot_number,
        v_lot.manufactured_at, v_lot.expires_at, now(), v_qty,
        v_qty, v_lot.unit_cost, 'available', 'Transferencia ' || v_number
      ) returning id into v_dest_lot_id;
    end if;

    insert into public.inventory_transfer_items (
      business_id, transfer_id, product_id, lot_id, quantity, unit_cost, expiration_date
    ) values (
      v_biz, v_transfer_id, v_lot.product_id, v_lot.id, v_qty, v_lot.unit_cost, v_lot.expires_at
    );

    -- Movimientos en pareja (misma referencia = número de transferencia).
    insert into public.inventory_movements (
      business_id, branch_id, product_id, warehouse_id, lot_id,
      type, quantity, reason, reference, user_id
    ) values
      (v_biz, v_lot.branch_id, v_lot.product_id, v_lot.warehouse_id, v_lot.id,
       'transfer_out', -v_qty, coalesce(v_notes, 'Transferencia entre sucursales'), v_number, v_user),
      (v_biz, v_dest_branch, v_lot.product_id, v_dest_wh, v_dest_lot_id,
       'transfer_in', v_qty, coalesce(v_notes, 'Transferencia entre sucursales'), v_number, v_user);

    v_total := v_total + v_qty;
  end loop;

  if v_total = 0 then
    raise exception 'La transferencia no tiene ítems con cantidad > 0' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_transfer_id, 'transfer_number', v_number, 'total', v_total);
end;
$$;

notify pgrst, 'reload schema';
```

- [ ] **Step 1:** Escribir el archivo con el SQL de arriba.
- [ ] **Step 2:** (Checkpoint usuario) El usuario lo corre en el SQL Editor de Supabase de prod. No se puede probar el RPC hasta que exista. Continuar con el resto del código (no depende de la migración para compilar).

---

## Task 2: Payload puro `transfer-payload.ts` (TDD)

**Files:** Create `apps/web/src/features/inventory/transfer-payload.ts` + `.test.ts`

Arma el payload del RPC a partir del input de UI + los lotes (para leer product_id/qty). Puro y testeable.

```ts
import type { ProductLot } from "@/types";

export interface TransferDraftItem { lotId: string; quantity: number }
export interface BuildTransferPayloadArgs {
  transferNumber: string;
  originBranchId: string;
  originWarehouseId: string;
  destinationBranchId: string;
  destinationWarehouseId: string;
  transferDate: string;
  notes?: string;
  items: TransferDraftItem[];
  lots: ProductLot[];
}
export interface TransferRpcPayload {
  header: {
    transfer_number: string;
    origin_branch_id: string;
    origin_warehouse_id: string;
    destination_branch_id: string;
    destination_warehouse_id: string;
    transfer_date: string;
    notes: string | null;
  };
  items: { lot_id: string; product_id: string; qty: number }[];
}
export function buildTransferPayload(args: BuildTransferPayloadArgs): TransferRpcPayload {
  const lotById = new Map(args.lots.map((l) => [l.id, l]));
  const items = args.items
    .filter((i) => i.lotId && i.quantity > 0 && lotById.has(i.lotId))
    .map((i) => ({
      lot_id: i.lotId,
      product_id: lotById.get(i.lotId)!.productId,
      qty: Math.round(i.quantity),
    }));
  return {
    header: {
      transfer_number: args.transferNumber,
      origin_branch_id: args.originBranchId,
      origin_warehouse_id: args.originWarehouseId,
      destination_branch_id: args.destinationBranchId,
      destination_warehouse_id: args.destinationWarehouseId,
      transfer_date: args.transferDate,
      notes: args.notes?.trim() ? args.notes.trim() : null,
    },
    items,
  };
}
```

Tests: arma items solo de lotes válidos con qty>0; resuelve product_id; redondea; notes null si vacío.

- [ ] Steps TDD: test rojo → implementación → verde → commit.

## Task 3: Mappers + repositorio + tipos + registro

**Files:** mappers.ts, `supabase/transfers.ts` (new), types.ts, `supabase/index.ts`, `mock/index.ts`

- Mappers `inventoryTransferRowToTs` / `inventoryTransferItemRowToTs` (imitar `productLotRowToTs`; camelCase; `items?: TransferItem[]`).
- `inventoryTransferRepository`:
  - `list(ctx)` → `select * from inventory_transfers order by transfer_date desc, created_at desc` + items por transfer (o join). Devuelve `Transfer[]`.
  - `byId(ctx, id)` → cabecera + items.
  - `create(ctx, input)`: resuelve `origin_warehouse_id`/`destination_warehouse_id` con `resolveBranchWarehouseId(sb, ctx.businessId, branchId)`; genera `transfer_number` `TRF-${year}-${seq}` (query max + 1; retry en `23505`/unique); `buildTransferPayload(...)`; `sb.rpc("transfer_stock_atomic", { p_header, p_items })`; mapea `/STOCK_INSUFICIENTE/` a `UserFacingRepositoryError`; devuelve la transferencia (byId del id retornado).
- Tipos: `InventoryTransferRepository { list; byId; create }` en types.ts + campo `inventoryTransfer` en `Repositories`.
- Registrar en `supabaseRepositories` y stub en `mock` (mock delega en el `transfer-store` local para no romper el modo mock).

- [ ] Steps: escribir, `tsc` verde, commit.

## Task 4: Rutas API `/api/transfers`

**Files:** `app/api/transfers/route.ts`, `app/api/transfers/[id]/route.ts` (imitar `app/api/proformas/route.ts`)

- `GET /api/transfers` → gate DATA_SOURCE (409 si no supabase), `getRepoContext()`, `repos.inventoryTransfer.list(ctx)`, `{ transfers }`, `no-store`.
- `POST /api/transfers` → `getSession()` (401), `getRepoContext()`, `repos.inventoryTransfer.create(ctx, body)`, `toUserFacingMessage`.
- `GET /api/transfers/[id]` → byId.

- [ ] Steps: escribir, `tsc` verde, commit.

## Task 5: Wiring cliente en `transfer-store.ts`

**Files:** `features/inventory/transfer-store.ts`

- `TRANSFER_BACKEND = NEXT_PUBLIC_DATA_SOURCE === "supabase" ? "supabase" : "local"`.
- `async createTransferOnServer(input): Promise<CreateTransferResult>` → `POST /api/transfers`.
- `async fetchTransfersFromServer(): Promise<Transfer[]>` / `fetchTransferFromServer(id)`.
- Hooks `useTransfers()` / `useTransfer(id)` que en supabase fetchean del server (patrón `useProducts`/`useAllLots`), en local usan `listTransfers()`/`getTransfer()`.
- La página Nueva llamará `createTransferOnServer` en modo supabase.

- [ ] Steps: escribir, `tsc` verde, commit.

## Task 6: Reconectar pantallas a datos reales

**Files:** nueva/page.tsx, transferencias/page.tsx, transferencias/[id]/page.tsx

- **Nueva:** `availableLots` desde `useAllLots()` (real) filtrado por origen; `handleScan`/prefill usan `useProducts()` (real) y esos lotes reales; guardar con `createTransferOnServer` (gate). Los helpers puros (`applyTransferScan`, `resolveTransferPrefill`) NO cambian, solo su fuente de datos. Mostrar error del server (stock insuficiente, etc.).
- **Lista:** `useTransfers()` (real); lookup de nombre/barcode con `useProducts()` (real) en `matchesTransferSearch`.
- **Detalle:** `useTransfer(id)` (real).

- [ ] Steps: escribir, `tsc` + suite Vitest verdes, commit.

## Task 7: e2e en vivo `transfer-atomic-test.mjs`

**Files:** `scripts/test/transfer-atomic-test.mjs` (copiar conexión de `atomic-sale-test.mjs`)

- Setup con `service_role`: business/branch/2 warehouses/product/lote origen + usuario auth con `app_metadata.business_id`.
- Firmar como usuario (JWT) y `rpc("transfer_stock_atomic", { p_header, p_items })`.
- Asserts: lote origen bajó, lote destino creado/sumado, 2 movimientos `transfer_out`/`transfer_in`, fila en `inventory_transfers` + item. Probar stock insuficiente → error. Cleanup en orden inverso de FK.
- **Correr solo DESPUÉS** de que el usuario aplique la migración.

- [ ] Steps: escribir; ejecutar tras migración; iterar hasta verde.

## Verificación final

- `tsc --noEmit` 0, suite Vitest verde, `transfer-atomic-test.mjs` verde contra prod.
- Prueba manual: crear transferencia real desde la UI mueve stock real (verificar en detalle de producto origen/destino).
- Bump versión + CHANGELOG + push GitHub/Gitea + deploy.

## No incluido (YAGNI, fase 2)

- `void_transfer_atomic` (anular transferencia con reingreso) — solo si el detalle tiene acción de anular; si no, después.
- Transferencias en estado `draft`/aprobación.
