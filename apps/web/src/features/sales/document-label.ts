import type { Proforma } from "@/types";

/**
 * Clasificación y etiqueta del documento de venta a partir de los campos que
 * persiste el POS en la tabla `proformas` (modelo único de documento de venta):
 *
 *  - `documentKind`: "proforma" | "invoice"
 *  - `ecfType`: "31" | "32" (solo e-CF)
 *  - `ecfNumber`: comprobante fiscal generado (B02…/B01… para NCF, E32…/E31…)
 *
 * Regla de clasificación:
 *  - documentKind === "invoice" + ecfType  → e-CF (E32/E31)
 *  - documentKind === "invoice" sin ecfType → NCF tradicional (B02/B01)
 *  - resto                                  → Proforma
 *
 * Esto permite que la pantalla **Proformas** muestre solo proformas y la
 * pantalla **Ventas / Facturas** muestre las facturas NCF/e-CF, usando el mismo
 * criterio en todos lados.
 */

export type SaleDocClass = "proforma" | "ncf" | "ecf";

type DocFields = Pick<Proforma, "documentKind" | "ecfType" | "ecfNumber"> & {
  number?: string;
};

export function classifySaleDocument(p: DocFields): SaleDocClass {
  if (p.documentKind === "invoice") {
    return p.ecfType ? "ecf" : "ncf";
  }
  return "proforma";
}

export function isProformaDocument(p: DocFields): boolean {
  return classifySaleDocument(p) === "proforma";
}

export function isInvoiceDocument(p: DocFields): boolean {
  return classifySaleDocument(p) !== "proforma";
}

/** Etiqueta legible del tipo de documento (para chips/columnas). */
export function saleDocumentLabel(p: DocFields): string {
  const cls = classifySaleDocument(p);
  if (cls === "ecf") {
    return p.ecfType === "31"
      ? "Crédito Fiscal e-CF (E31)"
      : "Consumo e-CF (E32)";
  }
  if (cls === "ncf") {
    const prefix = (p.ecfNumber ?? "").slice(0, 3).toUpperCase();
    if (prefix === "B01") return "Crédito fiscal (B01)";
    if (prefix === "B02") return "Factura de consumo (B02)";
    return "Factura NCF";
  }
  return "Proforma";
}

/**
 * Base de ruta para ver/imprimir según el TIPO de documento:
 *  - facturas (NCF/e-CF) → `/ventas`
 *  - proformas           → `/proformas`
 * Garantiza que una factura B02/B01/e-CF nunca se mande a la ruta de proforma.
 */
export function documentRouteBase(p: DocFields): "/ventas" | "/proformas" {
  return isInvoiceDocument(p) ? "/ventas" : "/proformas";
}

/** Tono de badge por clase de documento. */
export function saleDocumentTone(
  p: DocFields,
): "neutral" | "purple" | "info" {
  const cls = classifySaleDocument(p);
  if (cls === "ecf") return "purple";
  if (cls === "ncf") return "info";
  return "neutral";
}

// ─── Info de presentación del documento (títulos, banner demo, etc.) ─────────

export interface DocumentDisplayInfo {
  cls: SaleDocClass;
  /** Título grande: "FACTURA" / "FACTURA ELECTRÓNICA" / "PROFORMA". */
  title: string;
  /** Subtítulo: "Factura de consumo (B02)", "Factura de consumo electrónica (e-CF 32)"… */
  subtitle: string;
  /** Etiqueta del número: "NCF" / "e-NCF" / "No.". */
  numberLabel: string;
  number: string;
  /** true solo para e-CF (E31/E32…). Los NCF tradicionales (B0x) son false. */
  isElectronic: boolean;
  /** Mostrar banner "sin validez fiscal": e-CF en demo o proforma. NUNCA para NCF. */
  showDemoBanner: boolean;
}

/** Subtítulo del NCF tradicional según el prefijo del comprobante (B01/B02…). */
function ncfSubtitle(number: string): string {
  const prefix = (number ?? "").slice(0, 3).toUpperCase();
  switch (prefix) {
    case "B01":
      return "Crédito fiscal (B01)";
    case "B02":
      return "Factura de consumo (B02)";
    case "B04":
      return "Nota de crédito (B04)";
    case "B14":
      return "Régimen especial (B14)";
    case "B15":
      return "Gubernamental (B15)";
    case "B16":
      return "Exportaciones (B16)";
    default:
      return "Factura NCF";
  }
}

/**
 * Info central para pintar CUALQUIER formato de documento (pantalla, PDF,
 * ticket, WhatsApp) de forma consistente. La clasificación manda: un NCF
 * tradicional (B0x, sin `ecfType`) NUNCA se muestra como e-CF ni con banner demo;
 * un e-CF (E3x) sí; la proforma no lleva NCF/e-CF.
 *
 * `isDemoEnv` = ambiente e-CF no productivo (DGII apagado). Solo afecta el banner
 * de los e-CF; los NCF tradicionales son fiscales y no muestran banner.
 */
export function getDocumentDisplayInfo(
  p: DocFields,
  opts: { isDemoEnv?: boolean } = {},
): DocumentDisplayInfo {
  const cls = classifySaleDocument(p);
  const number = p.ecfNumber ?? p.number ?? "";
  const isDemoEnv = opts.isDemoEnv ?? true;

  if (cls === "ecf") {
    const is31 = p.ecfType === "31";
    return {
      cls,
      title: "FACTURA ELECTRÓNICA",
      subtitle: is31
        ? "Crédito fiscal electrónico (e-CF 31)"
        : "Factura de consumo electrónica (e-CF 32)",
      numberLabel: "e-NCF",
      number,
      isElectronic: true,
      showDemoBanner: isDemoEnv,
    };
  }

  if (cls === "ncf") {
    return {
      cls,
      title: "FACTURA",
      subtitle: ncfSubtitle(number),
      numberLabel: "NCF",
      number,
      isElectronic: false,
      showDemoBanner: false,
    };
  }

  return {
    cls,
    title: "PROFORMA",
    subtitle: "Documento no fiscal",
    numberLabel: "No.",
    number,
    isElectronic: false,
    showDemoBanner: true,
  };
}
