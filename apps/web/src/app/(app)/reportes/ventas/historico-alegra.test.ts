import { describe, it, expect } from "vitest";
import {
  filtrosDelReporteSinHistorico,
  filtrosSinHistorico,
  resolverHistorico,
} from "./historico-alegra";
import { EMPTY_FILTERS, type SalesReportFilters } from "@/features/sales/sales-report";
import type { ResumenVentasApi } from "@/features/ventas/ventas-api";

const resumen = (totalAlegra: number, cantidadAlegra: number): ResumenVentasApi => ({
  total: totalAlegra,
  cantidad: cantidadAlegra,
  itbis: 0,
  unidades: 0,
  porOrigen: {
    sistema: { total: 0, cantidad: 0, itbis: 0, unidades: 0 },
    alegra: { total: totalAlegra, cantidad: cantidadAlegra, itbis: 0, unidades: 0 },
  },
});

const listo = (total: number, cantidad: number) =>
  ({ tipo: "listo", datos: resumen(total, cantidad) }) as const;

describe("qué filtros dejan al histórico fuera", () => {
  it("nombra solo los filtros que están puestos", () => {
    expect(
      filtrosSinHistorico([
        { etiqueta: "Método de pago", activo: true },
        { etiqueta: "Cajero", activo: false },
        { etiqueta: "Producto", activo: true },
      ]),
    ).toEqual(["Método de pago", "Producto"]);
  });

  it("sin filtros activos, el histórico puede entrar", () => {
    expect(filtrosSinHistorico([{ etiqueta: "Estado", activo: false }])).toEqual([]);
  });
});

describe("el histórico en los KPIs del reporte de ventas", () => {
  it("suma el histórico cuando llegó y no hay filtros que lo estorben", () => {
    const h = resolverHistorico({
      incluir: true,
      filtrosNoAplicables: [],
      estado: listo(48454899.08, 14743),
      cantidadSistema: 0,
    });
    expect(h.participa).toBe(true);
    expect(h.total).toBeCloseTo(48454899.08, 2);
    expect(h.cantidad).toBe(14743);
    expect(h.leyenda.aviso).toBe(false);
    expect(h.leyenda.texto).toMatch(/todas migradas de Alegra/);
  });

  it("🔴 con un filtro que el histórico no sabe aplicar NO suma, y lo avisa", () => {
    // El fallo silencioso que esto evita: sumar un total SIN filtrar por
    // método de pago a otro que sí está filtrado. El número saldría enorme y
    // nadie podría cuadrarlo con nada.
    const h = resolverHistorico({
      incluir: true,
      filtrosNoAplicables: ["Método de pago"],
      estado: listo(48454899.08, 14743),
      cantidadSistema: 3,
    });
    expect(h.participa).toBe(false);
    expect(h.total).toBe(0);
    expect(h.cantidad).toBe(0);
    expect(h.leyenda.aviso).toBe(true);
    expect(h.leyenda.texto).toContain("Método de pago");
  });

  it("🔴 mientras carga no aporta nada y se marca como cargando", () => {
    // Si aportara 0 sin decir que está cargando, el reporte enseñaría un total
    // incompleto como si fuera el definitivo — el fallo original del panel.
    const h = resolverHistorico({
      incluir: true,
      filtrosNoAplicables: [],
      estado: { tipo: "cargando" },
      cantidadSistema: 0,
    });
    expect(h.cargando).toBe(true);
    expect(h.participa).toBe(false);
    expect(h.leyenda.texto).toMatch(/Cargando/i);
  });

  it("🔴 si la carga falla, avisa en vez de enseñar un total corto en silencio", () => {
    // Hoy `?vista=resumen` responde 400 hasta que se aplique la migración
    // `20260906130000_resumen_ventas_unificadas.sql`: este es el camino real.
    const h = resolverHistorico({
      incluir: true,
      filtrosNoAplicables: [],
      estado: { tipo: "error", mensaje: "La función no existe todavía." },
      cantidadSistema: 0,
    });
    expect(h.participa).toBe(false);
    expect(h.total).toBe(0);
    expect(h.leyenda.aviso).toBe(true);
    expect(h.leyenda.texto).toMatch(/solo lo del sistema/i);
  });

  it("desmarcar la casilla lo deja fuera, y lo dice sin alarmar", () => {
    const h = resolverHistorico({
      incluir: false,
      filtrosNoAplicables: [],
      estado: listo(100, 1),
      cantidadSistema: 5,
    });
    expect(h.participa).toBe(false);
    expect(h.total).toBe(0);
    expect(h.leyenda.aviso).toBe(false);
    expect(h.leyenda.texto).toMatch(/excluido/i);
  });

  it("la casilla desmarcada manda sobre el filtro incompatible", () => {
    // Los dos caminos acaban en «no suma»; el mensaje tiene que ser el que
    // explica la causa que el usuario controla.
    const h = resolverHistorico({
      incluir: false,
      filtrosNoAplicables: ["Cajero"],
      estado: listo(100, 1),
      cantidadSistema: 5,
    });
    expect(h.leyenda.texto).toMatch(/excluido/i);
  });
});

describe("qué filtros del reporte dejan al histórico fuera, uno por uno", () => {
  // 🔴 Cada línea de esta tabla es una forma concreta de mentir. Si alguien
  // borra una entrada de `filtrosDelReporteSinHistorico`, la pantalla suma los
  // RD$48 millones del histórico SIN FILTRAR a un total del sistema que sí
  // está filtrado, y lo presenta como un total filtrado. Antes esa lista era
  // un literal dentro del JSX, sin una sola prueba.
  const casos: { filtro: keyof SalesReportFilters; valor: unknown; etiqueta: string }[] = [
    { filtro: "method", valor: "cash", etiqueta: "Método de pago" },
    { filtro: "comprobante", valor: "b02", etiqueta: "Tipo de comprobante" },
    { filtro: "status", valor: "paid", etiqueta: "Estado" },
    { filtro: "cashierId", valor: "u-1", etiqueta: "Cajero" },
    { filtro: "sellerId", valor: "u-2", etiqueta: "Vendedor" },
    { filtro: "customerQuery", valor: "Ana", etiqueta: "Cliente" },
    { filtro: "productQuery", valor: "crema", etiqueta: "Producto" },
  ];

  it.each(casos)("«$etiqueta» deja el histórico fuera", ({ filtro, valor, etiqueta }) => {
    const f = { ...EMPTY_FILTERS, [filtro]: valor } as SalesReportFilters;
    expect(filtrosDelReporteSinHistorico(f)).toContain(etiqueta);
  });

  it("sin filtros, el histórico entra", () => {
    expect(filtrosDelReporteSinHistorico(EMPTY_FILTERS)).toEqual([]);
  });

  it("fecha y sucursal NO lo dejan fuera: la ruta sí sabe aplicarlos", () => {
    const f: SalesReportFilters = {
      ...EMPTY_FILTERS,
      from: "2026-01-01",
      to: "2026-09-05",
      branchId: "b-1",
    };
    expect(filtrosDelReporteSinHistorico(f)).toEqual([]);
  });

  it("«Incluir proformas» tampoco: en Alegra todo lo migrado son facturas", () => {
    const f: SalesReportFilters = { ...EMPTY_FILTERS, includeProformas: false };
    expect(filtrosDelReporteSinHistorico(f)).toEqual([]);
  });

  it("un texto de solo espacios no cuenta como filtro puesto", () => {
    const f: SalesReportFilters = { ...EMPTY_FILTERS, customerQuery: "   " };
    expect(filtrosDelReporteSinHistorico(f)).toEqual([]);
  });

  it("con varios puestos, los nombra todos", () => {
    const f: SalesReportFilters = { ...EMPTY_FILTERS, method: "cash", cashierId: "u-1" };
    expect(filtrosDelReporteSinHistorico(f)).toEqual(["Método de pago", "Cajero"]);
  });
});
