import { group, leaf, serializeDocument, money2, money2str } from "../xml-utils";
import {
  assertField,
  isValidDgiiDate,
  isValidEncf,
  isValidMoney,
  isValidRnc,
} from "./common";

/**
 * v316 — Builder PURO del Resumen de Factura de Consumo Electrónica (RFCE 32
 * v1.0, facturas de consumo < RD$250,000). Campo a campo según el PDF oficial
 * "Formato Resumen Factura Consumo Electrónica v1.0" (dgii.gov.do):
 * <RFCE><Encabezado> Version(1.0) · <IdDoc> TipoeCF(32) · eNCF(13) ·
 * TipoIngresos(01-06) · TipoPago(1|2|3) · TablaFormasPago(≤7 <FormaDePago> con
 * FormaPago(1-8)+MontoPago) · <Emisor> RNCEmisor · RazonSocialEmisor(≤150) ·
 * FechaEmision(dd-MM-AAAA) · <Comprador>(opcional) RNCComprador |
 * IdentificadorExtranjero(condicional, excluyentes) · RazonSocialComprador ·
 * <Totales> MontoGravadoTotal/I1/I2/I3 · MontoExento · TotalITBIS/1/2/3 ·
 * MontoImpuestoAdicional + ImpuestosAdicionales(≤20) · MontoTotal(=Σ) ·
 * MontoNoFacturable · MontoPeriodo · CodigoSeguridadeCF(6, primeros 6 chars del
 * hash de la firma del e-CF emitido). Sin DB/red/secuencias.
 */

export interface RfceImpuestoAdicional {
  tipoImpuesto: string; // código Tabla I del formato e-CF (3)
  montoSelectivoEspecifico?: number;
  montoSelectivoAdvalorem?: number;
  otrosImpuestos?: number;
}

export interface RfceInput {
  encf: string; // E32xxxxxxxxxx
  tipoIngresos: "01" | "02" | "03" | "04" | "05" | "06";
  tipoPago: 1 | 2 | 3;
  formasPago?: { forma: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; monto: number }[];
  rncEmisor: string;
  razonSocialEmisor: string;
  fechaEmision: string; // dd-MM-AAAA
  comprador?: {
    rncComprador?: string;
    identificadorExtranjero?: string;
    razonSocial?: string;
  };
  totales: {
    montoGravadoTotal?: number;
    montoGravadoI1?: number;
    montoGravadoI2?: number;
    montoGravadoI3?: number;
    montoExento?: number;
    totalItbis?: number;
    totalItbis1?: number;
    totalItbis2?: number;
    totalItbis3?: number;
    montoImpuestoAdicional?: number;
    impuestosAdicionales?: RfceImpuestoAdicional[];
    montoTotal: number;
    montoNoFacturable?: number;
    montoPeriodo?: number;
  };
  /** Primeros 6 caracteres del hash de la firma del e-CF emitido (nunca inventado). */
  codigoSeguridad: string;
}

/** Tope oficial del RFCE: facturas de consumo MENORES a RD$250,000. */
export const RFCE_MONTO_MAXIMO = 250_000;

export function buildRfce(input: RfceInput): { xml: string } {
  assertField(isValidEncf(input.encf), "eNCF", "e-NCF inválido (13 posiciones).");
  assertField(input.encf.slice(1, 3) === "32", "TipoeCF", "El RFCE aplica solo al tipo 32 (Factura de Consumo).");
  assertField(isValidRnc(input.rncEmisor), "RNCEmisor", "RNC del emisor inválido (9 u 11 dígitos).");
  assertField(
    input.razonSocialEmisor.trim().length > 0 && input.razonSocialEmisor.length <= 150,
    "RazonSocialEmisor",
    "Razón social del emisor requerida (≤150).",
  );
  assertField(isValidDgiiDate(input.fechaEmision), "FechaEmision", "Fecha de emisión inválida (dd-MM-AAAA).");
  const t = input.totales;
  assertField(isValidMoney(t.montoTotal), "MontoTotal", "Monto total inválido.");
  assertField(t.montoTotal < RFCE_MONTO_MAXIMO, "MontoTotal", "El RFCE aplica solo a facturas < RD$250,000.");
  assertField(
    /^[A-Za-z0-9+/=]{6}$/.test(input.codigoSeguridad),
    "CodigoSeguridadeCF",
    "Código de seguridad inválido (6 caracteres del hash de la firma — nunca se inventa).",
  );
  const fp = input.formasPago ?? [];
  assertField(fp.length <= 7, "TablaFormasPago", "Máximo 7 formas de pago.");
  for (const f of fp) assertField(isValidMoney(f.monto), "MontoPago", "Monto de pago inválido.");
  const ia = t.impuestosAdicionales ?? [];
  assertField(ia.length <= 20, "ImpuestosAdicionales", "Máximo 20 impuestos adicionales.");
  if (input.comprador?.identificadorExtranjero) {
    assertField(
      !input.comprador.rncComprador,
      "RNCComprador",
      "Con IdentificadorExtranjero, RNCComprador debe ir en blanco (regla oficial).",
    );
  }
  if (input.comprador?.rncComprador) {
    assertField(isValidRnc(input.comprador.rncComprador), "RNCComprador", "RNC del comprador inválido.");
  }
  // Consistencia oficial: MontoTotal = MontoGravadoTotal + MontoExento + TotalITBIS + MontoImpuestoAdicional.
  const suma = money2((t.montoGravadoTotal ?? 0) + (t.montoExento ?? 0) + (t.totalItbis ?? 0) + (t.montoImpuestoAdicional ?? 0));
  assertField(
    Math.abs(suma - money2(t.montoTotal)) < 0.01,
    "MontoTotal",
    `MontoTotal (${money2str(t.montoTotal)}) no coincide con la suma de los componentes (${money2str(suma)}).`,
  );

  const money = (v: number | undefined) => (v == null ? null : money2str(v));

  const root = group("RFCE", [
    group("Encabezado", [
      leaf("Version", "1.0"),
      group("IdDoc", [
        leaf("TipoeCF", "32"),
        leaf("eNCF", input.encf),
        leaf("TipoIngresos", input.tipoIngresos),
        leaf("TipoPago", String(input.tipoPago)),
        fp.length > 0
          ? group(
              "TablaFormasPago",
              fp.map((f) =>
                group("FormaDePago", [leaf("FormaPago", String(f.forma)), leaf("MontoPago", money2str(f.monto))]),
              ),
            )
          : null,
      ]),
      group("Emisor", [
        leaf("RNCEmisor", input.rncEmisor),
        leaf("RazonSocialEmisor", input.razonSocialEmisor.trim()),
        leaf("FechaEmision", input.fechaEmision),
      ]),
      // v317: el XSD oficial exige el ÁREA <Comprador> siempre (sus hijos son
      // opcionales) — se emite aunque no haya datos del comprador.
      group("Comprador", [
        leaf("RNCComprador", input.comprador?.rncComprador ?? null),
        leaf("IdentificadorExtranjero", input.comprador?.identificadorExtranjero ?? null),
        leaf("RazonSocialComprador", input.comprador?.razonSocial ?? null),
      ]),
      group("Totales", [
        leaf("MontoGravadoTotal", money(t.montoGravadoTotal)),
        leaf("MontoGravadoI1", money(t.montoGravadoI1)),
        leaf("MontoGravadoI2", money(t.montoGravadoI2)),
        leaf("MontoGravadoI3", money(t.montoGravadoI3)),
        leaf("MontoExento", money(t.montoExento)),
        leaf("TotalITBIS", money(t.totalItbis)),
        leaf("TotalITBIS1", money(t.totalItbis1)),
        leaf("TotalITBIS2", money(t.totalItbis2)),
        leaf("TotalITBIS3", money(t.totalItbis3)),
        leaf("MontoImpuestoAdicional", money(t.montoImpuestoAdicional)),
        ia.length > 0
          ? group(
              "ImpuestosAdicionales",
              ia.map((x) =>
                group("ImpuestoAdicional", [
                  leaf("TipoImpuesto", x.tipoImpuesto),
                  leaf("MontoImpuestoSelectivoConsumoEspecifico", money(x.montoSelectivoEspecifico)),
                  leaf("MontoImpuestoSelectivoConsumoAdvalorem", money(x.montoSelectivoAdvalorem)),
                  leaf("OtrosImpuestosAdicionales", money(x.otrosImpuestos)),
                ]),
              ),
            )
          : null,
        leaf("MontoTotal", money2str(t.montoTotal)),
        leaf("MontoNoFacturable", money(t.montoNoFacturable)),
        leaf("MontoPeriodo", money(t.montoPeriodo)),
      ]),
      leaf("CodigoSeguridadeCF", input.codigoSeguridad),
    ]),
  ]);
  return { xml: serializeDocument(root) };
}
