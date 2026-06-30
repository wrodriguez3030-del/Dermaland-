// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Laboratory } from "@/types";

const h = vi.hoisted(() => ({
  saveLaboratory: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/features/products/catalog-store", () => ({
  saveLaboratory: h.saveLaboratory,
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: h.toastSuccess, error: h.toastError, Toast: () => null }),
}));

import { LaboratorySelect } from "./laboratory-select";

const LABS: Laboratory[] = [
  { id: "lab1", businessId: "b", name: "ISDIN", country: "España", type: "Dermocosmética", createdAt: "", updatedAt: "" },
  { id: "lab2", businessId: "b", name: "La Roche-Posay", country: "Francia", type: "Dermocosmética", createdAt: "", updatedAt: "" },
  { id: "lab3", businessId: "b", name: "Laboratorios Dr. Collado", country: "República Dominicana", type: "Laboratorio local", createdAt: "", updatedAt: "" },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.saveLaboratory.mockResolvedValue({ ok: true, item: { id: "lab_new", name: "Laboratorio Nuevo" } });
});
afterEach(cleanup);

function combobox() {
  return screen.getByRole("combobox", { name: "Buscar laboratorio" });
}

function setup(value = "") {
  const onChange = vi.fn();
  render(<LaboratorySelect value={value} onChange={onChange} laboratories={LABS} />);
  return { onChange };
}

describe("LaboratorySelect", () => {
  it("1. el buscador inicia vacío aunque haya laboratorio seleccionado", () => {
    setup("lab1"); // ISDIN seleccionado
    expect(combobox()).toHaveValue("");
    // El seleccionado se muestra como chip, no en el input.
    expect(screen.getByText("ISDIN")).toBeInTheDocument();
  });

  it("2. el dropdown es amplio (min 420px, alto 360px) con subtítulo País · Tipo", () => {
    setup();
    fireEvent.focus(combobox());
    const listbox = screen.getByRole("listbox");
    expect(listbox.className).toContain("min-w-[420px]");
    expect(listbox.className).toContain("max-h-[360px]");
    expect(screen.getByText("España · Dermocosmética")).toBeInTheDocument();
    expect(screen.getByText("República Dominicana · Laboratorio local")).toBeInTheDocument();
  });

  it("5. busca por nombre ignorando acentos/mayúsculas", () => {
    setup();
    fireEvent.focus(combobox());
    fireEvent.change(combobox(), { target: { value: "ROCHE" } });
    expect(screen.getByText("La Roche-Posay")).toBeInTheDocument();
    expect(screen.queryByText("ISDIN")).not.toBeInTheDocument();
  });

  it("muestra 'Sin resultados' y la opción de crear cuando no existe", () => {
    setup();
    fireEvent.focus(combobox());
    fireEvent.change(combobox(), { target: { value: "Inexistente ZZZ" } });
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    expect(screen.getByText(/Crear laboratorio/)).toBeInTheDocument();
  });

  it("seleccionar una opción llama onChange y limpia el buscador", () => {
    const { onChange } = setup();
    fireEvent.focus(combobox());
    fireEvent.mouseDown(screen.getByText("La Roche-Posay"));
    expect(onChange).toHaveBeenCalledWith("lab2");
    expect(combobox()).toHaveValue("");
  });

  it("7 y 8. crea un laboratorio desde el modal y lo selecciona automáticamente", async () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Crear laboratorio" }));
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Laboratorio Nuevo" } });
    fireEvent.change(screen.getByLabelText("País"), { target: { value: "República Dominicana" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(h.saveLaboratory).toHaveBeenCalledWith("create", { name: "Laboratorio Nuevo", country: "República Dominicana" }));
    expect(onChange).toHaveBeenCalledWith("lab_new"); // auto-selección
  });

  it("6. no permite crear un laboratorio duplicado (case/acento-insensitive)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Crear laboratorio" }));
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "  isdin  " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    expect(screen.getByText("Este laboratorio ya existe.")).toBeInTheDocument();
    expect(h.saveLaboratory).not.toHaveBeenCalled();
  });

  it("no permite nombre vacío", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Crear laboratorio" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    expect(screen.getByText("El nombre es obligatorio.")).toBeInTheDocument();
    expect(h.saveLaboratory).not.toHaveBeenCalled();
  });

  it("limpiar la selección llama onChange con vacío", () => {
    const { onChange } = setup("lab1");
    fireEvent.click(screen.getByRole("button", { name: "Quitar laboratorio" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("12. no expone ids internos en la UI", () => {
    setup("lab1");
    fireEvent.focus(combobox());
    expect(document.body.textContent).not.toContain("lab1");
    expect(document.body.textContent).not.toContain("lab2");
  });
});
