import "server-only";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * Qué esquema valida cada documento fiscal.
 *
 * Antes había cuatro XSD para diez tipos de comprobante, así que **seis tipos
 * se habrían firmado y enviado sin validar contra nada**. Los catorce esquemas
 * —los diez tipos más acuse, anulación y aprobación comercial— se descargaron
 * del sitio de la DGII el 2026-08-04 y viven en `docs/dgii/xsd/` con su
 * checksum anotado en el `README.md` de esa carpeta.
 *
 * POR QUÉ SE COMPRUEBA EL CHECKSUM
 *
 * Un esquema fiscal es una dependencia versionada, no un archivo suelto. Si un
 * XML deja de validar, la primera pregunta es «¿cambió el esquema?». Sin
 * checksum no hay forma de contestarla, y con un esquema cambiado en silencio
 * se puede acabar enviando a la DGII algo que localmente parecía correcto.
 *
 * Aquí NO se falla si el checksum no cuadra —eso pararía la facturación por un
 * archivo actualizado a mano—, pero se puede consultar, y hay una prueba que
 * los fija todos.
 */

/** Los diez tipos de comprobante, según el CHECK de `electronic_invoices`. */
export const ECF_TYPES = [
  "31",
  "32",
  "33",
  "34",
  "41",
  "43",
  "44",
  "45",
  "46",
  "47",
] as const;

export type EcfTypeCode = (typeof ECF_TYPES)[number];

/** Documentos que no son comprobantes pero también tienen esquema. */
export const AUX_SCHEMAS = ["RFCE", "ARECF", "ANECF", "ACECF"] as const;
export type AuxSchema = (typeof AUX_SCHEMAS)[number];

export type SchemaKey = EcfTypeCode | AuxSchema;

/** Nombre de archivo por documento. */
const ARCHIVOS: Record<SchemaKey, string> = {
  "31": "e-CF-31-v1.0.xsd",
  "32": "e-CF-32-v1.0.xsd",
  "33": "e-CF-33-v1.0.xsd",
  "34": "e-CF-34-v1.0.xsd",
  "41": "e-CF-41-v1.0.xsd",
  "43": "e-CF-43-v1.0.xsd",
  "44": "e-CF-44-v1.0.xsd",
  "45": "e-CF-45-v1.0.xsd",
  "46": "e-CF-46-v1.0.xsd",
  "47": "e-CF-47-v1.0.xsd",
  RFCE: "RFCE-32-v1.0.xsd",
  ARECF: "ARECF-v1.0.xsd",
  ANECF: "ANECF-v1.0.xsd",
  ACECF: "ACECF-v1.0.xsd",
};

/**
 * SHA-256 de cada esquema tal como lo sirve la DGII, el 2026-08-04.
 *
 * Si uno cambia, `verifySchemaIntegrity` lo dice. Actualizar aquí **y** en
 * `docs/dgii/xsd/README.md` al traer esquemas nuevos.
 */
export const SCHEMA_CHECKSUMS: Record<SchemaKey, string> = {
  "31": "cc66cbc418ceefaa6437c97607308c3e0814d73070fbbf9e9a2a331d12cb8abc",
  "32": "ab66dff0b08d743e2f188242025a0dcef45203ad05687280860d3b07a475991b",
  "33": "718146c15edafd4582efc6886e1a7a8c5043a55236cec4fb3262094edda46615",
  "34": "6c1c4daf83146ecf35b81a3b2e3e34a79b429f4c1b8d63e05e2ee74f3ff8fab6",
  "41": "eae1993c637375bc1cbe80932411d87f5680cd54e77e4d1b2752d72a6c8b2ab3",
  "43": "776f030980c2c50cf0221e9263c55f367c8631727adff00ab45e2c7c1abafc52",
  "44": "19834f37a9f0e2db40f00c80d07c2bf92f9019f23474480f32cef1ba06af4e67",
  "45": "030492cc8ef7d1a09a89b16b241f8e5c4920dfd09c0b629b1db8e68406ecd6ca",
  "46": "e7f8613ade25c7efb88e84d34d7c0ad330d1b22238ad9ef90c80aed01911d67b",
  "47": "14daf18f52f63dd80e439a18fb60a102d74e71243ee90ee253367f61ce8e1994",
  RFCE: "6aad535875661b05eef072963295202fc94b3b320b257791feb8d3c39a5f8ee6",
  ARECF: "c6d186167159110959eb3f54706ecc7462ad9128fc2c3e03440c8352b1c66f10",
  ANECF: "af2e6a16c2900dfa55264d6ebec58ccbbbb25c1eb9821ee18ccc44fc142d0e78",
  ACECF: "072f65de202df8ec136a8d4493e0592172690a4e181047245401cc2e7b23c095",
};

/** Dónde viven. Desde `apps/web`, la carpeta está dos niveles arriba. */
export function schemaDir(): string {
  return join(process.cwd(), "..", "..", "docs", "dgii", "xsd");
}

export function schemaPath(key: SchemaKey): string {
  return join(schemaDir(), ARCHIVOS[key]);
}

export class SchemaNotFound extends Error {
  constructor(key: string) {
    super(`No hay esquema XSD registrado para «${key}».`);
    this.name = "SchemaNotFound";
  }
}

/**
 * El esquema, como texto.
 *
 * **Falla si no está.** Nunca devuelve una cadena vacía ni un esquema de otro
 * tipo: validar un e-CF 45 contra el esquema del 31 daría un «válido» que no
 * significa nada, y ese es exactamente el error que este registro existe para
 * impedir.
 */
export async function loadSchema(key: SchemaKey): Promise<string> {
  if (!(key in ARCHIVOS)) throw new SchemaNotFound(key);
  try {
    return await readFile(schemaPath(key), "utf8");
  } catch {
    throw new SchemaNotFound(key);
  }
}

/** El esquema que le toca a un comprobante. */
export async function loadSchemaForEcfType(tipoEcf: string): Promise<string> {
  if (!(ECF_TYPES as readonly string[]).includes(tipoEcf)) {
    throw new SchemaNotFound(tipoEcf);
  }
  return loadSchema(tipoEcf as EcfTypeCode);
}

export interface IntegrityResult {
  key: SchemaKey;
  expected: string;
  actual: string | null;
  ok: boolean;
}

/**
 * ¿Los esquemas en disco son los que se descargaron de la DGII?
 *
 * Se usa desde una prueba y desde el panel de estado. **No se llama antes de
 * cada validación**: leer y hashear catorce archivos por comprobante sería
 * pagar mucho por una comprobación que solo cambia cuando alguien toca la
 * carpeta.
 */
export async function verifySchemaIntegrity(): Promise<IntegrityResult[]> {
  const resultados: IntegrityResult[] = [];
  for (const key of Object.keys(SCHEMA_CHECKSUMS) as SchemaKey[]) {
    let actual: string | null = null;
    try {
      const bytes = await readFile(schemaPath(key));
      actual = createHash("sha256").update(bytes).digest("hex");
    } catch {
      actual = null;
    }
    resultados.push({
      key,
      expected: SCHEMA_CHECKSUMS[key],
      actual,
      ok: actual === SCHEMA_CHECKSUMS[key],
    });
  }
  return resultados;
}
