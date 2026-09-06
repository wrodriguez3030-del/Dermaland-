/**
 * Lectura mínima de `electronic_invoices` para la orquestación de la fase 3A
 * (tarea 5, `features/dgii/services/prepare.ts`).
 *
 * No es el baile transaccional (eso vive en `dgii-sequences.ts`): esto es una
 * lectura de metadata suelta, del mismo tipo que `leerConfiguracion` /
 * `leerCertificadoActivo` en `dgii-settings.ts`. Hace falta porque
 * `prepare_ecf_invoice` puede devolver `IDEMPOTENT_PROFORMA_YA_FACTURADA` con
 * solo el `invoice_id` de la factura que ya existía (ver
 * `20260906090200_dgii_fase2_funciones.sql:198-205`) — sin `e_ncf` ni la ruta
 * de su XML firmado. `prepararComprobante` necesita esos dos datos para poder
 * devolver `ResultadoPreparar` completo también en el caso idempotente, así
 * que los busca aquí, con el mismo `business_id` de siempre puesto por el
 * repositorio, nunca por quien llama.
 *
 * Igual que `dgii-sequences.ts` y `dgii-settings.ts`: `cliente` se tipa como
 * `SupabaseClient` A SECAS (sin el genérico `Database`) porque
 * `database.types.ts` no conoce las tablas de la fase 2. Pásale SIEMPRE el
 * cliente de `createServiceRoleClient()` — nunca el de la sesión.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Lo mínimo de `electronic_invoices` que hace falta para completar un resultado idempotente. */
export interface ResumenFactura {
  id: string;
  eNcf: string | null;
  rutaXmlFirmado: string | null;
}

export function crearRepositorioFacturas(cliente: SupabaseClient, businessId: string) {
  return {
    /**
     * Lee `e_ncf` y `xml_signed_path` de una factura propia por id.
     * `null` si no existe o no pertenece a este negocio (nunca revela cuál de las dos cosas es).
     */
    async leerResumen(invoiceId: string): Promise<ResumenFactura | null> {
      const { data, error } = await cliente
        .from("electronic_invoices")
        .select("id, e_ncf, xml_signed_path")
        .eq("business_id", businessId)
        .eq("id", invoiceId)
        .maybeSingle();

      if (error) throw new Error(`leer factura: ${error.message}`);
      if (!data) return null;

      return {
        id: data.id as string,
        eNcf: (data.e_ncf as string | null) ?? null,
        rutaXmlFirmado: (data.xml_signed_path as string | null) ?? null,
      };
    },
  };
}

export type RepositorioFacturas = ReturnType<typeof crearRepositorioFacturas>;
