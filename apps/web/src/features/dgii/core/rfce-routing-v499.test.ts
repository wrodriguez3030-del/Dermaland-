// Portada de agendapp: tests/unit/rfce-routing-v499.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveEcfDelivery, RFCE_MONTO_MAXIMO } from "./rfce-routing";
import { rutaPortada, leerSiExiste } from "./__port__/rutas";

/**
 * v499 — Íntegro o resumen.
 *
 * DGII no recibe todas las facturas de consumo por el mismo lugar: una E32 bajo
 * RD$250,000 va como resumen (RFCE) a `fc.dgii.gov.do/.../recepcionfc`, y la que llega al
 * tope va completa a `ecf.dgii.gov.do/.../recepcion`.
 *
 * `invoice-prepare` nunca tomó esa decisión. No se notó porque en certificación los casos
 * vienen clasificados en la hoja oficial de DGII; en una venta real no hay hoja. Para un
 * spa el resumen es el caso NORMAL: ninguna sesión de láser llega al tope.
 *
 * El contraste que destapó esto fue el módulo Odoo `l10n_do_edi` de Overload Solutions
 * (ver `docs/planning/V498_ESTUDIO_L10N_DO_EDI.md`). De ahí sale también el caso de la
 * moneda, que el módulo documenta con un ejemplo concreto.
 */

describe("v499 — qué sale íntegro y qué sale como resumen", () => {
  it("la factura de consumo típica de un spa va como resumen", () => {
    // Una sesión de depilación láser. Este ES el caso normal del negocio, no un borde.
    const d = resolveEcfDelivery({ tipoEcf: "32", montoTotalDop: 4500 });
    expect(d.kind).toBe("rfce");
    expect(d.channel).toBe("recepcionfc");
  });

  it("el tope es estricto: exactamente RD$250,000 va íntegra", () => {
    // El builder RFCE rechaza `montoTotal >= RFCE_MONTO_MAXIMO` al construir. Si la
    // decisión usara `<=`, mandaría a construir un resumen que el builder rechaza: el
    // comprobante moriría después de reservar el e-NCF, quemando una secuencia fiscal.
    expect(resolveEcfDelivery({ tipoEcf: "32", montoTotalDop: RFCE_MONTO_MAXIMO }).kind).toBe("ecf");
    expect(resolveEcfDelivery({ tipoEcf: "32", montoTotalDop: RFCE_MONTO_MAXIMO - 0.01 }).kind).toBe("rfce");
  });

  it("ningún tipo que no sea 32 se resume, por grande o chico que sea", () => {
    // El RFCE existe SÓLO para la Factura de Consumo. Un crédito fiscal de RD$100 sigue
    // yendo completo: el umbral no aplica.
    for (const tipo of ["31", "33", "34", "41", "43", "44", "45", "46", "47"]) {
      const chico = resolveEcfDelivery({ tipoEcf: tipo, montoTotalDop: 100 });
      expect(chico.kind, `el tipo ${tipo} no debe resumirse`).toBe("ecf");
      expect(chico.channel).toBe("recepcion");
    }
  });

  it("un total inválido se rechaza en vez de asumir íntegro", () => {
    // Asumir «íntegro» ante un total corrupto mandaría el comprobante al servicio
    // equivocado sin que nadie se entere. Falla ruidoso y antes de reservar.
    for (const malo of [NaN, Infinity, -1]) {
      expect(() => resolveEcfDelivery({ tipoEcf: "32", montoTotalDop: malo })).toThrow(RangeError);
    }
  });

  it("el motivo se explica en español y con el monto, no como código", () => {
    // Va a mensajes al dueño y a auditoría. «RFCE_REQUIRED» no le dice nada a nadie.
    const d = resolveEcfDelivery({ tipoEcf: "32", montoTotalDop: 4500 });
    expect(d.reason).toMatch(/resumen/i);
    expect(d.reason).toMatch(/4,500\.00/);
    expect(d.reason).not.toMatch(/[A-Z]{4,}_[A-Z]{4,}/);
  });

  it("el tope NO se redeclara: se importa del builder, su dueño canónico", () => {
    // `RFCE_MONTO_MAXIMO` ya estaba declarado dos veces en el repo (builders/rfce.ts y
    // official-dataset.ts). Una tercera copia sería la lógica paralela que la regla del
    // proyecto prohíbe: el día que DGII mueva el umbral, se corrige una y las otras
    // mienten. El módulo de ruteo lo importa y lo reexporta, no lo define.
    const src = readFileSync(rutaPortada("src/lib/dgii/rfce-routing.ts"), "utf8");
    expect(src).toMatch(/import\s*\{\s*RFCE_MONTO_MAXIMO\s*\}\s*from\s*"\.\/builders\/rfce"/);
    expect(src, "el ruteo redeclara el tope en vez de importarlo").not.toMatch(
      /const\s+RFCE_MONTO_MAXIMO\s*=/,
    );
    expect(RFCE_MONTO_MAXIMO).toBe(250_000);
  });
});

// PENDIENTE fase 3 (persistencia y orquestacion): el bloque entero guarda src/lib/dgii/invoice-prepare.ts, que DermaLand aún no tiene.
describe.skip("v499 — el preparador no emite un comprobante destinado al servicio equivocado", () => {
  const prepare = leerSiExiste("src/lib/dgii/invoice-prepare.ts");
  const soloCodigo = prepare.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("consulta la decisión de ruteo", () => {
    expect(soloCodigo).toMatch(/resolveEcfDelivery\(/);
  });

  it("decide ANTES de reservar la secuencia", () => {
    // Reservar consume un e-NCF de un rango autorizado por DGII: no se devuelve. Si la
    // decisión se tomara dentro de la transacción, un E32 bajo el tope quemaría número
    // antes de descubrir que no se puede generar todavía.
    expect(soloCodigo.indexOf("resolveEcfDelivery(")).toBeLessThan(soloCodigo.indexOf("$transaction"));
  });

  it("v500 — genera el resumen en vez de emitir el íntegro por defecto", () => {
    // En v499 esto exigía `return blocked(...)`: el resumen no se podía producir todavía y
    // bloquear era preferible a mandar el documento equivocado. v500 lo genera de verdad,
    // así que el contrato cambió — lo que NO cambió es que el íntegro nunca puede salir
    // por el camino del resumen.
    const bloque = soloCodigo.slice(soloCodigo.indexOf("resolveEcfDelivery("));
    expect(bloque).toMatch(/delivery\.kind === "rfce"/);
    expect(bloque, "el resumen ya no se construye").toMatch(/buildRfce\(/);
    expect(bloque, "el resumen debe firmarse con el seed-signer, no con el firmador de e-CF").toMatch(/signDgiiSeedXml\(/);
    expect(bloque, "falta re-validar el resumen firmado contra su XSD oficial").toMatch(/validateCertificationXml\("RFCE32"/);
  });
});
