// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import {
  CreatableClassificationSelect,
  type CreatableOption,
} from "./creatable-classification-select";

afterEach(cleanup);

const OPTIONS: CreatableOption[] = [
  { id: "b1", name: "La Roche-Posay" },
  { id: "b2", name: "Avène" },
];

function setup(
  over: Partial<
    React.ComponentProps<typeof CreatableClassificationSelect>
  > = {},
) {
  const onChange = vi.fn();
  const onCreate = vi.fn(async (v: { name: string }) => ({
    ok: true as const,
    item: { id: "new-1", name: v.name },
  }));
  render(
    <CreatableClassificationSelect
      label="Marca"
      value=""
      onChange={onChange}
      options={OPTIONS}
      placeholder="Buscar o seleccionar marca..."
      entityName="marca"
      createTitle="Crear marca"
      createTooltip="Crear marca"
      createdToast="Marca creada correctamente."
      onCreate={onCreate}
      {...over}
    />,
  );
  return { onChange, onCreate };
}

function combobox() {
  return screen.getByRole("combobox");
}

describe("CreatableClassificationSelect — buscador", () => {
  it("permite escribir para buscar y filtra las opciones", () => {
    setup();
    fireEvent.focus(combobox());
    // Todas visibles al abrir.
    expect(screen.getByText("La Roche-Posay")).toBeInTheDocument();
    expect(screen.getByText("Avène")).toBeInTheDocument();
    // Al escribir "ave" solo queda Avène.
    fireEvent.change(combobox(), { target: { value: "ave" } });
    expect(screen.queryByText("La Roche-Posay")).not.toBeInTheDocument();
    expect(screen.getByText("Avène")).toBeInTheDocument();
  });

  it("seleccionar una opción la fija y llama onChange", () => {
    const { onChange } = setup();
    fireEvent.focus(combobox());
    fireEvent.mouseDown(screen.getByText("Avène"));
    expect(onChange).toHaveBeenCalledWith("b2");
  });

  it("sin resultados muestra 'No existe. Puedes crearla con +'", () => {
    setup();
    fireEvent.focus(combobox());
    fireEvent.change(combobox(), { target: { value: "noexiste" } });
    expect(
      screen.getByText(/No existe\. Puedes crearla con \+/i),
    ).toBeInTheDocument();
  });
});

describe("CreatableClassificationSelect — botón + y modal", () => {
  it("el botón + abre el modal de creación", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Crear marca" }));
    expect(screen.getByText("Crear marca")).toBeInTheDocument(); // título modal
    expect(screen.getByLabelText("Nombre *")).toBeInTheDocument();
  });

  it("prellena el nombre del modal con lo que se venía buscando", () => {
    setup();
    fireEvent.focus(combobox());
    fireEvent.change(combobox(), { target: { value: "Eucerin" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear marca" }));
    expect(screen.getByLabelText("Nombre *")).toHaveValue("Eucerin");
  });

  it("crear un registro lo selecciona automáticamente y llama onCreate", async () => {
    const { onChange, onCreate } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Crear marca" }));
    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "Eucerin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name: "Eucerin" }));
    expect(onChange).toHaveBeenCalledWith("new-1");
  });

  it("no permite nombre vacío", () => {
    const { onCreate } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Crear marca" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    expect(screen.getByText("El nombre es obligatorio.")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("no permite un nombre duplicado (case-insensitive)", () => {
    const { onCreate } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Crear marca" }));
    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "  avène  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    expect(
      screen.getByText("Ya existe un registro con ese nombre."),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("muestra el campo extra (País) cuando se configura", () => {
    setup({
      entityName: "laboratorio",
      createTitle: "Crear laboratorio",
      createTooltip: "Crear laboratorio",
      extraFields: [{ key: "country", label: "País", placeholder: "Opcional" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear laboratorio" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("País")).toBeInTheDocument();
  });

  it("traduce un error de duplicado del servidor al mensaje por nombre", async () => {
    const onCreate = vi.fn(async () => ({
      ok: false as const,
      error: "Ya existe un registro con ese valor (duplicado).",
    }));
    setup({ onCreate, options: [] });
    fireEvent.click(screen.getByRole("button", { name: "Crear marca" }));
    fireEvent.change(screen.getByLabelText("Nombre *"), {
      target: { value: "Nuevo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    await waitFor(() =>
      expect(
        screen.getByText("Ya existe un registro con ese nombre."),
      ).toBeInTheDocument(),
    );
  });
});
