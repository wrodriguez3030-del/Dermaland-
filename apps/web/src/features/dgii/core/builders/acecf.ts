import { group, leaf, serializeDocument, money2str } from "../xml-utils";
import {
  assertField,
  isValidDgiiDate,
  isValidDgiiDateTime,
  isValidEncf,
  isValidMoney,
  isValidRnc,
} from "./common";

/**
 * v316 — Builder PURO de la Aprobación Comercial (ACECF v1.0). Campo a campo
 * según el PDF oficial "Formato Aprobación Comercial v1.0" (dgii.gov.do):
 * <ACECF><DetalleAprobacionComercial> Version(1.0) · RNCEmisor(9|11, = emisor del
 * e-CF) · eNCF(13, = e-CF remitido) · FechaEmision(dd-MM-AAAA, = e-CF) ·
 * MontoTotal(NUM 18, = e-CF) · RNCComprador(9|11) · Estado(1=Aceptado|2=Rechazado)
 * · DetalleMotivoRechazo(≤250, condicional a Estado=2) ·
 * FechaHoraAprobacionComercial(dd-MM-AAAA HH:mm:ss).
 * La <Signature> la agrega el signer existente. Sin DB/red/secuencias.
 */

export interface AcecfInput {
  rncEmisor: string;
  encf: string;
  /** dd-MM-AAAA — debe coincidir con la del e-CF. */
  fechaEmision: string;
  /** Debe coincidir con el MontoTotal del e-CF. */
  montoTotal: number;
  rncComprador: string;
  /** 1 = e-CF Aceptado · 2 = e-CF Rechazado. */
  estado: 1 | 2;
  /** Obligatorio si estado=2 (máx 250); prohibido si estado=1. */
  detalleMotivoRechazo?: string;
  /** dd-MM-AAAA HH:mm:ss */
  fechaHoraAprobacionComercial: string;
}

export function buildAcecf(input: AcecfInput): { xml: string } {
  assertField(isValidRnc(input.rncEmisor), "RNCEmisor", "RNC del emisor inválido (9 u 11 dígitos).");
  assertField(isValidEncf(input.encf), "eNCF", "e-NCF inválido (13 posiciones).");
  assertField(isValidDgiiDate(input.fechaEmision), "FechaEmision", "Fecha de emisión inválida (dd-MM-AAAA).");
  assertField(isValidMoney(input.montoTotal), "MontoTotal", "Monto total inválido (NUM ≥ 0).");
  assertField(isValidRnc(input.rncComprador), "RNCComprador", "RNC del comprador inválido (9 u 11 dígitos).");
  assertField(input.estado === 1 || input.estado === 2, "Estado", "Estado debe ser 1 (Aceptado) o 2 (Rechazado).");
  if (input.estado === 2) {
    const motivo = input.detalleMotivoRechazo?.trim() ?? "";
    assertField(motivo.length > 0, "DetalleMotivoRechazo", "Con Estado=2 el detalle del motivo es obligatorio.");
    assertField(motivo.length <= 250, "DetalleMotivoRechazo", "Detalle del motivo excede 250 caracteres.");
  } else {
    assertField(
      input.detalleMotivoRechazo == null || input.detalleMotivoRechazo.trim() === "",
      "DetalleMotivoRechazo",
      "Con Estado=1 no debe enviarse motivo de rechazo.",
    );
  }
  assertField(
    isValidDgiiDateTime(input.fechaHoraAprobacionComercial),
    "FechaHoraAprobacionComercial",
    "Fecha/hora inválida (dd-MM-AAAA HH:mm:ss).",
  );

  const root = group("ACECF", [
    group("DetalleAprobacionComercial", [
      leaf("Version", "1.0"),
      leaf("RNCEmisor", input.rncEmisor),
      leaf("eNCF", input.encf),
      leaf("FechaEmision", input.fechaEmision),
      leaf("MontoTotal", money2str(input.montoTotal)),
      leaf("RNCComprador", input.rncComprador),
      leaf("Estado", String(input.estado)),
      input.estado === 2 ? leaf("DetalleMotivoRechazo", input.detalleMotivoRechazo!.trim()) : null,
      leaf("FechaHoraAprobacionComercial", input.fechaHoraAprobacionComercial),
    ]),
  ]);
  return { xml: serializeDocument(root) };
}
