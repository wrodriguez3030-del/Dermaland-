// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { todayRD } from "@/features/receivables/aging";
import type { ReceivableRow } from "@/features/receivables/receivables-client";

/**
 * 🔴 Restricción global del plan: «toda venta que se muestre lleva su origen
 * visible». En cuentas por cobrar eso se había cumplido en `pendientes` y
 * `cobros` y se había olvidado en `mora` y en `calendario`, que enseñan deuda
 * que puede ser 100 % del sistema anterior.
 *
 * Lo que está en juego no es cosmético: la encargada llama a un cliente a
 * cobrarle un saldo que se paga en Alegra, y aquí no queda registrado.
 */

const { filas, estadoCuenta } = vi.hoisted(() => ({
  filas: { current: [] as unknown[] },
  estadoCuenta: { current: null as unknown },
}));

vi.mock("@/features/receivables/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/receivables/components")>()),
  usePendingReceivables: () => ({
    rows: filas.current,
    error: null,
    loading: false,
    reload: () => {},
  }),
}));
vi.mock("@/features/receivables/receivables-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/receivables/receivables-client")>()),
  arApi: { statement: async () => estadoCuenta.current },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("cliente=c1"),
}));
vi.mock("@/components/reporting/export-pdf-button", () => ({
  ExportPdfButton: () => null,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"}>{children}</a>
  ),
}));

import MoraPage from "./mora/page";
import CalendarioPage from "./calendario/page";
import EstadosDeCuentaPage from "./estados-de-cuenta/page";

const hoy = todayRD();

const fila = (over: Partial<ReceivableRow>): ReceivableRow =>
  ({
    id: "p1",
    number: "FAC-1",
    ecfNumber: null,
    customerId: "c1",
    customerName: "Ana",
    customerPhone: "8095551234",
    branchId: "b1",
    branchName: "Principal",
    sellerName: null,
    cashierName: "Rosa",
    issuedAt: "2025-01-09",
    dueDate: "2025-01-09",
    creditDays: null,
    overdueDays: 400,
    bucket: "v60",
    total: 1000,
    paid: 400,
    balance: 600,
    status: "open",
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
  motivoNoCobrable: "Factura migrada de Alegra: el cobro se registra en Alegra, no aquí.",
});

afterEach(() => {
  cleanup();
  filas.current = [];
  estadoCuenta.current = null;
});

describe("mora — deuda migrada marcada", () => {
  it("🔴 un cliente cuya mora viene de Alegra sale marcado", () => {
    filas.current = [migrada];
    render(<MoraPage />);
    expect(screen.getByText(/Migrada de Alegra/i)).toBeInTheDocument();
  });

  it("un cliente con mora propia no lleva marca (marcar lo normal es ruido)", () => {
    filas.current = [fila({})];
    render(<MoraPage />);
    expect(screen.queryByText(/Migrada de Alegra/i)).not.toBeInTheDocument();
  });

  it("🔴 y no se le puede registrar el pago desde aquí", () => {
    filas.current = [migrada];
    render(<MoraPage />);
    const boton = screen.getByTitle(/se cobran en Alegra, no aquí/i);
    expect(boton).toBeDisabled();
  });
});

describe("calendario — vencimientos migrados marcados", () => {
  it("🔴 un día cuyo vencimiento es todo de Alegra lo dice", () => {
    filas.current = [{ ...migrada, dueDate: hoy }];
    render(<CalendarioPage />);
    expect(screen.getByText(/migradas de Alegra/i)).toBeInTheDocument();
  });

  it("un día con vencimientos propios no lleva marca", () => {
    filas.current = [{ ...fila({}), dueDate: hoy }];
    render(<CalendarioPage />);
    expect(screen.queryByText(/migradas/i)).not.toBeInTheDocument();
  });

  it("un día mixto dice cuántas son migradas", () => {
    filas.current = [
      { ...fila({}), dueDate: hoy },
      { ...migrada, dueDate: hoy },
    ];
    render(<CalendarioPage />);
    expect(screen.getByText(/^1 migradas$/)).toBeInTheDocument();
  });
});

describe("estado de cuenta en pantalla — deuda migrada marcada", () => {
  const estado = (invoices: ReceivableRow[]) => ({
    client: {
      id: "c1",
      name: "Ana",
      phone: null,
      email: null,
      creditLimit: null,
      creditDays: null,
      creditBlocked: false,
    },
    invoices,
    paidInvoicesCount: 0,
    payments: [],
    saldoTotal: invoices.reduce((s, i) => s + i.balance, 0),
    aging: {
      count: { al_dia: 0, por_vencer: 0, v1_30: 0, v31_60: 0, v60: invoices.length },
      amount: { al_dia: 0, por_vencer: 0, v1_30: 0, v31_60: 0, v60: 0 },
      totalCount: invoices.length,
      totalAmount: 0,
      overdueCount: invoices.length,
      overdueAmount: 0,
    },
    ultimoPago: null,
  });

  it("🔴 la fila de una factura migrada lleva su etiqueta", async () => {
    filas.current = [migrada];
    estadoCuenta.current = estado([migrada]);
    render(<EstadosDeCuentaPage />);
    expect(await screen.findByText(/Migrada de Alegra/i)).toBeInTheDocument();
  });

  it("🔴 y el botón «Cobrar» queda apagado con el motivo a la vista", async () => {
    filas.current = [migrada];
    estadoCuenta.current = estado([migrada]);
    render(<EstadosDeCuentaPage />);
    const boton = await screen.findByTitle(/se cobran en Alegra, no aquí/i);
    expect(boton).toBeDisabled();
  });
});
