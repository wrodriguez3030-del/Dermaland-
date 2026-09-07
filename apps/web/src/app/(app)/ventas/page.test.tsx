// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { formatCurrency } from "@/lib/utils/format";

// La pantalla lee `?period=` con useSearchParams: sin router montado hay que
// mockear next/navigation en el entorno de test.
const searchParams = new URLSearchParams("");
vi.mock("@/features/auth/current-user", () => ({
  useCurrentUser: () => ({ id: "u1", fullName: "Admin", role: "admin", avatarColor: "#000", isPlatformAdmin: false }),
  useCurrentRole: () => "admin",
  CurrentUserProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));
// Cero proformas: es el estado REAL de producción (`proformas` tiene 0 filas)
// y por eso esta pantalla enseñaba RD$0.00 teniendo 48 millones migrados.
vi.mock("@/features/sales/proforma-store", () => ({ useProformas: () => [] }));

import VentasPage from "./page";

afterEach(cleanup);

/** Cifras verificadas contra producción: 14 743 facturas migradas que cuentan. */
const RESUMEN = {
  resumen: {
    total: 48454899.08,
    cantidad: 14743,
    porOrigen: {
      sistema: { total: 0, cantidad: 0 },
      alegra: { total: 48454899.08, cantidad: 14743 },
    },
  },
};

const FACTURA_MIGRADA = {
  id: "a1",
  origen: "alegra",
  numero: "B0100000123",
  fecha: "2026-08-19T00:00:00Z",
  clienteId: null,
  clienteNombre: "MARIA PEREZ",
  total: 1500,
  itbis: 0,
  subtotal: 1500,
  formaPago: null,
  vendedor: "DESTENY REYNOSO",
  sucursalId: null,
  anulada: false,
  estado: "vigente",
  editable: false,
};

/**
 * 🔴 Un BORRADOR de Alegra. `anulada` es `true` —no cuenta para los totales—
 * pero NO está anulada fiscalmente. El sincronizador diario puede traer una
 * (el CHECK de `alegra_invoices.status` lo permite) y esta pantalla es donde
 * aterriza quien pulsa la tarjeta del panel.
 */
const FACTURA_BORRADOR = {
  ...FACTURA_MIGRADA,
  id: "a2",
  numero: "B0100000124",
  clienteNombre: "JUAN GOMEZ",
  total: 750,
  fecha: "2026-08-18T00:00:00Z",
  anulada: true,
  estado: "borrador",
};

/** `/api/ventas` respondiendo bien a sus dos vistas. */
function fetchOk() {
  return vi.fn(async (url: string) => {
    const u = String(url);
    const cuerpo = u.includes("vista=resumen")
      ? RESUMEN
      : { ventas: [FACTURA_MIGRADA, FACTURA_BORRADOR], hayMas: false };
    return { ok: true, status: 200, json: async () => cuerpo };
  });
}

describe("Ventas / Facturas — el histórico migrado de Alegra", () => {
  beforeEach(() => {
    // El panel enlaza aquí con «Ver ventas»; el botón «Ver todas» es
    // `?period=all`, y ahí es donde el dueño seguía leyendo RD$0.00.
    searchParams.set("period", "all");
  });
  afterEach(() => {
    searchParams.delete("period");
    vi.unstubAllGlobals();
  });

  it("🔴 el total cuenta el histórico migrado, no solo las proformas", async () => {
    vi.stubGlobal("fetch", fetchOk());
    render(<VentasPage />);
    // Mientras el histórico está en camino NO se enseña un número: un RD$0.00
    // provisional es exactamente lo que hizo creer que no se había migrado.
    expect(screen.getAllByText("Cargando…").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.getByText(formatCurrency(48454899.08))).toBeInTheDocument(),
    );
    // Y dice cuántas son y de dónde salen: un total que mezcla dos fuentes sin
    // decir cuánto pone cada una no se puede auditar.
    expect(screen.getByText(/todas migradas de Alegra/)).toBeInTheDocument();
  });

  it("🔴 cada venta migrada que se lista lleva su origen visible", async () => {
    vi.stubGlobal("fetch", fetchOk());
    render(<VentasPage />);
    await waitFor(() =>
      expect(screen.getAllByText("Migrada de Alegra").length).toBeGreaterThan(0),
    );
    // Historial de otro sistema: se ve, no se toca.
    expect(screen.getAllByText("Solo lectura").length).toBeGreaterThan(0);
  });

  it("🔴 un borrador migrado NO se pinta como anulada (ni en móvil, que no tiene columna de estado)", async () => {
    // Tachar un importe ES decir «anulada». `anulada` significa «no cuenta
    // para los totales» y también es `true` para un borrador: decidir la
    // pintura con ese campo afirma algo falso sobre un documento fiscal de
    // OTRO sistema. En la tarjeta móvil, además, no hay badge que matice: lo
    // único que vería el usuario sería el tachado, solo.
    vi.stubGlobal("fetch", fetchOk());
    render(<VentasPage />);
    await waitFor(() => expect(screen.getAllByText("Borrador").length).toBeGreaterThan(0));

    // Móvil Y escritorio: las dos filas del borrador dicen su palabra.
    expect(screen.getAllByText("Borrador").length).toBe(2);
    const importes = screen.getAllByText(formatCurrency(750));
    expect(importes.length).toBe(2);
    for (const el of importes) {
      expect(el.className, "el importe de un borrador sale tachado").not.toContain("line-through");
    }
    // Y no hay ninguna anulada en los datos, así que esa palabra no aparece.
    expect(screen.queryByText("Anulada")).toBeNull();
  });

  it("🔴 si el histórico falla, avisa — nunca enseña el cero como si fuera el total", async () => {
    // Es el camino de HOY: `?vista=resumen` responde 400 hasta que se apliquen
    // las migraciones de esta rama.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "La función resumen_ventas_unificadas no existe." }),
      })),
    );
    render(<VentasPage />);
    await waitFor(() =>
      expect(
        screen.getByText(/No se pudo cargar el histórico migrado de Alegra/),
      ).toBeInTheDocument(),
    );
  });
});

describe("Ventas / Facturas — acceso al POS", () => {
  it("muestra el botón 'POS / Nueva venta' que enlaza a /pos", () => {
    render(<VentasPage />);
    const btn = screen.getByText("POS / Nueva venta");
    expect(btn).toBeInTheDocument();
    // El botón vive dentro de un <a href="/pos">.
    const link = btn.closest("a");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("href", "/pos");
    expect(link).toHaveAttribute("aria-label", "Ir a POS / Nueva venta");
  });
});
