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
  InformacionReferencia,
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
// eNCF: 'E' + tipo (2 dígitos, serie oficial 31/32/33/34/41/43/44/45) +
// secuencia de 10 dígitos = 13 chars. Antes se aceptaba cualquier
// alfanumérico de 13 chars, lo que dejaba pasar eNCF malformados de
// inputs externos.
const ENCF_RE = /^E(?:3[1-4]|4[1345])\d{10}$/;
/**
 * `NCFModificado` (e-CF 33/34) puede ser un NCF legado (11 chars: 'B0100000001')
 * o un eNCF nuevo (13 chars: 'E310000000001'). El XSD lo declara como
 * `AlfNum11a19ValidationType` (11..19 chars alfanum).
 */
const NCF_MODIFICADO_RE = /^[a-zA-Z0-9]{11,19}$/;
const TELEFONO_RE = /^\d{3}-\d{3}-\d{4}$/;

/** Tipos e-CF soportados por el builder actual. */
const SUPPORTED_TYPES: ReadonlySet<string> = new Set(["31", "32", "33", "34"]);

/** Tipos que requieren obligatoriamente `<InformacionReferencia>`. */
const TYPES_REQUIRING_INFO_REFERENCIA: ReadonlySet<string> = new Set([
  "33",
  "34",
]);

/** Tipos donde RNCComprador y RazonSocialComprador son obligatorios. */
const TYPES_REQUIRING_COMPRADOR_RNC: ReadonlySet<string> = new Set([
  "31",
  "33",
  "34",
]);

// Las fechas fiscales SIEMPRE se expresan en hora de República Dominicana
// (AST, UTC-4 fijo, sin horario de verano) — NUNCA en el TZ del proceso: en
// serverless (Vercel) el proceso corre en UTC y una venta a las 22:00 AST se
// firmaría/imprimiría con la fecha del día siguiente.
const AST_OFFSET_MS = 4 * 60 * 60 * 1000;

/** Corre el instante -4h para leer con getters UTC la hora civil AST. */
function shiftToAst(d: Date): Date {
  return new Date(d.getTime() - AST_OFFSET_MS);
}

export function formatDgiiDate(d: Date): string {
  if (Number.isNaN(d.getTime())) {
    throw new EcfBuilderInvalidInput("fecha", "fecha inválida");
  }
  const a = shiftToAst(d);
  const day = String(a.getUTCDate()).padStart(2, "0");
  const mo = String(a.getUTCMonth() + 1).padStart(2, "0");
  const yr = a.getUTCFullYear();
  return `${day}-${mo}-${yr}`;
}

export function formatDgiiDateTime(d: Date): string {
  const date = formatDgiiDate(d);
  const a = shiftToAst(d);
  const hh = String(a.getUTCHours()).padStart(2, "0");
  const mm = String(a.getUTCMinutes()).padStart(2, "0");
  const ss = String(a.getUTCSeconds()).padStart(2, "0");
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

/**
 * Cantidad: 2 decimales por defecto, pero conserva hasta 4 cuando la
 * cantidad es fraccionaria fina (antes se truncaba a 2 y desalineaba
 * `cantidad × precio` con `MontoItem`).
 */
export function formatDgiiQuantity(n: number): string {
  if (!Number.isFinite(n)) {
    throw new EcfBuilderInvalidInput("cantidad", `valor no finito: ${n}`);
  }
  const four = n.toFixed(4);
  return four.endsWith("00") ? n.toFixed(2) : four;
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

  // Orden por tipo (basado en XSDs oficiales DGII):
  //   e-CF 31/33: FechaVencimientoSecuencia → [indicadores opcionales] → TipoIngresos
  //   e-CF 32:    [indicadores opcionales] → TipoIngresos (NO emite FechaVencimientoSecuencia)
  //   e-CF 34:    IndicadorNotaCredito → [indicadores opcionales] → TipoIngresos
  //               (NO emite FechaVencimientoSecuencia; el slot lo ocupa IndicadorNotaCredito)
  if (input.tipoEcf === "31" || input.tipoEcf === "33") {
    idDoc
      .ele("FechaVencimientoSecuencia")
      .txt(formatDgiiDate(input.fechaVencimientoSecuencia));
  } else if (input.tipoEcf === "34") {
    if (input.indicadorNotaCredito === undefined) {
      throw new EcfBuilderInvalidInput(
        "indicadorNotaCredito",
        "e-CF 34 requiere indicadorNotaCredito (0 si <=30 días del original, 1 si >30 días)",
      );
    }
    idDoc.ele("IndicadorNotaCredito").txt(String(input.indicadorNotaCredito));
  }
  // (e-CF 32 no emite ninguno de los dos)

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
  if (comprador.rncComprador) {
    assertRnc("comprador.rncComprador", comprador.rncComprador);
  }
  const c = parent.ele("Comprador");
  if (comprador.rncComprador) {
    c.ele("RNCComprador").txt(comprador.rncComprador);
  }
  if (comprador.razonSocialComprador) {
    c.ele("RazonSocialComprador").txt(comprador.razonSocialComprador);
  }
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

function buildInformacionReferencia(
  parent: ReturnType<typeof create>,
  info: InformacionReferencia,
): void {
  if (!NCF_MODIFICADO_RE.test(info.ncfModificado)) {
    throw new EcfBuilderInvalidInput(
      "informacionReferencia.ncfModificado",
      `NCF modificado debe ser 11..19 chars alfanum (recibido: '${info.ncfModificado}')`,
    );
  }
  assertRnc(
    "informacionReferencia.rncOtroContribuyente",
    info.rncOtroContribuyente,
  );
  if (![1, 2, 3, 4, 5].includes(info.codigoModificacion)) {
    throw new EcfBuilderInvalidInput(
      "informacionReferencia.codigoModificacion",
      `valor permitido: 1..5 (recibido: ${info.codigoModificacion})`,
    );
  }
  // Orden estricto según XSD: NCFModificado, RNCOtroContribuyente,
  // FechaNCFModificado, CodigoModificacion.
  const ir = parent.ele("InformacionReferencia");
  ir.ele("NCFModificado").txt(info.ncfModificado);
  ir.ele("RNCOtroContribuyente").txt(info.rncOtroContribuyente);
  ir.ele("FechaNCFModificado").txt(formatDgiiDate(info.fechaNCFModificado));
  ir.ele("CodigoModificacion").txt(String(info.codigoModificacion));
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
  i.ele("CantidadItem").txt(formatDgiiQuantity(item.cantidadItem));
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
 * Tipos soportados:
 *  - 31 (Factura de Crédito Fiscal): RNCComprador + RazonSocialComprador
 *    obligatorios.
 *  - 32 (Factura de Consumo): RNCComprador y RazonSocialComprador opcionales
 *    (consumidor final).
 *  - 33 (Nota de Débito) y 34 (Nota de Crédito): RNCComprador +
 *    RazonSocialComprador + `informacionReferencia` obligatorios. El
 *    bloque `<InformacionReferencia>` se inserta antes de `<FechaHoraFirma>`.
 *
 * Tipos 41/43/44/45/46/47 lanzan `EcfBuilderUnsupported` (planeados para
 * fases siguientes).
 *
 * NOTA: el XSD oficial de DGII para 32/33/34 NO está en el repo (solo el
 * de 31). La estructura se basa en el XSD de 31 + el documento adjunto.
 * Validar contra los XSDs oficiales de 32/33/34 cuando estén disponibles
 * (matriz D-13).
 *
 * Campos no cubiertos (Transporte, InformacionesAdicionales,
 * ImpuestosAdicionales, Subtotales, DescuentosORecargos, Paginacion,
 * OtraMoneda, Retencion por item) se añaden por demanda, sin romper el
 * shape de `EcfBuilderInput`.
 *
 * @throws EcfBuilderUnsupported  Tipos no soportados todavía (41+).
 * @throws EcfBuilderInvalidInput Si algún campo no respeta el XSD o las
 *  reglas por tipo (ej. NC/ND sin informacionReferencia).
 */
/** ¿a ≈ b dentro de la tolerancia de redondeo? */
function closeTo(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

/**
 * Validación ARITMÉTICA de negocio (el XSD solo valida estructura):
 *  - Por línea: `cantidad × precio − descuento ≈ montoItem`.
 *  - Σ montoItem por indicadorFacturacion ≈ MontoGravadoI1/I2/I3/MontoExento
 *    (cuando el total granular viene provisto).
 *  - `MontoGravadoTotal ≈ ΣIi`, `TotalITBIS ≈ Σ TotalITBISi`,
 *    `TotalITBISi ≈ MontoGravadoIi × tasa` (cuando ambos lados existen).
 *  - Con `IndicadorMontoGravado = 0` (montos sin ITBIS) y `TotalITBIS`
 *    presente: `MontoTotal ≈ Σ montoItem + TotalITBIS`.
 *
 * Antes cualquier descuadre de redondeo pasaba silencioso hasta el rechazo
 * de DGII; ahora se corta en el builder con un mensaje accionable.
 */
export function assertEcfArithmetic(input: EcfBuilderInput): void {
  const LINE_TOL = 0.011;
  const totalsTol = 0.01 + input.items.length * 0.005;
  const t = input.totales;

  const sums = { g1: 0, g2: 0, g3: 0, exento: 0, todas: 0 };
  for (const it of input.items) {
    const calc =
      it.cantidadItem * it.precioUnitarioItem - (it.descuentoMonto ?? 0);
    if (!closeTo(calc, it.montoItem, LINE_TOL)) {
      throw new EcfBuilderInvalidInput(
        `items[${it.numeroLinea}].montoItem`,
        `cantidad × precio − descuento = ${calc.toFixed(4)} no cuadra con montoItem = ${it.montoItem.toFixed(2)}`,
      );
    }
    sums.todas += it.montoItem;
    if (it.indicadorFacturacion === 1) sums.g1 += it.montoItem;
    else if (it.indicadorFacturacion === 2) sums.g2 += it.montoItem;
    else if (it.indicadorFacturacion === 3) sums.g3 += it.montoItem;
    else if (it.indicadorFacturacion === 4) sums.exento += it.montoItem;
  }

  const granular: Array<[string, number | undefined, number]> = [
    ["totales.montoGravadoI1", t.montoGravadoI1, sums.g1],
    ["totales.montoGravadoI2", t.montoGravadoI2, sums.g2],
    ["totales.montoGravadoI3", t.montoGravadoI3, sums.g3],
    ["totales.montoExento", t.montoExento, sums.exento],
  ];
  for (const [field, declared, fromLines] of granular) {
    if (declared !== undefined && !closeTo(declared, fromLines, totalsTol)) {
      throw new EcfBuilderInvalidInput(
        field,
        `declarado ${declared.toFixed(2)} pero las líneas suman ${fromLines.toFixed(2)}`,
      );
    }
  }

  const gravadoIs = [t.montoGravadoI1, t.montoGravadoI2, t.montoGravadoI3];
  if (t.montoGravadoTotal !== undefined && gravadoIs.some((v) => v !== undefined)) {
    const sumIs = gravadoIs.reduce<number>((s, v) => s + (v ?? 0), 0);
    if (!closeTo(t.montoGravadoTotal, sumIs, totalsTol)) {
      throw new EcfBuilderInvalidInput(
        "totales.montoGravadoTotal",
        `declarado ${t.montoGravadoTotal.toFixed(2)} pero MontoGravadoI1+I2+I3 = ${sumIs.toFixed(2)}`,
      );
    }
  }

  const itbisIs = [t.totalItbis1, t.totalItbis2, t.totalItbis3];
  if (t.totalItbis !== undefined && itbisIs.some((v) => v !== undefined)) {
    const sumItbis = itbisIs.reduce<number>((s, v) => s + (v ?? 0), 0);
    if (!closeTo(t.totalItbis, sumItbis, totalsTol)) {
      throw new EcfBuilderInvalidInput(
        "totales.totalItbis",
        `declarado ${t.totalItbis.toFixed(2)} pero TotalITBIS1+2+3 = ${sumItbis.toFixed(2)}`,
      );
    }
  }

  const rates: Array<[string, number | undefined, number | undefined, number | undefined]> = [
    ["totales.totalItbis1", t.totalItbis1, t.montoGravadoI1, t.itbis1],
    ["totales.totalItbis2", t.totalItbis2, t.montoGravadoI2, t.itbis2],
    ["totales.totalItbis3", t.totalItbis3, t.montoGravadoI3, t.itbis3],
  ];
  // El ITBIS total se acumula desde líneas redondeadas, así que puede
  // diferir del gravado × tasa por céntimos acumulados; DGII tolera ±1.
  const RATE_TOL = Math.max(1.0, totalsTol);
  for (const [field, totalItbisI, gravadoI, tasa] of rates) {
    if (totalItbisI !== undefined && gravadoI !== undefined && tasa !== undefined) {
      const expected = gravadoI * (tasa / 100);
      if (!closeTo(totalItbisI, expected, RATE_TOL)) {
        throw new EcfBuilderInvalidInput(
          field,
          `declarado ${totalItbisI.toFixed(2)} pero MontoGravado × ${tasa}% = ${expected.toFixed(2)}`,
        );
      }
    }
  }

  // Con montos sin ITBIS (indicadorMontoGravado 0/undefined) y TotalITBIS
  // presente, el total del comprobante debe ser líneas + ITBIS.
  if (
    (input.indicadorMontoGravado === 0 || input.indicadorMontoGravado === undefined) &&
    t.totalItbis !== undefined
  ) {
    const expectedTotal = sums.todas + t.totalItbis;
    if (!closeTo(t.montoTotal, expectedTotal, totalsTol)) {
      throw new EcfBuilderInvalidInput(
        "totales.montoTotal",
        `declarado ${t.montoTotal.toFixed(2)} pero Σ líneas + TotalITBIS = ${expectedTotal.toFixed(2)}`,
      );
    }
  }
}

export function buildEcfXml(input: EcfBuilderInput): string {
  if (!SUPPORTED_TYPES.has(input.tipoEcf)) {
    throw new EcfBuilderUnsupported(
      `Tipo e-CF ${input.tipoEcf} aún no soportado (Fase L cubre 31-34).`,
    );
  }

  assertEncf(input.eNcf);

  // Reglas por tipo
  if (TYPES_REQUIRING_COMPRADOR_RNC.has(input.tipoEcf)) {
    if (!input.comprador.rncComprador) {
      throw new EcfBuilderInvalidInput(
        "comprador.rncComprador",
        `e-CF ${input.tipoEcf} requiere RNCComprador (9 u 11 dígitos)`,
      );
    }
    if (!input.comprador.razonSocialComprador) {
      throw new EcfBuilderInvalidInput(
        "comprador.razonSocialComprador",
        `e-CF ${input.tipoEcf} requiere RazonSocialComprador`,
      );
    }
  }
  if (TYPES_REQUIRING_INFO_REFERENCIA.has(input.tipoEcf)) {
    if (!input.informacionReferencia) {
      throw new EcfBuilderInvalidInput(
        "informacionReferencia",
        `e-CF ${input.tipoEcf} (Nota de ${input.tipoEcf === "33" ? "Débito" : "Crédito"}) requiere InformacionReferencia`,
      );
    }
  }

  if (input.items.length === 0) {
    throw new EcfBuilderInvalidInput("items", "se requiere al menos 1 item");
  }
  if (input.items.length > 1000) {
    throw new EcfBuilderInvalidInput(
      "items",
      `XSD permite máximo 1000 items (recibido: ${input.items.length})`,
    );
  }

  assertEcfArithmetic(input);

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

  // InformacionReferencia — XSD lo posiciona entre DetallesItems
  // (después de Subtotales/DescuentosORecargos/Paginacion opcionales) y
  // FechaHoraFirma.
  if (input.informacionReferencia) {
    buildInformacionReferencia(ecf, input.informacionReferencia);
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
  if (input.informacionReferencia) {
    buildInformacionReferencia(ecf, input.informacionReferencia);
  }
  ecf.ele("FechaHoraFirma").txt(formatDgiiDateTime(input.fechaHoraFirma));
  return doc.end({ prettyPrint: true });
}
