-- =============================================================================
-- DermaLand · Numeraciones de comprobantes (electrónicas y no electrónicas)
-- =============================================================================
-- No destructiva: NO toca ecf_sequences (que sigue para el flujo e-CF real).
-- Agrega un modelo más amplio que soporta B01/B02/gubernamental/exportación/
-- proforma además de e-CF 31/32/33/34, con ambiente (mock..producción),
-- preferida y estado. RLS por business_id.

create table if not exists invoice_numberings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id),
  name text not null,
  document_type text not null
    check (document_type in (
      'proforma','consumo','credito_fiscal','nota_credito','nota_debito',
      'gubernamental','exportacion','regimen_especial',
      'ecf_31','ecf_32','ecf_33','ecf_34'
    )),
  prefix text not null,
  range_start int not null,
  range_end int not null,
  next_number int not null,
  start_date date,
  end_date date,
  environment text not null default 'mock'
    check (environment in ('mock','demo','testecf','certecf','produccion')),
  is_electronic boolean not null default false,
  is_preferred boolean not null default false,
  status text not null default 'active'
    check (status in ('active','inactive')),
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint invoice_numberings_range_ok check (range_end >= range_start),
  constraint invoice_numberings_next_ok
    check (next_number >= range_start and next_number <= range_end + 1),
  -- Prefijo + tipo + ambiente únicos por negocio.
  unique (business_id, prefix, document_type, environment)
);

-- Una sola numeración PREFERIDA activa por tipo+ambiente (parcial).
create unique index if not exists invoice_numberings_one_preferred
  on invoice_numberings (business_id, document_type, environment)
  where is_preferred and status = 'active' and deleted_at is null;

create index if not exists invoice_numberings_business_idx
  on invoice_numberings (business_id, document_type);

alter table invoice_numberings enable row level security;
create policy invoice_numberings_all on invoice_numberings for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- Reserva atómica del siguiente número (respeta rango, estado y vencimiento).
create or replace function reserve_invoice_number(p_numbering_id uuid)
returns int
language plpgsql
security invoker
as $$
declare
  v_next int;
begin
  update invoice_numberings
     set next_number = next_number + 1,
         updated_at = now()
   where id = p_numbering_id
     and business_id = auth_business_id()
     and status = 'active'
     and deleted_at is null
     and next_number <= range_end
     and (end_date is null or end_date >= current_date)
  returning next_number - 1 into v_next;

  if v_next is null then
    raise exception 'Numeración no disponible (inactiva, vencida, agotada o fuera de alcance)';
  end if;
  return v_next;
end;
$$;

notify pgrst, 'reload schema';
