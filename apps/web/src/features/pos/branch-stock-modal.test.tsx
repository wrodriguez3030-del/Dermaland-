// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { BranchStockModal } from "./pos-terminal";
import { cacheBranchNames } from "@/features/tenancy/branch-store";
import type { Branch } from "@/types";

const CUTIS = "0a1fd664-ea36-4df0-8634-902eb293a021";
const PRINCIPAL = "00000000-0000-0000-0000-00000000b001";

beforeEach(() => {
  // Simula sucursales reales de Supabase ya cargadas (cache en memoria).
  cacheBranchNames([
    { id: CUTIS, name: "Dermaland Cutis" } as unknown as Branch,
    { id: PRINCIPAL, name: "DermaLand Principal" } as unknown as Branch,
  ]);
});
afterEach(cleanup);

function setup(over: Partial<React.ComponentProps<typeof BranchStockModal>> = {}) {
  const onSwitchBranch = vi.fn();
  const onAddStockHere = vi.fn();
  const onClose = vi.fn();
  render(
    <BranchStockModal
      open
      productName="A-derma Crema DE Ducha Hidratante 500 ML"
      rows={[
        { branchId: PRINCIPAL, available: 30, lots: 1, soon: 0, expired: 0 },
        { branchId: CUTIS, available: 0, lots: 0, soon: 0, expired: 0 },
      ]}
      currentBranchId={CUTIS}
      currentBranchName="Dermaland Cutis"
      onClose={onClose}
      onSwitchBranch={onSwitchBranch}
      onAddStockHere={onAddStockHere}
      {...over}
    />,
  );
  return { onSwitchBranch, onAddStockHere, onClose };
}

describe("BranchStockModal — stock por sucursal + acciones", () => {
  it("muestra el nombre de la sucursal, nunca el UUID", () => {
    setup();
    expect(screen.getAllByText(/DermaLand Principal/).length).toBeGreaterThan(0);
    expect(screen.queryByText(PRINCIPAL)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(PRINCIPAL);
    expect(document.body.textContent).not.toContain(CUTIS);
  });

  it("ofrece los tres botones: cambiar, agregar aquí, transferir", () => {
    setup();
    expect(
      screen.getByRole("button", { name: /Cambiar a DermaLand Principal \(30 unid\.\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Agregar stock aquí — Dermaland Cutis/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Transferir stock/ }),
    ).toBeInTheDocument();
  });

  it("'Cambiar a sucursal con stock' llama onSwitchBranch con el branchId y la cantidad", () => {
    const { onSwitchBranch } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: /Cambiar a DermaLand Principal/ }),
    );
    expect(onSwitchBranch).toHaveBeenCalledWith(PRINCIPAL, 30);
  });

  it("'Agregar stock aquí' llama onAddStockHere", () => {
    const { onAddStockHere } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Agregar stock aquí/ }));
    expect(onAddStockHere).toHaveBeenCalled();
  });

  it("'Transferir stock' enlaza al flujo de transferencias", () => {
    setup();
    const link = screen
      .getByRole("button", { name: /Transferir stock/ })
      .closest("a");
    expect(link).toHaveAttribute("href", "/inventario/transferencias/nueva");
  });

  it("no ofrece 'Cambiar' a la sucursal actual (solo a las que tienen stock)", () => {
    setup();
    // Solo Principal tiene stock; no debe haber botón 'Cambiar a Dermaland Cutis'.
    expect(
      screen.queryByRole("button", { name: /Cambiar a Dermaland Cutis/ }),
    ).not.toBeInTheDocument();
  });
});
