// Portada de agendapp: tests/unit/dgii-retencion-productor-v579.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildEcfXml } from "./builder";
import { loadXsdForTipo } from "./xsd-loader";
import { validateEcfXml } from "./validator";
import type { BuildEcfXmlInput } from "./builder-types";
import { rutaPortada, leerSiExiste } from "./__port__/rutas";

/**
 * v579 — Lo que el code-review encontró de v575, y que costó producción.
 *
 * v575 añadió al builder un assert que exige `MontoITBISRetenido` en TODOS los ítems del
 * 41. El único productor de producción —`purchase-emit.ts`— lo pone SÓLO en el ítem 0 y
 * SÓLO si es mayor que cero. El arreglo se hizo en el builder y no se propagó a quien lo
 * alimenta, así que desde v575:
 *
 *   · una compra de DOS líneas no podía emitir su e-CF 41;
 *   · una compra sin retención de ITBIS —el caso de quien no es agente de retención—
 *     tampoco.
 *
 * La única forma que seguía funcionando era una compra de una línea con ITBIS retenido
 * mayor que cero: exactamente la que se probó a mano contra la DGII ese mismo día. Un
 * caso de prueba que pasa por el único hueco que queda abierto no es una verificación.
 *
 * Y de paso, el mismo defecto de truthiness que v575 corrigió por ítem seguía vivo una
 * sección más arriba, en los TOTALES: retener cero producía un XML que declaraba 0.00 por
 * línea y omitía `TotalITBISRetenido` — un 41 que declara retención y no la totaliza, que
 * es la misma incoherencia por la que la DGII rechazó E410000000002 con [260].
 */

const WILDCARD_RE = /Signature|Missing child element\(s\)\. Expected is one of \( \{?\*/;
const EMISOR = { rnc: "131561985", razonSocial: "CIBAO SPA LASER CSL SRL", direccion: "Calle 1 #1, Santiago" };

const compra41 = (items: BuildEcfXmlInput["items"]): BuildEcfXmlInput => ({
  tipoEcf: "41",
  eNcf: "E410000000004",
  fechaEmision: "2026-08-23T18:00:00Z",
  fechaVencimientoSecuencia: "2026-12-31T00:00:00Z",
  ambiente: "ecf",
  emisor: EMISOR,
  comprador: { rncOCedula: "131000001", razonSocial: "Proveedor de prueba" },
  items,
  indicadorMontoGravado: "0",
});

/** La forma EXACTA que arma `purchase-emit.ts` para cada línea de la compra. */
const lineaComoLaArmaProduccion = (idx: number, itbisRet: number, isr: number) => ({
  nombre: `Línea ${idx + 1}`,
  cantidad: 1,
  precioUnitario: 100,
  itbisRate: 18,
  retencion: {
    indicadorAgente: "1" as const,
    montoItbisRetenido: idx === 0 ? itbisRet : 0,
    montoIsrRetenido: idx === 0 ? isr : 0,
  },
});

const erroresXsd = async (xml: string): Promise<string[]> => {
  const res = await validateEcfXml({ xml, xsd: await loadXsdForTipo("41"), schemaName: "e-CF-41" });
  return res.errors.filter((e) => !WILDCARD_RE.test(e.message)).map((e) => e.message);
};

describe("v579 — las compras que v575 dejó sin poder emitir", () => {
  it("una compra de DOS líneas emite", () => {
    const { xml } = buildEcfXml(compra41([lineaComoLaArmaProduccion(0, 300, 100), lineaComoLaArmaProduccion(1, 300, 100)]));
    expect(xml).toContain("<MontoITBISRetenido>300.00</MontoITBISRetenido>");
    expect(xml, "la segunda línea salió sin su monto").toContain("<MontoITBISRetenido>0.00</MontoITBISRetenido>");
  });

  it("una compra SIN retención de ITBIS emite", () => {
    // Quien no es agente de retención de ITBIS. Antes de v579 esto reventaba.
    const { xml } = buildEcfXml(compra41([lineaComoLaArmaProduccion(0, 0, 0)]));
    expect(xml).toContain("<MontoITBISRetenido>0.00</MontoITBISRetenido>");
  });

  it("y las dos validan contra el XSD oficial del 41", async () => {
    for (const items of [
      [lineaComoLaArmaProduccion(0, 300, 100), lineaComoLaArmaProduccion(1, 300, 100)],
      [lineaComoLaArmaProduccion(0, 0, 0)],
    ]) {
      expect(await erroresXsd(buildEcfXml(compra41(items)).xml)).toEqual([]);
    }
  });

  it("la que sí funcionaba sigue funcionando", () => {
    const { xml } = buildEcfXml(compra41([lineaComoLaArmaProduccion(0, 18, 10)]));
    expect(xml).toContain("<MontoITBISRetenido>18.00</MontoITBISRetenido>");
    expect(xml).toContain("<TotalITBISRetenido>18.00</TotalITBISRetenido>");
  });
});

describe("v579 — el total de retención también se declara en cero", () => {
  it("con retención cero el XML declara el total, no lo omite", () => {
    // Antes: 0.00 por línea y ningún TotalITBISRetenido. Un 41 que declara retención y no
    // la totaliza es la misma incoherencia del rechazo [260].
    const { xml } = buildEcfXml(compra41([lineaComoLaArmaProduccion(0, 0, 0)]));
    expect(xml).toContain("<TotalITBISRetenido>0.00</TotalITBISRetenido>");
    expect(xml).toContain("<TotalISRRetencion>0.00</TotalISRRetencion>");
  });

  it("y sigue validando contra el XSD", async () => {
    expect(await erroresXsd(buildEcfXml(compra41([lineaComoLaArmaProduccion(0, 0, 0)])).xml)).toEqual([]);
  });

  it("un tipo que no es 41 no gana totales de retención de la nada", () => {
    const { xml } = buildEcfXml({
      tipoEcf: "32",
      eNcf: "E320000000012",
      fechaEmision: "2026-08-23T18:00:00Z",
      fechaVencimientoSecuencia: "2026-12-31T00:00:00Z",
      ambiente: "ecf",
      emisor: EMISOR,
      items: [{ nombre: "Servicio", cantidad: 1, precioUnitario: 100, itbisRate: 18 }],
      indicadorMontoGravado: "0",
    });
    expect(xml).not.toContain("TotalITBISRetenido");
    expect(xml).not.toContain("TotalISRRetencion");
  });
});

// PENDIENTE fase 5 (adaptadores de negocio (POS)): el bloque entero guarda src/lib/server/purchase-emit.ts, que DermaLand aún no tiene.
describe.skip("v579 — el productor manda lo que el builder exige", () => {
  // PENDIENTE fase 5 (adaptadores de negocio (POS)): revive cuando exista src/lib/server/purchase-emit.ts.
  it.skip("purchase-emit ya no condiciona el monto a que sea mayor que cero", () => {
    const r = leerSiExiste("src/lib/server/purchase-emit.ts");
    expect(r, "sigue omitiendo el monto cuando es 0 o no es la primera línea").not.toMatch(
      /idx === 0 && itbisRet > 0/,
    );
    expect(r).toMatch(/montoItbisRetenido:\s*idx === 0 \?\s*itbisRet\s*:\s*0/);
    expect(r).toMatch(/montoIsrRetenido:\s*idx === 0 \?\s*isr\s*:\s*0/);
  });
});
