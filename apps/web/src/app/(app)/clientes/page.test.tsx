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

/**
 * 🔴 Se simula el hook que la pantalla usa DE VERDAD. Antes aquí se simulaba
 * `useCustomersReport`, y cuando la pantalla pasó a pedir la página al servidor
 * (`usePaginaClientes`), esta prueba siguió en VERDE sin tocar el camino real:
 * pintaba una tabla vacía y comprobaba textos que no dependen de las filas.
 *
 * Una prueba que pasa con el código cambiado por debajo no protege nada. La
 * cazó comprobar a mano quién consume qué, no la suite.
 */
/** Cada prueba puede pisar esto para simular carga / error / vacío real. */
let respuestaClientes: {
  filas: CustomerMetricsRow[];
  total: number;
  cargando: boolean;
  error: string | null;
} = { filas: FILAS, total: FILAS.length, cargando: false, error: null };

vi.mock("@/features/customers/use-pagina-clientes", () => ({
  usePaginaClientes: () => respuestaClientes,
}));

import ClientesPage from "./page";

afterEach(() => {
  cleanup();
  respuestaClientes = { filas: FILAS, total: FILAS.length, cargando: false, error: null };
});

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

/**
 * 🔴 Estas pruebas existen porque las de arriba pasaban en verde con el hook
 * equivocado simulado: no tocaban las FILAS. Estas sí — si la pantalla dejara
 * de pintar lo que el servidor le manda, se ponen rojas.
 */
describe("Clientes — la tabla pinta lo que manda el servidor", () => {
  it("🔴 el cliente que devuelve el servidor aparece en la tabla", () => {
    render(<ClientesPage />);
    // Si la pantalla dejara de pintar `filas`, esto se pone rojo.
    expect(screen.getAllByText(/MARIA/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PEREZ/i).length).toBeGreaterThan(0);
  });

  it("🔴 no dice «sin clientes» cuando el servidor devolvió filas", () => {
    render(<ClientesPage />);
    expect(screen.queryByText(/no hay clientes|sin clientes/i)).not.toBeInTheDocument();
  });
});

/**
 * 🔴 "AGREGAR ESTADO DE CARGA, ERROR Y CONTENIDO VACÍO" (pedido del dueño,
 * 10/09/2026): la pantalla ignoraba `consulta.error` por completo — si la
 * petición al servidor fallaba, se veía IGUAL que "no hay clientes" (mismo
 * texto), justo lo que el propio hook `usePaginaClientes` advierte en su
 * comentario que hay que evitar. Tampoco había ningún indicador de carga en
 * el cuerpo de la pantalla (solo la palabra "Cargando…" en el encabezado).
 */
describe("Clientes — estados de carga, error y vacío", () => {
  it("mientras carga, no dice «sin clientes»", () => {
    respuestaClientes = { filas: [], total: 0, cargando: true, error: null };
    render(<ClientesPage />);
    expect(screen.queryByText(/sin clientes/i)).not.toBeInTheDocument();
  });

  it("con error del servidor, enseña el error — no «sin clientes»", () => {
    respuestaClientes = {
      filas: [],
      total: 0,
      cargando: false,
      error: "No se pudieron cargar los clientes.",
    };
    render(<ClientesPage />);
    expect(screen.getByText("No se pudieron cargar los clientes.")).toBeInTheDocument();
    expect(screen.queryByText(/^sin clientes/i)).not.toBeInTheDocument();
  });

  it("sin carga, sin error y sin filas, enseña el vacío real (no el mensaje de error)", () => {
    respuestaClientes = { filas: [], total: 0, cargando: false, error: null };
    render(<ClientesPage />);
    expect(screen.getByText(/sin clientes/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/no se pudieron cargar/i),
    ).not.toBeInTheDocument();
  });
});

describe("Clientes — entrada a Unificar clientes", () => {
  it("el botón «Unificar clientes» aparece para un admin y enlaza a /clientes/unificar", () => {
    render(<ClientesPage />);
    const link = screen.getByRole("link", { name: /unificar clientes/i });
    expect(link).toHaveAttribute("href", "/clientes/unificar");
  });
});
