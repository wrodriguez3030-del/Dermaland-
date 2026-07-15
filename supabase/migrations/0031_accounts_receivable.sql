-- 0031: Cuentas por Cobrar
--
-- Fuente única: la cuenta por cobrar ES la proforma con balance > 0 (no se
-- duplica en otra tabla). Esta migración agrega lo que falta:
--   1) Crédito por cliente (límite, días, bloqueo).
--   2) Vencimiento de la venta (due_date) + índice parcial de pendientes.
--   3) Promesas de pago (ar_promises).
--   4) Configuración del módulo (ar_settings).
--   5) Saldo-después en pagos (historial saldo anterior/nuevo sin recalcular).
--   6) RPC ar_apply_payments: cobro atómico multi-factura (patrón 0029/0030,
--      SECURITY INVOKER → RLS aplica; tenant SIEMPRE de auth_business_id()).

-- 1) Crédito por cliente ------------------------------------------------------
alter table clients
  add column if not exists credit_limit numeric,
  add column if not exists credit_days integer,
  add column if not exists credit_blocked boolean not null default false;

-- 2) Vencimiento de la venta --------------------------------------------------
alter table proformas add column if not exists due_date date;

create index if not exists idx_proformas_receivables
  on proformas (business_id, due_date)
  where balance > 0;

-- 5) Saldo restante tras cada pago (para el historial; NULL en pagos viejos) --
alter table proforma_payments add column if not exists balance_after numeric;

-- 3) Promesas de pago ---------------------------------------------------------
create table if not exists ar_promises (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  client_id uuid references clients(id),
  client_name text not null,
  proforma_id uuid references proformas(id),
  promised_date date not null,
  amount numeric not null check (amount > 0),
  notes text,
  status text not null default 'pending' check (status in ('pending','kept','broken')),
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ar_promises enable row level security;
drop policy if exists ar_promises_all on ar_promises;
create policy ar_promises_all on ar_promises for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create index if not exists idx_ar_promises_biz
  on ar_promises (business_id, promised_date);

-- 4) Configuración del módulo -------------------------------------------------
create table if not exists ar_settings (
  business_id uuid primary key,
  default_credit_days integer not null default 30,
  block_over_limit boolean not null default false,
  reminder_offsets_days integer[] not null default '{-7,-3,-1,0,1,7,15,30}',
  updated_at timestamptz not null default now()
);

alter table ar_settings enable row level security;
drop policy if exists ar_settings_all on ar_settings;
create policy ar_settings_all on ar_settings for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- 6) RPC: cobro atómico multi-factura ------------------------------------------
-- p_items = [{"proforma_id": uuid, "amount": numeric}, ...]
-- Un solo método/referencia por llamada (pago mixto = varias llamadas o varios
-- items con el mismo método). Todo o nada: si un item falla, rollback total.
create or replace function ar_apply_payments(
  p_items jsonb,
  p_method text,
  p_reference text default null,
  p_user_id uuid default null,
  p_user_name text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_biz uuid := auth_business_id();
  it jsonb;
  v_id uuid;
  v_amount numeric;
  v_row proformas%rowtype;
  v_new_balance numeric;
  v_new_status text;
  v_applied jsonb := '[]'::jsonb;
begin
  if v_biz is null then
    raise exception 'Sesión sin negocio: no se puede cobrar.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay pagos que aplicar.';
  end if;
  if p_method is null or p_method = '' then
    raise exception 'Falta el método de pago.';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_id := (it->>'proforma_id')::uuid;
    v_amount := round((it->>'amount')::numeric, 2);

    if v_amount is null or v_amount <= 0 then
      raise exception 'Monto inválido en el cobro.';
    end if;

    select * into v_row from proformas
      where id = v_id and business_id = v_biz
      for update;
    if not found then
      raise exception 'Venta no encontrada.';
    end if;
    if v_row.status in ('cancelled','draft','expired') then
      raise exception 'La factura % no admite cobros (estado %).', v_row.number, v_row.status;
    end if;
    if v_row.balance <= 0 then
      raise exception 'La factura % no tiene saldo pendiente.', v_row.number;
    end if;
    if v_amount > v_row.balance + 0.009 then
      raise exception 'El pago (%.2f) excede el saldo (%.2f) de la factura %.',
        v_amount, v_row.balance, v_row.number;
    end if;

    v_new_balance := greatest(0, round(v_row.balance - v_amount, 2));
    v_new_status := case
      when v_new_balance <= 0.009 then
        case when v_row.status in ('pending_ecf','converted_to_ecf')
             then v_row.status else 'paid' end
      else
        case when v_row.status = 'issued' then 'partially_paid' else v_row.status end
    end;
    if v_new_balance <= 0.009 then v_new_balance := 0; end if;

    insert into proforma_payments
      (business_id, proforma_id, method_code, amount, reference, user_id, user_name, balance_after)
    values
      (v_biz, v_id, p_method, v_amount, p_reference, p_user_id, p_user_name, v_new_balance);

    update proformas set
      paid = round(paid + v_amount, 2),
      balance = v_new_balance,
      status = v_new_status,
      updated_at = now()
    where id = v_id;

    v_applied := v_applied || jsonb_build_object(
      'proforma_id', v_id,
      'number', v_row.number,
      'amount', v_amount,
      'new_balance', v_new_balance,
      'new_status', v_new_status
    );
  end loop;

  return v_applied;
end;
$$;
