import { describe, it, expect } from "vitest";
import {
  buildEcfXml,
  buildEcfXmlPretty,
  formatDgiiAmount,
  formatDgiiDate,
  formatDgiiDateTime,
  formatDgiiPrice,
  EcfBuilderInvalidInput,
  EcfBuilderUnsupported,
} from "./builder";
import type { EcfBuilderInput } from "./types";

// Fechas en hora local (constructor con args separados) para que el test
// sea determinístico en cualquier TZ. `new Date('2027-12-31')` se parsea
// como UTC y se desplaza un día al formatear en RD (UTC-4) — el fixture
// usa el constructor local para evitar ese flake.
// TODO: formatDgiiDate debería forzar TZ America/Santo_Domingo en
// producción — pendiente confirmar con doc oficial DGII (matriz D-03).
const fixedDate = new Date(2026, 4, 17, 14, 30, 45); // 2026-05-17 14:30:45 local

/**
 * Fixture mínimo válido para e-CF 31 (Crédito Fiscal).
 * RNCs sin guiones (11 dígitos), eNCF de 13 chars, fechas reales.
 */
function makeValidInput(overrides: Partial<EcfBuilderInput> = {}): EcfBuilderInput {
  return {
    tipoEcf: "31",
    eNcf: "E310000000001",
    fechaVencimientoSecuencia: new Date(2027, 11, 31), // 2027-12-31 local
    tipoIngresos: "01",
    tipoPago: 1,
    formasPago: [{ formaPago: 3, montoPago: 1180 }], // Tarjeta
    emisor: {
      rncEmisor: "13259077503",
      razonSocialEmisor: "DermaLand SRL",
      nombreComercial: "DermaLand",
      direccionEmisor: "Calle E. León Jiménez No. 47, Santiago",
      municipio: "Santiago",
      provincia: "Santiago",
      telefonosEmisor: ["809-226-5252"],
      correoEmisor: "fiscal@dermaland.do",
      fechaEmision: fixedDate,
    },
    comprador: {
      rncComprador: "131234567",
      razonSocialComprador: "Distrimedica SRL",
      correoComprador: "compras@distrimedica.do",
    },
    totales: {
      montoGravadoTotal: 1000,
      itbis1: 18,
      totalItbis: 180,
      totalItbis1: 180,
      montoTotal: 1180,
    },
    items: [
      {
        numeroLinea: 1,
        indicadorFacturacion: 1, // ITBIS 18%
        nombreItem: "Crema hidratante 50ml",
        indicadorBienoServicio: 1, // Bien
        cantidadItem: 2,
        precioUnitarioItem: 500,
        montoItem: 1000,
      },
    ],
    fechaHoraFirma: fixedDate,
    ...overrides,
  };
}

describe("formatters", () => {
  it("formatDgiiDate produce dd-MM-yyyy", () => {
    expect(formatDgiiDate(new Date(2026, 4, 17, 14, 30, 0))).toBe("17-05-2026");
    expect(formatDgiiDate(new Date(2027, 0, 3, 0, 0, 0))).toBe("03-01-2027");
  });

  it("formatDgiiDateTime produce dd-MM-yyyy HH:MM:SS", () => {
    expect(formatDgiiDateTime(new Date(2026, 4, 17, 14, 30, 45))).toBe(
      "17-05-2026 14:30:45",
    );
  });

  it("formatDgiiAmount usa 2 decimales, punto y sin separador", () => {
    expect(formatDgiiAmount(1234.5)).toBe("1234.50");
    expect(formatDgiiAmount(0)).toBe("0.00");
    expect(formatDgiiAmount(1234567.891)).toBe("1234567.89");
  });

  it("formatDgiiPrice usa 4 decimales (Decimal20D1or4)", () => {
    expect(formatDgiiPrice(12.5)).toBe("12.5000");
    expect(formatDgiiPrice(0.12345)).toBe("0.1235"); // redondeo a 4
  });

  it("formatters lanzan en valores no finitos", () => {
    expect(() => formatDgiiAmount(NaN)).toThrow(EcfBuilderInvalidInput);
    expect(() => formatDgiiPrice(Infinity)).toThrow(EcfBuilderInvalidInput);
    expect(() => formatDgiiDate(new Date("invalid"))).toThrow(
      EcfBuilderInvalidInput,
    );
  });
});

describe("buildEcfXml — estructura básica", () => {
  it("produce XML válido con declaración UTF-8", () => {
    const xml = buildEcfXml(makeValidInput());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("incluye el elemento raíz <ECF>", () => {
    const xml = buildEcfXml(makeValidInput());
    expect(xml).toContain("<ECF>");
    expect(xml).toContain("</ECF>");
  });

  it("respeta el orden XSD: Encabezado antes que DetallesItems antes que FechaHoraFirma", () => {
    const xml = buildEcfXml(makeValidInput());
    const idxEncabezado = xml.indexOf("<Encabezado>");
    const idxDetalles = xml.indexOf("<DetallesItems>");
    const idxFirma = xml.indexOf("<FechaHoraFirma>");
    expect(idxEncabezado).toBeGreaterThan(-1);
    expect(idxDetalles).toBeGreaterThan(idxEncabezado);
    expect(idxFirma).toBeGreaterThan(idxDetalles);
  });

  it("respeta el orden interno del IdDoc: TipoeCF, eNCF, FechaVencimientoSecuencia", () => {
    const xml = buildEcfXml(makeValidInput());
    const idxTipo = xml.indexOf("<TipoeCF>");
    const idxNcf = xml.indexOf("<eNCF>");
    const idxVenc = xml.indexOf("<FechaVencimientoSecuencia>");
    expect(idxTipo).toBeLessThan(idxNcf);
    expect(idxNcf).toBeLessThan(idxVenc);
  });

  it("respeta el orden Emisor → Comprador → Totales", () => {
    const xml = buildEcfXml(makeValidInput());
    const idxEmisor = xml.indexOf("<Emisor>");
    const idxComprador = xml.indexOf("<Comprador>");
    const idxTotales = xml.indexOf("<Totales>");
    expect(idxEmisor).toBeLessThan(idxComprador);
    expect(idxComprador).toBeLessThan(idxTotales);
  });

  it("NO contiene el bug <DetallesItems> doblado del builder anterior", () => {
    const xml = buildEcfXml(makeValidInput());
    const occurrences = (xml.match(/<DetallesItems>/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("Items quedan dentro de DetallesItems en orden por NumeroLinea", () => {
    const xml = buildEcfXml(
      makeValidInput({
        items: [
          {
            numeroLinea: 1,
            indicadorFacturacion: 1,
            nombreItem: "Item A",
            indicadorBienoServicio: 1,
            cantidadItem: 1,
            precioUnitarioItem: 100,
            montoItem: 100,
          },
          {
            numeroLinea: 2,
            indicadorFacturacion: 1,
            nombreItem: "Item B",
            indicadorBienoServicio: 1,
            cantidadItem: 1,
            precioUnitarioItem: 200,
            montoItem: 200,
          },
        ],
        totales: { montoGravadoTotal: 300, totalItbis: 54, montoTotal: 354 },
      }),
    );
    const idxA = xml.indexOf("Item A");
    const idxB = xml.indexOf("Item B");
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(idxA);
  });
});

describe("buildEcfXml — formato de campos", () => {
  it("e-NCF y RNCs sin guiones aparecen tal cual", () => {
    const xml = buildEcfXml(makeValidInput());
    expect(xml).toContain("<eNCF>E310000000001</eNCF>");
    expect(xml).toContain("<RNCEmisor>13259077503</RNCEmisor>");
    expect(xml).toContain("<RNCComprador>131234567</RNCComprador>");
  });

  it("fechas en dd-MM-yyyy y fecha-hora en dd-MM-yyyy HH:MM:SS", () => {
    const xml = buildEcfXml(makeValidInput());
    expect(xml).toContain(
      "<FechaVencimientoSecuencia>31-12-2027</FechaVencimientoSecuencia>",
    );
    expect(xml).toContain("<FechaEmision>17-05-2026</FechaEmision>");
    expect(xml).toContain(
      "<FechaHoraFirma>17-05-2026 14:30:45</FechaHoraFirma>",
    );
  });

  it("decimales con 2 lugares y punto", () => {
    const xml = buildEcfXml(makeValidInput());
    expect(xml).toContain("<MontoTotal>1180.00</MontoTotal>");
    expect(xml).toContain("<TotalITBIS>180.00</TotalITBIS>");
    expect(xml).toContain("<MontoItem>1000.00</MontoItem>");
  });

  it("PrecioUnitarioItem con 4 decimales", () => {
    const xml = buildEcfXml(makeValidInput());
    expect(xml).toContain("<PrecioUnitarioItem>500.0000</PrecioUnitarioItem>");
  });

  it("TipoeCF y enteros sin punto", () => {
    const xml = buildEcfXml(makeValidInput());
    expect(xml).toContain("<TipoeCF>31</TipoeCF>");
    expect(xml).toContain("<TipoPago>1</TipoPago>");
    expect(xml).toContain("<TipoIngresos>01</TipoIngresos>");
    expect(xml).toContain("<ITBIS1>18</ITBIS1>");
  });

  it("Items con indicadorBienoServicio = 1 (Bien) o 2 (Servicio)", () => {
    const xml = buildEcfXml(makeValidInput());
    expect(xml).toContain(
      "<IndicadorBienoServicio>1</IndicadorBienoServicio>",
    );
  });

  it("formasPago crea TablaFormasPago con FormaDePago entries", () => {
    const xml = buildEcfXml(makeValidInput());
    expect(xml).toContain("<TablaFormasPago>");
    expect(xml).toContain("<FormaPago>3</FormaPago>");
    expect(xml).toContain("<MontoPago>1180.00</MontoPago>");
  });

  it("omite campos opcionales cuando vienen undefined", () => {
    const xml = buildEcfXml(
      makeValidInput({
        emisor: {
          rncEmisor: "13259077503",
          razonSocialEmisor: "DermaLand SRL",
          direccionEmisor: "Calle E.",
          fechaEmision: fixedDate,
        },
      }),
    );
    expect(xml).not.toContain("<NombreComercial>");
    expect(xml).not.toContain("<CorreoEmisor>");
    expect(xml).not.toContain("<TablaTelefonoEmisor>");
  });

  it("escapa caracteres XML especiales en strings", () => {
    const xml = buildEcfXml(
      makeValidInput({
        comprador: {
          rncComprador: "131234567",
          razonSocialComprador: "Health & Beauty <test>",
        },
      }),
    );
    expect(xml).toContain("Health &amp; Beauty &lt;test&gt;");
  });
});

describe("buildEcfXml — validaciones", () => {
  it("rechaza eNCF con longitud incorrecta", () => {
    expect(() => buildEcfXml(makeValidInput({ eNcf: "E31000001" }))).toThrow(
      EcfBuilderInvalidInput,
    );
  });

  it("rechaza RNC con guiones", () => {
    expect(() =>
      buildEcfXml(
        makeValidInput({
          emisor: {
            ...makeValidInput().emisor,
            rncEmisor: "1-32-59077-5",
          },
        }),
      ),
    ).toThrow(EcfBuilderInvalidInput);
  });

  it("rechaza RNC de comprador inválido", () => {
    expect(() =>
      buildEcfXml(
        makeValidInput({
          comprador: { rncComprador: "abc", razonSocialComprador: "x" },
        }),
      ),
    ).toThrow(EcfBuilderInvalidInput);
  });

  it("rechaza teléfono sin formato ddd-ddd-dddd", () => {
    expect(() =>
      buildEcfXml(
        makeValidInput({
          emisor: {
            ...makeValidInput().emisor,
            telefonosEmisor: ["8092265252"],
          },
        }),
      ),
    ).toThrow(EcfBuilderInvalidInput);
  });

  it("rechaza items vacíos", () => {
    expect(() => buildEcfXml(makeValidInput({ items: [] }))).toThrow(
      EcfBuilderInvalidInput,
    );
  });

  it("rechaza numeroLinea fuera de 1..1000", () => {
    expect(() =>
      buildEcfXml(
        makeValidInput({
          items: [
            {
              numeroLinea: 0,
              indicadorFacturacion: 1,
              nombreItem: "x",
              indicadorBienoServicio: 1,
              cantidadItem: 1,
              precioUnitarioItem: 1,
              montoItem: 1,
            },
          ],
        }),
      ),
    ).toThrow(EcfBuilderInvalidInput);
  });

  it("rechaza más de 7 formas de pago (XSD maxOccurs=7)", () => {
    const formasPago = Array.from({ length: 8 }, (_, i) => ({
      formaPago: 1 as const,
      montoPago: i + 1,
    }));
    expect(() => buildEcfXml(makeValidInput({ formasPago }))).toThrow(
      EcfBuilderInvalidInput,
    );
  });

  it("rechaza tipos 41/43/44/45 con EcfBuilderUnsupported (Fase L cubre 31-34)", () => {
    for (const tipo of ["41", "43", "44", "45", "46", "47"] as const) {
      expect(() => buildEcfXml(makeValidInput({ tipoEcf: tipo }))).toThrow(
        EcfBuilderUnsupported,
      );
    }
  });

  it("rechaza cantidad <= 0", () => {
    expect(() =>
      buildEcfXml(
        makeValidInput({
          items: [
            {
              numeroLinea: 1,
              indicadorFacturacion: 1,
              nombreItem: "x",
              indicadorBienoServicio: 1,
              cantidadItem: 0,
              precioUnitarioItem: 1,
              montoItem: 1,
            },
          ],
        }),
      ),
    ).toThrow(EcfBuilderInvalidInput);
  });
});

describe("buildEcfXmlPretty", () => {
  it("produce XML con saltos de línea (debug)", () => {
    const xml = buildEcfXmlPretty(makeValidInput());
    expect(xml.split("\n").length).toBeGreaterThan(5);
  });
});

describe("buildEcfXml — e-CF 32 (Factura de Consumo)", () => {
  it("acepta tipo 32 con RNCComprador del consumidor", () => {
    const xml = buildEcfXml(makeValidInput({ tipoEcf: "32" }));
    expect(xml).toContain("<TipoeCF>32</TipoeCF>");
    expect(xml).toContain("<RNCComprador>131234567</RNCComprador>");
  });

  it("acepta tipo 32 SIN RNCComprador (consumidor final)", () => {
    const xml = buildEcfXml(
      makeValidInput({
        tipoEcf: "32",
        comprador: { razonSocialComprador: "Consumidor Final" },
      }),
    );
    expect(xml).toContain("<TipoeCF>32</TipoeCF>");
    expect(xml).not.toContain("<RNCComprador>");
    expect(xml).toContain(
      "<RazonSocialComprador>Consumidor Final</RazonSocialComprador>",
    );
  });

  it("acepta tipo 32 con Comprador completamente vacío", () => {
    const xml = buildEcfXml(
      makeValidInput({ tipoEcf: "32", comprador: {} }),
    );
    expect(xml).toContain("<TipoeCF>32</TipoeCF>");
    expect(xml).toContain("<Comprador/>");
  });

  it("tipo 31 sigue requiriendo RNCComprador y RazonSocial", () => {
    expect(() =>
      buildEcfXml(
        makeValidInput({
          tipoEcf: "31",
          comprador: { razonSocialComprador: "X" } as never,
        }),
      ),
    ).toThrow(EcfBuilderInvalidInput);
    expect(() =>
      buildEcfXml(
        makeValidInput({
          tipoEcf: "31",
          comprador: { rncComprador: "131234567" } as never,
        }),
      ),
    ).toThrow(EcfBuilderInvalidInput);
  });
});

describe("buildEcfXml — e-CF 33 (Nota de Débito) y 34 (Nota de Crédito)", () => {
  const baseInfoRef = {
    ncfModificado: "E310000000100",
    rncOtroContribuyente: "131234567",
    fechaNCFModificado: new Date(2026, 3, 10),
    codigoModificacion: 3 as const,
  };

  it("acepta tipo 33 con informacionReferencia", () => {
    const xml = buildEcfXml(
      makeValidInput({
        tipoEcf: "33",
        informacionReferencia: baseInfoRef,
      }),
    );
    expect(xml).toContain("<TipoeCF>33</TipoeCF>");
    expect(xml).toContain("<InformacionReferencia>");
    expect(xml).toContain("<NCFModificado>E310000000100</NCFModificado>");
    expect(xml).toContain(
      "<RNCOtroContribuyente>131234567</RNCOtroContribuyente>",
    );
    expect(xml).toContain(
      "<FechaNCFModificado>10-04-2026</FechaNCFModificado>",
    );
    expect(xml).toContain("<CodigoModificacion>3</CodigoModificacion>");
  });

  it("acepta tipo 34 con informacionReferencia + indicadorNotaCredito", () => {
    const xml = buildEcfXml(
      makeValidInput({
        tipoEcf: "34",
        indicadorNotaCredito: 0,
        informacionReferencia: { ...baseInfoRef, codigoModificacion: 1 },
      }),
    );
    expect(xml).toContain("<TipoeCF>34</TipoeCF>");
    expect(xml).toContain("<IndicadorNotaCredito>0</IndicadorNotaCredito>");
    expect(xml).not.toContain("<FechaVencimientoSecuencia>");
    expect(xml).toContain("<CodigoModificacion>1</CodigoModificacion>");
  });

  it("e-CF 34 sin indicadorNotaCredito lanza EcfBuilderInvalidInput", () => {
    expect(() =>
      buildEcfXml(
        makeValidInput({
          tipoEcf: "34",
          informacionReferencia: baseInfoRef,
        }),
      ),
    ).toThrow(EcfBuilderInvalidInput);
  });

  it("e-CF 32 NO emite FechaVencimientoSecuencia ni IndicadorNotaCredito", () => {
    const xml = buildEcfXml(makeValidInput({ tipoEcf: "32" }));
    expect(xml).not.toContain("<FechaVencimientoSecuencia>");
    expect(xml).not.toContain("<IndicadorNotaCredito>");
  });

  it("rechaza tipo 33 SIN informacionReferencia", () => {
    expect(() => buildEcfXml(makeValidInput({ tipoEcf: "33" }))).toThrow(
      EcfBuilderInvalidInput,
    );
  });

  it("rechaza tipo 34 SIN informacionReferencia", () => {
    expect(() => buildEcfXml(makeValidInput({ tipoEcf: "34" }))).toThrow(
      EcfBuilderInvalidInput,
    );
  });

  it("acepta NCF modificado legado (11 chars 'B...')", () => {
    const xml = buildEcfXml(
      makeValidInput({
        tipoEcf: "34",
        indicadorNotaCredito: 0,
        informacionReferencia: {
          ...baseInfoRef,
          ncfModificado: "B0100000001",
        },
      }),
    );
    expect(xml).toContain("<NCFModificado>B0100000001</NCFModificado>");
  });

  it("rechaza ncfModificado fuera del rango 11..19 chars", () => {
    expect(() =>
      buildEcfXml(
        makeValidInput({
          tipoEcf: "34",
          informacionReferencia: {
            ...baseInfoRef,
            ncfModificado: "TOOSHORT",
          },
        }),
      ),
    ).toThrow(EcfBuilderInvalidInput);
  });

  it("rechaza rncOtroContribuyente con guiones", () => {
    expect(() =>
      buildEcfXml(
        makeValidInput({
          tipoEcf: "33",
          informacionReferencia: {
            ...baseInfoRef,
            rncOtroContribuyente: "1-31-23456-7",
          },
        }),
      ),
    ).toThrow(EcfBuilderInvalidInput);
  });

  it("rechaza codigoModificacion fuera de 1..5", () => {
    expect(() =>
      buildEcfXml(
        makeValidInput({
          tipoEcf: "33",
          informacionReferencia: {
            ...baseInfoRef,
            codigoModificacion: 99 as never,
          },
        }),
      ),
    ).toThrow(EcfBuilderInvalidInput);
  });

  it("InformacionReferencia se inserta DESPUÉS de DetallesItems y ANTES de FechaHoraFirma", () => {
    const xml = buildEcfXml(
      makeValidInput({
        tipoEcf: "33",
        informacionReferencia: baseInfoRef,
      }),
    );
    const idxDetalles = xml.indexOf("<DetallesItems>");
    const idxInfoRef = xml.indexOf("<InformacionReferencia>");
    const idxFirma = xml.indexOf("<FechaHoraFirma>");
    expect(idxDetalles).toBeGreaterThan(-1);
    expect(idxInfoRef).toBeGreaterThan(idxDetalles);
    expect(idxFirma).toBeGreaterThan(idxInfoRef);
  });

  it("orden interno de InformacionReferencia: NCFModificado → RNCOtro → Fecha → CodigoModificacion", () => {
    const xml = buildEcfXml(
      makeValidInput({
        tipoEcf: "33",
        informacionReferencia: baseInfoRef,
      }),
    );
    const idxNcf = xml.indexOf("<NCFModificado>");
    const idxRnc = xml.indexOf("<RNCOtroContribuyente>");
    const idxFecha = xml.indexOf("<FechaNCFModificado>");
    const idxCod = xml.indexOf("<CodigoModificacion>");
    expect(idxNcf).toBeLessThan(idxRnc);
    expect(idxRnc).toBeLessThan(idxFecha);
    expect(idxFecha).toBeLessThan(idxCod);
  });

  it("tipo 31 acepta informacionReferencia opcional (XSD permite minOccurs=0)", () => {
    const xml = buildEcfXml(
      makeValidInput({
        informacionReferencia: baseInfoRef,
      }),
    );
    expect(xml).toContain("<InformacionReferencia>");
  });

  it("tipo 31 sin informacionReferencia NO emite el bloque", () => {
    const xml = buildEcfXml(makeValidInput());
    expect(xml).not.toContain("<InformacionReferencia>");
  });
});
