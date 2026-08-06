import "server-only";
import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Guardar y recuperar el XML fiscal.
 *
 * `electronic_invoices` tenía las columnas de ruta desde la migración 0003 y
 * **ninguna línea las escribía**. El módulo construía el XML, lo validaba, lo
 * firmaba y lo tiraba.
 *
 * Un e-CF firmado **es** el documento fiscal. Perderlo no es perder un archivo
 * temporal: es no poder demostrar qué se emitió.
 *
 * QUÉ SE GUARDA Y POR QUÉ TRES COPIAS
 *
 *   · `generated` — el XML sin firmar. Sirve para ver qué se construyó cuando
 *     la validación falla, que es cuando hace falta mirarlo.
 *   · `signed` — el documento. Este es el que importa.
 *   · `response` — lo que contestó la DGII, tal cual. Sin él, «la DGII lo
 *     rechazó» es una afirmación sin respaldo.
 *
 * El hash SHA-256 del firmado se guarda en la fila. Si algún día hay que
 * demostrar que el archivo no se tocó, el hash lo dice y el archivo solo.
 */

/** Bucket PRIVADO. Un e-CF lleva dentro el RNC del comprador y lo que compró. */
const BUCKET = "dgii-xml";

export type XmlKind = "generated" | "signed" | "response";

/**
 * Dónde va cada archivo.
 *
 * El `businessId` va **primero** porque la política de RLS del bucket compara
 * la primera carpeta de la ruta: si estuviera en otra posición, el aislamiento
 * entre negocios no funcionaría.
 *
 * El ambiente va en la ruta para que una prueba y una emisión real del mismo
 * e-NCF no se pisen el archivo.
 */
export function xmlPath(
  businessId: string,
  ambiente: string,
  eNcf: string,
  kind: XmlKind,
): string {
  return `${businessId}/${ambiente}/${eNcf}/${kind}.xml`;
}

export function sha256(contenido: string): string {
  return createHash("sha256").update(contenido, "utf8").digest("hex");
}

export interface SaveResult {
  path: string;
  hash: string;
}

export class XmlStorageError extends Error {
  readonly detail?: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = "XmlStorageError";
    this.detail = detail;
  }
}

/**
 * Guarda un XML y devuelve su ruta y su hash.
 *
 * `upsert: true` a propósito: la cola puede reintentar un paso y volver a
 * generar el mismo XML. Sobrescribir el mismo contenido en la misma ruta no
 * pierde nada — y fallar ahí dejaría un documento a medias por un reintento
 * normal.
 *
 * **Lo que nunca se sobrescribe es un `signed` por otro distinto**, y eso lo
 * impide la máquina de estados: desde `signed` no se vuelve a firmar.
 */
export async function saveXml(
  businessId: string,
  ambiente: string,
  eNcf: string,
  kind: XmlKind,
  contenido: string,
): Promise<SaveResult> {
  const admin = createServiceRoleClient();
  if (!admin) throw new XmlStorageError("No se pudo acceder al almacenamiento.");

  const path = xmlPath(businessId, ambiente, eNcf, kind);
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, new Blob([contenido], { type: "application/xml" }), {
      contentType: "application/xml",
      upsert: true,
    });

  if (error) {
    throw new XmlStorageError(
      `No se pudo guardar el XML ${kind} del comprobante.`,
      error,
    );
  }

  return { path, hash: sha256(contenido) };
}

/**
 * Recupera un XML por su ruta.
 *
 * Falla si no está. Devolver una cadena vacía haría que el paso siguiente
 * validara o firmara la nada, y el fallo aparecería mucho más tarde y en otro
 * sitio.
 */
export async function loadXml(path: string): Promise<string> {
  const admin = createServiceRoleClient();
  if (!admin) throw new XmlStorageError("No se pudo acceder al almacenamiento.");

  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new XmlStorageError(`No se encontró el XML en «${path}».`, error);
  }
  return await data.text();
}

/**
 * URL temporal para descargar un XML.
 *
 * Firmada y con caducidad corta. **Nunca se hace público el bucket**: eso
 * convertiría la ruta —que se puede adivinar, porque lleva el e-NCF— en acceso
 * directo al documento fiscal de cualquiera.
 */
export async function signedXmlUrl(
  path: string,
  segundos = 300,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, segundos);
  return data?.signedUrl ?? null;
}
