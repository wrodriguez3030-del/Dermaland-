// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ChargeSaleModal } from "./charge-sale-modal";

afterEach(cleanup);

const baseProps = {
  open: true,
  onClose: () => {},
  subtotal: 1000,
  itbis: 180,
  total: 1700,
  billingType: "consumo" as const,
  onConfirm: () => {},
};

const selectMethod = (name: string) =>
  fireEvent.click(screen.getByRole("radio", { name }));

const setAmount = (value: string) =>
  fireEvent.change(screen.getByLabelText("Monto"), { target: { value } });

describe("ChargeSaleModal — campos por método", () => {
  it("1. Tarjeta muestra el campo de últimos 4 con su ayuda", () => {
    render(<ChargeSaleModal {...baseProps} />);
    selectMethod("Tarjeta");
    expect(screen.getByLabelText("Últimos 4 números")).toBeInTheDocument();
    expect(
      screen.getByText("Ingresa los últimos 4 dígitos de la tarjeta."),
    ).toBeInTheDocument();
  });

  it("2. Transferencia muestra el campo de últimos 4 de la referencia", () => {
    render(<ChargeSaleModal {...baseProps} />);
    selectMethod("Transferencia");
    expect(
      screen.getByLabelText("Últimos 4 números de la referencia"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ingresa los últimos 4 dígitos de la referencia o comprobante de transferencia.",
      ),
    ).toBeInTheDocument();
  });

  it("3. Efectivo NO muestra el campo de últimos 4", () => {
    render(<ChargeSaleModal {...baseProps} />);
    selectMethod("Efectivo");
    expect(screen.queryByLabelText(/Últimos 4/)).not.toBeInTheDocument();
  });

  it("4. Otro método muestra referencia opcional y no últimos 4", () => {
    render(<ChargeSaleModal {...baseProps} />);
    selectMethod("Otro método");
    expect(screen.getByLabelText("Referencia")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Últimos 4/)).not.toBeInTheDocument();
  });
});

describe("ChargeSaleModal — validación de últimos 4", () => {
  it("7. el input no acepta letras (las descarta)", () => {
    render(<ChargeSaleModal {...baseProps} />);
    selectMethod("Tarjeta");
    const input = screen.getByLabelText("Últimos 4 números") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12ab" } });
    expect(input.value).toBe("12");
  });

  it("10. Cobrar venta queda deshabilitado si falta últimos 4 en tarjeta", () => {
    render(<ChargeSaleModal {...baseProps} />);
    selectMethod("Tarjeta");
    setAmount("1700");
    expect(
      screen.getByRole("button", { name: "Cobrar venta" }),
    ).toBeDisabled();
  });

  it("Cobrar venta se habilita al completar los 4 dígitos", () => {
    render(<ChargeSaleModal {...baseProps} />);
    selectMethod("Tarjeta");
    setAmount("1700");
    fireEvent.change(screen.getByLabelText("Últimos 4 números"), {
      target: { value: "1234" },
    });
    expect(
      screen.getByRole("button", { name: "Cobrar venta" }),
    ).toBeEnabled();
  });
});

describe("ChargeSaleModal — múltiples pagos", () => {
  it("8. permite varios pagos con diferentes últimos 4 y los confirma", () => {
    const onConfirm = vi.fn();
    render(<ChargeSaleModal {...baseProps} onConfirm={onConfirm} />);

    // Pago 1: Tarjeta RD$1,000, últimos 4 = 1234
    selectMethod("Tarjeta");
    setAmount("1000");
    fireEvent.change(screen.getByLabelText("Últimos 4 números"), {
      target: { value: "1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Agregar pago/ }));

    // Pago 2: Transferencia RD$500, últimos 4 = 9876
    selectMethod("Transferencia");
    setAmount("500");
    fireEvent.change(
      screen.getByLabelText("Últimos 4 números de la referencia"),
      { target: { value: "9876" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Agregar pago/ }));

    // Pago 3: Efectivo RD$200, sin últimos 4
    selectMethod("Efectivo");
    setAmount("200");
    fireEvent.click(screen.getByRole("button", { name: /Agregar pago/ }));

    fireEvent.click(screen.getByRole("button", { name: "Cobrar venta" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const result = onConfirm.mock.calls[0]![0];
    expect(result.payments).toEqual([
      { method: "card", amount: 1000, last4: "1234" },
      { method: "transfer", amount: 500, last4: "9876" },
      { method: "cash", amount: 200 },
    ]);
    expect(result.amountReceived).toBe(1700);
    expect(result.changeAmount).toBe(0);
  });

  it("9. nunca expone el número completo de tarjeta en el resultado", () => {
    const onConfirm = vi.fn();
    render(<ChargeSaleModal {...baseProps} onConfirm={onConfirm} />);
    selectMethod("Tarjeta");
    setAmount("1700");
    // El cajero pega el número completo: el input solo deja los últimos 4.
    fireEvent.change(screen.getByLabelText("Últimos 4 números"), {
      target: { value: "4111111111111234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cobrar venta" }));
    const result = onConfirm.mock.calls[0]![0];
    expect(result.payments[0].last4).toBe("1234");
    expect(JSON.stringify(result)).not.toContain("4111111111111234");
  });
});
