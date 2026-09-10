// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReceivableRow } from "./receivables-client";

/**
 * 🔴 El modal de cobro es el ÚNICO sitio por el que pasa un pago, lo abra la
 * pantalla que lo abra (pendientes, cobros, mora, estados de cuenta). Aquí se
 * comprueba que una factura migrada de Alegra nunca llega al servidor y que el
 * motivo se ve: si el pago se registrara en DermaLand y no en Alegra, los dos
 * sistemas dejarían de cuadrar.
 */

type EnvioCobro = { items: { proformaId: string; amount: number }[]; method: string };
const collect = vi.fn(async (_entrada: EnvioCobro) => ({ applied: [], totalApplied: 0 }));

vi.mock("./receivables-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./receivables-client")>()),
  arApi: { collect: (entrada: EnvioCobro) => collect(entrada) },
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({
    show: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    Toast: () => null,
  }),
}));

import { CollectModal } from "./components";

const fila = (over: Partial<ReceivableRow>): ReceivableRow =>
  ({
    id: "p1",
    number: "FAC-1",
    ecfNumber: null,
    customerId: "c1",
    customerName: "Ana",
    customerPhone: null,
    branchId: "b1",
    branchName: "Principal",
    sellerName: null,
    cashierName: "Rosa",
    issuedAt: "2026-09-01",
    dueDate: "2026-09-30",
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
    ...over,
  }) as ReceivableRow;

const migrada = fila({
  id: "a1",
  number: "B0100000123",
  origen: "alegra",
  cobrable: false,
  motivoNoCobrable:
    "Factura migrada de Alegra: el cobro se registra en Alegra, no aquí. Si se aplicara desde DermaLand, los dos sistemas dejarían de cuadrar.",
  balance: 600,
});

beforeEach(() => collect.mockClear());
afterEach(cleanup);

describe("modal de cobro con facturas migradas de Alegra", () => {
  it("enseña el motivo por el que una migrada no se puede cobrar", () => {
    render(<CollectModal open invoices={[migrada]} onClose={() => {}} onDone={() => {}} />);
    expect(screen.getByText(/dejarían de cuadrar/i)).toBeInTheDocument();
    expect(screen.getByText(/B0100000123/)).toBeInTheDocument();
    expect(screen.getByText(/No hay ninguna factura cobrable/i)).toBeInTheDocument();
  });

  it("🔴 con solo una migrada, no se puede registrar el cobro", () => {
    render(<CollectModal open invoices={[migrada]} onClose={() => {}} onDone={() => {}} />);
    const boton = screen.getByRole("button", { name: /Registrar cobro/i });
    expect(boton).toBeDisabled();
    fireEvent.click(boton);
    expect(collect).not.toHaveBeenCalled();
  });

  it("🔴 en un lote mixto solo viaja la del sistema, y la migrada se avisa", async () => {
    // El fallo que esto cierra: una pantalla que pasa el listado entero sin
    // filtrar y el modal mandando la migrada al servidor con el resto.
    render(
      <CollectModal open invoices={[fila({}), migrada]} onClose={() => {}} onDone={() => {}} />,
    );
    expect(screen.getByText(/no se puede cobrar desde DermaLand/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Registrar cobro/i }));
    expect(collect).toHaveBeenCalledTimes(1);
    const enviado = collect.mock.calls[0]![0];
    expect(enviado.items.map((i) => i.proformaId)).toEqual(["p1"]);
  });

  it("un cobro solo del sistema se comporta como siempre", () => {
    render(<CollectModal open invoices={[fila({})]} onClose={() => {}} onDone={() => {}} />);
    expect(screen.queryByText(/no se puede cobrar desde DermaLand/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Registrar cobro/i }));
    expect(collect).toHaveBeenCalledTimes(1);
  });
});

/**
 * 🔴 "Al registrar un cobro el modal debe ser igual al de cobro de venta"
 * (pedido del dueño, 10/09/2026): mismo patrón de tarjetas por método que
 * `ChargeSaleModal` del POS, y la MISMA validación de últimos 4 dígitos para
 * tarjeta/transferencia — reutilizando `features/pos/payment-validation.ts`,
 * no una copia.
 */
describe("modal de cobro — mismo patrón que «Cobrar venta» del POS", () => {
  it("el método se elige con tarjetas (radiogroup), no con un <select>", () => {
    render(<CollectModal open invoices={[fila({})]} onClose={() => {}} onDone={() => {}} />);
    const grupo = screen.getByRole("radiogroup", { name: /Método de pago/i });
    expect(grupo).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Efectivo/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Tarjeta/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Transferencia/i })).toBeInTheDocument();
  });

  it("al elegir Tarjeta, pide los últimos 4 dígitos y bloquea «Registrar cobro» hasta que sean válidos", () => {
    render(<CollectModal open invoices={[fila({})]} onClose={() => {}} onDone={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /Tarjeta/i }));
    const boton = screen.getByRole("button", { name: /Registrar cobro/i });
    expect(boton).toBeDisabled();

    const last4 = screen.getByLabelText(/Últimos 4 números/i);
    fireEvent.change(last4, { target: { value: "12" } });
    expect(boton).toBeDisabled();

    fireEvent.change(last4, { target: { value: "1234" } });
    expect(boton).not.toBeDisabled();
  });

  it("con Tarjeta y últimos 4 válidos, el cobro viaja con esos 4 dígitos como referencia", () => {
    render(<CollectModal open invoices={[fila({})]} onClose={() => {}} onDone={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /Tarjeta/i }));
    fireEvent.change(screen.getByLabelText(/Últimos 4 números/i), { target: { value: "4242" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar cobro/i }));
    expect(collect).toHaveBeenCalledTimes(1);
    const enviado = collect.mock.calls[0]![0] as EnvioCobro & { reference?: string };
    expect(enviado.method).toBe("card");
    expect(enviado.reference).toBe("4242");
  });

  it("con Efectivo (no exige últimos 4), «Registrar cobro» sigue habilitado", () => {
    render(<CollectModal open invoices={[fila({})]} onClose={() => {}} onDone={() => {}} />);
    expect(screen.getByRole("button", { name: /Registrar cobro/i })).not.toBeDisabled();
  });
});
