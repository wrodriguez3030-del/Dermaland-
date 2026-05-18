import "server-only";
import type { Proforma } from "@/types";
import type {
  EcfBuilderInput,
  EcfItem,
  IndicadorFacturacion,
  InformacionReferencia,
} from "./types";

/**
 * DEMO ÚNICAMENTE — Mapea una `Proforma` interna del POS a un
 * `EcfBuilderInput` listo para el pipeline (build → sign → validate → PDF).
 *
 * Se hardcodea el emisor (DermaLand SRL) y se asume:
 *  - `tipoIngresos: '01'` (operaciones).
 *  - `tipoPago: 1` (Contado).
 *  - `IndicadorMontoGravado: 0` (los montos en líneas se entregan SIN ITBIS,
 *    que es como `Proforma.SaleItem.subtotal` se calcula).
 *  - `IndicadorFacturacion` por línea derivado de `itbisRate`:
 *      18 → 1 (ITBIS 1)
 *      16 → 2 (ITBIS 2)
 *      0  → 4 (Exento)
 *      otro → 1 (default conservador)
 *
 * Para tipo 32 (Consumo) RNCComprador/RazonSocialComprador pueden ir vacíos.
 * Para tipos 33/34, la proforma del POS ACTUALMENTE no produce este tipo
 * (POS solo emite 31 o 32 según billingType + método de pago). Se incluye
 * el ramo defensivo por completitud, con `informacionReferencia` placeholder.
 *
 * Cuando Fase C (DB) esté lista, el `eNcf` y `fechaVencimientoSecuencia`
 * deben venir de `DgiiSequenceService`. Por ahora se sintetizan a partir
 * del número de proforma para tener un eNcf único por proforma.
 */

/**
 * Datos del emisor demo.
 *
 * `municipio` y `provincia` se OMITEN intencionalmente: el XSD oficial DGII
 * para e-CF 32/33/34 los restringe a un enum de códigos numéricos (e.g.
 * "320700" para algunos municipios de Santiago) — el documento técnico
 * tiene la tabla completa. "Santiago" como string libre NO valida. Hasta
 * tener un catálogo de códigos DGII en el repo, se omiten — el XSD los
 * marca como `minOccurs="0"`. Duda D-15 en matriz.
 */
const DEMO_EMISOR = {
  rncEmisor: "13259077503",
  razonSocialEmisor: "DermaLand SRL",
  nombreComercial: "DermaLand",
  direccionEmisor:
    "Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este, Santiago",
  correoEmisor: "fiscal@dermaland.do",
} as const;

const RNC_RE = /^(?:\d{9}|\d{11})$/;

function indicadorFacturacionFromItbisRate(rate: number): IndicadorFacturacion {
  if (rate === 16) return 2;
  if (rate === 0) return 4;
  if (rate === 18) return 1;
  return 1;
}

/** Strip cualquier no-dígito de un RNC/cédula (acepta `1-32-59077-5`). */
function normalizeRnc(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return RNC_RE.test(digits) ? digits : undefined;
}

/**
 * Sintetiza un eNcf demo a partir del número de proforma. Cuando llegue
 * `DgiiSequenceService` (Fase C), este eNcf se reemplaza con uno reservado
 * atómicamente desde `ecf_sequences`. NO usar en producción para enviar a
 * DGII real.
 */
function synthesizeENcf(tipoEcf: string, proformaNumber: string): string {
  // Tomar los últimos dígitos del número (e.g. "PROF-2026-00185" → "00185").
  const digits = proformaNumber.replace(/\D/g, "").slice(-10);
  const padded = digits.padStart(10, "0");
  // eNcf = `E<tipo:2>` + 10 dígitos = 13 chars total.
  return `E${tipoEcf}${padded}`;
}

function parseDate(value: string | Date | undefined, fallback: Date): Date {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export interface MapProformaOptions {
  /** Tipo e-CF a sintetizar si la proforma no tiene `ecfType`. Default '32'. */
  defaultTipoEcf?: "31" | "32" | "33" | "34";
}

/**
 * Convierte una `Proforma` en un `EcfBuilderInput` listo para el builder.
 *
 * @throws Error si la proforma no es facturable como e-CF (e.g. documentKind
 *  distinto a 'invoice' Y sin ecfType — el POS marca el doc como proforma
 *  no fiscal en esos casos).
 */
export function mapProformaToEcfInput(
  proforma: Proforma,
  opts: MapProformaOptions = {},
): EcfBuilderInput {
  const tipoEcf = (proforma.ecfType ?? opts.defaultTipoEcf ?? "32") as
    | "31"
    | "32"
    | "33"
    | "34";

  const now = new Date();
  const fechaEmision = parseDate(proforma.createdAt as unknown as string, now);
  const fechaFirma = parseDate(proforma.updatedAt as unknown as string, now);

  const eNcf = synthesizeENcf(tipoEcf, proforma.number);

  if (proforma.items.length === 0) {
    throw new Error("La proforma no tiene ítems — nada que facturar");
  }

  const items: EcfItem[] = proforma.items.map((it, ix) => {
    // `subtotal` de la proforma es pre-ITBIS post-descuento.
    const subtotalLinea = it.subtotal;
    const unidades = it.quantity > 0 ? it.quantity : 1;
    // Precio unitario pre-ITBIS pre-descuento.
    const precioUnitarioPre = it.unitPrice / (1 + it.itbisRate / 100);
    return {
      numeroLinea: ix + 1,
      indicadorFacturacion: indicadorFacturacionFromItbisRate(it.itbisRate),
      nombreItem: it.productName,
      indicadorBienoServicio: 1,
      descripcionItem: it.lotNumber
        ? `Lote ${it.lotNumber} · SKU ${it.productSku}`
        : `SKU ${it.productSku}`,
      cantidadItem: unidades,
      precioUnitarioItem: precioUnitarioPre,
      ...(it.discount > 0 ? { descuentoMonto: it.discount } : {}),
      montoItem: subtotalLinea,
    };
  });

  // Comprador: si hay RNC válido → tipo 31 friendly. Para tipo 32 sin
  // RNC se omite (consumidor final).
  const rncComprador = normalizeRnc(proforma.customerDocument);
  const razonSocial = proforma.customerName || undefined;

  // Para 33/34 (NC/ND) — el POS actual no emite estos, pero proveemos un
  // placeholder defensivo si llegan vía path no estándar.
  let informacionReferencia: InformacionReferencia | undefined;
  if (tipoEcf === "33" || tipoEcf === "34") {
    informacionReferencia = {
      ncfModificado: "E310000000001",
      rncOtroContribuyente: rncComprador ?? "131234567",
      fechaNCFModificado: fechaEmision,
      codigoModificacion: tipoEcf === "34" ? 1 : 2,
    };
  }

  const indicadorNotaCredito = tipoEcf === "34" ? 0 : undefined;

  return {
    tipoEcf,
    eNcf,
    fechaVencimientoSecuencia: new Date(2027, 11, 31),
    tipoIngresos: "01",
    tipoPago: 1,
    indicadorMontoGravado: 0,
    indicadorNotaCredito,
    emisor: {
      ...DEMO_EMISOR,
      fechaEmision,
    },
    comprador: {
      ...(rncComprador ? { rncComprador } : {}),
      ...(razonSocial ? { razonSocialComprador: razonSocial } : {}),
    },
    totales: {
      montoGravadoTotal: proforma.subtotal,
      itbis1: 18,
      totalItbis: proforma.itbis,
      totalItbis1: proforma.itbis,
      montoTotal: proforma.total,
    },
    items,
    informacionReferencia,
    fechaHoraFirma: fechaFirma,
  };
}
