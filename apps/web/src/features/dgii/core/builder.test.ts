import { describe, it, expect, vi } from "vitest";
import { buildEcfXml } from "./builder";
import {
  EcfBuilderInvalidInput,
  type BuildEcfXmlInput,
  type EcfTipoBuilder,
} from "./builder-types";

function baseInput(over: Partial<BuildEcfXmlInput> = {}): BuildEcfXmlInput {
  return {
    tipoEcf: "32",
    eNcf: "E320000000001",
    fechaEmision: "2026-06-09T10:00:00.000Z",
    ambiente: "testecf",
    emisor: { rnc: "130123456", razonSocial: "Mi Negocio SRL", direccion: "Calle 1, Santiago" },
    items: [{ nombre: "Servicio A", cantidad: 1, precioUnitario: 100, itbisRate: 18 }],
    ...over,
  };
}

describe("buildEcfXml — estructura alineada al XSD", () => {
  it("tipo 31 con comprador fiscal", () => {
    const r = buildEcfXml(baseInput({
      tipoEcf: "31", eNcf: "E310000000001",
      fechaVencimientoSecuencia: "2026-12-31",
      comprador: { rncOCedula: "131245678", razonSocial: "Cliente SA" },
    }));
    expect(r.xml).toContain("<TipoeCF>31</TipoeCF>");
    expect(r.xml).toContain("<FechaVencimientoSecuencia>31-12-2026</FechaVencimientoSecuencia>");
    expect(r.xml).toContain("<RNCComprador>131245678</RNCComprador>");
    expect(r.unsigned).toBe(true);
  });

  it("tipo 32 emite Comprador (requerido por XSD) aunque sin datos", () => {
    const r = buildEcfXml(baseInput());
    expect(r.xml).toContain("<Comprador"); // <Comprador/> self-closing es válido (XSD lo acepta)
  });

  it("incluye TipoIngresos, TipoPago, FechaEmision DD-MM-YYYY y FechaHoraFirma", () => {
    const r = buildEcfXml(baseInput());
    expect(r.xml).toContain("<TipoIngresos>01</TipoIngresos>");
    expect(r.xml).toContain("<TipoPago>1</TipoPago>");
    expect(r.xml).toContain("<FechaEmision>09-06-2026</FechaEmision>");
    expect(r.xml).toMatch(/<FechaHoraFirma>09-06-2026 \d{2}:\d{2}:\d{2}<\/FechaHoraFirma>/);
  });

  it("ítems usan IndicadorFacturacion (18→1, 0→4) y MontoItem, sin TasaITBIS", () => {
    const r = buildEcfXml(baseInput({
      items: [
        { nombre: "G", cantidad: 1, precioUnitario: 100, itbisRate: 18 },
        { nombre: "E", cantidad: 1, precioUnitario: 50, itbisRate: 0 },
      ],
    }));
    expect(r.xml).toContain("<IndicadorFacturacion>1</IndicadorFacturacion>");
    expect(r.xml).toContain("<IndicadorFacturacion>4</IndicadorFacturacion>");
    expect(r.xml).toContain("<IndicadorBienoServicio>1</IndicadorBienoServicio>");
    expect(r.xml).not.toContain("TasaITBIS");
  });

  it("tipo 34 con referencia (NCFModificado/Fecha/CodigoModificacion)", () => {
    const r = buildEcfXml(baseInput({
      tipoEcf: "34", eNcf: "E340000000001",
      referencia: { ncfModificado: "E320000000009", fechaNcfModificado: "2026-06-01", codigoModificacion: "1" },
    }));
    expect(r.xml).toContain("<NCFModificado>E320000000009</NCFModificado>");
    expect(r.xml).toContain("<FechaNCFModificado>01-06-2026</FechaNCFModificado>");
    expect(r.xml).toContain("<CodigoModificacion>1</CodigoModificacion>");
  });
});

describe("buildEcfXml — validaciones que fallan", () => {
  it("tipo 42/desconocido fail-closed (v353: los 10 objetivo ya implementados)", () => {
    expect(() => buildEcfXml(baseInput({ tipoEcf: "42" as unknown as EcfTipoBuilder }))).toThrow(EcfBuilderInvalidInput);
  });
  it("eNCF no coincide con tipo", () => {
    expect(() => buildEcfXml(baseInput({ tipoEcf: "31", eNcf: "E320000000001", comprador: { rncOCedula: "130123456" } }))).toThrow(EcfBuilderInvalidInput);
  });
  it("RNC emisor inválido", () => {
    expect(() => buildEcfXml(baseInput({ emisor: { rnc: "123", razonSocial: "X", direccion: "Y" } }))).toThrow(EcfBuilderInvalidInput);
  });
  it("falta dirección del emisor (requerida por XSD)", () => {
    expect(() => buildEcfXml(baseInput({ emisor: { rnc: "130123456", razonSocial: "X", direccion: "" } }))).toThrow(EcfBuilderInvalidInput);
  });
  it("cantidad <= 0", () => {
    expect(() => buildEcfXml(baseInput({ items: [{ nombre: "X", cantidad: 0, precioUnitario: 10, itbisRate: 18 }] }))).toThrow(EcfBuilderInvalidInput);
  });
  it("línea negativa (descuento > importe)", () => {
    expect(() => buildEcfXml(baseInput({ items: [{ nombre: "X", cantidad: 1, precioUnitario: 10, descuento: 50, itbisRate: 0 }] }))).toThrow(EcfBuilderInvalidInput);
  });
  it("itbisRate no permitido", () => {
    expect(() => buildEcfXml(baseInput({ items: [{ nombre: "X", cantidad: 1, precioUnitario: 10, itbisRate: 5 }] }))).toThrow(EcfBuilderInvalidInput);
  });
  it("tipo 34 sin referencia completa", () => {
    expect(() => buildEcfXml(baseInput({ tipoEcf: "34", eNcf: "E340000000001" }))).toThrow(EcfBuilderInvalidInput);
  });
  it("sin items", () => {
    expect(() => buildEcfXml(baseInput({ items: [] }))).toThrow(EcfBuilderInvalidInput);
  });
  it("tipo 31 sin comprador fiscal", () => {
    expect(() => buildEcfXml(baseInput({ tipoEcf: "31", eNcf: "E310000000001" }))).toThrow(EcfBuilderInvalidInput);
  });
});

describe("buildEcfXml — formato y seguridad de salida", () => {
  it("declaración XML UTF-8 sin BOM", () => {
    const r = buildEcfXml(baseInput());
    expect(r.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(r.xml.charCodeAt(0)).not.toBe(0xfeff);
  });
  it("escapa & < > \" '", () => {
    const r = buildEcfXml(baseInput({ emisor: { rnc: "130123456", razonSocial: `A & B <C> "D" 'E'`, direccion: "X" } }));
    expect(r.xml).toContain("A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;");
    expect(r.xml).not.toContain("<C>");
  });
  it("sin 'undefined'/'null' como texto", () => {
    const r = buildEcfXml(baseInput());
    expect(r.xml).not.toContain("undefined");
    expect(r.xml).not.toContain(">null<");
  });
  it("sin secretos en la salida", () => {
    const r = buildEcfXml(baseInput({ ...({ password: "x", privateKey: "y", certificate: "z" } as unknown as Partial<BuildEcfXmlInput>) }));
    for (const bad of ["password", "privatekey", "certificate", "begin private key", "service_role", "signature"]) {
      expect(r.xml.toLowerCase()).not.toContain(bad);
    }
  });
  it("orden root: Encabezado → DetallesItems → InformacionReferencia → FechaHoraFirma", () => {
    const r = buildEcfXml(baseInput({ tipoEcf: "34", eNcf: "E340000000001", referencia: { ncfModificado: "E320000000009", fechaNcfModificado: "2026-06-01", codigoModificacion: "1" } }));
    const a = r.xml.indexOf("<Encabezado>");
    const b = r.xml.indexOf("<DetallesItems>");
    const c = r.xml.indexOf("<InformacionReferencia>");
    const d = r.xml.indexOf("<FechaHoraFirma>");
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(d);
  });
  it("determinístico", () => {
    expect(buildEcfXml(baseInput()).xml).toBe(buildEcfXml(baseInput()).xml);
  });
  it("NO emite <Signature> (sin firma)", () => {
    expect(buildEcfXml(baseInput()).xml).not.toContain("Signature");
  });
});

describe("buildEcfXml — totales/redondeo", () => {
  it("recalcula y redondea a 2 decimales", () => {
    const r = buildEcfXml(baseInput({ items: [{ nombre: "X", cantidad: 3, precioUnitario: 33.333, itbisRate: 18 }] }));
    expect(r.totals.subtotal).toBe(100);
    expect(r.totals.totalItbis).toBe(18);
    expect(r.totals.total).toBe(118);
    expect(r.xml).toContain("<MontoTotal>118.00</MontoTotal>");
  });
  it("warning si total declarado difiere", () => {
    const r = buildEcfXml(baseInput({ totales: { total: 999 } }));
    expect(r.warnings.some((w) => w.toLowerCase().includes("total"))).toBe(true);
  });
});

describe("buildEcfXml — pureza", () => {
  it("no llama fetch", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    buildEcfXml(baseInput());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// Matriz de casos (tipos × rate × cantidad × precio × nombres con caracteres).
describe("buildEcfXml — matriz de casos", () => {
  const tipos: { t: EcfTipoBuilder; encf: string; extra: Partial<BuildEcfXmlInput> }[] = [
    { t: "31", encf: "E310000000001", extra: { fechaVencimientoSecuencia: "2026-12-31", comprador: { rncOCedula: "131245678", razonSocial: "C SA" } } },
    { t: "32", encf: "E320000000001", extra: {} },
    { t: "33", encf: "E330000000001", extra: { fechaVencimientoSecuencia: "2026-12-31", referencia: { ncfModificado: "E310000000009", fechaNcfModificado: "2026-05-01", codigoModificacion: "2" } } },
    { t: "34", encf: "E340000000001", extra: { referencia: { ncfModificado: "E320000000009", fechaNcfModificado: "2026-05-01", codigoModificacion: "2" } } },
  ];
  const rates = [0, 16, 18];
  const cantidades = [1, 2, 7];
  const precios = [0, 10.5, 99.99, 1234.567];
  const nombres = ["Item normal", "Taza & Plato", "Cama <grande>", `Bebida "fría"`, "Don't go"];

  let count = 0;
  for (const tipo of tipos) {
    for (const rate of rates) {
      for (const cantidad of cantidades) {
        for (const precio of precios) {
          // `count % nombres.length` siempre cae dentro del array: nunca es undefined.
          const nombre = nombres[count % nombres.length]!;
          count++;
          it(`caso #${count}: ${tipo.t}/${rate}/${cantidad}/${precio}`, () => {
            const r = buildEcfXml(baseInput({
              tipoEcf: tipo.t, eNcf: tipo.encf,
              items: [{ nombre, cantidad, precioUnitario: precio, itbisRate: rate }],
              ...tipo.extra,
            }));
            expect(r.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
            expect(r.xml).toContain(`<TipoeCF>${tipo.t}</TipoeCF>`);
            expect(r.totals.total).toBeGreaterThanOrEqual(0);
            expect(r.xml).toMatch(/<MontoTotal>\d+\.\d{2}<\/MontoTotal>/);
            expect(r.xml).not.toContain("undefined");
            if (nombre.includes("&")) expect(r.xml).toContain("&amp;");
            if (nombre.includes("<")) expect(r.xml).not.toContain("<grande>");
          });
        }
      }
    }
  }
});
