// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CeldaItemsMigrados } from "./celda-items-migrados";
import type { RenglonAlegra } from "./use-renglones-alegra";

/**
 * El dueño pidió ver los ítems de cada compra en la propia tabla, con un «ver
 * más» cuando hay muchos. Antes la columna decía «—» sobre 14 965 facturas
 * migradas: la ficha del cliente no servía para responder «¿qué me llevé la
 * última vez?», que es para lo que se abre.
 */
afterEach(cleanup);

const linea = (n: number, extra: Partial<RenglonAlegra> = {}): RenglonAlegra => ({
  invoiceId: "f1",
  productId: `p${n}`,
  name: `Producto ${n}`,
  quantity: 1,
  total: 100 * n,
  ...extra,
});

describe("CeldaItemsMigrados", () => {
  it("🔴 cuenta los ítems y enseña los dos primeros", () => {
    render(<CeldaItemsMigrados lineas={[linea(1), linea(2), linea(3), linea(4), linea(5)]} cargando={false} />);
    expect(screen.getByText("5 ítems")).toBeInTheDocument();
    expect(screen.getByText(/Producto 1/)).toBeInTheDocument();
    expect(screen.getByText(/Producto 2/)).toBeInTheDocument();
    expect(screen.queryByText(/Producto 3/)).not.toBeInTheDocument();
  });

  it("🔴 «ver más» enseña el resto y vuelve a cerrarse", () => {
    render(<CeldaItemsMigrados lineas={[linea(1), linea(2), linea(3), linea(4), linea(5)]} cargando={false} />);
    fireEvent.click(screen.getByText("ver más (3)"));
    expect(screen.getByText(/Producto 5/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("ver menos"));
    expect(screen.queryByText(/Producto 5/)).not.toBeInTheDocument();
  });

  it("con dos ítems o menos no ofrece «ver más»", () => {
    render(<CeldaItemsMigrados lineas={[linea(1), linea(2)]} cargando={false} />);
    expect(screen.queryByText(/ver más/)).not.toBeInTheDocument();
    expect(screen.getByText("2 ítems")).toBeInTheDocument();
  });

  it("un solo ítem se dice en singular", () => {
    render(<CeldaItemsMigrados lineas={[linea(1)]} cargando={false} />);
    expect(screen.getByText("1 ítem")).toBeInTheDocument();
  });

  it("🔴 mientras carga NO dice «0 ítems»: eso sería afirmar lo que no se sabe", () => {
    render(<CeldaItemsMigrados lineas={[]} cargando />);
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText(/ítem/)).not.toBeInTheDocument();
  });

  it("sin líneas y sin cargar, una raya", () => {
    render(<CeldaItemsMigrados lineas={[]} cargando={false} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("🔴 desplegar no navega: la fila entera es un enlace a la factura", () => {
    const alPulsarLaFila = { llamado: false };
    render(
      <div onClick={() => { alPulsarLaFila.llamado = true; }}>
        <CeldaItemsMigrados lineas={[linea(1), linea(2), linea(3)]} cargando={false} />
      </div>,
    );
    fireEvent.click(screen.getByText("ver más (1)"));
    expect(alPulsarLaFila.llamado, "el clic se propagó y habría sacado al usuario de la ficha").toBe(false);
  });

  it("la cantidad solo se enseña cuando es más de una", () => {
    render(<CeldaItemsMigrados lineas={[linea(1, { quantity: 3 }), linea(2, { quantity: 1 })]} cargando={false} />);
    expect(screen.getByText(/3×/)).toBeInTheDocument();
    expect(screen.queryByText(/1×/)).not.toBeInTheDocument();
  });
});
