// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildSalesReport, EMPTY_FILTERS } from "@/features/sales/sales-report";
import { formatCurrency } from "@/lib/utils/format";
import type { Proforma } from "@/types";
import type { DesgloseVentasApi, EstadoVentas } from "@/features/ventas/ventas-api";
import type { DimensionDesglose, FilaDesglose } from "@/features/ventas/venta-unificada";
import { AvisoSoloSistema } from "./desglose-tarjetas";

/**
 * 🔴 Qué tarjeta lleva el histórico migrado y cuál no, y que cada una lo DIGA.
 *
 * Las seis —vendedor, forma de pago, producto, sucursal, cliente y
 * comprobante— ya lo desglosan, porque la base sabe agruparlas (migraciones
 * `20260906140000_…`, `20260907120000_…` y `20260909150000_…`). «Top
 * cajeros» y «Tendencia de ventas» no llevan el aviso GENÉRICO porque
 * explican su propio motivo (ver `CON_MOTIVO_PROPIO`), no porque les falte el
 * histórico.
 *
 * Sin esa distinción, el dueño lee arriba «Total facturado RD$48 454 899,08 ·
 * 14 743 transacciones» y abajo tarjetas que cuentan otra cosa, sin nada que
 * lo explique: exactamente el desconcierto que este plan vino a cerrar. El
 * informe de una tarea anterior afirmó que el aviso estaba puesto y no lo
 * estaba; esta prueba existe para que eso no pueda repetirse en silencio.
 */

/** Estado que devolverá `useDesgloseVentas` en la prueba en curso. */
let estadoDesglose: EstadoVentas<DesgloseVentasApi> = { tipo: "cargando" };
/**
 * Estado SOLO para una dimensión, cuando la prueba necesita datos distintos en
 * cada tarjeta. Hace falta para las de medios de pago: si la misma fixture de
 * claves `cash`/`credit-sell` se devolviera también a la tarjeta de vendedor y
 * a la de productos —que no traducen nada, ni deben—, buscar «cash» en la
 * pantalla encontraría tres y no se podría afirmar nada.
 */
let estadoPorDimension: Partial<Record<DimensionDesglose, EstadoVentas<DesgloseVentasApi>>> = {};
const pedidas: DimensionDesglose[] = [];
/** `false` cuando la pantalla NO debe pedir el desglose. */
let activoVisto: boolean[] = [];

vi.mock("@/features/ventas/ventas-api", async (original) => ({
  ...(await original<typeof import("@/features/ventas/ventas-api")>()),
  useDesgloseVentas: (dimension: DimensionDesglose, _f: unknown, activo = true) => {
    pedidas.push(dimension);
    activoVisto.push(activo);
    return estadoPorDimension[dimension] ?? estadoDesglose;
  },
}));

const { ResumenesVentas } = await import("./resumenes-ventas");

/**
 * Las que la base NO sabe desglosar: el aviso se queda en ellas. Hoy
 * ninguna — «Clientes principales» y «Comprobantes» se mudaron a
 * `CON_HISTORICO` desde `20260909150000_desglose_ventas_cliente_comprobante.sql`.
 * El array se queda vacío (y no se borra) para que la prueba de abajo
 * («el aviso queda SOLO en las que no desglosan») siga afirmando algo el día
 * que una tarjeta nueva se quede sin su dimensión en la base.
 */
const CON_AVISO: string[] = [];
/**
 * Tarjetas que existen pero NO llevan el aviso genérico porque explican su
 * propio motivo: «Top cajeros» dice que las facturas migradas no pasaron por la
 * caja de DermaLand, que es más útil que un «solo del sistema» sin causa.
 */
const CON_MOTIVO_PROPIO = ["Top cajeros", "Tendencia de ventas"];
/** Las que ya llevan el histórico. */
const CON_HISTORICO = [
  "Medios de pago",
  "Ventas por vendedor",
  "Productos más vendidos",
  "Ventas por sucursal",
  "Clientes principales",
  "Comprobantes",
];

const reporteVacio = () => buildSalesReport([], EMPTY_FILTERS);

/**
 * 🔴 Un reporte con VENTAS DE VERDAD, y hace falta.
 *
 * Todas las pruebas de este archivo usaban `buildSalesReport([], …)`. Con un
 * reporte vacío, `report.methods` son cuatro grupos a cero (así que el filtro
 * que los quita es indistinguible de no existir) y las filas migradas de la
 * fixture tenían claves que no están en `METODO_ETIQUETA` (así que el traductor
 * también era indistinguible de no existir). Verificado por la revisión:
 * revertir ENTEROS los commits que arreglaron esas dos cosas dejaba la suite en
 * `9 passed`.
 *
 * Con una venta en efectivo del sistema, «Efectivo» aparece con dinero y los
 * otros tres grupos a cero; y con filas migradas de clave `cash`/`credit-sell`,
 * el traductor tiene algo que traducir.
 */
function ventaEnEfectivo(): Proforma {
  return {
    id: "prof_1",
    businessId: "biz_1",
    branchId: "br_1",
    number: "B0100000001",
    customerId: "cust_1",
    customerName: "María Fernanda",
    documentKind: "invoice",
    status: "paid",
    items: [],
    payments: [{ method: "cash", amount: 1000 }],
    subtotal: 847.46,
    itbis: 152.54,
    discount: 0,
    total: 1000,
    createdAt: "2026-03-10T10:00:00Z",
  } as unknown as Proforma;
}

const reporteConVentas = () => buildSalesReport([ventaEnEfectivo()], EMPTY_FILTERS);

const migradas: FilaDesglose[] = [
  { clave: "DESTENY REYNOSO", etiqueta: "DESTENY REYNOSO", origen: "alegra", cantidad: 5513, total: 20_000 },
  { clave: "", etiqueta: "Sin forma de pago", origen: "alegra", cantidad: 12_672, total: 40_000 },
];

/**
 * Filas migradas de forma de pago tal como las manda la base: con el código
 * CRUDO de Alegra, que es lo que hay que traducir.
 */
const pagosMigrados: FilaDesglose[] = [
  { clave: "", etiqueta: "Sin forma de pago", origen: "alegra", cantidad: 12_672, total: 40_912_469.65 },
  { clave: "credit-card", etiqueta: "credit-card", origen: "alegra", cantidad: 1192, total: 4_793_588.8 },
  { clave: "cash", etiqueta: "cash", origen: "alegra", cantidad: 869, total: 2_689_272.65 },
  { clave: "credit-sell", etiqueta: "credit-sell", origen: "alegra", cantidad: 4, total: 29_982.98 },
];

beforeEach(() => {
  estadoDesglose = { tipo: "listo", datos: { filas: migradas, fuentes: ["alegra"] } };
  estadoPorDimension = {};
  pedidas.length = 0;
  activoVisto = [];
});
afterEach(cleanup);

describe("resúmenes del reporte de ventas", () => {
  it("las ocho tarjetas siguen ahí (una cambió de nombre)", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    for (const t of [...CON_AVISO, ...CON_MOTIVO_PROPIO, ...CON_HISTORICO]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("🔴 el aviso «Solo ventas del sistema» queda SOLO en las que no desglosan el histórico", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect(screen.queryAllByText(/Solo ventas del sistema/i)).toHaveLength(CON_AVISO.length);
  });

  it("🔴 las seis tarjetas nuevas enseñan de verdad el histórico migrado", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    // Una fila por tarjeta que lo pida: seis tarjetas, mismo dato falso.
    // Las seis tablas más la barra de la tendencia, que usa la misma fila falsa.
    expect(screen.getAllByText("DESTENY REYNOSO").length).toBe(CON_HISTORICO.length + 1);
    expect(screen.getAllByText(/Migrada de Alegra/i).length).toBe(CON_HISTORICO.length * 2);
  });

  it("🔴 pide las siete dimensiones, ni una más ni una menos", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect([...new Set(pedidas)].sort()).toEqual([
      "cliente",
      "comprobante",
      "forma_pago",
      "mes",
      "producto",
      "sucursal",
      "vendedor",
    ]);
  });

  it("🔴 sin histórico en los KPIs NO se pide el desglose: sumaría un total sin filtrar", () => {
    // `historicoParticipa` en falso significa que hay un filtro activo que el
    // histórico no sabe aplicar (o que la casilla está desmarcada). Pedirlo
    // igual traería RD$48 millones sin filtrar a una tabla que sí lo está.
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa={false} />);
    // Siete: las seis tablas más la serie mensual de la tendencia.
    expect(activoVisto).toEqual([false, false, false, false, false, false, false]);
    expect(screen.queryByText(/Solo ventas del sistema/i)).not.toBeInTheDocument();
    expect(screen.queryByText("DESTENY REYNOSO")).not.toBeInTheDocument();
  });

  it("el aviso dice dónde SÍ está el histórico, no solo que falta", () => {
    // 🔴 Ya no hay ningún escenario de ResumenesVentas en el que se vea: con
    // las siete dimensiones respondidas, `combinarDesglose` nunca devuelve
    // `soloSistema:true` sin estar también `cargando` o en `error` —y esos dos
    // casos pintan SU PROPIO mensaje, no éste (ver `TarjetaDesglose`)—. El
    // texto sigue vivo para el día que una tarjeta nueva se quede sin su
    // dimensión en la base, así que se prueba el componente solo.
    render(<AvisoSoloSistema mostrar />);
    expect(screen.getAllByText(/su total está arriba y sus facturas, más abajo/i).length)
      .toBeGreaterThan(0);
  });

  it("🔴 «Sin forma de pago» se explica: es el dato migrado, no un fallo", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect(screen.getByText(/Alegra no registró la forma de pago en/i)).toBeInTheDocument();
    expect(screen.getByText(/no un fallo/i)).toBeInTheDocument();
  });

  it("mientras el histórico viaja, las seis tarjetas lo dicen en vez de enseñar la tabla a medias", () => {
    estadoDesglose = { tipo: "cargando" };
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect(screen.getAllByText(/Cargando el histórico migrado/i)).toHaveLength(CON_HISTORICO.length + 1);
  });

  it("si el histórico falla, las seis avisan en vez de enseñar ceros", () => {
    estadoDesglose = { tipo: "error", mensaje: "No se pudo cargar el histórico migrado de Alegra." };
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect(screen.getAllByText(/No se pudo cargar el histórico migrado/i))
      .toHaveLength(CON_HISTORICO.length + 1);
    // El aviso del fallo YA dice que lo que se ve es solo del sistema, así que
    // el genérico no se repite encima: se queda en una por tarjeta.
    expect(screen.getAllByText(/Se enseñan solo las ventas del sistema/i))
      .toHaveLength(CON_HISTORICO.length);
    expect(screen.queryAllByText(/Solo ventas del sistema/i)).toHaveLength(CON_AVISO.length);
  });
});

/**
 * Lo que protegen estas cuatro: los dos commits que arreglaron la tabla de
 * medios de pago. La revisión comprobó que se podían revertir ENTEROS sin que
 * se pusiera roja una sola prueba, porque todas usaban un reporte vacío y
 * claves que no estaban en `METODO_ETIQUETA`.
 */
describe("medios de pago — con ventas de verdad en el reporte", () => {
  beforeEach(() => {
    // Solo la tarjeta de medios de pago recibe las claves crudas de Alegra; las
    // otras dos siguen con la fixture de siempre.
    estadoPorDimension = {
      forma_pago: { tipo: "listo", datos: { filas: pagosMigrados, fuentes: ["alegra"] } },
    };
  });

  it("🔴 no queda ni un código de Alegra a la vista: `cash` no puede convivir con «Efectivo»", () => {
    render(<ResumenesVentas report={reporteConVentas()} historicoParticipa />);
    for (const crudo of ["cash", "credit-card", "credit-sell"]) {
      expect(screen.queryByText(crudo), `sigue saliendo el código crudo «${crudo}»`)
        .not.toBeInTheDocument();
    }
    // Y sí salen traducidos, incluido `credit-sell`, que faltaba en el
    // diccionario y se colaba en inglés.
    for (const traducido of ["Efectivo", "Tarjeta de crédito", "Venta a crédito"]) {
      expect(screen.getAllByText(traducido).length, `falta «${traducido}»`).toBeGreaterThan(0);
    }
  });

  it("🔴 ni una fila de medio de pago a RD$0.00: `byPaymentMethod` devuelve siempre los cuatro grupos", () => {
    render(<ResumenesVentas report={reporteConVentas()} historicoParticipa />);
    // La venta del reporte es en efectivo, así que Tarjeta / Transferencia /
    // Otro llegan a cero y no se pintan.
    expect(screen.queryByText("Tarjeta")).not.toBeInTheDocument();
    expect(screen.queryByText("Transferencia")).not.toBeInTheDocument();
    expect(screen.queryByText("Otro")).not.toBeInTheDocument();
    // Y «Efectivo» sí, porque tiene dinero: dos filas, la del sistema y la
    // migrada.
    expect(screen.getAllByText("Efectivo").length).toBe(2);
  });

  it("🔴 dice que las dos mitades de la columna «Total» no miden lo mismo", () => {
    render(<ResumenesVentas report={reporteConVentas()} historicoParticipa />);
    expect(screen.getByText(/pagos RECIBIDOS/i)).toBeInTheDocument();
    expect(screen.getByText(/no se pueden sumar como si midieran lo mismo/i)).toBeInTheDocument();
  });

  it("sin ventas del sistema esa aclaración sobra y no se enseña", () => {
    // Es el caso de hoy: `proformas` vacía. La columna es toda «facturado».
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect(screen.queryByText(/pagos RECIBIDOS/i)).not.toBeInTheDocument();
  });

  it("🔴 el ranking de productos dice que es un ranking, no un total", () => {
    render(<ResumenesVentas report={reporteConVentas()} historicoParticipa />);
    expect(screen.getByText(/es un ranking, no un total/i)).toBeInTheDocument();
    expect(screen.getByText(/1 248 productos/)).toBeInTheDocument();
  });
});

/**
 * 🔴 La ventana en la que el KPI todavía no sabe si el histórico entra.
 *
 * `resolverHistorico` devuelve `participa: false` tanto mientras carga como
 * cuando falla o cuando hay un filtro que el histórico no sabe aplicar. En esos
 * tres casos las seis tarjetas enseñan solo lo del sistema; antes lo hacían sin
 * decir nada, y quien avisaba era la leyenda de los KPIs, arriba.
 */
/**
 * 🔴 «LAS VENTAS Y PROCESO DE ALEGRA SALEN APARTE, HICE UNA VENTA Y SALE LA
 * SUC REPETIDA. TODO DEBE ESTAR UNIFICADO Y SOLO UN LETRERO PARA IDENTIFICAR
 * QUE VINO DE ALEGRA, NO DIVIDIR LOS PROCESOS Y LA INFORMACIÓN» (pedido del
 * dueño, 10/09/2026, con captura de pantalla real de producción: «DermaLand
 * Principal» salía dos veces en «Ventas por sucursal» —una migrada, otra del
 * sistema— y lo mismo con «Desteny Reynoso» en «Ventas por vendedor»).
 *
 * Sucursal, vendedor y comprobante comparten el mismo espacio de claves entre
 * las dos fuentes (branches.id / users.id / ComprobanteKey), así que una
 * sucursal, un vendedor o un tipo de comprobante reales tienen que ser UNA
 * fila con un solo letrero, no dos.
 */
function ventaDelDia(): Proforma {
  return {
    id: "prof_unificada",
    businessId: "biz_1",
    branchId: "br_1",
    number: "B0200000001",
    documentKind: "invoice",
    ecfNumber: "B0200000001",
    customerId: "cust_1",
    customerName: "Ana",
    status: "paid",
    items: [],
    payments: [{ method: "cash", amount: 7470 }],
    subtotal: 6330.51,
    itbis: 1139.49,
    discount: 0,
    total: 7470,
    sellerId: "seller_1",
    sellerName: "Desteny Reynoso",
    createdAt: "2026-09-10T10:00:00Z",
  } as unknown as Proforma;
}

const reporteDelDia = () =>
  buildSalesReport([ventaDelDia()], EMPTY_FILTERS, {
    branchNames: new Map([["br_1", "DermaLand Principal"]]),
  });

describe("unificación de sucursal, vendedor y comprobante (pedido del dueño 10/09/2026)", () => {
  beforeEach(() => {
    estadoPorDimension = {
      sucursal: {
        tipo: "listo",
        datos: {
          filas: [
            { clave: "br_1", etiqueta: "DermaLand Principal", origen: "alegra", cantidad: 10, total: 42_675.51 },
          ],
          fuentes: ["alegra"],
        },
      },
      vendedor: {
        tipo: "listo",
        datos: {
          filas: [
            { clave: "seller_1", etiqueta: "Desteny Reynoso", origen: "alegra", cantidad: 19, total: 65_255.51 },
          ],
          fuentes: ["alegra"],
        },
      },
      comprobante: {
        tipo: "listo",
        datos: {
          filas: [
            { clave: "b02", etiqueta: "Factura de consumo (B02)", origen: "alegra", cantidad: 5, total: 10_000 },
          ],
          fuentes: ["alegra"],
        },
      },
    };
  });

  it("🔴 una sucursal con ventas en las dos fuentes sale en UNA fila con el total sumado", () => {
    render(<ResumenesVentas report={reporteDelDia()} historicoParticipa />);
    expect(screen.getAllByText("DermaLand Principal")).toHaveLength(1);
    expect(screen.getByText(formatCurrency(7470 + 42_675.51))).toBeInTheDocument();
  });

  it("🔴 un vendedor con ventas en las dos fuentes sale en UNA fila con el total sumado", () => {
    render(<ResumenesVentas report={reporteDelDia()} historicoParticipa />);
    expect(screen.getAllByText("Desteny Reynoso")).toHaveLength(1);
    expect(screen.getByText(formatCurrency(7470 + 65_255.51))).toBeInTheDocument();
  });

  it("🔴 un comprobante con ventas en las dos fuentes sale en UNA fila con el total sumado", () => {
    render(<ResumenesVentas report={reporteDelDia()} historicoParticipa />);
    expect(screen.getAllByText("Factura de consumo (B02)")).toHaveLength(1);
    expect(screen.getByText(formatCurrency(7470 + 10_000))).toBeInTheDocument();
  });

  it("la fila fundida lleva UN SOLO letrero («Incluye histórico de Alegra»), no «Migrada de Alegra»", () => {
    // «Migrada de Alegra» diría que TODA la fila es histórico y no se puede
    // editar, que es falso: parte de esos RD$50 145,51 es una venta del
    // sistema, editable. El letrero tiene que decir que es una MEZCLA.
    render(<ResumenesVentas report={reporteDelDia()} historicoParticipa />);
    expect(screen.getAllByText(/Incluye histórico de Alegra/i).length).toBeGreaterThan(0);
  });

  it("una sucursal / vendedor SOLO del sistema no lleva ningún letrero de Alegra", () => {
    render(<ResumenesVentas report={reporteDelDia()} historicoParticipa={false} />);
    expect(screen.queryByText(/Alegra/i)).not.toBeInTheDocument();
  });
});

describe("mientras el KPI del histórico carga o falla", () => {
  it("🔴 las seis tarjetas dicen que el histórico viene en camino", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa={false} historicoCargando />);
    expect(screen.getAllByText(/Cargando el histórico migrado/i)).toHaveLength(CON_HISTORICO.length + 1);
  });

  it("🔴 las seis repiten el motivo por el que el histórico no entra", () => {
    const aviso =
      "El histórico migrado no se puede filtrar por Método de pago: estos totales son solo del sistema.";
    render(
      <ResumenesVentas report={reporteVacio()} historicoParticipa={false} historicoAviso={aviso} />,
    );
    // Seis tablas más la tendencia: la gráfica repite el motivo igual que ellas.
    expect(screen.getAllByText(aviso)).toHaveLength(CON_HISTORICO.length + 1);
  });

  it("con la casilla desmarcada no se repite nada: no hay nada que explicar", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa={false} />);
    expect(screen.queryByText(/Cargando el histórico migrado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Solo ventas del sistema/i)).not.toBeInTheDocument();
  });
});
