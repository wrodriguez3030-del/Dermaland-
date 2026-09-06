// Portada de agendapp: tests/unit/dgii-retencion-41-v575.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildEcfXml } from "./builder";
import { loadXsdForTipo } from "./xsd-loader";
import { validateEcfXml } from "./validator";
import type { BuildEcfXmlInput } from "./builder-types";
import { rutaPortada } from "./__port__/rutas";

/**
 * v575 — La retención que se declaraba sin declararse.
 *
 * DGII, 23/08/2026 2:03 PM AST, sobre `E410000000002`:
 *   «[260] El campo MontoITBISRetenido de la sección DetallesItems de la línea 1
 *    no es válido»
 *
 * El XML que salió decía esto, literal:
 *
 *   <Retencion>
 *     <IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>
 *   </Retencion>
 *
 * «Soy agente de retención» y ni un monto. Pasó porque el builder emitía el monto por
 * TRUTHINESS (`it.retencion.montoItbisRetenido ? …`) y `0` es falsy: poner cero retenido
 * no producía «0.00», producía la desaparición del campo.
 *
 * Es el mismo defecto de clase que v574 —un «0» legítimo tratado como vacío—, y el propio
 * proyecto lo tenía escrito como regla desde v413: «jamás truthiness: "0" es un valor
 * legítimo, no un vacío».
 */

const WILDCARD_RE = /Signature|Missing child element\(s\)\. Expected is one of \( \{?\*/;
const EMISOR = { rnc: "131561985", razonSocial: "CIBAO SPA LASER CSL SRL", direccion: "Calle 1 #1, Santiago" };

function compra41(retencion: BuildEcfXmlInput["items"][number]["retencion"]): BuildEcfXmlInput {
  return {
    tipoEcf: "41",
    eNcf: "E410000000003",
    fechaEmision: "2026-08-23T18:00:00Z",
    fechaVencimientoSecuencia: "2026-12-31T00:00:00Z",
    ambiente: "ecf",
    emisor: EMISOR,
    comprador: { rncOCedula: "131561985", razonSocial: "CIBAO SPA LASER CSL SRL" },
    items: [{ nombre: "ANESTESIA ENCAIN", cantidad: 1, precioUnitario: 100, itbisRate: 18, ...(retencion ? { retencion } : {}) }],
    indicadorMontoGravado: "0",
  };
}

const errosXsd = async (xml: string, tipo: string): Promise<string[]> => {
  const res = await validateEcfXml({ xml, xsd: await loadXsdForTipo(tipo), schemaName: `e-CF-${tipo}` });
  return res.errors.filter((e) => !WILDCARD_RE.test(e.message)).map((e) => e.message);
};

const bloqueRetencion = (xml: string) => {
  const i = xml.indexOf("<Retencion>");
  return i === -1 ? "" : xml.slice(i, xml.indexOf("</Retencion>", i) + "</Retencion>".length);
};

describe("v575 — retener cero es retener cero, no es no decirlo", () => {
  it("con ITBIS retenido 0 el campo SALE, en 0.00", () => {
    const { xml } = buildEcfXml(compra41({ indicadorAgente: "1", montoItbisRetenido: 0, montoIsrRetenido: 0 }));
    expect(bloqueRetencion(xml)).toContain("<MontoITBISRetenido>0.00</MontoITBISRetenido>");
  });

  it("y el ISR retenido en 0, también", () => {
    const { xml } = buildEcfXml(compra41({ indicadorAgente: "1", montoItbisRetenido: 0, montoIsrRetenido: 0 }));
    expect(bloqueRetencion(xml)).toContain("<MontoISRRetenido>0.00</MontoISRRetenido>");
  });

  it("nunca vuelve a salir un bloque que declare agente y no diga cuánto", () => {
    // Éste es el XML exacto que la DGII rechazó.
    const { xml } = buildEcfXml(compra41({ indicadorAgente: "1", montoItbisRetenido: 0, montoIsrRetenido: 0 }));
    const b = bloqueRetencion(xml);
    expect(b).toContain("IndicadorAgenteRetencionoPercepcion");
    expect(b, "declara agente de retención sin ningún monto").toMatch(/MontoITBISRetenido|MontoISRRetenido/);
  });

  it("con retención de verdad sale con sus montos", () => {
    const { xml } = buildEcfXml(compra41({ indicadorAgente: "1", montoItbisRetenido: 18, montoIsrRetenido: 10 }));
    const b = bloqueRetencion(xml);
    expect(b).toContain("<MontoITBISRetenido>18.00</MontoITBISRetenido>");
    expect(b).toContain("<MontoISRRetenido>10.00</MontoISRRetenido>");
  });

  it("y el XML sigue validando contra el XSD oficial del 41 en los dos casos", async () => {
    for (const r of [
      { indicadorAgente: "1" as const, montoItbisRetenido: 0, montoIsrRetenido: 0 },
      { indicadorAgente: "1" as const, montoItbisRetenido: 18, montoIsrRetenido: 10 },
    ]) {
      expect(await errosXsd(buildEcfXml(compra41(r)).xml, "41")).toEqual([]);
    }
  });
});

describe("v575 — un 41 que no diga cuánto retuvo no sale", () => {
  it("sin ningún monto definido, revienta antes de firmar y con el motivo", () => {
    // Antes esto producía el bloque contradictorio y consumía el número igual.
    expect(() => buildEcfXml(compra41({ indicadorAgente: "1" }))).toThrow(/retenido/i);
  });

  it("y el mensaje dice qué campo y qué línea, no un código", () => {
    try {
      buildEcfXml(compra41({ indicadorAgente: "1" }));
      throw new Error("debería haber fallado");
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toMatch(/#1/);
      expect(m).toMatch(/MontoITBISRetenido/);
    }
  });
});

describe("v575 — lo que ya funcionaba en el 47 no se toca", () => {
  it("el 47 sigue emitiendo MontoISRRetenido siempre, y sin MontoITBISRetenido", () => {
    const { xml } = buildEcfXml({
      tipoEcf: "47",
      eNcf: "E470000000001",
      fechaEmision: "2026-08-23T18:00:00Z",
      fechaVencimientoSecuencia: "2026-12-31T00:00:00Z",
      ambiente: "ecf",
      emisor: EMISOR,
      comprador: { rncOCedula: null, razonSocial: "Proveedor del exterior", identificadorExtranjero: "X-1" },
      items: [{ nombre: "Servicio del exterior", cantidad: 1, precioUnitario: 100, itbisRate: 0, retencion: { indicadorAgente: "1", montoIsrRetenido: 0 } }],
    });
    const b = bloqueRetencion(xml);
    expect(b).toContain("<MontoISRRetenido>0.00</MontoISRRetenido>");
    expect(b).not.toContain("MontoITBISRetenido");
  });
});

// ── El motivo que se quedó viejo en pantalla ────────────────────────────────────────
const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");

describe("v575 — tras preguntar, el motivo que se enseña es el nuevo", () => {
  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/(dashboard)/settings/dgii/facturas/_components/InvoicesPanel.tsx.
  it.skip("la consulta mete el motivo al frente de los apuntes", () => {
    // Se vio en producción: el titular pasaba a «La DGII lo rechazó» y debajo, bajo «Lo
    // que respondió la DGII», seguía «Recibido (TrackId asignado)» —el apunte anterior—,
    // porque la consulta sólo actualizaba `status`.
    const c = leer("src/app/(dashboard)/settings/dgii/facturas/_components/InvoicesPanel.tsx");
    const i = c.indexOf("async function consultarEstado");
    const bloque = c.slice(i, i + 1800);
    expect(bloque).toContain("statusLogs");
    expect(bloque).toMatch(/statusMessage/);
  });
});
