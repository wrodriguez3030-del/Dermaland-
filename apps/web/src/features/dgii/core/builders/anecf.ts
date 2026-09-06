import { group, leaf, serializeDocument } from "../xml-utils";
import {
  assertField,
  isValidDgiiDateTime,
  isValidEncf,
  isValidRnc,
  TIPOS_ECF,
  type TipoEcfCodigo,
} from "./common";

/**
 * v316 — Builder PURO de la Anulación de secuencias de e-NCF (ANECF v1.0).
 * Campo a campo según el PDF oficial "Formato Anulación de e-NCF v1.0"
 * (dgii.gov.do): <ANECF><Encabezado> Version(1.0) · RncEmisor(9|11, casing
 * oficial "RncEmisor") · CantidadeNCFAnulados(Σ del detalle) ·
 * FechaHoraAnulacioneNCF(dd-MM-AAAA HH:mm:ss) · <DetalleAnulacion><Anulacion>
 * (hasta 10): NoLinea(1-10) · TipoeCF(31/32/33/34/41/43/44/45/46/47) ·
 * <TablaRangoSecuenciasAnuladaseNCF> (hasta 10,000 rangos): SecuenciaeNCFDesde/
 * SecuenciaeNCFHasta(13, misma serie+tipo, Desde ≤ Hasta) · CantidadeNCFAnulados
 * (Σ de los rangos). NO consume secuencias — solo construye el XML del trámite.
 * v317: verificado contra el XSD OFICIAL ANECF v1.0 (docs/dgii/xsd/ANECF-v1.0.xsd):
 * cada rango va en un elemento <Secuencias> dentro de TablaRangoSecuenciasAnuladaseNCF.
 */

export interface AnecfRango {
  desde: string;
  hasta: string;
}

export interface AnecfAnulacion {
  tipoEcf: TipoEcfCodigo;
  rangos: AnecfRango[];
}

export interface AnecfInput {
  rncEmisor: string;
  /** dd-MM-AAAA HH:mm:ss */
  fechaHoraAnulacion: string;
  /** Hasta 10 anulaciones (una por tipo de e-CF). */
  anulaciones: AnecfAnulacion[];
}

function secuencial(encf: string): number {
  return Number(encf.slice(3));
}

export function buildAnecf(input: AnecfInput): { xml: string; cantidadTotal: number } {
  assertField(isValidRnc(input.rncEmisor), "RncEmisor", "RNC del emisor inválido (9 u 11 dígitos).");
  assertField(
    isValidDgiiDateTime(input.fechaHoraAnulacion),
    "FechaHoraAnulacioneNCF",
    "Fecha/hora inválida (dd-MM-AAAA HH:mm:ss).",
  );
  assertField(input.anulaciones.length >= 1, "Anulacion", "Debe incluir al menos una anulación.");
  assertField(input.anulaciones.length <= 10, "Anulacion", "Máximo 10 anulaciones (repeticiones oficiales).");

  let cantidadTotal = 0;
  const detalles = input.anulaciones.map((a, idx) => {
    assertField(
      (TIPOS_ECF as readonly string[]).includes(a.tipoEcf),
      "TipoeCF",
      `Tipo de e-CF inválido: ${a.tipoEcf}.`,
    );
    assertField(a.rangos.length >= 1, "TablaRangoSecuenciasAnuladaseNCF", "Cada anulación requiere al menos un rango.");
    assertField(a.rangos.length <= 10_000, "TablaRangoSecuenciasAnuladaseNCF", "Máximo 10,000 rangos por anulación.");

    let cantidad = 0;
    const rangos = a.rangos.map((r) => {
      assertField(isValidEncf(r.desde), "SecuenciaeNCFDesde", `e-NCF 'desde' inválido: ${r.desde}.`);
      assertField(isValidEncf(r.hasta), "SecuenciaeNCFHasta", `e-NCF 'hasta' inválido: ${r.hasta}.`);
      assertField(
        r.desde.slice(0, 3) === r.hasta.slice(0, 3),
        "SecuenciaeNCFHasta",
        "El rango debe tener la misma serie y tipo de comprobante.",
      );
      assertField(
        r.desde.slice(1, 3) === a.tipoEcf,
        "SecuenciaeNCFDesde",
        `El tipo del e-NCF (${r.desde.slice(1, 3)}) no corresponde al TipoeCF ${a.tipoEcf}.`,
      );
      const d = secuencial(r.desde);
      const h = secuencial(r.hasta);
      assertField(d > 0 && h >= d, "SecuenciaeNCFHasta", "Rango inválido: 'hasta' debe ser ≥ 'desde' y > 0.");
      cantidad += h - d + 1;
      return group("Secuencias", [
        leaf("SecuenciaeNCFDesde", r.desde),
        leaf("SecuenciaeNCFHasta", r.hasta),
      ]);
    });
    cantidadTotal += cantidad;

    return group("Anulacion", [
      leaf("NoLinea", String(idx + 1)),
      leaf("TipoeCF", a.tipoEcf),
      group("TablaRangoSecuenciasAnuladaseNCF", rangos),
      leaf("CantidadeNCFAnulados", String(cantidad)),
    ]);
  });

  const root = group("ANECF", [
    group("Encabezado", [
      leaf("Version", "1.0"),
      leaf("RncEmisor", input.rncEmisor),
      leaf("CantidadeNCFAnulados", String(cantidadTotal)),
      leaf("FechaHoraAnulacioneNCF", input.fechaHoraAnulacion),
    ]),
    group("DetalleAnulacion", detalles),
  ]);
  return { xml: serializeDocument(root), cantidadTotal };
}
