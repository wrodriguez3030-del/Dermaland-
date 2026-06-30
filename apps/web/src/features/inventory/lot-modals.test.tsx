// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// Mocks de stores (módulo) — el modal integra el combobox real de laboratorios.
const h = vi.hoisted(() => ({
  addLotAnywhere: vi.fn(),
  setProductLaboratoryAnywhere: vi.fn(),
  saveLaboratory: vi.fn(),
  useProduct: vi.fn(),
  useLaboratoriesList: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/features/inventory/lot-store", () => ({
  addLotAnywhere: h.addLotAnywhere,
  adjustStockAnywhere: vi.fn(),
  expiryError: () => null,
}));
vi.mock("@/features/tenancy/branch-store", () => ({
  useActiveBranches: () => [{ id: "br1", name: "Sucursal Principal" }],
  defaultWarehouseForBranch: () => "wh1",
  resolveBranchName: () => "Sucursal Principal",
}));
vi.mock("@/features/products/catalog-store", () => ({
  useLaboratoriesList: h.useLaboratoriesList,
  saveLaboratory: h.saveLaboratory,
}));
vi.mock("@/features/products/product-store", () => ({
  useProduct: h.useProduct,
  setProductLaboratoryAnywhere: h.setProductLaboratoryAnywhere,
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: h.toastSuccess, error: h.toastError, Toast: () => null }),
}));

import { NewLotModal } from "./lot-modals";

const LABS = [
  { id: "lab1", name: "ISDIN" },
  { id: "lab2", name: "La Roche-Posay" },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.useLaboratoriesList.mockReturnValue(LABS);
  h.useProduct.mockReturnValue({ id: "prod1", name: "Crema", laboratoryId: undefined });
  h.addLotAnywhere.mockResolvedValue({ ok: true, lot: { currentQuantity: 24, lotNumber: "L1" } });
  h.setProductLaboratoryAnywhere.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

function openModal(props: Record<string, unknown> = {}) {
  render(
    <NewLotModal open onClose={() => {}} productId="prod1" productName="Crema" {...props} />,
  );
}

function labCombobox() {
  return screen.getByRole("combobox", { name: "Buscar o seleccionar laboratorio" });
}

function fillRequired() {
  fireEvent.change(document.querySelector("select")!, { target: { value: "br1" } });
  fireEvent.change(screen.getByPlaceholderText("LRP24A"), { target: { value: "L1" } });
  fireEvent.change(screen.getByPlaceholderText("24"), { target: { value: "24" } });
  fireEvent.change(document.querySelector('input[type="date"]')!, {
    target: { value: "2027-01-01" },
  });
}

describe("NewLotModal — Laboratorio", () => {
  it("1. muestra 'Laboratorio' y NO 'Proveedor'", () => {
    openModal();
    expect(screen.getByText("Laboratorio")).toBeInTheDocument();
    expect(screen.queryByText("Proveedor")).not.toBeInTheDocument();
  });

  it("2. carga los laboratorios existentes en el buscador", () => {
    openModal();
    fireEvent.focus(labCombobox());
    expect(screen.getByText("ISDIN")).toBeInTheDocument();
    expect(screen.getByText("La Roche-Posay")).toBeInTheDocument();
  });

  it("3. el buscador filtra los laboratorios", () => {
    openModal();
    fireEvent.focus(labCombobox());
    fireEvent.change(labCombobox(), { target: { value: "isd" } });
    expect(screen.getByText("ISDIN")).toBeInTheDocument();
    expect(screen.queryByText("La Roche-Posay")).not.toBeInTheDocument();
  });

  it("4 y 8. seleccionar laboratorio y guardar actualiza el laboratorio del producto", async () => {
    openModal(); // producto sin laboratorio
    fillRequired();
    fireEvent.focus(labCombobox());
    fireEvent.mouseDown(screen.getByText("ISDIN"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar stock" }));
    await waitFor(() => expect(h.addLotAnywhere).toHaveBeenCalled());
    expect(h.addLotAnywhere.mock.calls[0]![0]).toMatchObject({
      productId: "prod1",
      branchId: "br1",
      lotNumber: "L1",
      initialQuantity: 24,
    });
    await waitFor(() =>
      expect(h.setProductLaboratoryAnywhere).toHaveBeenCalledWith("prod1", "lab1"),
    );
  });

  it("5. ofrece el botón '+ Agregar laboratorio' que abre el alta rápida", () => {
    openModal();
    fireEvent.click(screen.getByRole("button", { name: "Agregar laboratorio" }));
    expect(screen.getByText("Nuevo laboratorio")).toBeInTheDocument(); // título del modal
    expect(screen.getByLabelText("Nombre *")).toBeInTheDocument();
  });

  it("7. si el producto ya tiene laboratorio, aparece preseleccionado", () => {
    h.useProduct.mockReturnValue({ id: "prod1", name: "Crema", laboratoryId: "lab1" });
    openModal();
    expect(labCombobox()).toHaveValue("ISDIN");
  });

  it("9. guarda el stock y muestra confirmación", async () => {
    openModal();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Guardar stock" }));
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalled());
    expect(h.addLotAnywhere).toHaveBeenCalledTimes(1);
    // Sin laboratorio elegido y producto sin laboratorio → no se toca el producto.
    expect(h.setProductLaboratoryAnywhere).not.toHaveBeenCalled();
  });

  it("no actualiza el producto si el laboratorio no cambió", async () => {
    h.useProduct.mockReturnValue({ id: "prod1", name: "Crema", laboratoryId: "lab1" });
    openModal();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Guardar stock" }));
    await waitFor(() => expect(h.addLotAnywhere).toHaveBeenCalled());
    expect(h.setProductLaboratoryAnywhere).not.toHaveBeenCalled();
  });

  it("12. no expone UUIDs/ids internos en la UI", () => {
    h.useProduct.mockReturnValue({ id: "prod1", name: "Crema", laboratoryId: "lab1" });
    openModal();
    fireEvent.focus(labCombobox());
    expect(document.body.textContent).not.toContain("lab1");
    expect(document.body.textContent).not.toContain("prod1");
  });
});
