/**
 * Catálogo de provincias, municipios y distritos municipales de República
 * Dominicana — codificación oficial DGII.
 *
 * **FUENTE:** códigos y nombres extraídos directamente del XSD oficial
 * `docs/dgii/xsd/e-CF-32-v1.0.xsd` (campo `ProvinciaMunicipioType`,
 * enumeración con 582 entradas). El archivo de datos
 * (`./dgii-locations-data.ts`) es AUTO-GENERADO por
 * `scripts/extract-dgii-locations.sh`. NO editar a mano.
 *
 * **Estructura de códigos:**
 *  - 6 dígitos: `PPRRDD`
 *  - `PP` = provincia (01-32)
 *  - `RR` = municipio dentro de la provincia (`00` = provincia entera)
 *  - `DD` = distrito municipal (`00` = municipio entero)
 *
 *  Ejemplos:
 *  - `250000` = Provincia (Santiago)
 *  - `250100` = Municipio (Santiago de los Caballeros)
 *  - `250101` = Distrito municipal (Santiago D.M.)
 *
 * **Estado de validación:**
 *  - Los **códigos** son oficiales (vienen del XSD DGII).
 *  - Los **nombres** vienen de los comentarios del XSD oficial — son la
 *    fuente canónica DGII (mayúsculas y formato preservado).
 *  - Si DGII publica un XSD actualizado, regenerar el catálogo con
 *    `bash scripts/extract-dgii-locations.sh`.
 *
 * Duda D-15 en `docs/dgii/matriz-requisitos-dgii.md` queda **PARCIALMENTE
 * RESUELTA**: tenemos los códigos oficiales. Pendiente validar contra el
 * catálogo publicado por DGII (PDF o portal) por si los nombres en
 * comentarios del XSD difieren del catálogo oficial canonical.
 */

export type DrLocationType = "provincia" | "municipio" | "distrito";

export interface DrLocation {
  /** Código DGII de 6 dígitos (e.g. `250101`). */
  code: string;
  /** Código de la provincia padre (e.g. `250000`). */
  provinceCode: string;
  /** Nombre oficial tal como aparece en el XSD DGII. */
  name: string;
  /** Tipo derivado de la estructura del código. */
  type: DrLocationType;
}

import { DGII_LOCATION_DATA } from "./dgii-locations-data";

export const ALL_LOCATIONS: ReadonlyArray<DrLocation> = DGII_LOCATION_DATA;

export const PROVINCIAS: ReadonlyArray<DrLocation> = ALL_LOCATIONS.filter(
  (l) => l.type === "provincia",
);

export const MUNICIPIOS: ReadonlyArray<DrLocation> = ALL_LOCATIONS.filter(
  (l) => l.type === "municipio",
);

export const DISTRITOS: ReadonlyArray<DrLocation> = ALL_LOCATIONS.filter(
  (l) => l.type === "distrito",
);

/** Lookup O(1) por código. */
const BY_CODE: ReadonlyMap<string, DrLocation> = new Map(
  ALL_LOCATIONS.map((l) => [l.code, l] as const),
);

export function findLocationByCode(code: string): DrLocation | undefined {
  return BY_CODE.get(code);
}

/** Municipios + distritos de una provincia. */
export function getChildrenOfProvince(
  provinceCode: string,
): DrLocation[] {
  return ALL_LOCATIONS.filter(
    (l) => l.provinceCode === provinceCode && l.code !== provinceCode,
  );
}

/** Solo municipios (cabeceras) de una provincia. */
export function getMunicipiosOfProvince(
  provinceCode: string,
): DrLocation[] {
  return MUNICIPIOS.filter((l) => l.provinceCode === provinceCode);
}

/** Toma una cadena escrita por el usuario ("Santiago", "santiago de los caballeros")
 *  y devuelve la mejor coincidencia case-insensitive contra el catálogo. Útil
 *  para migrar datos legacy donde los emisores grabaron strings en vez de
 *  códigos. Si no hay match, devuelve undefined.
 */
export function findLocationByFuzzyName(
  text: string,
): DrLocation | undefined {
  if (!text) return undefined;
  const normalized = text.trim().toLocaleLowerCase("es-DO");
  // 1. Match exacto case-insensitive.
  let hit = ALL_LOCATIONS.find(
    (l) => l.name.toLocaleLowerCase("es-DO") === normalized,
  );
  if (hit) return hit;
  // 2. Match contains.
  hit = ALL_LOCATIONS.find((l) =>
    l.name.toLocaleLowerCase("es-DO").includes(normalized),
  );
  return hit;
}
