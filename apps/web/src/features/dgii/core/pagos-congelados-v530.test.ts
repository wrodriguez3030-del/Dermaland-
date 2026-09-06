// Portada de agendapp: tests/unit/pagos-congelados-v530.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { congelaPagos, STATUSES_QUE_CONGELAN_PAGOS, INVOICE_STATUSES } from "./submission-state-types";
import { rutaPortada } from "./__port__/rutas";

/**
 * v530 — Una venta cuyo comprobante ya salió a DGII no se edita por detrás.
 *
 * El `TipoPago` del e-CF —contado o crédito— se deriva del estado de cobro de la venta al
 * momento de emitir (v528). Si después se agrega un abono o se anula un pago, DGII se queda
 * con un comprobante que dice una cosa y la venta dice otra. Y a diferencia de un error de
 * captura, esto no se arregla editando: hay que anular el comprobante y emitir uno nuevo.
 *
 * Antes de v530 nada lo impedía. Con la emisión real recién encendida, dejaba de ser teórico.
 */

const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");
const codigo = (rel: string) =>
  leer(rel).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("v530 — qué estados congelan los pagos", () => {
  it("congela desde que el documento salió, no desde que fue aceptado", () => {
    // `submitted` e `in_process` cuentan: el documento ya está en manos de DGII aunque no
    // haya veredicto. Esperar al «accepted» dejaría una ventana en la que se puede editar
    // una venta cuyo comprobante ya viajó.
    expect(congelaPagos("submitted")).toBe(true);
    expect(congelaPagos("in_process")).toBe(true);
    expect(congelaPagos("accepted")).toBe(true);
    expect(congelaPagos("accepted_conditional")).toBe(true);
  });

  it("NO congela lo que todavía no salió ni lo que ya no vale", () => {
    // Preparado o firmado: el número está reservado pero el documento no viajó — la venta
    // todavía se puede corregir y el comprobante se reemite.
    expect(congelaPagos("prepared")).toBe(false);
    expect(congelaPagos("signed")).toBe(false);
    // Rechazado o cancelado: ese comprobante no vale. Bloquear la venta ahí la dejaría
    // atrapada, sin comprobante válido y sin poder corregirse.
    expect(congelaPagos("rejected")).toBe(false);
    expect(congelaPagos("cancelled")).toBe(false);
    expect(congelaPagos(null)).toBe(false);
    expect(congelaPagos(undefined)).toBe(false);
  });

  it("la lista solo contiene estados que existen", () => {
    for (const s of STATUSES_QUE_CONGELAN_PAGOS) {
      expect(INVOICE_STATUSES as readonly string[]).toContain(s);
    }
  });
});

describe("v530 — el bloqueo vive en el SERVIDOR, en las dos operaciones", () => {
  const pagos = () => codigo("src/lib/server/pos-payments.ts");

  // PENDIENTE fase 5 (adaptadores de negocio (POS)): revive cuando exista src/lib/server/pos-payments.ts.
  it.skip("las DOS operaciones cortan de verdad, no solo mencionan el helper", () => {
    // Contar apariciones no alcanza: `if (false && congelaPagos(...))` deja el texto intacto
    // y el guard muerto. Se exige la condición EXACTA que corta, dos veces —agregar y anular.
    const src = pagos();
    const corta = (src.match(/if \(congelaPagos\(sale\.electronicInvoice\?\.status\)\) \{/g) ?? []).length;
    expect(corta, "una de las dos operaciones quedó sin bloqueo efectivo").toBe(2);
  });

  // PENDIENTE fase 5 (adaptadores de negocio (POS)): revive cuando exista src/lib/server/pos-payments.ts.
  it.skip("las DOS traen el estado del comprobante en su query", () => {
    // Sin el select, `status` llega `undefined`, `congelaPagos` devuelve false y el guard
    // pasa siempre. Un guard que nunca corta es peor que no tenerlo: da falsa tranquilidad.
    const src = pagos();
    const selects = (src.match(/electronicInvoice: \{ select: \{ status: true/g) ?? []).length;
    expect(selects, "una operación consulta la venta sin el estado del comprobante").toBe(2);
  });

  // PENDIENTE fase 5 (adaptadores de negocio (POS)): revive cuando exista src/lib/server/pos-payments.ts.
  it.skip("responde 409 con un motivo accionable, no un error genérico", () => {
    const src = pagos();
    expect(src).toMatch(/comprobante fiscal enviado a DGII/i);
    expect(src, "no dice qué hacer").toMatch(/anular el comprobante y emitir uno nuevo/i);
  });

  // PENDIENTE fase 5 (adaptadores de negocio (POS)): revive cuando exista src/lib/server/pos-payments.ts.
  it.skip("usa el helper canónico, no una lista de estados propia", () => {
    expect(pagos()).toMatch(/import \{ congelaPagos \} from "@\/lib\/dgii\/submission-state-types"/);
    expect(pagos(), "reimplementó la lista de estados").not.toMatch(/=== "accepted"/);
  });
});

describe("v530 — la pantalla lo dice antes de que la cajera lo intente", () => {
  const creditos = () => codigo("src/app/(dashboard)/sales/credits/page.tsx");

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/api/pos/credits/route.ts.
  it.skip("la lista trae el estado del comprobante", () => {
    expect(codigo("src/app/api/pos/credits/route.ts")).toMatch(/electronicInvoice:electronic_invoices\(status\)/);
  });

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/(dashboard)/sales/credits/page.tsx.
  it.skip("no deshabilita en silencio: el motivo se ve", () => {
    // Un `title` en un botón `disabled` no lo lee ni el teclado ni un lector de pantalla.
    const src = creditos();
    expect(src).toMatch(/data-testid="abono-congelado"/);
    expect(src).toMatch(/<StatusMark tone="warning" label=\{MOTIVO_CONGELADA\}/);
    expect(src, "volvió el tooltip invisible para teclado").not.toMatch(/title=\{pagosCongelados/);
  });

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/(dashboard)/sales/credits/page.tsx.
  it.skip("y la razón que muestra es la misma que aplica el servidor", () => {
    expect(creditos()).toMatch(/congelaPagos\(s\.electronicInvoice\?\.status\)/);
  });
});
