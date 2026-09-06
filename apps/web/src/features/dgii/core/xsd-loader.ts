/**
 * Loader seguro de XSD oficiales (Fase 5).
 *
 * SERVER-ONLY DE FACTO: usa `node:fs` (lazy import) y nunca debe importarse desde
 * un Client Component. (No se usa el paquete `server-only` porque rompe el runner
 * de tests; el acceso a fs es lazy y la lógica de resolución es pura/testeable.)
 *
 * Seguridad:
 *  - tipoEcf debe estar en una allowlist fija; el nombre de archivo NUNCA viene
 *    del usuario → sin path traversal posible vía tipo.
 *  - resolveXsdPath valida además que la ruta resuelta quede dentro de XSD_DIR.
 *  - Si el XSD oficial no existe, retorna un error controlado (no inventa XSD).
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { EcfValidatorError, XSD_ECF_TIPOS, type XsdEcfTipo } from "./validator-types";

// PORTADO A DERMALAND (2026-09-05): en agendapp los XSD viven en `docs/dgii/xsd`,
// fuera del código. Aquí van JUNTO al módulo (`features/dgii/core/xsd`) para que
// el trazado de Next los empaquete con la función. La cascada de candidatos de
// abajo sube desde `import.meta.url`, así que el primer anclaje real es el propio
// directorio del módulo + `xsd`. Único cambio del fichero.
const XSD_REL = ["xsd"] as const;
// Archivo "testigo" para saber si un directorio candidato realmente tiene los XSD.
const XSD_SENTINEL = "e-CF-32-v1.0.xsd";

/**
 * v318-HOTFIX — Resolución ROBUSTA del directorio de XSD.
 *
 * El bug real de producción: los XSD sí se empaquetaban (nft.json los lista) pero
 * `path.join(process.cwd(), "docs/dgii/xsd")` fallaba en la función serverless de
 * Vercel porque `process.cwd()` NO apunta a donde quedan los archivos trazados →
 * ENOENT → XSD_UNAVAILABLE. Se prueban varios anclajes y se usa el primero que
 * REALMENTE contiene los XSD (verificado con `existsSync` del sentinel):
 *   1) process.cwd()/docs/dgii/xsd  (local/dev y cuando cwd = raíz de la función)
 *   2) subiendo desde la ubicación del MÓDULO compilado (import.meta.url) buscando
 *      docs/dgii/xsd — robusto ante el cwd de Vercel.
 * Es un saneo de PATH del loader canónico: mismos archivos, mismo validador,
 * misma allowlist anti-traversal. No es un segundo loader.
 */
export function pickXsdDir(
  candidates: string[],
  exists: (p: string) => boolean = existsSync,
): string {
  for (const c of candidates) {
    try {
      if (exists(path.join(c, XSD_SENTINEL))) return c;
    } catch {
      /* candidato inaccesible → siguiente */
    }
  }
  return candidates[0]!; // fallback: comportamiento previo (cwd)
}

function xsdDirCandidates(): string[] {
  const out = [path.join(process.cwd(), ...XSD_REL)];
  try {
    // Next compila el server a CJS y polyfilla import.meta.url → apunta al chunk.
    const here = new URL(import.meta.url).pathname;
    let dir = path.dirname(here);
    for (let i = 0; i < 10; i++) {
      out.push(path.join(dir, ...XSD_REL));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* import.meta.url no disponible → solo cwd */
  }
  return out;
}

/** Directorio donde viven los XSD OFICIALES de DGII (resuelto una vez, robusto). */
export const XSD_DIR = pickXsdDir(xsdDirCandidates());

/** Diagnóstico SEGURO (solo path + existencia; sin secretos) para logs server-side. */
export function xsdDirDiagnostics(): { baseDir: string; sentinelExists: boolean } {
  let sentinelExists = false;
  try {
    sentinelExists = existsSync(path.join(XSD_DIR, XSD_SENTINEL));
  } catch {
    /* noop */
  }
  return { baseDir: XSD_DIR, sentinelExists };
}

/** Mapa fijo tipoEcf → nombre de archivo XSD esperado (allowlist). */
const XSD_FILE_BY_TIPO: Record<XsdEcfTipo, string> = {
  "31": "e-CF-31-v1.0.xsd",
  "32": "e-CF-32-v1.0.xsd",
  "33": "e-CF-33-v1.0.xsd",
  "34": "e-CF-34-v1.0.xsd",
  // v349 — oficiales descargados 2026-07-10 (SOURCE.md: fuente + SHA256).
  "41": "e-CF-41-v1.0.xsd",
  "43": "e-CF-43-v1.0.xsd",
  "44": "e-CF-44-v1.0.xsd",
  "45": "e-CF-45-v1.0.xsd",
  "46": "e-CF-46-v1.0.xsd",
  "47": "e-CF-47-v1.0.xsd",
};

export function isKnownXsdTipo(tipo: string): tipo is XsdEcfTipo {
  return (XSD_ECF_TIPOS as readonly string[]).includes(tipo);
}

/**
 * Parche EN MEMORIA de typos conocidos del XSD oficial (NO modifica el archivo).
 * Caso conocido: el XSD e-CF 31 define `name=" IndicadorServicioTodoIncluidoType"`
 * con un espacio inicial, pero lo referencia sin espacio → no resuelve y el XSD
 * no compila. Se normaliza el espacio inicial dentro de cualquier `name="..."`.
 * Es un saneo de whitespace, NO se inventa ni altera contenido fiscal.
 */
export function patchOfficialDgiiXsd(xsd: string): string {
  // v349 — los XSD oficiales 41-47 vienen con BOM UTF-8 (como ANECF): se remueve
  // EN MEMORIA (el archivo en disco queda idéntico al oficial descargado).
  return xsd.replace(/^\uFEFF/, "").replace(/name="\s+/g, 'name="');
}

/**
 * Resuelve la ruta absoluta del XSD para un tipo conocido. Pura (no toca fs).
 * Lanza EcfValidatorError si el tipo no está en la allowlist o si la ruta
 * resultante escapa de XSD_DIR (defensa extra anti path-traversal).
 */
export function resolveXsdPath(tipo: string): string {
  if (!isKnownXsdTipo(tipo)) {
    throw new EcfValidatorError(`Tipo e-CF sin XSD permitido: ${String(tipo)}.`);
  }
  const file = XSD_FILE_BY_TIPO[tipo];
  const full = path.resolve(XSD_DIR, file);
  if (full !== path.join(XSD_DIR, file) || !full.startsWith(XSD_DIR + path.sep)) {
    throw new EcfValidatorError("Ruta XSD inválida.");
  }
  return full;
}

/**
 * Carga el contenido del XSD oficial para un tipo. Server-runtime (lazy fs).
 * Lanza EcfValidatorError controlado si el archivo aún no fue provisto.
 */
export async function loadXsdForTipo(tipo: string): Promise<string> {
  const full = resolveXsdPath(tipo);
  const { readFile } = await import("node:fs/promises");
  try {
    const contents = await readFile(full, "utf8");
    if (contents.trim() === "") {
      throw new EcfValidatorError(`El XSD para tipo ${tipo} está vacío.`);
    }
    return patchOfficialDgiiXsd(contents);
  } catch (e) {
    if (e instanceof EcfValidatorError) throw e;
    throw new EcfValidatorError(
      `XSD oficial no encontrado para tipo ${tipo}. Coloca '${XSD_FILE_BY_TIPO[tipo as XsdEcfTipo]}' en docs/dgii/xsd/ (ver README_XSD_REQUERIDOS.md).`,
    );
  }
}

/** ¿Existe el XSD oficial para este tipo? (helper para tests/skip condicional.) */
export async function hasOfficialXsd(tipo: string): Promise<boolean> {
  if (!isKnownXsdTipo(tipo)) return false;
  try {
    const { access } = await import("node:fs/promises");
    await access(resolveXsdPath(tipo));
    return true;
  } catch {
    return false;
  }
}
