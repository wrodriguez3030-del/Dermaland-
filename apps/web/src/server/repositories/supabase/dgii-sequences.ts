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
  /** `numeric(12,3)` en la base. */
  quantity: number;
  /** `numeric(14,2)` en la base. */
  unit_price: number;
  /**
   * FRACCIÓN, no porcentaje: el 18 % del ITBIS se escribe `0.18`, no `18`.
   *
   * La columna es `numeric(5,4)` (`20260906090100_dgii_fase2_tablas.sql:288`),
   * así que el máximo es 9.9999: un `18` heredado de la tabla vieja —que era
   * `numeric(5,2)` y sí guardaba porcentajes— DESBORDA. La convención no
   * estaba escrita en ningún sitio. M7 de la revisión final.
   */
  itbis_rate: number;
  /** `numeric(14,2)` en la base. */
  monto_item: number;
}

export type ResultadoPreparar =
  | { ok: true; invoice_id: string; e_ncf: string }
  | { ok: false; motivo: "ENCF_TOMADO"; e_ncf_actual: string }
  | { ok: false; motivo: "IDEMPOTENT_PROFORMA_YA_FACTURADA"; invoice_id: string };

export type ResultadoFinalizar =
  | { ok: true; invoice_id: string }
  | { ok: false; motivo: "NO_ESTABA_EN_DRAFT" };

/**
 * `fail_ecf_invoice` devuelve `jsonb_build_object('ok', true, 'invoice_id',
 * p_invoice_id)` (`20260906090200_dgii_fase2_funciones.sql:368`), igual que
 * `finalize_ecf_invoice`. El tipo declaraba solo `{ ok: true }` y una prueba
 * simulaba una respuesta que la función NUNCA emite. No rompía nada
 * —TypeScript no se queja de campos de más y `desenvolver` castea—, pero la
 * fase 3 no habría podido leer `invoice_id` sin castear. M2 de la revisión
 * final.
 */
export type ResultadoMarcarFallo =
  | { ok: true; invoice_id: string }
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
