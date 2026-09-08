// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import { TarjetasVentasPanel } from "./tarjetas-ventas";
import type { Proforma } from "@/types";

/**
 * 🔴 Las cuatro tarjetas del panel, RENDERIZADAS con los datos reales de
 * producción.
 *
 * El fallo que cierran estas pruebas es visual y silencioso: con
 * `proformas` vacía y RD$317 723,13 facturados en septiembre, el dueño veía
 * «Sin datos este mes.» en tres tarjetas y una línea plana en cero en la
 * cuarta. Nada fallaba: simplemente no se miraba `alegra_invoices`.
 *
 * Por eso cada tarjeta tiene aquí dos exigencias:
 *   1. Que la CIFRA salga en pantalla.
 *   2. Que NO salga el texto de vacío.
 *
 * Las cifras son las medidas contra la base real el 07/09/2026.
 */

/** Septiembre 2026, tal como responde `GET /api/ventas?vista=desglose`. */
const RESPUESTAS: Record<string, { desglose: unknown[]; fuentes: string[] }> = {
  sucursal: {
    desglose: [
      { clave: "b-villa", etiqueta: "Villa Olga", origen: "alegra", cantidad: 41, total: 165985 },
      { clave: "b-princ", etiqueta: "Principal", origen: "alegra", cantidad: 48, total: 151738.13 },
    ],
    fuentes: ["alegra"],
  },
  forma_pago: {
    desglose: [
      { clave: "credit-card", etiqueta: "credit-card", origen: "alegra", cantidad: 52, total: 182435 },
      { clave: "cash", etiqueta: "cash", origen: "alegra", cantidad: 36, total: 133838.13 },
      { clave: "debit-card", etiqueta: "debit-card", origen: "alegra", cantidad: 1, total: 1450 },
    ],
    fuentes: ["alegra"],
  },
  producto: {
    desglose: [
      { clave: "p1", etiqueta: "ZK-INA LIDOCAINA 10% SPRAY CEREZA 115 ML", origen: "alegra", cantidad: 50, total: 37513.13 },
      { clave: "p2", etiqueta: "GLISODIN SKIN BRIGHTENING 60 CAPSULAS", origen: "alegra", cantidad: 4, total: 13740 },
      { clave: "p3", etiqueta: "LA ROCHE-POSAY GLYCOLIC B5 SERUM 30 ML", origen: "alegra", cantidad: 2, total: 8210 },
    ],
    fuentes: ["alegra"],
  },
  mes: {
    desglose: [
      { clave: "2026-04", etiqueta: "Abr 2026", origen: "alegra", cantidad: 432, total: 1580965.66 },
      { clave: "2026-05", etiqueta: "May 2026", origen: "alegra", cantidad: 455, total: 1641881.92 },
      { clave: "2026-06", etiqueta: "Jun 2026", origen: "alegra", cantidad: 446, total: 1543623.44 },
      { clave: "2026-07", etiqueta: "Jul 2026", origen: "alegra", cantidad: 590, total: 2086983.23 },
      { clave: "2026-08", etiqueta: "Ago 2026", origen: "alegra", cantidad: 471, total: 1908052.71 },
      { clave: "2026-09", etiqueta: "Sep 2026", origen: "alegra", cantidad: 89, total: 317723.13 },
    ],
    fuentes: ["alegra"],
  },
};

/** Qué dimensión pide una URL de `/api/ventas`. */
function dimensionDe(url: string): string {
  return new URL(url, "http://x").searchParams.get("dimension") ?? "";
}

/**
 * `fetch` falso que responde el desglose real de cada dimensión.
 *
 * 🔴 Responde las DOS formas, porque la ruta responde las dos: con una sola
 * dimensión devuelve `{ desglose, fuentes }` —hay pantallas que ya la consumen
 * así— y con varias separadas por comas devuelve `{ desgloses: { … } }`. El
 * panel pide las tres que comparten filtros en UNA petición desde que se midió
 * que disparaba trece al cargar.
 */
function fetchDelHistorico(respuestas = RESPUESTAS) {
  return vi.fn((url: string) => {
    const pedidas = dimensionDe(url).split(",").filter(Boolean);
    const vacio = { desglose: [], fuentes: [] };
    const cuerpo =
      pedidas.length > 1
        ? {
            desgloses: Object.fromEntries(
              pedidas.map((d) => [d, respuestas[d] ?? vacio]),
            ),
          }
        : (respuestas[pedidas[0] ?? ""] ?? vacio);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) });
  });
}

/**
 * El panel de HOY: `proformas` vacía. Es el estado real de producción, y el
 * que hacía que las cuatro tarjetas salieran en blanco.
 */
const SIN_VENTAS_PROPIAS: Proforma[] = [];

function pintar(over: Partial<React.ComponentProps<typeof TarjetasVentasPanel>> = {}) {
  return render(
    <TarjetasVentasPanel
      ventasDelPeriodo={SIN_VENTAS_PROPIAS}
      ventasParaTendencia={SIN_VENTAS_PROPIAS}
      nombreDeSucursal={(id) => id}
      filtros={{ desde: "2026-09-01", hasta: "2026-09-30" }}
      historicoParticipa
      vencimientosCriticos={0}
      bajoStock={0}
      {...over}
    />,
  );
}

/**
 * Los tooltips de una tarjeta, en orden. En las gráficas SVG el importe de
 * cada marca vive en un `<title>` dentro de su `<g>`/`<circle>`, y las
 * consultas de testing-library sólo miran los `<title>` que cuelgan
 * directamente del `<svg>`: hay que ir a buscarlos.
 */
function tooltips(caja: HTMLElement): string[] {
  return [...caja.querySelectorAll("title")].map((t) => t.textContent ?? "");
}

/** La tarjeta cuyo título es `titulo`, con su contenido. */
function tarjeta(titulo: string): HTMLElement {
  const encabezado = screen.getByRole("heading", { name: titulo });
  const caja = encabezado.closest("div.p-5");
  expect(caja, `no se encontró el cuerpo de la tarjeta «${titulo}»`).not.toBeNull();
  return caja as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("las cuatro tarjetas de ventas del panel", () => {
  it("🔴 «Ventas por sucursal» enseña el reparto real, no «Sin datos este mes.»", async () => {
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    const caja = tarjeta("Ventas por sucursal");
    await waitFor(() => expect(within(caja).getByText(/Villa Olga/)).toBeInTheDocument());
    expect(within(caja).getByText(/Principal/)).toBeInTheDocument();
    // Las barras llevan su importe escrito encima, en formato compacto.
    expect(within(caja).getByText("RD$166.0K")).toBeInTheDocument();
    expect(within(caja).getByText("RD$151.7K")).toBeInTheDocument();
    expect(within(caja).queryByText("Sin datos este mes.")).not.toBeInTheDocument();
  });

  it("🔴 «Cobros por método de pago» enseña los tres métodos con su dinero", async () => {
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    const caja = tarjeta("Cobros por método de pago");
    await waitFor(() => expect(within(caja).getByText("Tarjeta de crédito")).toBeInTheDocument());
    // Traducidos: la dona no puede enseñar `cash` ni `credit-card`.
    expect(within(caja).getByText("Efectivo")).toBeInTheDocument();
    expect(within(caja).getByText("Tarjeta de débito")).toBeInTheDocument();
    expect(within(caja).queryByText("cash")).not.toBeInTheDocument();
    expect(within(caja).queryByText("credit-card")).not.toBeInTheDocument();
    expect(within(caja).getByText("RD$182,435.00")).toBeInTheDocument();
    expect(within(caja).getByText("RD$133,838.13")).toBeInTheDocument();
    // Y el total del centro de la dona es la suma de los tres.
    expect(within(caja).getByText("RD$317,723.13")).toBeInTheDocument();
    expect(within(caja).queryByText("Sin datos este mes.")).not.toBeInTheDocument();
  });

  it("🔴 «Tendencia mensual» deja de ser una línea plana en cero", async () => {
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    const caja = tarjeta("Tendencia mensual (ventas)");
    // Cada punto lleva su mes y su importe. Los seis, en orden cronológico y
    // con las cifras reales: es lo único que distingue una serie con datos de
    // la línea plana en cero que veía el dueño.
    // El `waitFor` envuelve la comparación ENTERA: antes de que llegue el
    // histórico ya hay seis puntos —todos a cero, que es el fallo— así que
    // esperar sólo a que haya seis no esperaría a nada.
    await waitFor(() =>
      expect(tooltips(caja)).toEqual([
        "Abr 2026: RD$1.58M",
        "May 2026: RD$1.64M",
        "Jun 2026: RD$1.54M",
        "Jul 2026: RD$2.09M",
        "Ago 2026: RD$1.91M",
        "Sep 2026: RD$317.7K",
      ]),
    );
    // Y ni un punto se quedó en cero: la línea plana era el fallo.
    expect(tooltips(caja).filter((t) => t.endsWith("RD$0"))).toEqual([]);
  });

  it("🔴 «Top productos del mes» enseña el ranking real, no «Sin ventas este mes.»", async () => {
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    const caja = tarjeta("Top productos del mes");
    await waitFor(() =>
      expect(
        within(caja).getByText("ZK-INA LIDOCAINA 10% SPRAY CEREZA 115 ML"),
      ).toBeInTheDocument(),
    );
    expect(within(caja).getByText("GLISODIN SKIN BRIGHTENING 60 CAPSULAS")).toBeInTheDocument();
    expect(within(caja).getByText("RD$37,513.13")).toBeInTheDocument();
    expect(within(caja).getByText("RD$13,740.00")).toBeInTheDocument();
    expect(within(caja).queryByText("Sin ventas este mes.")).not.toBeInTheDocument();
    // «Cant.», no «Unidades»: en las filas migradas son renglones de factura.
    expect(within(caja).getByText("Cant.")).toBeInTheDocument();
    expect(within(caja).queryByText("Unidades")).not.toBeInTheDocument();
  });

  it("🔴 cada tarjeta dice que lo que enseña es histórico migrado", async () => {
    // Una barra no puede llevar insignia y en tabletas no hay hover: si el
    // origen no se dice en la cabecera de la tarjeta, RD$317 mil de otro
    // sistema pasan por ventas propias.
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    for (const titulo of [
      "Ventas por sucursal",
      "Cobros por método de pago",
      "Tendencia mensual (ventas)",
      "Top productos del mes",
    ]) {
      const caja = tarjeta(titulo);
      await waitFor(() =>
        expect(within(caja).getByText("Migrada de Alegra")).toBeInTheDocument(),
      );
      expect(
        within(caja).getByText("Todo lo que se ve aquí es histórico migrado."),
      ).toBeInTheDocument();
    }
  });

  it("🔴 los insights dejan de estar mudos: salen de las filas ya combinadas", async () => {
    // Antes salían de `branchSales[0]` y `topProds[0]`, que sólo miraban
    // `proformas`: con la tabla vacía el panel no tenía ni un titular de
    // ventas. Se comprueba, no se supone.
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar();
    await waitFor(() =>
      expect(screen.getByText("Villa Olga lidera las ventas del mes")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("ZK-INA LIDOCAINA 10% SPRAY CEREZA 115 ML es el producto más vendido"),
    ).toBeInTheDocument();
    expect(screen.getByText("Con RD$165,985.00 facturado.")).toBeInTheDocument();
    // 🔴 El titular del producto NO dice «unidades»: en las filas migradas la
    // cantidad son renglones de factura.
    expect(screen.getByText("RD$37,513.13 en el período.")).toBeInTheDocument();
  });
});

/**
 * 🔴 Con las DOS fuentes. Todas las pruebas de arriba pintan con `proformas`
 * vacía —el estado real de producción hoy—, así que la fusión sistema+Alegra
 * no se ejercitaba en pantalla. Y ahí estaba el fallo: el sistema clavaba sus
 * barras por NOMBRE y la base por `branch_id`, así que las dos mitades no se
 * fundían nunca. Se enciende con la PRIMERA venta del POS, que es justo lo que
 * este trabajo existe para que ocurra.
 */
describe("cuando el POS también ha facturado", () => {
  /** Una proforma cobrada en Villa Olga, del mes en curso. */
  function ventaPropia(total: number): Proforma {
    const hoy = new Date();
    return {
      id: "p1",
      number: "F-0001",
      customerName: "Cliente del sistema",
      cashierId: "u1",
      cashierName: "Cajero",
      sellerName: "Rosa Peralta",
      items: [],
      subtotal: total,
      discount: 0,
      itbis: 0,
      total,
      status: "paid",
      payments: [],
      paid: total,
      balance: 0,
      businessId: "b",
      branchId: "b-villa",
      createdAt: hoy.toISOString(),
      updatedAt: hoy.toISOString(),
    } as Proforma;
  }

  it("🔴 la misma sucursal sale en UNA barra, no en dos con el mismo nombre", async () => {
    // La cabecera dice «Suma las ventas del sistema y el histórico migrado».
    // Si no suma, la tarjeta miente sobre lo que está enseñando.
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar({
      ventasDelPeriodo: [ventaPropia(1_000)],
      nombreDeSucursal: (id) => (id === "b-villa" ? "Villa Olga" : id),
    });
    const caja = tarjeta("Ventas por sucursal");
    await waitFor(() => expect(within(caja).getAllByText(/Villa Olga/)).toHaveLength(1));
    // 165 985 (Alegra) + 1 000 (sistema) = 166 985 → «RD$167.0K» en la barra.
    expect(within(caja).getByText("RD$167.0K")).toBeInTheDocument();
    expect(
      within(caja).getByText("Suma las ventas del sistema y el histórico migrado."),
    ).toBeInTheDocument();
  });

  it("🔴 el insight nombra a la sucursal que de VERDAD lidera", async () => {
    // Con las filas partidas, la primera era «Principal» (RD$151 738,13)
    // teniendo Villa Olga RD$165 985 + lo del sistema. El panel afirmaba algo
    // falso sobre el negocio.
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar({
      ventasDelPeriodo: [ventaPropia(1_000)],
      nombreDeSucursal: (id) => (id === "b-villa" ? "Villa Olga" : "Principal"),
    });
    await waitFor(() =>
      expect(screen.getByText("Villa Olga lidera las ventas del mes")).toBeInTheDocument(),
    );
    expect(screen.getByText("Con RD$166,985.00 facturado.")).toBeInTheDocument();
    expect(screen.queryByText("Principal lidera las ventas del mes")).not.toBeInTheDocument();
  });
});

describe("cuando el histórico no llega", () => {
  it("🔴 mientras carga, la tarjeta lo DICE en vez de enseñar un cero mudo", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    pintar();
    const caja = tarjeta("Ventas por sucursal");
    expect(
      within(caja).getByText("Cargando el histórico migrado de Alegra…"),
    ).toBeInTheDocument();
  });

  it("🔴 si falla, se avisa: media tarjeta en silencio pasaría por entera", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: "La función desglose_ventas_unificadas no existe." }),
        }),
      ),
    );
    pintar();
    const caja = tarjeta("Ventas por sucursal");
    await waitFor(() =>
      expect(within(caja).getByText(/desglose_ventas_unificadas no existe/)).toBeInTheDocument(),
    );
    expect(within(caja).getByText(/Se enseñan solo las ventas del sistema/)).toBeInTheDocument();
  });

  it("una respuesta vacía deja el texto de vacío, sin inventarse filas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ desglose: [], fuentes: [] }) })),
    );
    pintar();
    const caja = tarjeta("Top productos del mes");
    await waitFor(() => expect(within(caja).getByText("Sin ventas este mes.")).toBeInTheDocument());
    // Y sin filas no se anuncia un origen que no aporta nada.
    expect(within(caja).queryByText("Migrada de Alegra")).not.toBeInTheDocument();
  });
});

describe("qué se le pide a la base", () => {
  it("🔴 la tendencia NO manda el filtro de mes/año: colapsaría la serie", async () => {
    // Es la única de las cuatro que ignora el periodo, igual que hacía
    // `monthlyTrend`. Manda SU ventana de seis meses y la sucursal.
    const espia = fetchDelHistorico();
    vi.stubGlobal("fetch", espia);
    pintar({ filtros: { desde: "2026-09-01", hasta: "2026-09-30", sucursalId: "b-villa" } });
    // 🔴 DOS peticiones, no cuatro: las tres que comparten filtros van juntas y
    // la tendencia aparte, porque lleva su propia ventana de seis meses. Antes
    // eran cuatro y el panel disparaba trece en total al cargar.
    await waitFor(() => expect(espia).toHaveBeenCalledTimes(2));
    const urls = espia.mock.calls.map((c) => String(c[0]));
    const mes = new URL(urls.find((u) => dimensionDe(u) === "mes")!, "http://x").searchParams;
    // No es el mes que pide el panel: si lo fuera, la serie tendría un punto.
    expect(mes.get("desde")).not.toBe("2026-09-01");
    // Arranca el día 1 y abarca SEIS meses, que son los que se dibujan.
    expect(mes.get("desde")).toMatch(/^\d{4}-\d{2}-01$/);
    const meses = (v: string) => {
      const [a, m] = v.split("-").map(Number) as [number, number];
      return a * 12 + m;
    };
    expect(meses(mes.get("hasta")!) - meses(mes.get("desde")!)).toBe(5);
    // Pero la sucursal SÍ se respeta.
    expect(mes.get("sucursalId")).toBe("b-villa");

    // Y las otras tres viajan JUNTAS en la otra petición, con el periodo del
    // panel tal cual. Agruparlas no puede costarles el filtro: si lo perdieran,
    // las tarjetas enseñarían el histórico completo como si fuera del mes.
    const juntas = urls.find((u) => dimensionDe(u).includes(","));
    expect(juntas, `no se agruparon las tres: ${urls.join(" | ")}`).toBeDefined();
    const p = new URL(juntas!, "http://x").searchParams;
    expect(p.get("dimension")!.split(",").sort()).toEqual(["forma_pago", "producto", "sucursal"]);
    expect(p.get("desde"), "la petición agrupada perdió el filtro de periodo").toBe("2026-09-01");
    expect(p.get("hasta")).toBe("2026-09-30");
    expect(p.get("sucursalId")).toBe("b-villa");
  });

  it("🔴 pide DESGLOSES, no listas de facturas", async () => {
    // Ninguna pantalla descarga filas para contarlas: son 14 965 facturas.
    const espia = fetchDelHistorico();
    vi.stubGlobal("fetch", espia);
    pintar();
    await waitFor(() => expect(espia).toHaveBeenCalledTimes(2));
    for (const llamada of espia.mock.calls) {
      const p = new URL(String(llamada[0]), "http://x").searchParams;
      expect(p.get("vista")).toBe("desglose");
      expect(p.get("dimension")).toBeTruthy();
    }
  });

  it("🔴 con el combo «mes fijo + año Todos», la tendencia SIGUE pidiendo su serie", async () => {
    // Las otras tres no pueden pedir nada (no hay rango que mandar) pero la
    // tendencia nunca respetó el periodo: apagarla también habría dejado esa
    // tarjeta plana sin motivo.
    const espia = fetchDelHistorico();
    vi.stubGlobal("fetch", espia);
    pintar({ historicoParticipa: false, filtros: {} });
    await waitFor(() => expect(espia).toHaveBeenCalledTimes(1));
    expect(dimensionDe(String(espia.mock.calls[0]![0]))).toBe("mes");
    const caja = tarjeta("Tendencia mensual (ventas)");
    await waitFor(() => expect(tooltips(caja)).toContain("Jul 2026: RD$2.09M"));
  });
});

/**
 * 🔴 Los desgloses que el panel ya trajo NO se vuelven a pedir.
 *
 * El panel pide el resumen, el listado y estos tres desgloses en UNA petición
 * (`usePanelVentas`): los cinco llevan exactamente los mismos filtros. Si
 * estas tarjetas siguieran pidiendo los suyos, el ahorro sería cero y nadie lo
 * notaría — la pantalla se ve igual.
 */
describe("Tarjetas de ventas con los desgloses que ya trajo el panel", () => {
  /**
   * Los desgloses tal como los entrega `usePanelVentas`: ya INTERPRETADOS
   * (`filas`), no el cuerpo crudo de la respuesta (`desglose`).
   */
  const listo = (d: string) => ({
    tipo: "listo",
    datos: { filas: RESPUESTAS[d]?.desglose ?? [], fuentes: RESPUESTAS[d]?.fuentes ?? [] },
  });
  const DEL_PANEL = {
    sucursal: listo("sucursal"),
    forma_pago: listo("forma_pago"),
    producto: listo("producto"),
  } as never;

  it("🔴 no pide ninguno de los tres por su cuenta", async () => {
    const espia = fetchDelHistorico();
    vi.stubGlobal("fetch", espia);
    pintar({ desglosesDelPanel: DEL_PANEL });
    const caja = tarjeta("Ventas por sucursal");
    await waitFor(() => expect(within(caja).getByText(/Villa Olga/)).toBeInTheDocument());

    // La tendencia SÍ sigue pidiendo lo suyo: lleva su propia ventana de seis
    // meses, sin el filtro de periodo, así que no cabe en la agrupada.
    const dimensiones = espia.mock.calls.map(([url]) => dimensionDe(url as string));
    expect(dimensiones).toEqual(["mes"]);
  });

  it("sin los desgloses del panel sí los pide", async () => {
    // La otra mitad de la guarda: estas tarjetas siguen valiéndose solas. Sin
    // esto, «no pide nada» pasaría también con las tarjetas rotas.
    const espia = fetchDelHistorico();
    vi.stubGlobal("fetch", espia);
    pintar();
    await waitFor(() =>
      expect(espia.mock.calls.map(([url]) => dimensionDe(url as string)).sort()).toEqual([
        "forma_pago,producto,sucursal",
        "mes",
      ]),
    );
  });

  it("🔴 el error del panel se enseña en las tarjetas, no un «sin datos» mudo", async () => {
    vi.stubGlobal("fetch", fetchDelHistorico());
    pintar({
      desglosesDelPanel: {
        sucursal: { tipo: "error", mensaje: "Se cayó la base." },
        forma_pago: { tipo: "error", mensaje: "Se cayó la base." },
        producto: { tipo: "error", mensaje: "Se cayó la base." },
      } as never,
    });
    await waitFor(() =>
      expect(within(tarjeta("Ventas por sucursal")).getByText(/Se cayó la base/)).toBeInTheDocument(),
    );
  });
});
