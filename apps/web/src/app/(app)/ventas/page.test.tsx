// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { formatCurrency } from "@/lib/utils/format";
import type { Proforma } from "@/types";

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
// Por defecto, cero proformas: es el estado REAL de producción (`proformas`
// tiene 0 filas) y por eso esta pantalla enseñaba RD$0.00 teniendo 48 millones
// migrados. Una prueba lo cambia para el caso de la venta anulada.
let proformas: Proforma[] = [];
vi.mock("@/features/sales/proforma-store", () => ({ useProformas: () => proformas }));

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

/**
 * Factura emitida del sistema (NCF): lo que `isInvoiceDocument` deja pasar.
 *
 * `estado` va como `string` a propósito: `voided` es un estado EXTENDIDO de la
 * base que no está en el union TS `ProformaStatus` (lo documenta
 * `isExcludedStatus`), y es justo el que llega de una anulación real del punto
 * de venta. Tiparlo estrecho dejaría el caso de verdad fuera de la prueba.
 */
function factura(o: Omit<Partial<Proforma>, "status"> & { status: string }): Proforma {
  return {
    businessId: "b",
    branchId: "br1",
    customerName: "CLIENTE",
    cashierId: "u",
    cashierName: "Rosa",
    items: [],
    subtotal: 0,
    discount: 0,
    itbis: 0,
    paid: 0,
    balance: 0,
    documentKind: "invoice",
    payments: [],
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
    ...o,
  } as Proforma;
}

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
    proformas = [];
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
    // Y no hay ninguna anulada en los datos, así que esa palabra no aparece
    // en ninguna fila — el filtro «Estado» sí trae la opción en su lista
    // estática, y esa no cuenta: no es una afirmación sobre esta venta.
    expect(screen.queryByText("Anulada", { ignore: "option" })).toBeNull();
  });

  it("🔴 una venta ANULADA del sistema no suma al total (restricción dura)", async () => {
    // `isInvoiceDocument` clasifica por tipo de documento y NO mira `status`
    // jamás, así que la lista trae también las anuladas. Desde que esta
    // pantalla presenta el mismo número que el panel, sumarlas la haría decir
    // MÁS que el panel sin que ninguna de las dos dijera por qué.
    proformas = [
      factura({ id: "p1", number: "B0200000001", status: "paid", total: 1000, itbis: 100 }),
      factura({ id: "p2", number: "B0200000002", status: "voided", total: 5000, itbis: 500 }),
      factura({ id: "p3", number: "B0200000003", status: "cancelled", total: 3000, itbis: 300 }),
    ];
    vi.stubGlobal("fetch", fetchOk());
    render(<VentasPage />);
    await waitFor(() =>
      expect(screen.getByText(formatCurrency(1000 + 48454899.08))).toBeInTheDocument(),
    );
    // Ni los RD$5 000 `voided` ni los RD$3 000 `cancelled` están en el total.
    expect(screen.queryByText(formatCurrency(9000 + 48454899.08))).toBeNull();
    // El ITBIS «(sistema)» tampoco los cuenta.
    expect(screen.getByText(formatCurrency(100))).toBeInTheDocument();
    // Pero las filas SIGUEN listadas, y la pantalla dice cuántas no cuentan.
    expect(screen.getAllByText("B0200000002").length).toBeGreaterThan(0);
    expect(screen.getByText(/2 listadas no cuentan para el total/)).toBeInTheDocument();
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

describe("Ventas / Facturas — panel de filtros", () => {
  afterEach(() => {
    proformas = [];
    vi.unstubAllGlobals();
  });

  it("arranca con el rango en HOY (Desde y Hasta con la fecha de hoy)", () => {
    const d = new Date();
    const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    render(<VentasPage />);
    expect(screen.getAllByDisplayValue(hoy)).toHaveLength(2);
  });

  it("🔴 el pellizco «Todo» quita el rango de hoy y trae el histórico completo", async () => {
    vi.stubGlobal("fetch", fetchOk());
    render(<VentasPage />);
    fireEvent.click(screen.getByText("Todo"));
    await waitFor(() =>
      expect(screen.getByText(formatCurrency(48454899.08))).toBeInTheDocument(),
    );
  });

  it("🔴 un filtro que /api/ventas no sabe aplicar excluye el histórico y lo dice", async () => {
    vi.stubGlobal("fetch", fetchOk());
    render(<VentasPage />);
    fireEvent.click(screen.getByText("Todo"));
    await waitFor(() =>
      expect(screen.getByText(/todas migradas de Alegra/)).toBeInTheDocument(),
    );
    // Con el histórico participando, sus filas SÍ están en la tabla.
    await waitFor(() =>
      expect(screen.getAllByText("Migrada de Alegra").length).toBeGreaterThan(0),
    );

    // "Cliente" es uno de los filtros que la ruta `/api/ventas` no sabe
    // aplicar (solo filtra por fecha, sucursal y cliente por ID, no por texto
    // libre) — sumar el histórico SIN filtrar a un sistema filtrado daría un
    // número que nadie podría cuadrar.
    fireEvent.change(screen.getByPlaceholderText(/Nombre, teléfono, cédula/), {
      target: { value: "cualquiera" },
    });

    await waitFor(() =>
      expect(
        screen.getByText(/El histórico migrado no se puede filtrar por Cliente/),
      ).toBeInTheDocument(),
    );
    // 🔴 El hook deja de pedir pero conserva su última respuesta: sin una
    // guarda explícita, la tabla seguiría enseñando esas filas VIEJAS de
    // Alegra justo debajo del aviso que dice que no participan.
    expect(screen.queryByText("Migrada de Alegra")).toBeNull();
  });
});
