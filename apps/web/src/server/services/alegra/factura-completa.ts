/**
 * Lectura completa de UNA factura migrada de Alegra: cabecera
 * (`alegra_invoices`) + líneas (`alegra_invoice_items`). Es la base para
 * reimprimir el ticket 80mm de una venta del histórico (el adaptador a
 * `Proforma` vive en otra tarea, no aquí).
 *
 * Solo LECTURA — Alegra manda; nunca se escribe aquí ni se copia a
 * `proformas` (regla de la casa, ver `ventas-unificadas.ts`).
 *
 * `ctx.cliente` es el mismo patrón inyectable de `ventas-unificadas.ts`: en
 * producción SIEMPRE se omite y lo arma `getClient()` con la sesión real; en
 * pruebas se inyecta un cliente falso, sin tocar red.
 */
import "server-only";
import { failRepo, getClient, type AnySupabase } from "@/server/repositories/supabase/client";

export interface LineaAlegra {
  lineNo: number;
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  itbis: number;
  total: number;
}

export interface FacturaAlegraCompleta {
  id: string;
  ncf: string | null;
  ncfPrefix: string | null;
  date: string;
  issuedAt: string | null;
  status: string;
  clientId: string | null;
  clientName: string;
  clientDocument: string | null;
  branchId: string | null;
  sellerName: string | null;
  paymentMethod: string | null;
  subtotal: number;
  discount: number;
  itbis: number;
  total: number;
  lineas: LineaAlegra[];
}

const CAMPOS_CABECERA =
  "id,ncf,ncf_prefix,date,issued_at,status,client_id,client_name,client_document,branch_id,seller_name,payment_method,subtotal,discount,itbis,total";
const CAMPOS_LINEA = "line_no,product_id,name,quantity,unit_price,discount,itbis,total";

interface FilaCabecera {
  id: string;
  ncf: string | null;
  ncf_prefix: string | null;
  date: string;
  issued_at: string | null;
  status: string;
  client_id: string | null;
  client_name: string | null;
  client_document: string | null;
  branch_id: string | null;
  seller_name: string | null;
  payment_method: string | null;
  subtotal: number | string;
  discount: number | string;
  itbis: number | string;
  total: number | string;
}

interface FilaLinea {
  line_no: number | string;
  product_id: string | null;
  name: string | null;
  quantity: number | string;
  unit_price: number | string;
  discount: number | string;
  itbis: number | string;
  total: number | string;
}

/** PostgREST devuelve `numeric` como cadena; nunca se usa un importe de la base sin pasar por aquí. */
const numero = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

/**
 * Cabecera + líneas de una factura migrada, o `null` si no existe (o no es
 * de `ctx.businessId` — el filtro de tenant va en la MISMA consulta, nunca
 * después). Dos consultas:
 *
 *  1. Cabecera: `.maybeSingle()` — una fila o nada, nunca revienta si no hay.
 *  2. Líneas: `.range(0, 999)`. Ninguna factura real llega a 1000 renglones,
 *     pero PostgREST corta en 1000 filas EN SILENCIO si no se le pone tope
 *     (regla de la casa — ver el encabezado de `ventas-unificadas.ts`), y
 *     esta consulta no se salta esa regla aunque hoy sobre margen.
 */
export async function facturaAlegraCompleta(
  ctx: { businessId: string; cliente?: AnySupabase },
  id: string,
): Promise<FacturaAlegraCompleta | null> {
  const sb: AnySupabase = ctx.cliente ?? (await getClient("alegra.facturaCompleta"));

  const { data: cabecera, error: errorCabecera } = await sb
    .from("alegra_invoices")
    .select(CAMPOS_CABECERA)
    .eq("business_id", ctx.businessId)
    .eq("id", id)
    .maybeSingle();
  if (errorCabecera) failRepo("alegra.facturaCompleta.cabecera", errorCabecera);
  if (!cabecera) return null;

  const fila = cabecera as FilaCabecera;

  const { data: lineas, error: errorLineas } = await sb
    .from("alegra_invoice_items")
    .select(CAMPOS_LINEA)
    .eq("invoice_id", id)
    .order("line_no")
    .range(0, 999);
  if (errorLineas) failRepo("alegra.facturaCompleta.lineas", errorLineas);

  return {
    id: fila.id,
    ncf: fila.ncf,
    ncfPrefix: fila.ncf_prefix,
    date: fila.date,
    issuedAt: fila.issued_at,
    status: fila.status,
    clientId: fila.client_id,
    clientName: fila.client_name ?? "",
    clientDocument: fila.client_document,
    branchId: fila.branch_id,
    sellerName: fila.seller_name,
    paymentMethod: fila.payment_method,
    subtotal: numero(fila.subtotal),
    discount: numero(fila.discount),
    itbis: numero(fila.itbis),
    total: numero(fila.total),
    lineas: ((lineas ?? []) as FilaLinea[]).map((l) => ({
      lineNo: Math.trunc(numero(l.line_no)),
      productId: l.product_id,
      name: l.name ?? "",
      quantity: numero(l.quantity),
      unitPrice: numero(l.unit_price),
      discount: numero(l.discount),
      itbis: numero(l.itbis),
      total: numero(l.total),
    })),
  };
}
