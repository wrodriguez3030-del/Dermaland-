import "server-only";

import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Nombre del bucket privado de almacenamiento de XML fiscales. */
export const BUCKET_DGII = "dgii-xml";

/** Tamaño máximo razonable para un XML e-CF / respuesta (defensa). */
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Contexto de seguridad con el businessId de quien guarda. */
export type ContextoAlmacenamientoDgii = { businessId: string };

/** Tipos de documento que se guardan en el bucket privado. */
export type TipoAlmacenamientoDgii = "signed_xml" | "rfce_xml";

/** Entrada para construir la ruta canónica de almacenamiento. */
export type EntradaConstruirRuta = {
  tipo: TipoAlmacenamientoDgii;
  invoiceId: string;
};

/** Códigos de error de almacenamiento. */
export type CodigoErrorAlmacenamientoDgii = "path_invalid" | "too_large" | "upload_failed" | "not_found";

/**
 * Error personalizado para operaciones de almacenamiento de XML fiscales.
 * El codigo permite al llamador distinguir qué pasó (validación, tamaño, red, etc.).
 */
export class ErrorAlmacenamientoDgii extends Error {
  constructor(
    message: string,
    public codigo: CodigoErrorAlmacenamientoDgii = "upload_failed",
  ) {
    super(message);
    this.name = "ErrorAlmacenamientoDgii";
  }
}

/**
 * Valida un segmento de path: sin vacíos, sin "/" "\\" "..", sin caracteres de control.
 * Los guiones son permitidos (UUIDs los contienen). Los espacios al inicio/fin se trimean.
 * Lanzado sin captura revela un path traversal.
 */
function validarSegmentoSeguro(seg: string, etiqueta: string): string {
  if (typeof seg !== "string" || seg.trim() === "")
    throw new ErrorAlmacenamientoDgii(`Segmento ${etiqueta} vacío.`, "path_invalid");
  // Rechaza espacios internos pero no guiones (válidos en UUIDs)
  if (/ /.test(seg))
    throw new ErrorAlmacenamientoDgii(`Segmento ${etiqueta} inválido.`, "path_invalid");
  if (/[/\\]/.test(seg) || seg.includes("..")) {
    throw new ErrorAlmacenamientoDgii(
      `Segmento ${etiqueta} inválido (posible path traversal).`,
      "path_invalid",
    );
  }
  return seg;
}

/**
 * Construye el path canónico de almacenamiento.
 * businessId SIEMPRE viene del contexto (nunca del cliente), y se valida igual.
 * Devuelve rutas con el patrón `dgii/{businessId}/invoices/{invoiceId}/{signed|rfce}.xml`
 *
 * @throws ErrorAlmacenamientoDgii si algún segmento falla la validación
 */
export function construirRuta(
  ctx: ContextoAlmacenamientoDgii,
  entrada: EntradaConstruirRuta,
): string {
  const biz = validarSegmentoSeguro(ctx.businessId, "businessId");
  const inv = validarSegmentoSeguro(entrada.invoiceId, "invoiceId");
  const archivo = entrada.tipo === "signed_xml" ? "signed" : "rfce";
  return `dgii/${biz}/invoices/${inv}/${archivo}.xml`;
}
