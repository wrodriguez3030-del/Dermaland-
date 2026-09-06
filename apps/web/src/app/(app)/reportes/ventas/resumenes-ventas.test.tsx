// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildSalesReport, EMPTY_FILTERS } from "@/features/sales/sales-report";
import { ResumenesVentas } from "./resumenes-ventas";

/**
 * 🔴 Estas ocho tarjetas se calculan SOLO con las ventas del sistema: el
 * resumen que da la base son dos números y no sabe desglosar el histórico
 * migrado por vendedor, producto, forma de pago ni comprobante.
 *
 * Sin el aviso, el dueño lee arriba «Total facturado RD$48 454 899,08 ·
 * 14 743 transacciones» y aquí abajo «Sin ventas con vendedor», cuando
 * `alegra_invoices.seller_name` tiene DESTENY REYNOSO con 5 513 facturas y
 * LAURA MEJIA con 1 027. Dos cifras que no cuadran y nada que lo explique:
 * exactamente el desconcierto que este plan vino a cerrar.
 *
 * El informe de la tarea anterior afirmó que este aviso estaba puesto y no lo
 * estaba. Esta prueba existe para que eso no pueda volver a pasar sin que la
 * suite se ponga roja.
 */

const TARJETAS = [
  "Tendencia de ventas",
  "Medios de pago",
  "Ventas por sucursal",
  "Top cajeros / vendedores",
  "Ventas por vendedor",
  "Productos más vendidos",
  "Clientes principales",
  "Comprobantes",
];

const reporteVacio = () => buildSalesReport([], EMPTY_FILTERS);

afterEach(cleanup);

describe("resúmenes del reporte de ventas", () => {
  it("🔴 cuando el histórico entra en los KPIs, CADA tarjeta avisa que ella no lo lleva", () => {
    render(<ResumenesVentas report={reporteVacio()} soloSistema />);
    const avisos = screen.getAllByText(/Solo ventas del sistema/i);
    expect(avisos).toHaveLength(TARJETAS.length);
  });

  it("las ocho tarjetas siguen ahí (el aviso no sustituye a ninguna)", () => {
    render(<ResumenesVentas report={reporteVacio()} soloSistema />);
    for (const t of TARJETAS) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("sin histórico en los KPIs no hay nada que aclarar: sin aviso", () => {
    // Casilla desmarcada o filtro incompatible: arriba y abajo cuentan lo
    // mismo, así que el aviso sería ruido.
    render(<ResumenesVentas report={reporteVacio()} soloSistema={false} />);
    expect(screen.queryByText(/Solo ventas del sistema/i)).not.toBeInTheDocument();
  });

  it("el aviso dice dónde SÍ está el histórico, no solo que falta", () => {
    render(<ResumenesVentas report={reporteVacio()} soloSistema />);
    expect(screen.getAllByText(/su total está arriba y sus facturas, más abajo/i).length)
      .toBeGreaterThan(0);
  });
});
