// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Customer, Proforma } from "@/types";
import type { CustomerProfileState } from "@/features/customers/customer-profile-hooks";

/**
 * Estados de UI del perfil de cliente:
 *  1. loading  → skeleton, NUNCA "Cliente no encontrado".
 *  2. notFound → mensaje amigable SIN UUID técnico.
 *  3. error    → mensaje amigable + botón Reintentar.
 *  4. success  → datos del cliente.
 *
 * Regresión del bug: al abrir un cliente aparecía primero "Cliente no
 * encontrado" con el UUID y luego cargaban los datos.
 */

const UUID = "d76d0d15-815e-4f56-a9ae-7fc21bc58af9";

const { hookState, ventasState } = vi.hoisted(() => ({
  hookState: { current: {} as Partial<CustomerProfileState> },
  // Estado de `/api/ventas?clienteId=…` (las compras migradas de Alegra).
  // Sin esto, la ficha intentaría una petición real en jsdom.
  ventasState: {
    current: { tipo: "listo", datos: { ventas: [] as unknown[], hayMas: false } } as unknown,
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: UUID }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"}>{children}</a>
  ),
}));
vi.mock("@/features/ventas/ventas-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/ventas/ventas-api")>()),
  useListadoVentas: () => ventasState.current,
}));
vi.mock("@/features/customers/customer-profile-hooks", () => ({
  useCustomerProfile: () => ({
    customer: undefined,
    purchases: [] as Proforma[],
    stats: {
      totalSpent: 0,
      purchases: 0,
      avgTicket: 0,
      lastVisitAt: null,
      pendingProformas: 0,
    },
    loading: false,
    notFound: false,
    error: null,
    retry: () => {},
    ...hookState.current,
  }),
}));

import ClienteDetallePage from "./page";

const willian: Customer = {
  id: UUID,
  businessId: "b",
  customerNumber: "CLI-420678",
  firstName: "WILLIAN R",
  lastName: "RODRIGUEZ",
  documentType: "cedula",
  documentNumber: "031-0327428-2",
  phone: "829-714-1975",
  source: "manual",
  tags: [],
  defaultBillingType: "consumo",
  skinType: "normal",
  totalSpent: 0,
  totalOrders: 0,
  consents: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
} as Customer;

afterEach(() => {
  cleanup();
  hookState.current = {};
  ventasState.current = { tipo: "listo", datos: { ventas: [], hayMas: false } };
});

describe("perfil de cliente — estados de carga", () => {
  it("loading: muestra skeleton y NUNCA 'no encontrado' ni el UUID", () => {
    hookState.current = { loading: true };
    render(<ClienteDetallePage />);
    expect(screen.getByTestId("cliente-detalle-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/no encontrado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no encontramos/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(UUID);
  });

  it("notFound real: mensaje amigable, sin UUID, con Volver y Reintentar", () => {
    hookState.current = { loading: false, notFound: true };
    render(<ClienteDetallePage />);
    expect(screen.getByText(/no encontramos este cliente/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(UUID);
    expect(screen.getByText(/volver a clientes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  it("error: mensaje amigable sin jerga técnica + Reintentar", () => {
    hookState.current = {
      loading: false,
      error: "No pudimos cargar la información del cliente. Intenta nuevamente.",
    };
    render(<ClienteDetallePage />);
    expect(
      screen.getByText(/no pudimos cargar la información del cliente/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(UUID);
    expect(document.body.textContent).not.toMatch(/supabase|sql|pgrst|stack/i);
  });

  it("success: muestra el cliente con sus métricas (sin flash de error)", () => {
    hookState.current = {
      customer: willian,
      loading: false,
      stats: {
        totalSpent: 34908,
        purchases: 16,
        avgTicket: 2181.75,
        lastVisitAt: "2026-07-04T10:00:00Z",
        pendingProformas: 0,
      },
    };
    render(<ClienteDetallePage />);
    expect(screen.getByText(/WILLIAN R RODRIGUEZ/i)).toBeInTheDocument();
    expect(screen.queryByText(/no encontrado/i)).not.toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument(); // KPI compras
    expect(document.body.textContent).not.toContain(UUID);
  });
});

/**
 * Las compras migradas de Alegra van en el listado principal, no escondidas en
 * otra pestaña: quien abre la ficha de alguien que lleva años comprando no
 * puede ver «sin compras». Y se ven, pero no se tocan.
 */
describe("perfil de cliente — compras migradas de Alegra", () => {
  const compraAlegra = {
    id: "fac-1",
    origen: "alegra",
    numero: "B0100000123",
    fecha: "2025-03-14",
    clienteId: UUID,
    clienteNombre: "WILLIAN R RODRIGUEZ",
    total: 4500,
    itbis: 0,
    subtotal: 4500,
    formaPago: "cash",
    vendedor: "Laura Mejía",
    sucursalId: null,
    anulada: false,
    editable: false,
  };

  it("una compra de Alegra sale en «Compras» con su etiqueta de origen", () => {
    hookState.current = { customer: willian, loading: false };
    ventasState.current = {
      tipo: "listo",
      datos: { ventas: [compraAlegra], hayMas: false },
    };
    render(<ClienteDetallePage />);
    expect(screen.getByText("B0100000123")).toBeInTheDocument();
    expect(screen.getByText(/Migrada de Alegra/i)).toBeInTheDocument();
    // El contador de la pestaña cuenta las dos fuentes, no solo el sistema.
    expect(screen.getByText(/Compras \(1\)/)).toBeInTheDocument();
  });

  it("🔴 una compra de Alegra no ofrece editar, imprimir ni enviar", () => {
    // Alegra manda y DermaLand solo lee: un botón de enviar sobre historial
    // ajeno haría creer que el documento sale de aquí.
    hookState.current = { customer: willian, loading: false };
    ventasState.current = {
      tipo: "listo",
      datos: { ventas: [compraAlegra], hayMas: false },
    };
    render(<ClienteDetallePage />);
    const fila = screen.getByText("B0100000123").closest("tr");
    expect(fila).not.toBeNull();
    expect(fila!.textContent).toMatch(/Solo lectura/i);
    // Ni un enlace ni un botón en toda la fila: nada que abrir, editar,
    // imprimir o enviar.
    expect(fila!.querySelectorAll("a, button")).toHaveLength(0);
  });

  it("si el histórico no carga, lo dice en vez de enseñar una lista corta", () => {
    hookState.current = { customer: willian, loading: false };
    ventasState.current = { tipo: "error", mensaje: "fallo" };
    render(<ClienteDetallePage />);
    expect(
      screen.getByText(/No se pudieron cargar las compras migradas de Alegra/i),
    ).toBeInTheDocument();
  });
});
