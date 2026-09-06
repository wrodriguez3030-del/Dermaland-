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

export type ResultadoFinalizar =
  | { ok: true; invoice_id: string }
  | { ok: false; motivo: "NO_ESTABA_EN_DRAFT" };

export type ResultadoMarcarFallo =
  | { ok: true }
  | { ok: false; motivo: "FACTURA_NO_ENCONTRADA" };

function desenvolver<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
}

export function crearRepositorioSecuencias(cliente: SupabaseClient, businessId: string) {
  return {
    async peekNextEncf(tipoEcf: string, ambiente: string): Promise<string> {
      return desenvolver(
        await cliente.rpc("peek_next_encf", {
          p_business_id: businessId,
          p_tipo_ecf: tipoEcf,
          p_ambiente: ambiente,
        }),
        "peek_next_encf",
      ) as string;
    },

    async prepararFactura(
      encfEsperado: string,
      factura: FacturaAPreparar,
      items: LineaAPreparar[],
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
      invoiceId: string,
      datos: { xml_signed_path: string },
    ): Promise<ResultadoFinalizar> {
      return desenvolver(
        await cliente.rpc("finalize_ecf_invoice", {
          p_business_id: businessId,
          p_invoice_id: invoiceId,
          p_datos: datos,
        }),
        "finalize_ecf_invoice",
      ) as ResultadoFinalizar;
    },

    async marcarFallo(
      invoiceId: string,
      motivo: string,
    ): Promise<ResultadoMarcarFallo> {
      return desenvolver(
        await cliente.rpc("fail_ecf_invoice", {
          p_business_id: businessId,
          p_invoice_id: invoiceId,
          p_motivo: motivo,
        }),
        "fail_ecf_invoice",
      ) as ResultadoMarcarFallo;
    },
  };
}

export type RepositorioSecuencias = ReturnType<typeof crearRepositorioSecuencias>;
