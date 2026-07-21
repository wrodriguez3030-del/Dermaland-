import "server-only";
import type { Proforma } from "@/types";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  proformaItemRowToTs,
  proformaPaymentRowToTs,
  proformaRowToTs,
} from "@/server/repositories/supabase/mappers";

/**
 * Lectura de un documento de venta para ENLACES PÚBLICOS (sin sesión).
 *
 * Se usa desde la página `/factura/[token]`, su imagen OG y el endpoint PDF.
 * La autorización viene del token firmado (`verifyDocumentShareToken`): el
 * `businessId` sale del token, así que esta función SIEMPRE debe recibir el
 * businessId ya verificado. Lee con service-role (bypassa RLS) acotado por
 * `business_id` + `id` — nunca expone datos de otra empresa.
 *
 * Devuelve `null` si no hay service-role configurado o el documento no existe.
 */
export async function readSharedProforma(
  businessId: string,
  id: string,
): Promise<Proforma | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("proformas")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  const [{ data: items }, { data: payments }] = await Promise.all([
    sb
      .from("proforma_items")
      .select("*")
      .eq("business_id", businessId)
      .eq("proforma_id", id)
      .order("line_no", { ascending: true }),
    sb
      .from("proforma_payments")
      .select("*")
      .eq("business_id", businessId)
      .eq("proforma_id", id)
      .order("created_at", { ascending: true }),
  ]);

  return proformaRowToTs(
    data,
    (items ?? []).map(proformaItemRowToTs),
    (payments ?? []).map(proformaPaymentRowToTs),
  );
}
