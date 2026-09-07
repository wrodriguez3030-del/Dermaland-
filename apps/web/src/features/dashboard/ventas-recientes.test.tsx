// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import { VentasRecientes, ventasRecientes } from "./ventas-recientes";
import type { VentaUnificada } from "@/features/ventas/venta-unificada";
import type { Proforma } from "@/types";

/**
 * 🔴 «Ventas recientes» decía «Aún no hay ventas registradas hoy» con el
 * histórico migrado delante, por la misma causa que las otras cuatro
 * tarjetas: sólo miraba `proformas`, que tiene 0 filas.
 *
 * Además de que las ventas SALGAN, aquí se protege lo que no puede pasar:
 * que una factura de Alegra se pueda abrir para editarla. Alegra manda y
 * DermaLand solo lee.
 */

/** Facturas migradas, tal como responde `GET /api/ventas?vista=listado`. */
const MIGRADAS = [
  {
    id: "a1",
    origen: "alegra",
    numero: "B0100000123",
    fecha: "2026-09-05",
    clienteId: "c1",
    clienteNombre: "María Fernández",
    total: 4850,
    itbis: 739.83,
    subtotal: 4110.17,
    formaPago: "cash",
    vendedor: "LAURA MEJIA",
    sucursalId: "b-villa",
    anulada: false,
    estado: "vigente",
    editable: false,
  },
  {
    id: "a2",
    origen: "alegra",
    numero: "B0100000122",
    fecha: "2026-09-04",
    clienteId: null,
    clienteNombre: null,
    total: 1450,
    itbis: 221.19,
    subtotal: 1228.81,
    formaPago: "debit-card",
    vendedor: null,
    sucursalId: "b-princ",
    anulada: false,
    estado: "vigente",
    editable: false,
  },
];

/** Una proforma del sistema, ya cobrada. */
function proforma(over: Partial<Proforma> = {}): Proforma {
  return {
    id: "p1",
    number: "F-0001",
    customerName: "Cliente del sistema",
    cashierId: "u1",
    cashierName: "Cajero",
    sellerName: "Rosa Peralta",
    items: [],
    subtotal: 1000,
    discount: 0,
    itbis: 0,
    total: 1000,
    status: "paid",
    payments: [],
    paid: 1000,
    balance: 0,
    businessId: "b",
    branchId: "b-villa",
    createdAt: "2026-09-06T14:00:00.000Z",
    updatedAt: "2026-09-06T14:00:00.000Z",
    ...over,
  } as Proforma;
}

/**
 * 🔴 El falso LEE la URL: solo devuelve facturas si la petición trae el
 * `sucursalId` que el panel tiene puesto. Cuando ignoraba la URL, se podía
 * borrar ese filtro de la petición y las 281 pruebas seguían en verde — con el
 * panel en «Villa Olga», la tarjeta habría listado facturas de Principal.
 */
const fetchDelHistorico = (ventas: unknown[] = MIGRADAS, sucursalEsperada = SUCURSAL) =>
  vi.fn((url: string) => {
    const p = new URL(url, "http://x").searchParams;
    const pedidas = p.get("sucursalId") === sucursalEsperada ? ventas : [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ventas: pedidas, hayMas: false }),
    });
  });

/** La sucursal que el panel tiene filtrada en estas pruebas. */
const SUCURSAL = "b-villa";

function pintar(over: Partial<React.ComponentProps<typeof VentasRecientes>> = {}) {
  return render(
    <VentasRecientes
      ventasDelSistema={[]}
      filtros={{ desde: "2026-09-01", hasta: "2026-09-30", sucursalId: SUCURSAL }}
      historicoParticipa
      {...over}
    />,
  );
}

/** La lista de la tarjeta. */
const lista = () => screen.getByRole("list");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ventasRecientes (la regla, sin DOM)", () => {
  const v = (id: string, fecha: string, origen: "sistema" | "alegra"): VentaUnificada => ({
    id,
    origen,
    numero: id,
    fecha,
    clienteId: null,
    clienteNombre: null,
    total: 1,
    itbis: 0,
    subtotal: 1,
    formaPago: null,
    vendedor: null,
    sucursalId: null,
    anulada: false,
    estado: "vigente",
    editable: origen === "sistema",
  });

  it("🔴 intercala las dos fuentes por fecha, de la más nueva a la más vieja", () => {
    const r = ventasRecientes(
      [v("s1", "2026-09-06T14:00:00.000Z", "sistema")],
      [v("a1", "2026-09-07", "alegra"), v("a2", "2026-09-01", "alegra")],
    );
    expect(r.map((x) => x.id)).toEqual(["a1", "s1", "a2"]);
  });

  it("corta en las que caben en la tarjeta", () => {
    const muchas = Array.from({ length: 20 }, (_, i) =>
      v(`a${i}`, `2026-09-${String(i + 1).padStart(2, "0")}`, "alegra"),
    );
    expect(ventasRecientes([], muchas)).toHaveLength(8);
    expect(ventasRecientes([], muchas, 3)).toHaveLength(3);
  });

  it("dos ventas del mismo instante salen siempre en el mismo orden", () => {
    const a = v("a", "2026-09-05", "alegra");
    const b = v("b", "2026-09-05", "alegra");
    expect(ventasRecientes([], [a, b]).map((x) => x.id)).toEqual(["a", "b"]);
    expect(ventasRecientes([], [b, a]).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("«Ventas recientes» en pantalla", () => {
  it("🔴 con `proformas` vacía enseña el histórico migrado, no el texto de vacío", async () => {
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    await waitFor(() =>
      expect(within(lista()).getByText(/B0100000123 · María Fernández/)).toBeInTheDocument(),
    );
    expect(within(lista()).getByText("RD$4,850.00")).toBeInTheDocument();
    expect(within(lista()).getByText("RD$1,450.00")).toBeInTheDocument();
    expect(
      screen.queryByText("Aún no hay ventas registradas en el período."),
    ).not.toBeInTheDocument();
  });

  it("🔴 cada fila migrada lleva su etiqueta de origen", async () => {
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    await waitFor(() => expect(within(lista()).getAllByText("Migrada de Alegra")).toHaveLength(2));
  });

  it("🔴 una factura de Alegra NO enlaza a ningún sitio donde se pueda editar", async () => {
    // Alegra manda y DermaLand solo lee: si esta fila fuera un enlace a
    // /ventas/<id>, alguien «anularía» desde aquí una factura que en Alegra
    // sigue viva y los dos sistemas dejarían de cuadrar.
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    await waitFor(() => expect(within(lista()).getAllByText("Migrada de Alegra")).toHaveLength(2));
    for (const enlace of within(lista()).queryAllByRole("link")) {
      expect(enlace).not.toHaveAttribute("href", expect.stringContaining("a1"));
      expect(enlace).not.toHaveAttribute("href", expect.stringContaining("a2"));
    }
    expect(within(lista()).queryAllByRole("link")).toHaveLength(0);
  });

  it("🔴 una venta del sistema SÍ se puede abrir", async () => {
    vi.stubGlobal("fetch", fetchDelHistorico([]));
    pintar({ ventasDelSistema: [proforma()] });
    await waitFor(() =>
      expect(within(lista()).getByText(/F-0001 · Cliente del sistema/)).toBeInTheDocument(),
    );
    expect(within(lista()).getByRole("link")).toHaveAttribute("href", "/ventas/p1");
    // Y no lleva etiqueta de origen: lo normal es el sistema, marcarlo sería ruido.
    expect(within(lista()).queryByText("Migrada de Alegra")).not.toBeInTheDocument();
  });

  it("mezcla las dos fuentes en una sola lista ordenada", async () => {
    vi.stubGlobal("fetch", fetchDelHistorico());
    // La proforma es del 6 de septiembre; las migradas, del 5 y del 4.
    pintar({ ventasDelSistema: [proforma()] });
    await waitFor(() => expect(within(lista()).getAllByRole("listitem")).toHaveLength(3));
    const textos = within(lista())
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(textos[0]).toContain("F-0001");
    expect(textos[1]).toContain("B0100000123");
    expect(textos[2]).toContain("B0100000122");
  });

  it("🔴 el enlace de la cabecera lleva a /ventas, que sí cuenta el histórico", () => {
    // Decía «Ver proformas →» y llevaba a /proformas, donde el histórico
    // migrado no está: el dueño saldría de una lista con facturas de Alegra y
    // aterrizaría donde no aparecen.
    vi.stubGlobal("fetch", fetchDelHistorico([]));
    pintar();
    const enlace = screen.getByRole("link", { name: "Ver ventas →" });
    expect(enlace).toHaveAttribute("href", "/ventas");
    expect(screen.queryByText("Ver proformas →")).not.toBeInTheDocument();
  });

  it("🔴 la fecha de una migrada no se inventa una hora", async () => {
    // `alegra_invoices.date` es un día, sin hora: enseñar «00:00» sería
    // inventarse una precisión que el dato no tiene.
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    await waitFor(() => expect(within(lista()).getAllByText("Migrada de Alegra")).toHaveLength(2));
    const migrada = within(lista()).getAllByRole("listitem")[0]!;
    expect(migrada.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("una venta sin vendedor lo dice, no deja el hueco", async () => {
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    await waitFor(() => expect(within(lista()).getByText(/Sin vendedor/)).toBeInTheDocument());
    expect(within(lista()).getByText(/LAURA MEJIA/)).toBeInTheDocument();
  });

  it("un cliente sin nombre sale como «Consumidor final», no en blanco", async () => {
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    await waitFor(() =>
      expect(within(lista()).getByText(/B0100000122 · Consumidor final/)).toBeInTheDocument(),
    );
  });
});

describe("cuando el histórico no llega", () => {
  it("🔴 mientras carga lo DICE, y no enseña el texto de vacío", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    pintar();
    expect(screen.getByText("Cargando el histórico migrado de Alegra…")).toBeInTheDocument();
    expect(
      screen.queryByText("Aún no hay ventas registradas en el período."),
    ).not.toBeInTheDocument();
  });

  it("🔴 si falla, se avisa: una lista corta en silencio pasaría por completa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: "No se pudieron cargar las ventas." }),
        }),
      ),
    );
    pintar({ ventasDelSistema: [proforma()] });
    await waitFor(() =>
      expect(screen.getByText(/No se pudieron cargar las ventas/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Se enseñan solo las ventas del sistema/)).toBeInTheDocument();
    // Y lo del sistema sigue en pantalla: no se borra lo que sí se tiene.
    expect(within(lista()).getByText(/F-0001/)).toBeInTheDocument();
  });

  it("con un periodo que el histórico no sabe pedir, ni se lanza la petición", () => {
    const espia = fetchDelHistorico();
    vi.stubGlobal("fetch", espia);
    pintar({ historicoParticipa: false });
    expect(espia).not.toHaveBeenCalled();
  });

  it("🔴 pide una PÁGINA, no el histórico entero", async () => {
    const espia = fetchDelHistorico();
    vi.stubGlobal("fetch", espia);
    pintar();
    await waitFor(() => expect(espia).toHaveBeenCalledTimes(1));
    const p = new URL(String(espia.mock.calls[0]![0]), "http://x").searchParams;
    expect(p.get("vista")).toBe("listado");
    expect(p.get("limite")).toBe("8");
    expect(p.get("desde")).toBe("2026-09-01");
    expect(p.get("hasta")).toBe("2026-09-30");
    // 🔴 Y el filtro de SUCURSAL. Sin esta aserción se podía borrar de la
    // petición con toda la suite en verde: con el panel en «Villa Olga», la
    // tarjeta habría listado facturas de Principal.
    expect(p.get("sucursalId")).toBe(SUCURSAL);
  });

  it("🔴 sin el filtro de sucursal, la tarjeta se queda sin facturas que enseñar", async () => {
    // La otra mitad de lo mismo, medida en PANTALLA: el falso solo responde a
    // quien pide la sucursal del panel.
    vi.stubGlobal("fetch", fetchDelHistorico(MIGRADAS, "otra-sucursal"));
    pintar();
    await waitFor(() =>
      expect(screen.getByText("Aún no hay ventas registradas en el período.")).toBeInTheDocument(),
    );
  });

  it("🔴 no duplica una venta del sistema que el endpoint también devuelve", async () => {
    // El endpoint trae LAS DOS fuentes, y esta pantalla ya pone su mitad del
    // sistema por su cuenta (filtrada con `esVentaCompletada`). Sin el filtro
    // `origen === "alegra"`, cada venta del sistema saldría DOS veces —y se
    // colarían proformas `pending`, que todavía no son una venta—. Se podía
    // borrar con 263 pruebas en verde.
    const propiaDelEndpoint = {
      id: "p1",
      origen: "sistema",
      numero: "F-0001",
      fecha: "2026-09-06T14:00:00.000Z",
      clienteId: null,
      clienteNombre: "Cliente del sistema",
      total: 1000,
      itbis: 0,
      subtotal: 1000,
      formaPago: "cash",
      vendedor: "Rosa Peralta",
      sucursalId: SUCURSAL,
      anulada: false,
      estado: "vigente",
      editable: true,
    };
    vi.stubGlobal("fetch", fetchDelHistorico([propiaDelEndpoint, ...MIGRADAS]));
    pintar({ ventasDelSistema: [proforma()] });
    await waitFor(() => expect(within(lista()).getByText(/B0100000123/)).toBeInTheDocument());
    // Una sola vez, no dos.
    expect(within(lista()).getAllByText(/F-0001/)).toHaveLength(1);
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(3);
  });
});
