import { ECF_TIPO_LABELS, ECF_TIPOS_BUILDER, ECF_TIPOS_POSTULACION, ECF_TIPOS_RESERVADOS } from "./builder-types";
import { XSD_ECF_TIPOS } from "./validator-types";

/**
 * v349 — MATRIZ DE CAPACIDADES e-CF (fuente ÚNICA de "¿qué puede hacer AgendApp
 * con cada tipo?"). NO es una lista nueva: es la COMPOSICIÓN de las fuentes
 * canónicas existentes, para que UI/postulación/preflight no mantengan listas
 * independientes que se desincronicen:
 *
 *   - EMISIÓN (builder):  ECF_TIPOS_BUILDER (builder-types.ts) — hoy 31,32,33,34.
 *   - VALIDACIÓN (XSD):   XSD_ECF_TIPOS (validator-types.ts) — los 10 con XSD
 *                          oficial en docs/dgii/xsd/ (SOURCE.md, SHA256).
 *   - NOMBRES:            ECF_TIPO_LABELS (builder-types.ts; re-export en postulacion-content).
 *
 * REGLA DE HONESTIDAD (no declarar soporte falso): un tipo es DECLARABLE ante
 * DGII únicamente si es EMITIBLE end-to-end (builder + XSD + firma + secuencia).
 * Tener el XSD habilita validar ENTRANTES y desarrollar el builder — no emite.
 *
 * La capa TENANT (¿este negocio tiene rango/autorización DGII para el tipo?) es
 * DB-aware y vive aparte (ecf_sequences: el gate natural es "rango cargado y
 * vigente") — este módulo es puro y describe la capacidad del SOFTWARE.
 */

/** Los 10 tipos e-CF objetivo del producto (orden oficial). */
export const ECF_TIPOS_OBJETIVO = ["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"] as const;
export type EcfTipoObjetivo = (typeof ECF_TIPOS_OBJETIVO)[number];

export type EcfSoftwareCapability = {
  tipo: EcfTipoObjetivo;
  nombre: string;
  /** XSD oficial presente y cargable (capa validación / recepción entrante). */
  xsdReady: boolean;
  /** Builder canónico implementado (capa emisión). */
  builderReady: boolean;
  /** Emitible end-to-end por el SOFTWARE (builder + XSD). */
  emitible: boolean;
  /**
   * Declarable en la postulación DGII (fuente: ECF_TIPOS_POSTULACION).
   * v351 — subconjunto de emitible: builder listo ≠ certification-ready.
   */
  declarable: boolean;
  /** Estado humano honesto. */
  estado: "READY" | "BUILDER_READY_CERTIFICATION_PENDING" | "XSD_READY_BUILDER_PENDING";
};

export function getEcfSoftwareCapabilities(): EcfSoftwareCapability[] {
  return ECF_TIPOS_OBJETIVO.map((tipo) => {
    const builderReady = (ECF_TIPOS_BUILDER as readonly string[]).includes(tipo);
    const xsdReady = (XSD_ECF_TIPOS as readonly string[]).includes(tipo);
    const emitible = builderReady && xsdReady;
    const declarable = emitible && (ECF_TIPOS_POSTULACION as readonly string[]).includes(tipo);
    return {
      tipo,
      nombre: ECF_TIPO_LABELS[tipo] ?? `e-CF ${tipo}`,
      xsdReady,
      builderReady,
      emitible,
      declarable,
      estado: declarable
        ? "READY"
        : emitible
        ? "BUILDER_READY_CERTIFICATION_PENDING"
        : "XSD_READY_BUILDER_PENDING",
    };
  });
}

/** ¿Tipo reconocido dentro del objetivo del producto? (42 y desconocidos → false). */
export function isEcfTipoObjetivo(tipo: string): tipo is EcfTipoObjetivo {
  return (ECF_TIPOS_OBJETIVO as readonly string[]).includes(tipo);
}

/** ¿El software puede EMITIR este tipo end-to-end? (fuente: builder canónico.) */
export function isEmitibleTipo(tipo: string): boolean {
  return (ECF_TIPOS_BUILDER as readonly string[]).includes(tipo);
}

/** Tipos declarables HOY en la postulación (idéntico a SUPPORTED_ECF_TIPOS v339). */
export function getDeclarableTipos(): string[] {
  return getEcfSoftwareCapabilities()
    .filter((c) => c.declarable)
    .map((c) => c.tipo);
}

// Coherencia estática: los reservados del builder son exactamente los objetivo
// sin builder (si alguien agrega un builder sin actualizar reservados, o al
// revés, los tests de invariantes lo detectan).
export function capabilityInvariantIssues(): string[] {
  const issues: string[] = [];
  const caps = getEcfSoftwareCapabilities();
  for (const c of caps) {
    if (c.declarable && !c.emitible) issues.push(`Tipo ${c.tipo} declarable sin ser emitible.`);
    if (c.emitible && !c.xsdReady) issues.push(`Tipo ${c.tipo} emitible sin XSD oficial.`);
  }
  for (const p of ECF_TIPOS_POSTULACION) {
    if (!(ECF_TIPOS_BUILDER as readonly string[]).includes(p)) {
      issues.push(`Tipo ${p} declarable en postulación sin builder.`);
    }
  }
  for (const r of ECF_TIPOS_RESERVADOS) {
    if ((ECF_TIPOS_BUILDER as readonly string[]).includes(r)) {
      issues.push(`Tipo ${r} figura como reservado Y como implementado en el builder.`);
    }
  }
  return issues;
}
