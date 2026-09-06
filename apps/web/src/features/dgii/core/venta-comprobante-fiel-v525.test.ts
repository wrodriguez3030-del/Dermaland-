// Portada de agendapp: tests/unit/dgii-venta-comprobante-fiel-v525.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildEcfXml } from "./builder";
import type { BuildEcfXmlInput } from "./builder-types";
import { rutaPortada } from "./__port__/rutas";

/**
 * v525 — Que el comprobante diga lo que la clienta pagó.
 *
 * Dos defectos de la misma familia, encontrados al investigar qué le falta al módulo de
 * ventas para facturar completo. Los dos hacen que el e-CF declare un dato que no es.
 *
 * ── 1. El descuento se perdía en el camino ──────────────────────────────────
 * La venta calcula `línea = cantidad·precio − descuento` y guarda el descuento por línea.
 * Pero al comprobante se le mandaba `cantidad` y `precio` SIN el descuento, y el campo ya
 * existía en el builder. Una venta con descuento emitía un e-CF por MÁS de lo cobrado,
 * con el ITBIS y el QR inflados en la misma proporción. En un spa con promos y paquetes
 * no es un caso raro.
 *
 * ── 2. La fecha de vencimiento era inventada ────────────────────────────────
 * `FechaVencimientoSecuencia` se rellenaba con `Date.now() + 365 días` — en un campo que
 * DGII contrasta contra el rango que autorizó. Con los rangos de CIBAO, un E31 emitido el
 * 06-08-2026 declaraba vencimiento 06-08-2027 cuando la autorización vence el 31-12-2026:
 * ocho meses de más. El dato real estaba en la fila de la secuencia que el preparador ya
 * consultaba, pidiendo sólo el `id`.
 */

const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");

const ventaBase = (): BuildEcfXmlInput => ({
  tipoEcf: "32",
  eNcf: "E320000000001",
  fechaEmision: "2026-08-06T10:00:00.000Z",
  ambiente: "ecf",
  emisor: {
    rnc: "131561985",
    razonSocial: "CIBAO SPA LASER CSL SRL",
    direccion: "Santiago",
    telefono: "809-555-1212",
    correo: "info@ejemplo.do",
  },
  comprador: { rncOCedula: "00112345678", razonSocial: "Clienta de prueba" },
  items: [
    { nombre: "Sesión de láser", cantidad: 1, precioUnitario: 1000, itbisRate: 18, indicadorBienoServicio: "2" },
  ],
});

const tag = (xml: string, t: string): string | null => {
  const m = new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(xml);
  return m ? m[1]!.trim() : null;
};

describe("v525 — el descuento llega al comprobante", () => {
  it("MontoItem descuenta: 1000 − 200 = 800, no 1000", () => {
    const conDescuento = ventaBase();
    conDescuento.items[0]!.descuento = 200;
    const xml = buildEcfXml(conDescuento).xml;

    expect(tag(xml, "MontoItem"), "el comprobante cobra de más").toBe("800.00");
    expect(tag(xml, "DescuentoMonto")).toBe("200.00");
  });

  it("el ITBIS y el total salen del importe YA descontado", () => {
    const conDescuento = ventaBase();
    conDescuento.items[0]!.descuento = 200;
    const xml = buildEcfXml(conDescuento).xml;

    // 800 × 18% = 144 · total 944. Sin el arreglo daban 180 y 1180.
    expect(tag(xml, "TotalITBIS")).toBe("144.00");
    expect(tag(xml, "MontoTotal")).toBe("944.00");
  });

  it("sin descuento nada cambia: el arreglo no mueve las ventas normales", () => {
    const xml = buildEcfXml(ventaBase()).xml;
    expect(tag(xml, "MontoItem")).toBe("1000.00");
    expect(tag(xml, "MontoTotal")).toBe("1180.00");
    expect(xml).not.toMatch(/<DescuentoMonto>/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/simulation-ri.ts.
  it.skip("el QR queda atado al mismo monto: sale del MontoTotal firmado", () => {
    // El QR codifica el MontoTotal del XML, así que corregir el monto corrige el QR sin
    // tocar nada más — el código lee lo firmado en vez de recalcularlo.
    const ri = leer("src/lib/dgii/simulation-ri.ts");
    expect(ri).toMatch(/extractTag\(signedXml, "MontoTotal"\)/);
  });
});

describe("v525 — el descuento viaja desde la venta", () => {
  // PENDIENTE fase 5 (adaptadores de negocio (POS)): revive cuando exista src/lib/server/pos-sales.ts.
  it.skip("la venta le pasa el descuento de cada línea al emisor de comprobantes", () => {
    const ventas = leer("src/lib/server/pos-sales.ts");
    expect(ventas, "el descuento no sale de la venta").toMatch(/discount_amount: Number\(l\.discount_amount/);
  });

  // PENDIENTE fase 5 (adaptadores de negocio (POS)): revive cuando exista src/lib/server/pos-sale-ecf.ts.
  it.skip("el emisor lo reenvía al preparador", () => {
    const emisor = leer("src/lib/server/pos-sale-ecf.ts");
    expect(emisor, "el descuento se pierde antes de preparar").toMatch(/discount: Number\(l\.discount_amount/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/invoice-prepare.ts.
  it.skip("el preparador lo aplica al construir Y a los totales que muestra", () => {
    const prep = leer("src/lib/dgii/invoice-prepare.ts");
    // Al builder.
    expect(prep).toMatch(/descuento: it\.discount/);
    // Y a las otras dos cuentas del mismo archivo: si sólo se arreglara una, los totales
    // que se muestran y los que se firman dirían cosas distintas.
    const cuentas = [...prep.matchAll(/it\.quantity \* it\.unitPrice - \(it\.discount \?\? 0\)/g)];
    expect(cuentas.length, "quedó una cuenta sin descontar").toBe(2);
  });
});

describe("v525 — la fecha de vencimiento es la autorizada, no una inventada", () => {
  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/invoice-prepare.ts.
  it.skip("no queda ningún `Date.now() + 365 días` haciendo de fecha fiscal", () => {
    const prep = leer("src/lib/dgii/invoice-prepare.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(prep, "volvió la fecha inventada").not.toMatch(/365 \* 86_?400_?000/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/invoice-prepare.ts.
  it.skip("sale de la fila de la secuencia, que ya se consultaba", () => {
    const prep = leer("src/lib/dgii/invoice-prepare.ts");
    expect(prep).toMatch(/select: \{ id: true, expires_at: true \}/);
    expect(prep).toMatch(/fechaVencimientoSecuencia: seq!\.expires_at!\.toISOString\(\)/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/invoice-prepare.ts.
  it.skip("si el rango no la trae, BLOQUEA en vez de inventarla", () => {
    const prep = leer("src/lib/dgii/invoice-prepare.ts");
    expect(prep).toMatch(/TIPOS_CON_VENCIMIENTO\.includes\(input\.tipoEcf\) && !seq\?\.expires_at/);
    expect(prep).toMatch(/no tiene fecha de vencimiento cargada/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/invoice-prepare.ts.
  it.skip("32 y 34 quedan fuera de la exigencia: son los que no la llevan", () => {
    // Y no es casualidad que sean los dos cuyos rangos no traen `expires_at` cargado.
    const prep = leer("src/lib/dgii/invoice-prepare.ts");
    const m = /const TIPOS_CON_VENCIMIENTO = \[([^\]]*)\]/.exec(prep);
    expect(m, "desapareció la lista de tipos").toBeTruthy();
    const tipos = m![1];
    expect(tipos).not.toMatch(/"32"/);
    expect(tipos).not.toMatch(/"34"/);
    expect(tipos).toMatch(/"31"/);
  });
});
