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
 * Los guiones, espacios y otros caracteres imprimibles SÍ son permitidos.
 * Caracteres de control (0x00–0x1f: nulo, \n, \r, tabulador, etc.) SÍ se rechazan:
 * son peligrosos en filenames y rutas, y pueden romper auditorías y búsquedas.
 * Lanzado sin captura revela un path traversal.
 */
function validarSegmentoSeguro(seg: string, etiqueta: string): string {
  if (typeof seg !== "string" || seg.trim() === "")
    throw new ErrorAlmacenamientoDgii(`Segmento ${etiqueta} vacío.`, "path_invalid");
  // Rango de caracteres de control: \x00 (nulo) a \x1f (US — Unit Separator).
  // Rechazarlos protege filenames, auditoría, y búsquedas contra inyección invisible.
  if (/[\x00-\x1f]/.test(seg))
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

/** Entrada para guardar un XML firmado en el bucket privado. */
export type EntradaGuardarXmlFirmado = {
  tipo: TipoAlmacenamientoDgii;
  invoiceId: string;
  xml: string;
};

/** Contenido MIME seguro para almacenamientos DGII. */
const MIME_TYPES_SEGUROS = new Set(["application/xml", "text/xml", "application/json", "application/octet-stream"]);

/** Calcula el SHA256 en hexadecimal de un contenido de texto. */
function calcularSha256(contenido: string): string {
  return createHash("sha256").update(contenido, "utf8").digest("hex");
}

/**
 * Guarda el XML firmado del comprobante.
 * Valida tamaño (máx 5 MB), calcula el SHA256, y sube con el cliente de service-role.
 * Devuelve la ruta del objeto guardado.
 *
 * @throws ErrorAlmacenamientoDgii si el contenido excede el tamaño, es vacío, o falla la subida
 */
export async function guardarXmlFirmado(
  ctx: ContextoAlmacenamientoDgii,
  entrada: EntradaGuardarXmlFirmado,
): Promise<string> {
  if (typeof entrada.xml !== "string" || entrada.xml.length === 0)
    throw new ErrorAlmacenamientoDgii("Contenido XML vacío.", "upload_failed");

  const buffer = Buffer.from(entrada.xml, "utf8");
  if (buffer.byteLength > MAX_BYTES)
    throw new ErrorAlmacenamientoDgii("Contenido excede el tamaño máximo (5 MB).", "too_large");

  const ruta = construirRuta(ctx, { tipo: entrada.tipo, invoiceId: entrada.invoiceId });
  const admin = createServiceRoleClient();
  if (!admin) throw new ErrorAlmacenamientoDgii("Cliente de Supabase no disponible.", "upload_failed");

  const { error } = await admin.storage
    .from(BUCKET_DGII)
    .upload(ruta, buffer, { contentType: "application/xml", upsert: true });

  if (error) {
    if ((error.message ?? "").toLowerCase().includes("bucket"))
      throw new ErrorAlmacenamientoDgii(
        `Bucket "${BUCKET_DGII}" no existe.`,
        "upload_failed",
      );
    throw new ErrorAlmacenamientoDgii(`Fallo al subir: ${error.message}`, "upload_failed");
  }

  return ruta;
}

/**
 * Lee el contenido de un XML guardado.
 * Valida que el path pertenezca al businessId del contexto (ownership check).
 * Server-only; jamás exponer al cliente.
 *
 * @throws ErrorAlmacenamientoDgii si el path es inválido, no pertenece al business, o el archivo no existe
 */
export async function leerXml(ctx: ContextoAlmacenamientoDgii, ruta: string): Promise<string> {
  const prefijo = `dgii/${validarSegmentoSeguro(ctx.businessId, "businessId")}/`;
  if (!ruta.startsWith(prefijo) || ruta.includes(".."))
    throw new ErrorAlmacenamientoDgii("El path no pertenece a este negocio.", "path_invalid");

  const admin = createServiceRoleClient();
  if (!admin) throw new ErrorAlmacenamientoDgii("Cliente de Supabase no disponible.", "upload_failed");

  const { data, error } = await admin.storage.from(BUCKET_DGII).download(ruta);
  if (error || !data)
    throw new ErrorAlmacenamientoDgii(
      error?.message ? `No se pudo descargar: ${error.message}` : "Archivo no encontrado.",
      "not_found",
    );

  return await data.text();
}

/**
 * Borra un XML del bucket privado (operación de mejor esfuerzo).
 * Úsalo como compensación cuando algo falla después de subir.
 * No lanza excepciones: si falla, el error no enmascara el error original.
 *
 * Valida ownership: el path debe pertenecer al businessId del contexto.
 */
export async function borrarXml(ctx: ContextoAlmacenamientoDgii, ruta: string): Promise<void> {
  try {
    const prefijo = `dgii/${validarSegmentoSeguro(ctx.businessId, "businessId")}/`;
    if (!ruta.startsWith(prefijo) || ruta.includes("..")) return;

    const admin = createServiceRoleClient();
    if (!admin) return;

    await admin.storage.from(BUCKET_DGII).remove([ruta]);
  } catch {
    // Best-effort: no lanzar. El fallo de limpieza no debe tapar el error original.
  }
}
