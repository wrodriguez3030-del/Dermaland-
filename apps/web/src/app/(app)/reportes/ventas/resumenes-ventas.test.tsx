// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildSalesReport, EMPTY_FILTERS } from "@/features/sales/sales-report";
import type { DesgloseVentasApi, EstadoVentas } from "@/features/ventas/ventas-api";
import type { DimensionDesglose, FilaDesglose } from "@/features/ventas/venta-unificada";

/**
 * 🔴 Qué tarjeta lleva el histórico migrado y cuál no, y que cada una lo DIGA.
 *
 * Tres de ellas —vendedor, forma de pago y producto— ya lo desglosan, porque
 * la base sabe agruparlo (migración `20260906140000_…`). Las otras cinco no:
 * la base no sabe desglosar el histórico por sucursal, cajero, cliente ni
 * comprobante, así que conservan el aviso.
 *
 * Sin esa distinción, el dueño lee arriba «Total facturado RD$48 454 899,08 ·
 * 14 743 transacciones» y abajo tarjetas que cuentan otra cosa, sin nada que
 * lo explique: exactamente el desconcierto que este plan vino a cerrar. El
 * informe de una tarea anterior afirmó que el aviso estaba puesto y no lo
 * estaba; esta prueba existe para que eso no pueda repetirse en silencio.
 */

/** Estado que devolverá `useDesgloseVentas` en la prueba en curso. */
let estadoDesglose: EstadoVentas<DesgloseVentasApi> = { tipo: "cargando" };
const pedidas: DimensionDesglose[] = [];
/** `false` cuando la pantalla NO debe pedir el desglose. */
let activoVisto: boolean[] = [];

vi.mock("@/features/ventas/ventas-api", async (original) => ({
  ...(await original<typeof import("@/features/ventas/ventas-api")>()),
  useDesgloseVentas: (dimension: DimensionDesglose, _f: unknown, activo = true) => {
    pedidas.push(dimension);
    activoVisto.push(activo);
    return estadoDesglose;
  },
}));

const { ResumenesVentas } = await import("./resumenes-ventas");

/** Las cinco que la base NO sabe desglosar: el aviso se queda en ellas. */
const CON_AVISO = [
  "Tendencia de ventas",
  "Ventas por sucursal",
  "Top cajeros / vendedores",
  "Clientes principales",
  "Comprobantes",
];
/** Las tres que ya llevan el histórico. */
const CON_HISTORICO = ["Medios de pago", "Ventas por vendedor", "Productos más vendidos"];

const reporteVacio = () => buildSalesReport([], EMPTY_FILTERS);

const migradas: FilaDesglose[] = [
  { clave: "DESTENY REYNOSO", etiqueta: "DESTENY REYNOSO", origen: "alegra", cantidad: 5513, total: 20_000 },
  { clave: "", etiqueta: "Sin forma de pago", origen: "alegra", cantidad: 12_672, total: 40_000 },
];

beforeEach(() => {
  estadoDesglose = { tipo: "listo", datos: { filas: migradas, fuentes: ["alegra"] } };
  pedidas.length = 0;
  activoVisto = [];
});
afterEach(cleanup);

describe("resúmenes del reporte de ventas", () => {
  it("las ocho tarjetas siguen ahí", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    for (const t of [...CON_AVISO, ...CON_HISTORICO]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("🔴 el aviso «Solo ventas del sistema» queda SOLO en las cinco que no desglosan el histórico", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect(screen.getAllByText(/Solo ventas del sistema/i)).toHaveLength(CON_AVISO.length);
  });

  it("🔴 las tres tarjetas nuevas enseñan de verdad el histórico migrado", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    // Una fila por tarjeta que lo pida: tres tarjetas, mismo dato falso.
    expect(screen.getAllByText("DESTENY REYNOSO").length).toBe(CON_HISTORICO.length);
    expect(screen.getAllByText(/Migrada de Alegra/i).length).toBe(CON_HISTORICO.length * 2);
  });

  it("🔴 pide las tres dimensiones, ni una más ni una menos", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect([...new Set(pedidas)].sort()).toEqual(["forma_pago", "producto", "vendedor"]);
  });

  it("🔴 sin histórico en los KPIs NO se pide el desglose: sumaría un total sin filtrar", () => {
    // `historicoParticipa` en falso significa que hay un filtro activo que el
    // histórico no sabe aplicar (o que la casilla está desmarcada). Pedirlo
    // igual traería RD$48 millones sin filtrar a una tabla que sí lo está.
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa={false} />);
    expect(activoVisto).toEqual([false, false, false]);
    expect(screen.queryByText(/Solo ventas del sistema/i)).not.toBeInTheDocument();
    expect(screen.queryByText("DESTENY REYNOSO")).not.toBeInTheDocument();
  });

  it("el aviso dice dónde SÍ está el histórico, no solo que falta", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect(screen.getAllByText(/su total está arriba y sus facturas, más abajo/i).length)
      .toBeGreaterThan(0);
  });

  it("🔴 «Sin forma de pago» se explica: es el dato migrado, no un fallo", () => {
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect(screen.getByText(/Alegra no registró la forma de pago en/i)).toBeInTheDocument();
    expect(screen.getByText(/no un fallo/i)).toBeInTheDocument();
  });

  it("mientras el histórico viaja, las tres tarjetas lo dicen en vez de enseñar la tabla a medias", () => {
    estadoDesglose = { tipo: "cargando" };
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect(screen.getAllByText(/Cargando el histórico migrado/i)).toHaveLength(CON_HISTORICO.length);
  });

  it("si el histórico falla, las tres avisan en vez de enseñar ceros", () => {
    estadoDesglose = { tipo: "error", mensaje: "No se pudo cargar el histórico migrado de Alegra." };
    render(<ResumenesVentas report={reporteVacio()} historicoParticipa />);
    expect(screen.getAllByText(/No se pudo cargar el histórico migrado/i))
      .toHaveLength(CON_HISTORICO.length);
    // El aviso del fallo YA dice que lo que se ve es solo del sistema, así que
    // el genérico no se repite encima: se queda en las cinco de siempre.
    expect(screen.getAllByText(/Se enseñan solo las ventas del sistema/i))
      .toHaveLength(CON_HISTORICO.length);
    expect(screen.getAllByText(/Solo ventas del sistema/i)).toHaveLength(CON_AVISO.length);
  });
});
