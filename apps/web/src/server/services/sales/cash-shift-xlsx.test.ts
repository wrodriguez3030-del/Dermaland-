import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { generateShiftXlsx, shiftXlsxFilename } from "./cash-shift-xlsx";
import type { ShiftDetail } from "@/features/sales/cash-session-detail";

const detail: ShiftDetail = {
  openedAt: "2026-06-29T13:00:00Z",
  cashierName: "Rosa Peralta",
  branchName: "DermaLand Principal",
  sessionNumber: "CAJA-001",
  openingAmount: 1000,
  totalSales: 1500,
  salesCash: 800,
  salesCard: 500,
  salesTransfer: 200,
  salesOther: 0,
  refundsCash: 0,
  cashIncome: 0,
  cashWithdrawal: 0,
  totalShiftMovements: 2500,
  expectedCash: 1800,
  countedCash: 1750,
  difference: -50,
};

describe("generateShiftXlsx", () => {
  it("genera un .xlsx no vacío y legible con los datos del turno", () => {
    const buf = generateShiftXlsx(detail, {
      businessName: "DermaLand",
      generatedAt: "2026-06-29T15:00:00Z",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);

    // Releer el libro y verificar contenido clave.
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toContain("Turno de caja");
    const ws = wb.Sheets["Turno de caja"]!;
    const text = XLSX.utils.sheet_to_csv(ws);
    expect(text).toContain("Detalle del turno de caja");
    expect(text).toContain("Dinero esperado en caja".toUpperCase());
    expect(text).toContain("Rosa Peralta");
    expect(text).toContain("1,800.00"); // dinero esperado (formato RD$)
  });

  it("nombre de archivo derivado del número de sesión", () => {
    expect(shiftXlsxFilename(detail)).toBe("Turno-CAJA-001.xlsx");
  });
});
