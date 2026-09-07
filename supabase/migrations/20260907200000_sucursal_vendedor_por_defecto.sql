-- Vendedor por defecto de cada sucursal.
--
-- Por qué: la sincronización con Alegra trae `seller_name` (texto libre) pero no
-- el enlace al usuario de DermaLand, así que cada factura nueva llegaba con
-- `seller_id` NULL y quedaba fuera de la comisión sin que nadie lo notara. Se
-- descubrió con 7 facturas del mismo día ya sueltas.
--
-- El enlace principal se resuelve por nombre en el propio sync. Esta columna es
-- para el otro caso: las facturas que Alegra manda SIN vendedor. El dueño
-- decidió (07/09/2026) que esas se atribuyen a la encargada de la sucursal
-- —Villa Olga a Soribel Tejada, Principal a Heidi Pinales—, y esa regla vive
-- aquí en vez de estar escrita dentro del guion: así se puede cambiar sin tocar
-- código, y se ve quién responde por cada sede.
--
-- `on delete set null`: si se da de baja a la encargada, la sucursal se queda
-- sin defecto y las facturas nuevas sin vendedor quedan sueltas y visibles. Es
-- preferible a que sigan atribuyéndose a alguien que ya no está.

alter table public.branches
  add column if not exists default_seller_id uuid references public.users(id) on delete set null;

comment on column public.branches.default_seller_id is
  'Vendedor al que se atribuyen las ventas de esta sucursal que llegan SIN vendedor desde Alegra. NULL = quedan sin atribuir (visible en los reportes).';

-- El reparto que el dueño ya aplicó a mano sobre el histórico, para que las
-- facturas nuevas sigan el mismo criterio sin volver a decidirlo.
update public.branches b
   set default_seller_id = u.id
  from public.users u
 where u.business_id = b.business_id
   and u.deleted_at is null
   and (
     (b.name = 'Dermaland  Villa Olga' and lower(u.full_name) = 'soribel tejada')
     or (b.name = 'DermaLand Principal' and lower(u.full_name) = 'heidi pinales')
   );

notify pgrst, 'reload schema';
