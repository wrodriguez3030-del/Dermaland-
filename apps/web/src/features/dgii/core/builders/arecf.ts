import { group, leaf, serializeDocument } from "../xml-utils";
import {
  assertField,
  isValidDgiiDateTime,
  isValidEncf,
  isValidRnc,
} from "./common";

/**
 * v316 — Builder PURO del Acuse de Recibo (ARECF v1.0). Campo a campo según el
 * PDF oficial "Formato Acuse de Recibo v1.0" (dgii.gov.do):
 * <ARECF><DetalleAcusedeRecibo> Version(1.0) · RNCEmisor(9|11) · RNCComprador(9|11)
 * · eNCF(13) · Estado(0=Recibido|1=No Recibido) · CodigoMotivoNoRecibido(1-4,
 * condicional a Estado=1) · FechaHoraAcuseRecibo(dd-MM-AAAA HH:mm:ss).
 * La <Signature> (XMLDSig) la agrega el signer existente sobre este XML.
 * Sin DB, sin red, sin secuencias, salida determinística.
 */

/** Motivos oficiales de No Recibido. */
export const ARECF_MOTIVOS = {
  ERROR_ESPECIFICACION: 1,
  ERROR_FIRMA_DIGITAL: 2,
  ENVIO_DUPLICADO: 3,
  RNC_COMPRADOR_NO_CORRESPONDE: 4,
} as const;

export interface ArecfInput {
  rncEmisor: string;
  rncComprador: string;
  encf: string;
  /** 0 = e-CF Recibido · 1 = e-CF No Recibido. */
  estado: 0 | 1;
  /** Obligatorio si estado=1; prohibido si estado=0. */
  codigoMotivoNoRecibido?: 1 | 2 | 3 | 4;
  /** dd-MM-AAAA HH:mm:ss */
  fechaHoraAcuseRecibo: string;
}

export function buildArecf(input: ArecfInput): { xml: string } {
  assertField(isValidRnc(input.rncEmisor), "RNCEmisor", "RNC del emisor inválido (9 u 11 dígitos).");
  assertField(isValidRnc(input.rncComprador), "RNCComprador", "RNC del comprador inválido (9 u 11 dígitos).");
  assertField(isValidEncf(input.encf), "eNCF", "e-NCF inválido (13 posiciones, serie E-Z sin P).");
  assertField(input.estado === 0 || input.estado === 1, "Estado", "Estado debe ser 0 (Recibido) o 1 (No Recibido).");
  if (input.estado === 1) {
    assertField(
      input.codigoMotivoNoRecibido != null && input.codigoMotivoNoRecibido >= 1 && input.codigoMotivoNoRecibido <= 4,
      "CodigoMotivoNoRecibido",
      "Con Estado=1 el código de motivo (1-4) es obligatorio.",
    );
  } else {
    assertField(
      input.codigoMotivoNoRecibido == null,
      "CodigoMotivoNoRecibido",
      "Con Estado=0 no debe enviarse código de motivo.",
    );
  }
  assertField(
    isValidDgiiDateTime(input.fechaHoraAcuseRecibo),
    "FechaHoraAcuseRecibo",
    "Fecha/hora inválida (dd-MM-AAAA HH:mm:ss).",
  );

  const root = group("ARECF", [
    group("DetalleAcusedeRecibo", [
      leaf("Version", "1.0"),
      leaf("RNCEmisor", input.rncEmisor),
      leaf("RNCComprador", input.rncComprador),
      leaf("eNCF", input.encf),
      leaf("Estado", String(input.estado)),
      input.estado === 1 ? leaf("CodigoMotivoNoRecibido", String(input.codigoMotivoNoRecibido)) : null,
      leaf("FechaHoraAcuseRecibo", input.fechaHoraAcuseRecibo),
    ]),
  ]);
  return { xml: serializeDocument(root) };
}
