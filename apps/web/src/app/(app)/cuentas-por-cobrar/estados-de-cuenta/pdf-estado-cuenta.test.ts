import { describe, it, expect } from "vitest";
import type { ReceivableRow } from "@/features/receivables/receivables-client";
import { seccionFacturasPendientes } from "./pdf-estado-cuenta";

/**
 * 🔴 El PDF del estado de cuenta es el único sitio del módulo donde el dato
 * sale de la pantalla y llega al cliente: la encargada lo exporta y se lo manda
 * por WhatsApp. Si ese papel —con membrete de DermaLand— reclama facturas que
 * se cobran en Alegra sin decirlo, el cliente recibe una reclamación por algo
 * que ya pagó, o que va a pagar, en el otro sistema. En el PDF no hay `title`
 * al pasar el ratón: o se lee, o no existe.
 */

const fila = (over: Partial<ReceivableRow>): ReceivableRow =>
  ({
    id: "p1",
    number: "FAC-1",
    ecfNumber: null,
    customerId: "c1",
    customerName: "Ana",
    customerPhone: null,
    branchId: "b1",
    branchName: "Principal",
    sellerName: null,
    cashierName: "Rosa",
    issuedAt: "2026-09-01",
    dueDate: "2026-09-30",
    creditDays: 30,
    overdueDays: 0,
    bucket: "al_dia",
    total: 1000,
    paid: 0,
    balance: 1000,
    status: "issued",
    origen: "sistema",
    cobrable: true,
    motivoNoCobrable: null,
    ...over,
  }) as ReceivableRow;

const migrada = fila({
  id: "a1",
  number: "B0100000123",
  origen: "alegra",
  cobrable: false,
  motivoNoCobrable: "…",
  balance: 600,
});

describe("PDF del estado de cuenta", () => {
  it("🔴 cada fila dice su origen EN EL PAPEL", () => {
    const s = seccionFacturasPendientes([fila({}), migrada], 1600);
    expect(s.table.columns.map((c) => c.key)).toContain("origen");
    expect(s.table.rows[0]!.origen).toBe("Sistema");
    expect(s.table.rows[1]!.origen).toBe("Migrada de Alegra");
  });

  it("🔴 y una nota al pie explica que esas se cobran en Alegra", () => {
    // `footnote` en la SECCIÓN es la clave que el motor de PDF entiende. Una
    // `note` dentro de `table` se descartaría en silencio: el papel saldría
    // igual de mudo y nadie se enteraría.
    const s = seccionFacturasPendientes([fila({}), migrada], 1600);
    expect(s.footnote).toBeDefined();
    expect(s.footnote).toMatch(/se registra en Alegra/i);
  });

  it("sin deuda migrada no hay nota que poner", () => {
    expect(seccionFacturasPendientes([fila({})], 1000).footnote).toBeUndefined();
  });

  it("el TOTAL del papel es el saldo que se le pasa, no una suma inventada", () => {
    const s = seccionFacturasPendientes([fila({}), migrada], 1600);
    expect(s.table.totals?.balance).toBe(1600);
  });
});
