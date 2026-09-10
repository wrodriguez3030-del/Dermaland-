// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePendingReceivables } from "./components";
import type { ReceivableRow } from "./receivables-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function fila(overrides: Partial<ReceivableRow> = {}): ReceivableRow {
  return {
    id: "p1",
    number: "FAC-1",
    ecfNumber: null,
    customerId: null,
    customerName: "Cliente",
    customerPhone: null,
    branchId: "b1",
    branchName: "Principal",
    sellerName: null,
    cashierName: "Rosa",
    issuedAt: "2026-09-10",
    dueDate: "2026-10-10",
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
    ...overrides,
  } as ReceivableRow;
}

describe("usePendingReceivables", () => {
  it("🔴 al volver a la pestaña, vuelve a pedir /api/receivables — sin esto, una venta a crédito nueva no aparecía hasta recargar la página a mano", async () => {
    let llamadas = 0;
    const fetchMock = vi.fn(async () => {
      llamadas += 1;
      // La 2ª llamada (tras el foco) ya trae la factura nueva.
      const rows = llamadas === 1 ? [] : [fila()];
      return { ok: true, json: async () => ({ rows }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePendingReceivables());

    await waitFor(() => expect(result.current.rows).toEqual([]));
    expect(llamadas).toBe(1);

    // Vuelve a la pestaña: la venta a crédito se hizo en otra pestaña/ruta.
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(result.current.rows).toEqual([fila()]));
    expect(llamadas).toBe(2);
  });
});
