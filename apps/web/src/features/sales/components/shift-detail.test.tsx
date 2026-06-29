// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ShiftDetail } from "@/features/sales/cash-session-detail";
import { ShiftDetailView } from "./shift-detail";

afterEach(cleanup);

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

describe("ShiftDetailView", () => {
  it("muestra el título, el cajero y el dinero esperado en caja", () => {
    render(<ShiftDetailView detail={detail} />);
    expect(screen.getByText("Detalles del turno en curso")).toBeInTheDocument();
    expect(
      screen.getByText("Conoce los movimientos de efectivo en tu turno de caja actual."),
    ).toBeInTheDocument();
    expect(screen.getByText("Dinero esperado en caja")).toBeInTheDocument();
    expect(screen.getByText("Rosa Peralta", { exact: false })).toBeInTheDocument();
  });

  it("muestra las líneas de desglose y la diferencia", () => {
    render(<ShiftDetailView detail={detail} />);
    expect(screen.getByText("Base inicial")).toBeInTheDocument();
    expect(screen.getByText("Ventas en efectivo")).toBeInTheDocument();
    expect(screen.getByText("Ventas por tarjeta")).toBeInTheDocument();
    expect(screen.getByText("Ventas por transferencia")).toBeInTheDocument();
    expect(screen.getByText("Total de movimientos del turno")).toBeInTheDocument();
    expect(screen.getByText("Diferencia")).toBeInTheDocument();
  });
});
