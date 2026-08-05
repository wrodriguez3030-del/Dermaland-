import { describe, expect, it } from "vitest";
import {
  ALL_ECF_TYPES,
  checkTypeRules,
  ecfTypeLabel,
  effectiveRulesFor,
} from "@/features/dgii/ecf-type-rules";
import { buildEcfXml } from "./builder";
import { validateEcfXml } from "./validator";
import { loadSchemaForEcfType } from "./xsd-registry";
import type { EcfBuilderInput } from "./types";

/**
 * Los diez tipos, contra su esquema oficial.
 *
 * Esta es la prueba que decide si «soportar un tipo» significa algo. Que el
 * builder no lance no prueba nada: prueba que **el XML que produce lo acepta el
 * esquema que publica la DGII**.
 *
 * Se valida el XML SIN firmar, así que se espera que el único error sea la
 * firma que falta — el esquema la exige. Cualquier otro error es un campo mal
 * puesto y hay que verlo aquí, no cuando la DGII rechaza un comprobante.
 */

const FECHA = new Date("2026-08-04T14:00:00.000Z");

/**
 * Una entrada mínima y VÁLIDA para el tipo que se pida.
 *
 * Se arma a partir de las reglas del propio tipo: si no admite comprador, no se
 * le pone; si no admite ITBIS, la línea va exenta. Escribir diez fixtures a
 * mano habría sido escribir diez sitios donde equivocarse.
 */
function entrada(tipoEcf: string, extra: Partial<EcfBuilderInput> = {}): EcfBuilderInput {
  const reglas = effectiveRulesFor(tipoEcf);
  const conItbis = reglas.itbis !== "forbidden";
  // El 46 solo admite la tasa 3 (cero): una exportación no lleva ITBIS local.
  const soloTasaCero = conItbis && !reglas.tasasItbis.includes(1);

  return {
    tipoEcf,
    eNcf: `E${tipoEcf}0000000001`,
    fechaVencimientoSecuencia: new Date("2027-12-31T04:00:00.000Z"),
    tipoIngresos: "01",
    tipoPago: 1,
    ...(reglas.formasPago === "forbidden"
      ? {}
      : { formasPago: [{ formaPago: 1 as const, montoPago: conItbis && !soloTasaCero ? 1180 : 1000 }] }),
    emisor: {
      rncEmisor: "13259077503",
      razonSocialEmisor: "DermaLand SRL",
      direccionEmisor: "Calle E. León Jiménez No. 47, Santiago",
      fechaEmision: FECHA,
    },
    // El comprador solo va donde el tipo lo admite. En el 43 ni existe.
    ...(reglas.comprador === "forbidden"
      ? {}
      : {
          comprador: {
            ...(reglas.rncComprador === "forbidden"
              ? {}
              : { rncComprador: "131234567" }),
            razonSocialComprador: "Distrimedica SRL",
          },
        }),
    totales: !conItbis
      ? { montoExento: 1000, montoTotal: 1000 }
      : soloTasaCero
        ? {
            montoGravadoI3: 1000,
            itbis3: 0,
            totalItbis: 0,
            totalItbis3: 0,
            montoTotal: 1000,
          }
        : {
            montoGravadoTotal: 1000,
            itbis1: 18,
            totalItbis: 180,
            totalItbis1: 180,
            montoTotal: 1180,
          },
    items: [
      {
        numeroLinea: 1,
        // 1 = gravado con ITBIS; 4 = exento. Donde el tipo no admite ITBIS, la
        // línea TIENE que ir exenta o el esquema la rechaza.
        indicadorFacturacion: !conItbis ? 4 : soloTasaCero ? 3 : 1,
        // El 41 y el 47 la exigen: son los comprobantes que emite quien paga.
        ...(reglas.retencionEnItem === "required"
          ? {
              retencion: {
                indicadorAgenteRetencionoPercepcion: 1 as const,
                ...(reglas.isrRetenidoObligatorio ? { montoIsrRetenido: 100 } : {}),
              },
            }
          : {}),
        nombreItem: "Producto de prueba",
        indicadorBienoServicio: 1,
        cantidadItem: 1,
        precioUnitarioItem: 1000,
        montoItem: 1000,
      },
    ],
    // El 34 exige decir si pasaron más de 30 días desde el comprobante que
    // corrige: cambia el tratamiento fiscal de la nota.
    ...(reglas.indicadorNotaCredito === "required"
      ? { indicadorNotaCredito: 0 as const }
      : {}),
    // Las notas 33 y 34 tienen que decir QUÉ modifican.
    ...(reglas.informacionReferencia === "required"
      ? {
          informacionReferencia: {
            ncfModificado: "E310000000001",
            rncOtroContribuyente: "131234567",
            fechaNCFModificado: new Date("2026-07-01T04:00:00.000Z"),
            codigoModificacion: 1 as const,
          },
        }
      : {}),
    fechaHoraFirma: FECHA,
    ...extra,
  } as EcfBuilderInput;
}

describe("los diez tipos producen XML", () => {
  it("ninguno lanza al construirse", () => {
    for (const tipo of ALL_ECF_TYPES) {
      const xml = buildEcfXml(entrada(tipo));
      expect(xml, tipo).toContain(`<TipoeCF>${tipo}</TipoeCF>`);
      expect(xml, tipo).toContain(`<eNCF>E${tipo}0000000001</eNCF>`);
    }
  });

  it("el 43 sale SIN comprador: es un gasto propio, no una venta", () => {
    const xml = buildEcfXml(entrada("43"));
    expect(xml).not.toContain("<Comprador>");
  });

  it("los demás sí lo llevan", () => {
    for (const tipo of ALL_ECF_TYPES.filter((t) => t !== "43")) {
      expect(buildEcfXml(entrada(tipo)), tipo).toContain("<Comprador>");
    }
  });
});

describe("los diez validan contra el XSD oficial de la DGII", () => {
  it.each(ALL_ECF_TYPES)(
    "e-CF %s: el único error es la firma que falta",
    async (tipo) => {
      const xml = buildEcfXml(entrada(tipo));
      const xsd = await loadSchemaForEcfType(tipo);
      const r = await validateEcfXml({ xml, xsd });

      // El esquema exige la firma, así que un XML sin firmar SIEMPRE falla.
      // Lo que se comprueba es que no falle por NADA MÁS: cualquier otro error
      // es un campo mal puesto.
      //
      // `xmllint` no la llama «Signature»: el esquema la declara como `xs:any`,
      // así que el mensaje es «Missing child element(s). Expected is one of
      // ( {*}*, * )». Reconocerlo por ese texto es feo, pero confundirlo con un
      // campo mal puesto haría inútil toda esta prueba.
      const FALTA_LA_FIRMA = /Missing child element.*Expected is one of \( \{\*\}\*/;
      const noFirma = r.errors.filter(
        (e) => !/Signature/i.test(e.message) && !FALTA_LA_FIRMA.test(e.message),
      );
      expect(
        noFirma.map((e) => e.message),
        `${ecfTypeLabel(tipo)} tiene errores ajenos a la firma`,
      ).toEqual([]);
    },
    60_000,
  );
});

describe("las reglas rechazan lo que el tipo no admite", () => {
  it("el 43 no acepta comprador", () => {
    const v = checkTypeRules("43", { comprador: true });
    expect(v.some((x) => x.field === "comprador" && x.problem === "prohibido")).toBe(true);
  });

  it("el 44 no acepta ITBIS: el régimen especial es exento", () => {
    const v = checkTypeRules("44", { comprador: true, razonSocialComprador: true, itbis: true });
    expect(v.some((x) => x.field === "itbis" && x.problem === "prohibido")).toBe(true);
  });

  it("el 46 no acepta monto exento: en exportación hay tasa cero", () => {
    const v = checkTypeRules("46", {
      comprador: true,
      razonSocialComprador: true,
      montoExento: true,
    });
    expect(v.some((x) => x.field === "montoExento" && x.problem === "prohibido")).toBe(true);
  });

  it("el 45 exige el RNC: el Estado siempre lo tiene", () => {
    const v = checkTypeRules("45", { comprador: true, razonSocialComprador: true });
    expect(v.some((x) => x.field === "rncComprador" && x.problem === "faltante")).toBe(true);
  });

  it("las notas 33 y 34 exigen decir qué modifican", () => {
    for (const tipo of ["33", "34"]) {
      const v = checkTypeRules(tipo, {
        comprador: true,
        rncComprador: true,
        razonSocialComprador: true,
      });
      expect(
        v.some((x) => x.field === "informacionReferencia" && x.problem === "faltante"),
        tipo,
      ).toBe(true);
    }
  });

  it("un tipo bien formado no produce ninguna queja", () => {
    const v = checkTypeRules("31", {
      comprador: true,
      rncComprador: true,
      razonSocialComprador: true,
    });
    expect(v).toEqual([]);
  });

  it("los mensajes dicen el nombre del tipo, no su código", () => {
    // «El tipo 44 no admite itbis» no le dice nada a quien lo lee.
    const v = checkTypeRules("44", { comprador: true, razonSocialComprador: true, itbis: true });
    expect(v[0]!.message).toContain("Regímenes Especiales");
  });
});
