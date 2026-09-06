/**
 * Builder XML e-CF — SERVICIO PURO, alineado al XSD oficial DGII v1.0 (Fase 5).
 *
 * Genera el XML de un e-CF (tipos 31/32/33/34) siguiendo el orden/nombres/
 * cardinalidad de los XSD oficiales (docs/dgii/xsd/). Sin DB/fetch/FS/cert/env/DGII.
 *
 * SIN FIRMA: el XSD exige un nodo <Signature> final (xs:any minOccurs=1). El XML
 * de este builder valida contra todo el XSD EXCEPTO esa firma (Fase 6). El campo
 * `unsigned: true` lo refleja.
 *
 * Defaults requeridos por XSD (overridables y validados; no son "inventos"):
 *  - TipoIngresos "01", TipoPago "1", IndicadorBienoServicio "1".
 *  - FechaHoraFirma: se deriva de fechaEmision si no se provee (valor real = al firmar).
 */
import {
  AMBIENTES,
  CODIGOS_MODIFICACION,
  ECF_TIPOS_BUILDER,
  ECF_TIPOS_RESERVADOS,
  INDICADORES_AGENTE_RETENCION,
  INDICADORES_BIEN_SERVICIO,
  TIPOS_INGRESOS,
  TIPOS_PAGO,
  EcfBuilderInvalidInput,
  EcfBuilderUnsupported,
  type BuildEcfXmlInput,
  type BuildEcfXmlResult,
  type EcfItem,
  type EcfDescuentoRecargo,
  type EcfTipoBuilder,
  type EcfTotalesCalculados,
} from "./builder-types";
import {
  group,
  isoToDgiiDate,
  isoToDgiiDateTime,
  leaf,
  money2,
  money2str,
  serializeDocument,
} from "./xml-utils";

const ENCF_RE = /^[A-Za-z0-9]{13}$/; // eNCFValidationType
const RNC_RE = /^(?:\d{9}|\d{11})$/; // RNCValidationType
const ALLOWED_ITBIS_RATES = [0, 16, 18];

function isValidIsoDate(s: string): boolean {
  return typeof s === "string" && s.trim() !== "" && Number.isFinite(Date.parse(s));
}
function assert(cond: boolean, message: string): asserts cond {
  if (!cond) throw new EcfBuilderInvalidInput(message);
}

/** itbisRate → IndicadorFacturacion (XSD): 18→"1", 16→"2", 0→"4" (exento). */
function indicadorFacturacion(rate: number): "1" | "2" | "4" {
  if (rate === 18) return "1";
  if (rate === 16) return "2";
  return "4"; // 0% → exento
}

/** indicador: "0"=no facturable, "1"=18%, "2"=16%, "3"=gravado 0%, "4"=exento. */
type LineComputed = { base: number; itbis: number; gravado: boolean; indicador: "0" | "1" | "2" | "3" | "4" };

function computeLine(item: EcfItem, i: number): LineComputed {
  assert(item.cantidad > 0, `Item #${i + 1}: cantidad debe ser > 0.`);
  assert(item.precioUnitario >= 0, `Item #${i + 1}: precioUnitario no puede ser negativo.`);
  const descuento = item.descuento ?? 0;
  assert(descuento >= 0, `Item #${i + 1}: descuento no puede ser negativo.`);
  const recargo = item.recargoMonto ?? 0;
  assert(recargo >= 0, `Item #${i + 1}: recargo no puede ser negativo.`);
  assert(
    ALLOWED_ITBIS_RATES.includes(item.itbisRate),
    `Item #${i + 1}: itbisRate inválido (permitidos: ${ALLOWED_ITBIS_RATES.join(", ")}).`,
  );
  if (item.indicadorBienoServicio != null) {
    assert(
      (INDICADORES_BIEN_SERVICIO as readonly string[]).includes(item.indicadorBienoServicio),
      `Item #${i + 1}: indicadorBienoServicio inválido (1=Bien, 2=Servicio).`,
    );
  }
  // v378 — MontoItem = precio·cantidad − descuento + recargo (fórmula oficial DGII).
  const base = money2(item.precioUnitario * item.cantidad - descuento + recargo);
  assert(base >= 0, `Item #${i + 1}: monto de línea negativo (descuento > importe).`);
  const itbis = money2(base * (item.itbisRate / 100));
  // v378 — clasificación por IndicadorFacturacion explícito (distingue "3" gravado 0%
  // de "4" exento y "0" no-facturable); sin él se deriva de la tasa (backward compat).
  const indicador = item.indicadorFacturacion ?? indicadorFacturacion(item.itbisRate);
  // Gravado = tramos con ITBIS declarable (1/2/3). "4" exento y "0" no-facturable no lo son.
  const gravado = indicador === "1" || indicador === "2" || indicador === "3";
  return { base, itbis, gravado, indicador };
}

function computeTotals(
  lines: LineComputed[],
  descuentosORecargos: EcfDescuentoRecargo[] = [],
  montoNoFacturable = 0,
): EcfTotalesCalculados {
  const sumBase = (pred: (l: LineComputed) => boolean) =>
    money2(lines.filter(pred).reduce((s, l) => s + l.base, 0));
  // Bases por tramo desde las líneas (I1=18%, I2=16%, I3=gravado 0%, exento).
  let g1 = sumBase((l) => l.indicador === "1");
  let g2 = sumBase((l) => l.indicador === "2");
  let g3 = sumBase((l) => l.indicador === "3");
  // Exento = SOLO indicador "4" (el "0" no-facturable no es exento; su base queda en
  // subtotal y se neutraliza con MontoNoFacturable).
  let exento = sumBase((l) => l.indicador === "4");
  // v378 — Descuentos/Recargos GLOBALES ajustan la base del tramo indicado ANTES del
  // ITBIS (regla DGII); el ITBIS del tramo se calcula luego sobre la base ajustada.
  for (const d of descuentosORecargos) {
    const amt = money2((d.tipoAjuste === "R" ? 1 : -1) * (d.monto ?? 0));
    switch (d.indicadorFacturacion) {
      case "2": g2 = money2(g2 + amt); break;
      case "3": g3 = money2(g3 + amt); break;
      case "4": exento = money2(exento + amt); break;
      case "1":
      default: g1 = money2(g1 + amt); break;
    }
  }
  // v378 — ITBIS sobre la base de cada tramo (método oficial DGII: ITBIS =
  // MontoGravadoIx · tasa), no suma por línea (evita drift de redondeo cabecera↔líneas).
  const raw1 = g1 * 0.18;
  const raw2 = g2 * 0.16;
  const i1 = money2(raw1); // TotalITBIS1 (por tramo, redondeo independiente)
  const i2 = money2(raw2); // TotalITBIS2
  const i3 = 0; // gravado 0%
  // Base "0" no-facturable: fuera de gravado/exento pero dentro de subtotal (se
  // neutraliza con MontoNoFacturable en el total).
  const noFacturable = sumBase((l) => l.indicador === "0");
  const montoGravado = money2(g1 + g2 + g3);
  const montoExento = exento;
  // TotalITBIS agregado = redondeo de la SUMA cruda de tramos (regla DGII), que puede
  // diferir en 1 céntimo de i1+i2 redondeados por separado (p.ej. E41-010: 2608.70).
  const totalItbis = money2(raw1 + raw2);
  const subtotal = money2(montoGravado + montoExento + noFacturable);
  // v378 — MontoNoFacturable se resta del total (importe informado, no cobrado).
  const total = money2(subtotal + totalItbis - money2(montoNoFacturable));
  return {
    subtotal,
    montoGravado,
    montoExento,
    totalItbis,
    total,
    // v378 — desglose por tasa (I1=18%, I2=16%, I3=gravado 0%).
    montoGravadoI1: g1,
    montoGravadoI2: g2,
    montoGravadoI3: g3,
    totalItbis1: i1,
    totalItbis2: i2,
    totalItbis3: i3,
  };
}

export function buildEcfXml(input: BuildEcfXmlInput): BuildEcfXmlResult {
  const warnings: string[] = [];

  // --- Tipo ---
  if ((ECF_TIPOS_RESERVADOS as readonly string[]).includes(input.tipoEcf)) {
    throw new EcfBuilderUnsupported(`Tipo e-CF ${input.tipoEcf} aún no implementado (reservado 46-47).`);
  }
  assert((ECF_TIPOS_BUILDER as readonly string[]).includes(input.tipoEcf), `Tipo e-CF inválido: ${input.tipoEcf}.`);
  const tipoEcf = input.tipoEcf as EcfTipoBuilder;
  // v351 — variantes por XSD oficial (docs/dgii/xsd/FIELD_MATRIX_41_45.md):
  const esCompras41 = tipoEcf === "41";
  const esGastosMenores43 = tipoEcf === "43";
  // v352 — 44 (Regímenes Especiales: todo exento) y 45 (Gubernamental):
  const esRegimenes44 = tipoEcf === "44";
  const esGubernamental45 = tipoEcf === "45";
  // v353 — 46 (Exportaciones: gravado tramo 3 tasa 0%) y 47 (Pagos al Exterior):
  const esExportaciones46 = tipoEcf === "46";
  const esPagosExterior47 = tipoEcf === "47";

  // --- Ambiente ---
  assert((AMBIENTES as readonly string[]).includes(input.ambiente), `Ambiente inválido: ${input.ambiente}.`);

  // --- eNCF + coherencia con el tipo ---
  assert(ENCF_RE.test(input.eNcf), `eNCF inválido (13 alfanuméricos): ${input.eNcf}.`);
  assert(
    input.eNcf.slice(1, 3) === tipoEcf,
    `eNCF (${input.eNcf}) no coincide con el tipo (${tipoEcf}): se esperaba prefijo E${tipoEcf}.`,
  );

  // --- Catálogos requeridos (con defaults) ---
  // v395 — en modo set OFICIAL no se aplican los defaults comerciales de presencia: si el Excel no
  // trae el campo, se OMITE el nodo (DGII rechaza un nodo inyectado con default; ej. TipoPago vacío).
  const tipoIngresos = input.tipoIngresos ?? (input.officialDataset ? undefined : "01");
  assert(tipoIngresos === undefined || (TIPOS_INGRESOS as readonly string[]).includes(tipoIngresos), `tipoIngresos inválido: ${tipoIngresos}.`);
  const tipoPago = input.tipoPago ?? (input.officialDataset ? undefined : "1");
  assert(tipoPago === undefined || (TIPOS_PAGO as readonly string[]).includes(tipoPago), `tipoPago inválido: ${tipoPago}.`);

  // --- Fechas ---
  assert(isValidIsoDate(input.fechaEmision), "fechaEmision no es una fecha válida.");
  const fechaHoraFirmaIso = input.fechaHoraFirma ?? input.fechaEmision;
  assert(isValidIsoDate(fechaHoraFirmaIso), "fechaHoraFirma no es una fecha válida.");

  // --- Emisor ---
  assert(!!input.emisor, "Falta el emisor.");
  assert(RNC_RE.test(input.emisor.rnc), "RNC del emisor inválido (9 u 11 dígitos).");
  assert(
    typeof input.emisor.razonSocial === "string" && input.emisor.razonSocial.trim() !== "",
    "Falta la razón social del emisor.",
  );
  assert(
    typeof input.emisor.direccion === "string" && input.emisor.direccion.trim() !== "",
    "Falta la dirección del emisor (requerida por el XSD).",
  );
  // v335 — maxLength del XSD validados TEMPRANO con mensaje claro (antes solo
  // los detectaba la validación XSD al final, con mensaje genérico; caso real
  // en producción: dirección de 121 chars > AlfNum100Type).
  assert(
    input.emisor.razonSocial.trim().length <= 150,
    `RazonSocialEmisor supera 150 caracteres (XSD AlfNum150Type): ${input.emisor.razonSocial.trim().length}.`,
  );
  assert(
    input.emisor.direccion.trim().length <= 100,
    `DireccionEmisor supera 100 caracteres (XSD AlfNum100Type): ${input.emisor.direccion.trim().length}.`,
  );
  if (input.emisor.nombreComercial) {
    assert(
      input.emisor.nombreComercial.trim().length <= 150,
      `NombreComercial supera 150 caracteres (XSD AlfNum150Type).`,
    );
  }

  // --- Comprador (XSD: elemento requerido; hijos opcionales) ---
  const comprador = input.comprador ?? null;
  if (comprador?.rncOCedula != null && comprador.rncOCedula.trim() !== "") {
    assert(RNC_RE.test(comprador.rncOCedula), "RNC/Cédula del comprador inválido (9 u 11 dígitos).");
  }
  if (tipoEcf === "31") {
    assert(
      !!comprador?.rncOCedula && RNC_RE.test(comprador.rncOCedula),
      "Tipo 31 (Crédito Fiscal): el comprador debe tener RNC/Cédula válido.",
    );
  }
  // v351 — 41 (Compras): el XSD exige RNCComprador y RazonSocialComprador (min 1).
  if (esCompras41) {
    assert(
      !!comprador?.rncOCedula && RNC_RE.test(comprador.rncOCedula),
      "Tipo 41 (Compras): RNCComprador requerido y válido (XSD).",
    );
    assert(
      !!comprador?.razonSocial && comprador.razonSocial.trim() !== "",
      "Tipo 41 (Compras): RazonSocialComprador requerida (XSD).",
    );
  }
  // v351 — 43 (Gastos Menores): el XSD NO tiene bloque Comprador.
  if (esGastosMenores43 && comprador) {
    warnings.push("Tipo 43: el XSD no tiene bloque Comprador — se omite del XML.");
  }
  // v352 — 44 (Reg. Especiales): RazonSocialComprador obligatoria; RNC OPCIONAL (XSD).
  if (esRegimenes44) {
    assert(
      !!comprador?.razonSocial && comprador.razonSocial.trim() !== "",
      "Tipo 44 (Regímenes Especiales): RazonSocialComprador requerida (XSD).",
    );
  }
  // v353 — 46 (Exportaciones): RazonSocialComprador obligatoria; RNC e
  // IdentificadorExtranjero opcionales; PaisComprador opcional (XSD).
  if (esExportaciones46) {
    assert(
      !!comprador?.razonSocial && comprador.razonSocial.trim() !== "",
      "Tipo 46 (Exportaciones): RazonSocialComprador requerida (XSD).",
    );
  }
  // v353 — 47 (Pagos al Exterior): el XSD del Comprador SOLO define
  // IdentificadorExtranjero y RazonSocialComprador — RNCComprador NO existe.
  if (esPagosExterior47) {
    assert(
      !comprador?.rncOCedula,
      "Tipo 47 (Pagos al Exterior): el XSD no tiene RNCComprador — identifica al beneficiario con identificadorExtranjero.",
    );
  }
  // v353 — campos extranjeros solo donde el XSD los define:
  if (comprador?.identificadorExtranjero) {
    assert(
      esRegimenes44 || esExportaciones46 || esPagosExterior47,
      `Tipo ${tipoEcf}: IdentificadorExtranjero solo existe en los XSD 44/46/47.`,
    );
    assert(comprador.identificadorExtranjero.trim().length <= 20, "IdentificadorExtranjero supera 20 caracteres (XSD AlfNum20Type).");
  }
  if (comprador?.pais) {
    assert(esExportaciones46, `Tipo ${tipoEcf}: PaisComprador solo existe en el XSD 46.`);
    assert(comprador.pais.trim().length <= 60, "PaisComprador supera 60 caracteres (XSD Alfa60Type).");
  }
  // v352 — 45 (Gubernamental): RNCComprador y RazonSocialComprador obligatorios (XSD).
  if (esGubernamental45) {
    assert(
      !!comprador?.rncOCedula && RNC_RE.test(comprador.rncOCedula),
      "Tipo 45 (Gubernamental): RNCComprador requerido y válido (XSD — el receptor estatal tiene RNC).",
    );
    assert(
      !!comprador?.razonSocial && comprador.razonSocial.trim() !== "",
      "Tipo 45 (Gubernamental): RazonSocialComprador requerida (XSD).",
    );
  }

  // --- Referencia (tipos 33 y 34 obligatoria) ---
  // v335 — el XSD oficial e-CF-33-v1.0 define InformacionReferencia con
  // minOccurs=1 (NCFModificado + FechaNCFModificado + CodigoModificacion
  // requeridos), igual que el 34. Antes el 33 solo emitía un warning y el XML
  // salía sin referencia → rechazo garantizado contra el XSD oficial.
  const ref = input.referencia ?? null;
  if (tipoEcf === "34" || tipoEcf === "33") {
    assert(!!ref?.ncfModificado, `Tipo ${tipoEcf}: se requiere referencia con ncfModificado (XSD).`);
    assert(
      !!ref?.fechaNcfModificado && isValidIsoDate(ref.fechaNcfModificado),
      `Tipo ${tipoEcf}: FechaNCFModificado requerida y válida.`,
    );
    assert(
      !!ref?.codigoModificacion && (CODIGOS_MODIFICACION as readonly string[]).includes(ref.codigoModificacion),
      `Tipo ${tipoEcf}: CodigoModificacion requerido (1..5).`,
    );
  }

  // --- Items ---
  assert(Array.isArray(input.items) && input.items.length > 0, "Se requiere al menos un item.");
  const lines = input.items.map((it, i) => {
    assert(typeof it.nombre === "string" && it.nombre.trim() !== "", `Item #${i + 1}: falta el nombre.`);
    // v335 — NombreItem ≤80 (XSD AlfNum80Type): fallar temprano con el ítem exacto.
    assert(it.nombre.trim().length <= 80, `Item #${i + 1}: NombreItem supera 80 caracteres (XSD AlfNum80Type).`);
    // v351 — reglas por tipo (XSD oficial):
    if (esCompras41 || esPagosExterior47) {
      // 41 y 47: bloque Retencion OBLIGATORIO por ítem, con indicador 1|2.
      assert(!!it.retencion, `Item #${i + 1}: tipo ${tipoEcf} requiere Retencion por ítem (IndicadorAgenteRetencionoPercepcion — XSD).`);
      assert(
        (INDICADORES_AGENTE_RETENCION as readonly string[]).includes(it.retencion.indicadorAgente),
        `Item #${i + 1}: IndicadorAgenteRetencionoPercepcion inválido (1|2).`,
      );
      assert((it.retencion.montoItbisRetenido ?? 0) >= 0, `Item #${i + 1}: MontoITBISRetenido no puede ser negativo.`);
      assert((it.retencion.montoIsrRetenido ?? 0) >= 0, `Item #${i + 1}: MontoISRRetenido no puede ser negativo.`);
      if (esPagosExterior47) {
        // 47: MontoISRRetenido es OBLIGATORIO y MontoITBISRetenido NO existe (XSD).
        assert(it.retencion.montoIsrRetenido != null, `Item #${i + 1}: tipo 47 requiere MontoISRRetenido (XSD min 1).`);
        assert(it.retencion.montoItbisRetenido == null, `Item #${i + 1}: tipo 47 no tiene MontoITBISRetenido (XSD).`);
      }
      // v575 — El XSD del 41 declara el monto OPCIONAL, pero la DGII no acepta que
      // declares ser agente de retención y no digas cuánto retuviste: rechazó
      // E410000000002 por eso. Falla acá, antes de firmar y antes de gastar un e-NCF que
      // no se devuelve. El set oficial queda fuera: ahí la fidelidad literal al Excel
      // manda, y sus casos ya pasaron la certificación tal cual vienen.
      if (esCompras41 && !input.officialDataset) {
        assert(
          it.retencion.montoItbisRetenido != null,
          `Item #${i + 1}: falta MontoITBISRetenido. El tipo 41 declara retención, así que hay que decir cuánto se retuvo de ITBIS (0.00 si no se retuvo nada).`,
        );
      }
    } else {
      assert(!it.retencion, `Item #${i + 1}: el bloque Retencion por ítem solo existe en los tipos 41 y 47 (XSD).`);
    }
    if (esGastosMenores43) {
      // 43: sin ITBIS (Totales sin campos gravados/ITBIS) y sin DescuentoMonto.
      assert(it.itbisRate === 0, `Item #${i + 1}: tipo 43 no lleva ITBIS (el XSD no tiene campos de ITBIS) — usar itbisRate 0.`);
      assert(it.descuento == null || it.descuento === 0, `Item #${i + 1}: tipo 43 no admite DescuentoMonto (XSD).`);
    }
    if (esRegimenes44) {
      // 44: régimen 100% EXENTO — el XSD no tiene campos gravados/ITBIS en Totales.
      assert(it.itbisRate === 0, `Item #${i + 1}: tipo 44 es todo exento (el XSD no tiene campos de ITBIS) — usar itbisRate 0.`);
    }
    if (esExportaciones46) {
      // 46: exportación = gravado TRAMO 3 a tasa 0% (IndicadorFacturacion "3").
      assert(it.itbisRate === 0, `Item #${i + 1}: tipo 46 (Exportaciones) usa tasa 0% (tramo ITBIS3) — usar itbisRate 0.`);
    }
    if (esPagosExterior47) {
      assert(it.itbisRate === 0, `Item #${i + 1}: tipo 47 es exento (el XSD no tiene campos de ITBIS) — usar itbisRate 0.`);
      assert(it.descuento == null || it.descuento === 0, `Item #${i + 1}: tipo 47 no admite DescuentoMonto (XSD).`);
    }
    return computeLine(it, i);
  });

  // v351 — Totales de retención (solo 41): suma de los montos retenidos por ítem.
  // v389 — el total OFICIAL del set (si viene) gana sobre la suma recomputada, para fidelidad
  // exacta (DGII rechaza diferencias de redondeo de 0.01 entre la suma y su total del Excel).
  const totalItbisRetenido = input.totalItbisRetenido != null ? input.totalItbisRetenido
    : esCompras41 ? money2(input.items.reduce((s, it) => s + (it.retencion?.montoItbisRetenido ?? 0), 0)) : 0;
  const totalIsrRetenido = input.totalIsrRetenido != null ? input.totalIsrRetenido
    : (esCompras41 || esPagosExterior47) ? money2(input.items.reduce((s, it) => s + (it.retencion?.montoIsrRetenido ?? 0), 0)) : 0;

  /**
   * v579 — ¿Este comprobante DECLARA retención? Es la pregunta que decide si los totales
   * salen, y no «¿el importe es mayor que cero?»: un 41 que retuvo cero declara cero, no
   * calla. Basta con que algún ítem traiga el bloque con su monto definido, que es lo que
   * el propio builder exige desde v575.
   */
  const declaraRetencion = input.items.some(
    (it) => it.retencion != null && (it.retencion.montoItbisRetenido != null || it.retencion.montoIsrRetenido != null),
  );

  // --- Totales (recalculados; warning si difieren) ---
  const totals = computeTotals(lines, input.descuentosORecargos ?? [], input.montoNoFacturable ?? 0);
  const d = input.totales;
  if (d) {
    const near = (a: number | undefined, b: number) => a === undefined || Math.abs(money2(a) - b) < 0.005;
    if (!near(d.subtotal, totals.subtotal)) warnings.push(`Subtotal declarado ≠ recalculado; se usa ${totals.subtotal}.`);
    if (!near(d.totalItbis, totals.totalItbis)) warnings.push(`Total ITBIS declarado ≠ recalculado; se usa ${totals.totalItbis}.`);
    if (!near(d.total, totals.total)) warnings.push(`Total declarado ≠ recalculado; se usa ${totals.total}.`);
  }
  assert(totals.total >= 0, "El total no puede ser negativo.");

  // ── XML (orden EXACTO del XSD) ───────────────────────────────────────────
  // IdDoc — el orden y la cardinalidad varían por tipo (XSD oficial):
  //  - 34: IndicadorNotaCredito (req) tras eNCF.
  //  - 31/33: FechaVencimientoSecuencia (req) tras eNCF.
  //  - 32: ninguno de los dos.
  // v351 — 41/43 también exigen FechaVencimientoSecuencia (min 1 en sus XSD) y
  // NO tienen TipoIngresos (el elemento no existe en sus esquemas).
  const requiereVencimiento =
    tipoEcf === "31" || tipoEcf === "33" ||
    esCompras41 || esGastosMenores43 || esRegimenes44 || esGubernamental45 || esExportaciones46 || esPagosExterior47;
  if (requiereVencimiento) {
    assert(
      !!input.fechaVencimientoSecuencia && isValidIsoDate(input.fechaVencimientoSecuencia),
      `Tipo ${tipoEcf}: FechaVencimientoSecuencia requerida y válida (XSD).`,
    );
  }
  const emiteTipoIngresos = !esCompras41 && !esGastosMenores43 && !esPagosExterior47; // 46 SÍ lo lleva (como 31)
  // v378 — TablaFormasPago (XSD: FormaDePago[1..N]{FormaPago, MontoPago}), tras
  // TipoPago en el IdDoc. Cada forma por separado (jamás consolidar).
  const tablaFormasPago =
    input.formasPago && input.formasPago.length > 0
      ? group(
          "TablaFormasPago",
          input.formasPago.map((fp) =>
            group("FormaDePago", [leaf("FormaPago", fp.forma), leaf("MontoPago", money2str(fp.monto))]),
          ),
        )
      : null;
  const idDoc = group("IdDoc", [
    leaf("TipoeCF", tipoEcf),
    leaf("eNCF", input.eNcf),
    tipoEcf === "34" ? leaf("IndicadorNotaCredito", input.indicadorNotaCredito ?? (input.officialDataset ? undefined : "0")) : null,
    requiereVencimiento
      ? leaf("FechaVencimientoSecuencia", isoToDgiiDate(input.fechaVencimientoSecuencia!))
      : null,
    // v387 — IndicadorMontoGravado (IdDoc, XSD pos. 17): fidelidad del set oficial. Entre
    // FechaVencimientoSecuencia y TipoIngresos. Se emite solo cuando el set lo trae.
    leaf("IndicadorMontoGravado", input.indicadorMontoGravado ?? undefined),
    emiteTipoIngresos ? leaf("TipoIngresos", tipoIngresos) : null,
    leaf("TipoPago", tipoPago), // min 1 en 31-34; min 0 en 41/43 (mismo enum 1..3)
    // v389 — FechaLimitePago (21) + TerminoPago (22) tras TipoPago, antes de TablaFormasPago.
    input.fechaLimitePago ? leaf("FechaLimitePago", isoToDgiiDate(input.fechaLimitePago)) : null,
    leaf("TerminoPago", input.terminoPago ?? undefined),
    tablaFormasPago,
  ]);

  const telefonoTabla = input.emisor.telefono
    ? group("TablaTelefonoEmisor", [leaf("TelefonoEmisor", input.emisor.telefono)])
    : null;

  const emisor = group("Emisor", [
    leaf("RNCEmisor", input.emisor.rnc),
    leaf("RazonSocialEmisor", input.emisor.razonSocial),
    leaf("NombreComercial", input.emisor.nombreComercial ?? undefined),
    leaf("DireccionEmisor", input.emisor.direccion),
    leaf("Municipio", input.emisor.municipioCodigo ?? undefined),
    leaf("Provincia", input.emisor.provinciaCodigo ?? undefined),
    telefonoTabla,
    leaf("CorreoEmisor", input.emisor.correo ?? undefined),
    // v387 — comerciales OPCIONALES del Emisor (XSD pos. 64-69), tras CorreoEmisor y antes de
    // FechaEmision, en el orden del XSD. Fidelidad del set: emitir cuando el Excel trae valor.
    leaf("WebSite", input.emisor.webSite ?? undefined),
    leaf("CodigoVendedor", input.emisor.codigoVendedor ?? undefined),
    leaf("NumeroFacturaInterna", input.emisor.numeroFacturaInterna ?? undefined),
    leaf("NumeroPedidoInterno", input.emisor.numeroPedidoInterno ?? undefined),
    leaf("ZonaVenta", input.emisor.zonaVenta ?? undefined),
    leaf("FechaEmision", isoToDgiiDate(input.fechaEmision)),
  ]);

  // Comprador por tipo: 43 no tiene el bloque; 47 solo admite
  // IdentificadorExtranjero+RazonSocial (opcional entero); resto como 31 con
  // IdentificadorExtranjero (44/46) y PaisComprador (46) en su posición del XSD.
  const compradorEl = esGastosMenores43
    ? null
    : esPagosExterior47
    ? (comprador?.identificadorExtranjero || comprador?.razonSocial
        ? group("Comprador", [
            leaf("IdentificadorExtranjero", comprador?.identificadorExtranjero ?? undefined),
            leaf("RazonSocialComprador", comprador?.razonSocial ?? undefined),
          ])
        : null)
    : group("Comprador", [
        leaf("RNCComprador", comprador?.rncOCedula ?? undefined),
        (esRegimenes44 || esExportaciones46) && comprador?.identificadorExtranjero
          ? leaf("IdentificadorExtranjero", comprador.identificadorExtranjero)
          : null,
        leaf("RazonSocialComprador", comprador?.razonSocial ?? undefined),
        // v387 — ContactoComprador (XSD pos. 81) tras RazonSocial y antes de Correo.
        leaf("ContactoComprador", comprador?.contacto ?? undefined),
        leaf("CorreoComprador", comprador?.correo ?? undefined),
        leaf("DireccionComprador", comprador?.direccion ?? undefined),
        // v387 — Municipio/Provincia (XSD pos. 84-85) tras Direccion.
        leaf("MunicipioComprador", comprador?.municipioCodigo ?? undefined),
        leaf("ProvinciaComprador", comprador?.provinciaCodigo ?? undefined),
        esExportaciones46 && comprador?.pais ? leaf("PaisComprador", comprador.pais) : null,
        // v387 — FechaEntrega (86) → FechaOrdenCompra (90) → NumeroOrdenCompra (91) →
        // CodigoInternoComprador (92), en el orden del XSD. Fechas civiles (sin timezone).
        comprador?.fechaEntrega ? leaf("FechaEntrega", isoToDgiiDate(comprador.fechaEntrega)) : null,
        // v389 — Comprador (XSD 87-89) entre FechaEntrega y FechaOrdenCompra.
        leaf("ContactoEntrega", comprador?.contactoEntrega ?? undefined),
        leaf("DireccionEntrega", comprador?.direccionEntrega ?? undefined),
        leaf("TelefonoAdicional", comprador?.telefonoAdicional ?? undefined),
        comprador?.fechaOrdenCompra ? leaf("FechaOrdenCompra", isoToDgiiDate(comprador.fechaOrdenCompra)) : null,
        leaf("NumeroOrdenCompra", comprador?.numeroOrdenCompra ?? undefined),
        leaf("CodigoInternoComprador", comprador?.codigoInterno ?? undefined),
      ]);

  // Totales por tipo (orden literal del XSD):
  //  - 43: solo MontoExento + MontoTotal (sin gravados/ITBIS/retenciones).
  //  - 41: como 31 + TotalITBISRetenido/TotalISRRetencion DESPUÉS de MontoTotal.
  //  - 31-34: sin cambios.
  // 43 y 44 comparten Totales "solo exento"; 46 = gravado tramo 3 tasa 0%
  // (SIN MontoExento); 47 = exento + TotalISRRetencion al final (orden XSD).
  const totalesEl = esGastosMenores43 || esRegimenes44
    ? group("Totales", [
        leaf("MontoExento", money2str(totals.montoExento)),
        leaf("MontoTotal", money2str(totals.total)),
        input.montoPeriodo != null ? leaf("MontoPeriodo", money2str(input.montoPeriodo)) : null,
        input.valorPagar != null ? leaf("ValorPagar", money2str(input.valorPagar)) : null,
      ])
    : esExportaciones46
    ? group("Totales", [
        leaf("MontoGravadoTotal", money2str(totals.subtotal)),
        leaf("MontoGravadoI3", money2str(totals.subtotal)),
        leaf("ITBIS3", "0"),
        leaf("TotalITBIS", money2str(0)),
        leaf("TotalITBIS3", money2str(0)),
        leaf("MontoTotal", money2str(totals.total)),
        input.montoPeriodo != null ? leaf("MontoPeriodo", money2str(input.montoPeriodo)) : null,
        input.valorPagar != null ? leaf("ValorPagar", money2str(input.valorPagar)) : null,
      ])
    : esPagosExterior47
    ? group("Totales", [
        leaf("MontoExento", money2str(totals.montoExento)),
        leaf("MontoTotal", money2str(totals.total)),
        input.montoPeriodo != null ? leaf("MontoPeriodo", money2str(input.montoPeriodo)) : null,
        input.valorPagar != null ? leaf("ValorPagar", money2str(input.valorPagar)) : null,
        leaf("TotalISRRetencion", money2str(totalIsrRetenido)),
      ])
    : group("Totales", [
        // v378 — desglose por tasa en orden XSD; cada campo se emite solo si su tramo
        // tiene monto (>0), replicando el patrón del set oficial DGII (omite ceros).
        totals.montoGravado > 0 ? leaf("MontoGravadoTotal", money2str(totals.montoGravado)) : null,
        totals.montoGravadoI1 > 0 ? leaf("MontoGravadoI1", money2str(totals.montoGravadoI1)) : null,
        totals.montoGravadoI2 > 0 ? leaf("MontoGravadoI2", money2str(totals.montoGravadoI2)) : null,
        totals.montoGravadoI3 > 0 ? leaf("MontoGravadoI3", money2str(totals.montoGravadoI3)) : null,
        totals.montoExento > 0 ? leaf("MontoExento", money2str(totals.montoExento)) : null,
        totals.montoGravadoI1 > 0 ? leaf("ITBIS1", "18") : null,
        totals.montoGravadoI2 > 0 ? leaf("ITBIS2", "16") : null,
        totals.montoGravadoI3 > 0 ? leaf("ITBIS3", "0") : null,
        totals.totalItbis > 0 ? leaf("TotalITBIS", money2str(totals.totalItbis)) : null,
        totals.montoGravadoI1 > 0 ? leaf("TotalITBIS1", money2str(totals.totalItbis1)) : null,
        totals.montoGravadoI2 > 0 ? leaf("TotalITBIS2", money2str(totals.totalItbis2)) : null,
        totals.montoGravadoI3 > 0 ? leaf("TotalITBIS3", money2str(totals.totalItbis3)) : null,
        leaf("MontoTotal", money2str(totals.total)),
        // v378 — MontoNoFacturable (opcional, tras MontoTotal; no es descuento ni exento).
        input.montoNoFacturable != null ? leaf("MontoNoFacturable", money2str(input.montoNoFacturable)) : null,
        // v389 — MontoPeriodo (164) + ValorPagar (167), fidelidad del set; solo si el Excel los trae.
        input.montoPeriodo != null ? leaf("MontoPeriodo", money2str(input.montoPeriodo)) : null,
        input.valorPagar != null ? leaf("ValorPagar", money2str(input.valorPagar)) : null,
        /**
         * v579 — Por PRESENCIA de la retención, no por que su importe sea mayor que cero.
         *
         * v575 arregló esta misma truthiness por ítem y la dejó viva aquí, en los totales:
         * retener cero producía un XML que declaraba `0.00` en cada línea y omitía el
         * total. Un 41 que declara retención por línea y no la totaliza es la misma
         * incoherencia estructural por la que la DGII rechazó E410000000002 con [260],
         * sobre este mismo dato.
         */
        esCompras41 && declaraRetencion ? leaf("TotalITBISRetenido", money2str(totalItbisRetenido)) : null,
        esCompras41 && declaraRetencion ? leaf("TotalISRRetencion", money2str(totalIsrRetenido)) : null,
      ]);

  // v378 — Bloque OtraMoneda (tras Totales en el Encabezado). Valores OFICIALES
  // tal cual (jamás recalcular ni inventar el tipo de cambio). Orden literal XSD.
  const om = input.otraMoneda;
  const otraMonedaEl = om
    ? group("OtraMoneda", [
        leaf("TipoMoneda", om.tipoMoneda),
        leaf("TipoCambio", om.tipoCambioLexical ?? money2str(om.tipoCambio)),
        leaf("MontoGravadoTotalOtraMoneda", om.montoGravadoTotal != null ? money2str(om.montoGravadoTotal) : undefined),
        leaf("MontoGravado1OtraMoneda", om.montoGravado1 != null ? money2str(om.montoGravado1) : undefined),
        leaf("MontoGravado2OtraMoneda", om.montoGravado2 != null ? money2str(om.montoGravado2) : undefined),
        leaf("MontoGravado3OtraMoneda", om.montoGravado3 != null ? money2str(om.montoGravado3) : undefined),
        leaf("MontoExentoOtraMoneda", om.montoExento != null ? money2str(om.montoExento) : undefined),
        leaf("TotalITBISOtraMoneda", om.totalItbis != null ? money2str(om.totalItbis) : undefined),
        leaf("TotalITBIS1OtraMoneda", om.totalItbis1 != null ? money2str(om.totalItbis1) : undefined),
        leaf("TotalITBIS2OtraMoneda", om.totalItbis2 != null ? money2str(om.totalItbis2) : undefined),
        leaf("TotalITBIS3OtraMoneda", om.totalItbis3 != null ? money2str(om.totalItbis3) : undefined),
        leaf("MontoTotalOtraMoneda", om.montoTotal != null ? money2str(om.montoTotal) : undefined),
      ])
    : null;

  // v378 — E46: InformacionesAdicionales (embarque/aduana) + Transporte, entre
  // Comprador y Totales (orden XSD-46). Solo campos presentes.
  // v390 — Transporte/InformacionesAdicionales SOLO en E46. Aunque el XSD tenga los elementos para
  // 31/32/33/34/44/45, DGII rechaza "formato inválido" (código 2) al emitirlos en un e-CF doméstico:
  // demostrado con E310000000001 (intento-1 sin transporte = válido; intento-2 v389 con transporte =
  // rechazado; el único cambio estructural fue InformacionesAdicionales, no pedido en los 18 mensajes).
  const tr = esExportaciones46 ? input.transporte : null;
  // v398 — NO emitir un grupo estructural VACÍO: DGII rechazó E460000000009 (código 2 "formato
  // inválido") porque su Excel solo traía campos del grupo Transporte (Conductor/Placa/…) y ninguno
  // de InformacionesAdicionales → el builder emitía `<InformacionesAdicionales/>` autocerrado. El XSD
  // lo permite (todo minOccurs=0) pero DGII lo rechaza (patrón v390). Se omite el grupo sin hijos.
  const nonEmpty = (el: ReturnType<typeof group> | null) => (el && (el.children?.length ?? 0) > 0 ? el : null);
  const infoAdicionalesEl = nonEmpty(tr
    ? group("InformacionesAdicionales", [
        leaf("FechaEmbarque", tr.fechaEmbarque ? isoToDgiiDate(tr.fechaEmbarque) : undefined),
        leaf("NumeroEmbarque", tr.numeroEmbarque),
        leaf("NumeroContenedor", tr.numeroContenedor),
        leaf("NumeroReferencia", tr.numeroReferencia),
        leaf("NombrePuertoEmbarque", tr.nombrePuertoEmbarque),
        leaf("CondicionesEntrega", tr.condicionesEntrega),
        leaf("TotalFob", tr.totalFob != null ? money2str(tr.totalFob) : undefined),
        leaf("Seguro", tr.seguro != null ? money2str(tr.seguro) : undefined),
        leaf("Flete", tr.flete != null ? money2str(tr.flete) : undefined),
        leaf("OtrosGastos", tr.otrosGastos != null ? money2str(tr.otrosGastos) : undefined),
        leaf("TotalCif", tr.totalCif != null ? money2str(tr.totalCif) : undefined),
        leaf("RegimenAduanero", tr.regimenAduanero),
        leaf("NombrePuertoSalida", tr.nombrePuertoSalida),
        leaf("NombrePuertoDesembarque", tr.nombrePuertoDesembarque),
        leaf("PesoBruto", tr.pesoBruto != null ? money2str(tr.pesoBruto) : undefined),
        leaf("PesoNeto", tr.pesoNeto != null ? money2str(tr.pesoNeto) : undefined),
        leaf("UnidadPesoBruto", tr.unidadPesoBruto),
        leaf("UnidadPesoNeto", tr.unidadPesoNeto),
        leaf("CantidadBulto", tr.cantidadBultoLexical ?? (tr.cantidadBulto != null ? String(tr.cantidadBulto) : undefined)),
        leaf("UnidadBulto", tr.unidadBulto),
        leaf("VolumenBulto", tr.volumenBultoLexical ?? (tr.volumenBulto != null ? money2str(tr.volumenBulto) : undefined)),
        leaf("UnidadVolumen", tr.unidadVolumen),
      ])
    : null);
  const transporteEl = nonEmpty(tr
    ? group("Transporte", [
        leaf("ViaTransporte", tr.viaTransporte),
        leaf("PaisOrigen", tr.paisOrigen),
        leaf("DireccionDestino", tr.direccionDestino),
        leaf("PaisDestino", tr.paisDestino),
        leaf("RNCIdentificacionCompaniaTransportista", tr.rncTransportista),
        leaf("NombreCompaniaTransportista", tr.nombreTransportista),
        leaf("NumeroViaje", tr.numeroViaje),
        leaf("Conductor", tr.conductor),
        leaf("DocumentoTransporte", tr.documentoTransporte),
        leaf("Ficha", tr.ficha),
        leaf("Placa", tr.placa),
        leaf("RutaTransporte", tr.rutaTransporte),
        leaf("ZonaTransporte", tr.zonaTransporte),
        leaf("NumeroAlbaran", tr.numeroAlbaran),
      ])
    : null);

  const encabezado = group("Encabezado", [
    leaf("Version", "1.0"),
    idDoc,
    emisor,
    compradorEl,
    infoAdicionalesEl,
    transporteEl,
    totalesEl,
    otraMonedaEl,
  ]);

  const detalles = group(
    "DetallesItems",
    input.items.map((it, i) => {
      const l = lines[i];
      return group("Item", [
        leaf("NumeroLinea", i + 1),
        // 46: exportación = tramo ITBIS3 tasa 0% → indicador "3" (no "4" exento).
        leaf("IndicadorFacturacion", it.indicadorFacturacion ?? (esExportaciones46 ? "3" : indicadorFacturacion(it.itbisRate))),
        // v351/v353 — 41 y 47: bloque Retencion OBLIGATORIO tras IndicadorFacturacion (XSD).
        (esCompras41 || esPagosExterior47) && it.retencion
          ? group("Retencion", [
              leaf("IndicadorAgenteRetencionoPercepcion", it.retencion.indicadorAgente),
              // MontoITBISRetenido solo existe en el XSD 41.
              //
              // v575 — Por PRESENCIA, no por truthiness. Con `?` a secas, retener cero no
              // producía «0.00»: hacía desaparecer el campo, y salía un bloque que decía
              // «soy agente de retención» sin decir cuánto. La DGII rechazó E410000000002
              // con «[260] El campo MontoITBISRetenido … no es válido». Es la misma regla
              // que el proyecto ya tenía escrita desde v413: «0» es un valor, no un vacío.
              esCompras41 && it.retencion.montoItbisRetenido != null
                ? leaf("MontoITBISRetenido", money2str(it.retencion.montoItbisRetenido))
                : null,
              // En 47 MontoISRRetenido es OBLIGATORIO (se emite siempre, incluso 0.00):
              esPagosExterior47
                ? leaf("MontoISRRetenido", money2str(it.retencion.montoIsrRetenido ?? 0))
                : it.retencion.montoIsrRetenido != null
                ? leaf("MontoISRRetenido", money2str(it.retencion.montoIsrRetenido))
                : null,
            ])
          : null,
        leaf("NombreItem", it.nombre),
        leaf("IndicadorBienoServicio", it.indicadorBienoServicio ?? "1"),
        leaf("DescripcionItem", it.descripcion ?? undefined),
        // v387 — preservar la representación LEXICAL del set (p.ej. "15.00"); String(Number)
        // borra los ceros finales (15.00→15) y DGII lo rechaza por fidelidad.
        leaf("CantidadItem", it.cantidadLexical ?? String(it.cantidad)),
        leaf("UnidadMedida", it.unidadMedida ?? undefined),
        // v396 — FechaElaboracion/FechaVencimientoItem por ítem (orden XSD: tras UnidadMedida, antes de
        // PrecioUnitarioItem). Fechas CIVILES DD-MM-YYYY (isoToDgiiDate, sin offset AST). Solo si el ítem
        // las trae (el adaptador las setea únicamente cuando el Excel oficial las tiene). Incidente E44.
        leaf("FechaElaboracion", it.fechaElaboracion ? isoToDgiiDate(it.fechaElaboracion) : undefined),
        leaf("FechaVencimientoItem", it.fechaVencimientoItem ? isoToDgiiDate(it.fechaVencimientoItem) : undefined),
        // v392 — PrecioUnitarioItem LEXICAL exacto del set (DGII compara "350.0000" ≠ "350.00");
        // el lexical del Excel gana sobre money2str (que fuerza 2 decimales). Incidente E31#9.
        leaf("PrecioUnitarioItem", it.precioUnitarioLexical ?? money2str(it.precioUnitario)),
        // 43/47: DescuentoMonto NO existe en sus XSD (además ya se validó nulo/0).
        !esGastosMenores43 && !esPagosExterior47 && it.descuento != null ? leaf("DescuentoMonto", it.descuentoLexical ?? money2str(it.descuento)) : null,
        // v378 — TablaSubDescuento, RecargoMonto, TablaSubRecargo, OtraMonedaDetalle
        // (orden XSD, entre DescuentoMonto y MontoItem). Solo si el ítem los trae.
        !esGastosMenores43 && !esPagosExterior47 && it.subDescuentos && it.subDescuentos.length > 0
          ? group("TablaSubDescuento", it.subDescuentos.map((sd) =>
              group("SubDescuento", [
                leaf("TipoSubDescuento", sd.tipo),
                leaf("SubDescuentoPorcentaje", sd.porcentaje != null ? money2str(sd.porcentaje) : undefined),
                leaf("MontoSubDescuento", money2str(sd.monto)),
              ])))
          : null,
        !esGastosMenores43 && !esPagosExterior47 && it.recargoMonto != null ? leaf("RecargoMonto", it.recargoLexical ?? money2str(it.recargoMonto)) : null,
        !esGastosMenores43 && !esPagosExterior47 && it.subRecargos && it.subRecargos.length > 0
          ? group("TablaSubRecargo", it.subRecargos.map((sr) =>
              group("SubRecargo", [
                leaf("TipoSubRecargo", sr.tipo),
                leaf("SubRecargoPorcentaje", sr.porcentaje != null ? money2str(sr.porcentaje) : undefined),
                leaf("MontoSubRecargo", money2str(sr.monto)),
              ])))
          : null,
        !esGastosMenores43 && !esPagosExterior47 && it.otraMonedaDetalle
          ? group("OtraMonedaDetalle", [
              leaf("PrecioOtraMoneda", it.otraMonedaDetalle.precioOtraMoneda != null ? money2str(it.otraMonedaDetalle.precioOtraMoneda) : undefined),
              leaf("DescuentoOtraMoneda", it.otraMonedaDetalle.descuentoOtraMoneda != null ? money2str(it.otraMonedaDetalle.descuentoOtraMoneda) : undefined),
              leaf("RecargoOtraMoneda", it.otraMonedaDetalle.recargoOtraMoneda != null ? money2str(it.otraMonedaDetalle.recargoOtraMoneda) : undefined),
              leaf("MontoItemOtraMoneda", it.otraMonedaDetalle.montoItemOtraMoneda != null ? money2str(it.otraMonedaDetalle.montoItemOtraMoneda) : undefined),
            ])
          : null,
        // v392 — MontoItem lexical del set si está (preserva escala); si no, el calculado.
        leaf("MontoItem", it.montoItemLexical ?? money2str(l!.base)),
      ]);
    }),
  );

  const referenciaEl =
    ref?.ncfModificado
      ? group("InformacionReferencia", [
          leaf("NCFModificado", ref.ncfModificado),
          leaf("RNCOtroContribuyente", ref.rncOtroContribuyente ?? undefined),
          leaf("FechaNCFModificado", ref.fechaNcfModificado ? isoToDgiiDate(ref.fechaNcfModificado) : undefined),
          leaf("CodigoModificacion", ref.codigoModificacion ?? undefined),
          leaf("RazonModificacion", ref.razonModificacion ?? undefined),
        ])
      : null;

  // v378 — DescuentosORecargos (tras DetallesItems). Cada ajuste por separado en
  // el orden XSD: NumeroLinea, TipoAjuste, IndicadorNorma1007, Descripcion,
  // TipoValor, Valor, Monto, MontoOtraMoneda, IndicadorFacturacion.
  const descuentosRecargosEl =
    input.descuentosORecargos && input.descuentosORecargos.length > 0
      ? group(
          "DescuentosORecargos",
          input.descuentosORecargos.map((dr, i) =>
            group("DescuentoORecargo", [
              leaf("NumeroLinea", dr.numeroLinea ?? i + 1),
              leaf("TipoAjuste", dr.tipoAjuste),
              leaf("IndicadorNorma1007", dr.indicadorNorma1007 ?? undefined),
              leaf("DescripcionDescuentooRecargo", dr.descripcion ?? undefined),
              leaf("TipoValor", dr.tipoValor ?? undefined),
              leaf("ValorDescuentooRecargo", dr.valor != null ? money2str(dr.valor) : undefined),
              leaf("MontoDescuentooRecargo", money2str(dr.monto)),
              leaf("MontoDescuentooRecargoOtraMoneda", dr.montoOtraMoneda != null ? money2str(dr.montoOtraMoneda) : undefined),
              leaf("IndicadorFacturacionDescuentooRecargo", dr.indicadorFacturacion ?? undefined),
            ]),
          ),
        )
      : null;

  // Root: Encabezado, DetallesItems, [DescuentosORecargos], [InformacionReferencia], FechaHoraFirma.
  // (Sin <Signature>: el XSD la exige vía xs:any → se agrega al firmar, Fase 6.)
  const root = group("ECF", [
    encabezado,
    detalles,
    descuentosRecargosEl,
    referenciaEl,
    leaf("FechaHoraFirma", isoToDgiiDateTime(fechaHoraFirmaIso)),
  ]);

  return {
    xml: serializeDocument(root),
    eNcf: input.eNcf,
    tipoEcf,
    ambiente: input.ambiente,
    totals,
    unsigned: true,
    warnings,
  };
}
