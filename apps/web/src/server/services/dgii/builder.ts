// NOTA: este módulo es pure function (no toca certificado ni red).
// El guard `import "server-only"` se aplica en `service.ts` que orquesta
// el llamado. Mantener este archivo importable desde tests vitest.
import { create } from "xmlbuilder2";
import type {
  EcfBuilderInput,
  EcfItem,
  EcfTotales,
  EcfEmisor,
  EcfComprador,
} from "./types";

/**
 * Builder de XML e-CF (RD).
 *
 * Construye el documento siguiendo el ORDEN EXACTO del XSD oficial
 * (`docs/dgii/xsd/e-CF-31-v1.0.xsd`). El orden se respeta porque `xmlbuilder2`
 * preserva el orden de inserción de elementos.
 *
 * Reglas de formato cubiertas:
 *  - Decimales con punto (default JS).
 *  - Sin separador de miles (default JS).
 *  - Montos `Decimal18D1or2` → 2 decimales.
 *  - `PrecioUnitarioItem` `Decimal20D1or4` → 4 decimales.
 *  - Fechas: formato `dd-MM-yyyy` (DGII convención común — VALIDAR D-03 en
 *    `docs/dgii/matriz-requisitos-dgii.md`. Sujeto a cambio sin tocar
 *    callers, vía `DGII_DATE_FORMAT`).
 *  - Datetime para `FechaHoraFirma`: `dd-MM-yyyy HH:mm:ss`.
 *  - Campos opcionales (`minOccurs=0`) se omiten cuando son undefined.
 *  - eNCF se valida (13 chars alfanum) antes de emitir.
 *  - RNCs se valida (9 o 11 dígitos) antes de emitir.
 *  - Items 1..1000 enforced.
 *  - Cantidad de items en `Items` >= 1.
 *
 * NO firma, NO envía a DGII. Output es el XML sin firma para pasar a
 * `DgiiXmlValidator` (Fase E) → `DgiiXmlSigner` (Fase F) → `DgiiReceptionService`
 * (Fase H).
 */

/** Sello de valor mágico para indicar tipos no implementados todavía. */
export class EcfBuilderUnsupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcfBuilderUnsupported";
  }
}

/** Falla rápida con detalle del campo problemático. */
export class EcfBuilderInvalidInput extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(`Campo '${field}' inválido: ${message}`);
    this.name = "EcfBuilderInvalidInput";
    this.field = field;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formato — exportados para tests
// ─────────────────────────────────────────────────────────────────────────────

const RNC_RE = /^(?:\d{9}|\d{11})$/;
const ENCF_RE = /^[a-zA-Z0-9]{13}$/;
const TELEFONO_RE = /^\d{3}-\d{3}-\d{4}$/;

export function formatDgiiDate(d: Date): string {
  if (Number.isNaN(d.getTime())) {
    throw new EcfBuilderInvalidInput("fecha", "fecha inválida");
  }
  const day = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yr = d.getFullYear();
  return `${day}-${mo}-${yr}`;
}

export function formatDgiiDateTime(d: Date): string {
  const date = formatDgiiDate(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${date} ${hh}:${mm}:${ss}`;
}

/** Decimal con 2 decimales y punto, sin separador de miles. */
export function formatDgiiAmount(n: number): string {
  if (!Number.isFinite(n)) {
    throw new EcfBuilderInvalidInput("monto", `valor no finito: ${n}`);
  }
  return n.toFixed(2);
}

/** Precio unitario con hasta 4 decimales (DGII Decimal20D1or4). */
export function formatDgiiPrice(n: number): string {
  if (!Number.isFinite(n)) {
    throw new EcfBuilderInvalidInput("precio", `valor no finito: ${n}`);
  }
  return n.toFixed(4);
}

function assertRnc(field: string, value: string): void {
  if (!RNC_RE.test(value)) {
    throw new EcfBuilderInvalidInput(
      field,
      `RNC debe ser 9 u 11 dígitos sin guiones (recibido: '${value}')`,
    );
  }
}

function assertEncf(value: string): void {
  if (!ENCF_RE.test(value)) {
    throw new EcfBuilderInvalidInput(
      "eNcf",
      `eNCF debe tener 13 caracteres alfanuméricos (recibido: '${value}')`,
    );
  }
}

function assertTelefono(value: string, idx: number): void {
  if (!TELEFONO_RE.test(value)) {
    throw new EcfBuilderInvalidInput(
      `emisor.telefonosEmisor[${idx}]`,
      `formato requerido 'ddd-ddd-dddd' (recibido: '${value}')`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder por sección — preservan el orden del XSD
// ─────────────────────────────────────────────────────────────────────────────

function buildIdDoc(
  parent: ReturnType<typeof create>,
  input: EcfBuilderInput,
): void {
  const idDoc = parent.ele("IdDoc");
  idDoc.ele("TipoeCF").txt(input.tipoEcf);
  idDoc.ele("eNCF").txt(input.eNcf);
  idDoc.ele("FechaVencimientoSecuencia").txt(
    formatDgiiDate(input.fechaVencimientoSecuencia),
  );
  if (input.indicadorMontoGravado !== undefined) {
    idDoc.ele("IndicadorMontoGravado").txt(String(input.indicadorMontoGravado));
  }
  idDoc.ele("TipoIngresos").txt(input.tipoIngresos);
  idDoc.ele("TipoPago").txt(String(input.tipoPago));

  if (input.formasPago && input.formasPago.length > 0) {
    if (input.formasPago.length > 7) {
      throw new EcfBuilderInvalidInput(
        "formasPago",
        `XSD permite máximo 7 formas de pago (recibido: ${input.formasPago.length})`,
      );
    }
    const tabla = idDoc.ele("TablaFormasPago");
    for (const fp of input.formasPago) {
      const fdp = tabla.ele("FormaDePago");
      fdp.ele("FormaPago").txt(String(fp.formaPago));
      fdp.ele("MontoPago").txt(formatDgiiAmount(fp.montoPago));
    }
  }
}

function buildEmisor(
  parent: ReturnType<typeof create>,
  emisor: EcfEmisor,
): void {
  assertRnc("emisor.rncEmisor", emisor.rncEmisor);
  const e = parent.ele("Emisor");
  e.ele("RNCEmisor").txt(emisor.rncEmisor);
  e.ele("RazonSocialEmisor").txt(emisor.razonSocialEmisor);
  if (emisor.nombreComercial) {
    e.ele("NombreComercial").txt(emisor.nombreComercial);
  }
  if (emisor.sucursal) {
    e.ele("Sucursal").txt(emisor.sucursal);
  }
  e.ele("DireccionEmisor").txt(emisor.direccionEmisor);
  if (emisor.municipio) e.ele("Municipio").txt(emisor.municipio);
  if (emisor.provincia) e.ele("Provincia").txt(emisor.provincia);
  if (emisor.telefonosEmisor && emisor.telefonosEmisor.length > 0) {
    if (emisor.telefonosEmisor.length > 3) {
      throw new EcfBuilderInvalidInput(
        "emisor.telefonosEmisor",
        `XSD permite máximo 3 teléfonos (recibido: ${emisor.telefonosEmisor.length})`,
      );
    }
    const tabla = e.ele("TablaTelefonoEmisor");
    emisor.telefonosEmisor.forEach((tel, idx) => {
      assertTelefono(tel, idx);
      tabla.ele("TelefonoEmisor").txt(tel);
    });
  }
  if (emisor.correoEmisor) e.ele("CorreoEmisor").txt(emisor.correoEmisor);
  if (emisor.website) e.ele("WebSite").txt(emisor.website);
  if (emisor.actividadEconomica) {
    e.ele("ActividadEconomica").txt(emisor.actividadEconomica);
  }
  e.ele("FechaEmision").txt(formatDgiiDate(emisor.fechaEmision));
}

function buildComprador(
  parent: ReturnType<typeof create>,
  comprador: EcfComprador,
): void {
  assertRnc("comprador.rncComprador", comprador.rncComprador);
  const c = parent.ele("Comprador");
  c.ele("RNCComprador").txt(comprador.rncComprador);
  c.ele("RazonSocialComprador").txt(comprador.razonSocialComprador);
  if (comprador.contactoComprador) {
    c.ele("ContactoComprador").txt(comprador.contactoComprador);
  }
  if (comprador.correoComprador) {
    c.ele("CorreoComprador").txt(comprador.correoComprador);
  }
  if (comprador.direccionComprador) {
    c.ele("DireccionComprador").txt(comprador.direccionComprador);
  }
  if (comprador.municipioComprador) {
    c.ele("MunicipioComprador").txt(comprador.municipioComprador);
  }
  if (comprador.provinciaComprador) {
    c.ele("ProvinciaComprador").txt(comprador.provinciaComprador);
  }
}

function buildTotales(
  parent: ReturnType<typeof create>,
  totales: EcfTotales,
): void {
  const t = parent.ele("Totales");
  // Orden estricto del XSD.
  if (totales.montoGravadoTotal !== undefined) {
    t.ele("MontoGravadoTotal").txt(formatDgiiAmount(totales.montoGravadoTotal));
  }
  if (totales.montoGravadoI1 !== undefined) {
    t.ele("MontoGravadoI1").txt(formatDgiiAmount(totales.montoGravadoI1));
  }
  if (totales.montoGravadoI2 !== undefined) {
    t.ele("MontoGravadoI2").txt(formatDgiiAmount(totales.montoGravadoI2));
  }
  if (totales.montoGravadoI3 !== undefined) {
    t.ele("MontoGravadoI3").txt(formatDgiiAmount(totales.montoGravadoI3));
  }
  if (totales.montoExento !== undefined) {
    t.ele("MontoExento").txt(formatDgiiAmount(totales.montoExento));
  }
  if (totales.itbis1 !== undefined) t.ele("ITBIS1").txt(String(totales.itbis1));
  if (totales.itbis2 !== undefined) t.ele("ITBIS2").txt(String(totales.itbis2));
  if (totales.itbis3 !== undefined) t.ele("ITBIS3").txt(String(totales.itbis3));
  if (totales.totalItbis !== undefined) {
    t.ele("TotalITBIS").txt(formatDgiiAmount(totales.totalItbis));
  }
  if (totales.totalItbis1 !== undefined) {
    t.ele("TotalITBIS1").txt(formatDgiiAmount(totales.totalItbis1));
  }
  if (totales.totalItbis2 !== undefined) {
    t.ele("TotalITBIS2").txt(formatDgiiAmount(totales.totalItbis2));
  }
  if (totales.totalItbis3 !== undefined) {
    t.ele("TotalITBIS3").txt(formatDgiiAmount(totales.totalItbis3));
  }
  t.ele("MontoTotal").txt(formatDgiiAmount(totales.montoTotal));
}

function buildItem(parent: ReturnType<typeof create>, item: EcfItem): void {
  if (item.numeroLinea < 1 || item.numeroLinea > 1000) {
    throw new EcfBuilderInvalidInput(
      "items[].numeroLinea",
      `XSD acepta 1..1000 (recibido: ${item.numeroLinea})`,
    );
  }
  if (item.cantidadItem <= 0) {
    throw new EcfBuilderInvalidInput(
      "items[].cantidadItem",
      `XSD requiere > 0 (recibido: ${item.cantidadItem})`,
    );
  }

  const i = parent.ele("Item");
  i.ele("NumeroLinea").txt(String(item.numeroLinea));
  i.ele("IndicadorFacturacion").txt(String(item.indicadorFacturacion));
  i.ele("NombreItem").txt(item.nombreItem);
  i.ele("IndicadorBienoServicio").txt(String(item.indicadorBienoServicio));
  if (item.descripcionItem) i.ele("DescripcionItem").txt(item.descripcionItem);
  i.ele("CantidadItem").txt(formatDgiiAmount(item.cantidadItem));
  if (item.unidadMedida !== undefined) {
    i.ele("UnidadMedida").txt(String(item.unidadMedida));
  }
  i.ele("PrecioUnitarioItem").txt(formatDgiiPrice(item.precioUnitarioItem));
  if (item.descuentoMonto !== undefined) {
    i.ele("DescuentoMonto").txt(formatDgiiAmount(item.descuentoMonto));
  }
  i.ele("MontoItem").txt(formatDgiiAmount(item.montoItem));
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye el XML e-CF en el orden exacto del XSD oficial DGII v1.0.
 *
 * Solo cubre la **estructura mínima obligatoria + opcionales más comunes**
 * para Fase D. Campos no cubiertos (Transporte, InformacionesAdicionales,
 * ImpuestosAdicionales, Subtotales, DescuentosORecargos, Paginacion,
 * InformacionReferencia, OtraMoneda, Retencion por item) se añaden por
 * demanda, sin romper el shape de `EcfBuilderInput`.
 *
 * @throws EcfBuilderUnsupported  Tipos distintos a 31 aún no implementados.
 * @throws EcfBuilderInvalidInput Si algún campo no respeta el XSD.
 */
export function buildEcfXml(input: EcfBuilderInput): string {
  if (input.tipoEcf !== "31") {
    throw new EcfBuilderUnsupported(
      `Tipo e-CF ${input.tipoEcf} aún no soportado (Fase D solo cubre 31).`,
    );
  }

  assertEncf(input.eNcf);

  if (input.items.length === 0) {
    throw new EcfBuilderInvalidInput("items", "se requiere al menos 1 item");
  }
  if (input.items.length > 1000) {
    throw new EcfBuilderInvalidInput(
      "items",
      `XSD permite máximo 1000 items (recibido: ${input.items.length})`,
    );
  }

  const doc = create({ version: "1.0", encoding: "UTF-8" });
  const ecf = doc.ele("ECF");

  // Sección Encabezado — orden estricto del XSD
  const encabezado = ecf.ele("Encabezado");
  encabezado.ele("Version").txt("1.0");
  buildIdDoc(encabezado, input);
  buildEmisor(encabezado, input.emisor);
  buildComprador(encabezado, input.comprador);
  buildTotales(encabezado, input.totales);

  // Sección DetallesItems — 1..1000
  const detalles = ecf.ele("DetallesItems");
  for (const item of input.items) {
    buildItem(detalles, item);
  }

  // FechaHoraFirma — XSD requiere posición final (antes del xs:any).
  ecf.ele("FechaHoraFirma").txt(formatDgiiDateTime(input.fechaHoraFirma));

  return doc.end({ prettyPrint: false });
}

/**
 * Construye el XML con `prettyPrint: true` — útil para debugging y tests.
 * NO usar para enviar a DGII; el flujo de envío usa el output compacto y
 * canonicalizado por el firmador.
 */
export function buildEcfXmlPretty(input: EcfBuilderInput): string {
  const doc = create({ version: "1.0", encoding: "UTF-8" });
  const ecf = doc.ele("ECF");
  const encabezado = ecf.ele("Encabezado");
  encabezado.ele("Version").txt("1.0");
  buildIdDoc(encabezado, input);
  buildEmisor(encabezado, input.emisor);
  buildComprador(encabezado, input.comprador);
  buildTotales(encabezado, input.totales);
  const detalles = ecf.ele("DetallesItems");
  for (const item of input.items) {
    buildItem(detalles, item);
  }
  ecf.ele("FechaHoraFirma").txt(formatDgiiDateTime(input.fechaHoraFirma));
  return doc.end({ prettyPrint: true });
}
