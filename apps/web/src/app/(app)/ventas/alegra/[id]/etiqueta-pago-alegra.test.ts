import { describe, it, expect } from "vitest";
import { etiquetaPagoAlegra } from "./etiqueta-pago-alegra";

/**
 * `etiquetaPagoAlegra` es la única parte pura de este directorio de ruta —
 * el resto (`cargarFacturaMigrada`, la sesión, Supabase) no tiene arnés de
 * pruebas aquí. Valores reales verificados en producción (07/09): `null`
 * (12 879), `credit-card` (1 199), `cash` (885), `debit-card` (6),
 * `credit-sell` (4).
 */
describe("etiquetaPagoAlegra", () => {
  it("cash → efectivo", () => {
    expect(etiquetaPagoAlegra("cash")).toBe("efectivo");
  });

  it("credit-card → tarjeta de crédito", () => {
    expect(etiquetaPagoAlegra("credit-card")).toBe("tarjeta de crédito");
  });

  it("debit-card → tarjeta de débito", () => {
    expect(etiquetaPagoAlegra("debit-card")).toBe("tarjeta de débito");
  });

  it("credit-sell → a crédito (cuenta por cobrar), NO es un pago cobrado", () => {
    expect(etiquetaPagoAlegra("credit-sell")).toBe("a crédito (cuenta por cobrar)");
  });

  it("null → no registrado en Alegra", () => {
    expect(etiquetaPagoAlegra(null)).toBe("no registrado en Alegra");
  });

  it("valor desconocido → no registrado en Alegra (no inventa una etiqueta)", () => {
    expect(etiquetaPagoAlegra("wire-transfer-nuevo")).toBe("no registrado en Alegra");
  });
});
