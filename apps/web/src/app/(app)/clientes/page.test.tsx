// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Customer } from "@/types";
import type { CustomerMetricsRow } from "@/features/customers/customer-metrics";
import { ALCANCE_TOTAL_GASTADO } from "@/features/customers/alcance-total-gastado";

/**
 * 🔴 «Total gastado» decía DOS cosas distintas a dos clics de distancia.
 *
 * La ficha del cliente suma las ventas del sistema Y las migradas de Alegra;
 * este listado sale de `computeCustomerPurchaseStats`, que solo mira
 * `proformas` — y `proformas` tiene 0 filas en producción. Un cliente con 172
 * facturas migradas aparecía aquí con «Total gastado RD$0.00» y en su ficha con
 * RD$X, bajo la MISMA etiqueta y sin una palabra que lo explicara.
 *
 * Traer el histórico aquí exigiría el gasto migrado POR CLIENTE (un agregado
 * agrupado por `client_id` sobre 14 965 facturas: función SQL nueva, o
 * descargar las filas al navegador). Mientras eso no exista, la regla de la
 * casa manda: si el número se queda corto, LO DICE.
 */
const searchParams = new URLSearchParams("");
// El listado gatea editar/borrar por rol: sin este mock el árbol revienta al
// pedir el usuario actual fuera de su proveedor.
vi.mock("@/features/auth/current-user", () => ({
  useCurrentUser: () => ({ fullName: "Dario", role: "admin" }),
  useCurrentRole: () => "admin",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  // Lo buscado vive en la URL para que el «Atrás» devuelva la búsqueda intacta.
  usePathname: () => "/clientes",
}));

const CLIENTE = {
  id: "c1",
  businessId: "b",
  customerNumber: "CLI-000001",
  firstName: "MARIA",
  lastName: "PEREZ",
  source: "manual",
  tags: [],
  defaultBillingType: "consumo",
  skinType: "normal",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  consents: [],
} as unknown as Customer;

/** Cliente con 172 compras migradas: aquí cuenta 0 porque no hay proformas. */
const FILAS: CustomerMetricsRow[] = [
  {
    customer: CLIENTE,
    stats: {
      totalSpent: 0,
      purchases: 0,
      avgTicket: 0,
      lastVisitAt: null,
      pendingProformas: 0,
    },
  },
];

vi.mock("@/features/customers/customer-profile-hooks", () => ({
  useCustomersReport: () => ({ rows: FILAS, loading: false, error: null, retry: vi.fn() }),
}));

import ClientesPage from "./page";

afterEach(cleanup);

describe("Clientes — qué cuenta «Total gastado»", () => {
  it("🔴 dice en pantalla qué cuenta el «Total gastado»", () => {
    render(<ClientesPage />);
    // Contra el literal, no contra la constante: si la frase se vacía o se
    // queda sin la parte que importa, esta prueba se pone roja igual.
    const aviso = screen.getByText(/histórico migrado de Alegra/);
    expect(aviso).toBeInTheDocument();
    expect(aviso.textContent).toContain("suma las ventas del sistema y el histórico migrado");
    expect(ALCANCE_TOTAL_GASTADO).toBe(aviso.textContent);
  });

  it("🔴 la columna se llama igual que en la ficha, el Excel y el PDF", () => {
    render(<ClientesPage />);
    // 🔴 Ahora las tres pantallas cuentan LO MISMO —el listado suma el histórico
    // migrado desde `metricas_clientes_alegra`—, así que la etiqueta vuelve a
    // ser la simple. El «(sistema)» de antes era el aviso de una discrepancia
    // que ya no existe, y un aviso falso estorba más que ayuda.
    // El encabezado de la columna, no el párrafo de arriba (que también la
    // nombra): se busca dentro de la cabecera de la tabla.
    const encabezados = screen.getAllByRole("columnheader").map((c) => c.textContent ?? "");
    expect(encabezados.some((h) => h.includes("Total gastado"))).toBe(true);
    expect(encabezados.some((h) => h.includes("(sistema)"))).toBe(false);
  });
});
