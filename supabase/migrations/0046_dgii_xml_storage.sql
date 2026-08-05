-- 0046 — Dónde vive el XML fiscal.
--
-- `electronic_invoices` ya tenía `xml_generated_path`, `xml_signed_path` y
-- `xml_response_path` desde la migración 0003. **Ninguna línea de código las
-- escribía nunca**, y no existía el bucket. El módulo construía XML, lo
-- validaba, lo firmaba… y lo tiraba.
--
-- Un e-CF firmado ES el documento fiscal. Perderlo no es perder un archivo
-- temporal: es no poder demostrar qué se emitió.
--
-- PRIVADO, SIN EXCEPCIÓN
--
-- Un XML de e-CF lleva dentro el RNC del comprador, lo que compró, cuánto pagó
-- y la firma del negocio. Es el mismo criterio que `payment-receipts`, que
-- también es privado: se sirve por URL firmada y con permiso, nunca por una URL
-- que se pueda adivinar.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dgii-xml',
  'dgii-xml',
  false,
  -- 5 MB. Un e-CF con mil líneas no llega a 1 MB; el tope es contra un
  -- accidente, no contra un uso normal.
  5242880,
  array['application/xml', 'text/xml']
)
on conflict (id) do nothing;

-- RLS: aislamiento por negocio con el `business_id` como primera carpeta de la
-- ruta. El ROL lo valida `authorizeDgii` en la ruta (DL-01); esto solo impide
-- que un negocio vea los comprobantes de otro.

drop policy if exists dgii_xml_select on storage.objects;
create policy dgii_xml_select
  on storage.objects for select
  using (
    bucket_id = 'dgii-xml'
    and (storage.foldername(name))[1] =
        ((select auth.jwt() -> 'app_metadata' ->> 'business_id'))
  );

-- Sin políticas de INSERT/UPDATE/DELETE para usuarios.
--
-- El XML fiscal lo escribe el SERVIDOR con service-role, y **no se borra**: la
-- DGII exige conservar los comprobantes, así que una política de borrado sería
-- una herramienta para incumplir. Si algún día hace falta purgar, se hace con
-- una migración deliberada y no con un permiso permanente.

commit;
