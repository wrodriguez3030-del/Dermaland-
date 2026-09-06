// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { combinarDesglose, TarjetaDesglose, type FilaTarjeta } from "./desglose-tarjetas";
import type { EstadoVentas } from "@/features/ventas/ventas-api";
import type { FilaDesglose } from "@/features/ventas/venta-unificada";

/**
 * La regla que impide enseñar media tabla como si fuera entera.
 *
 * Cada tarjeta tiene DOS mitades: las ventas del sistema (que ya están en
 * memoria, filtradas por el reporte) y el histórico migrado (que viaja por
 * red). Lo que no puede pasar nunca es que falte la segunda y la tabla no lo
 * diga: sería el mismo RD$0.00 mudo que este plan existe para matar, entrando
 * por la puerta de al lado.
 */

const sistema: FilaTarjeta[] = [
  { clave: "u1", etiqueta: "Rosa Peralta", origen: "sistema", cantidad: 3, total: 300 },
];
const alegra: FilaDesglose[] = [
  { clave: "DESTENY REYNOSO", etiqueta: "DESTENY REYNOSO", origen: "alegra", cantidad: 5513, total: 20_000 },
  { clave: "", etiqueta: "Oficina", origen: "alegra", cantidad: 8197, total: 10_000 },
];

const listo = (datos: FilaDesglose[]): EstadoVentas<FilaDesglose[]> => ({ tipo: "listo", datos });

afterEach(cleanup);

describe("combinarDesglose", () => {
  it("junta las dos fuentes y ordena por importe", () => {
    const r = combinarDesglose({ sistema, historicoParticipa: true, estado: listo(alegra) });
    expect(r.filas.map((f) => f.etiqueta)).toEqual(["DESTENY REYNOSO", "Oficina", "Rosa Peralta"]);
    expect(r.soloSistema).toBe(false);
    expect(r.cargando).toBe(false);
    expect(r.error).toBeNull();
  });

  it("🔴 mientras el histórico está en camino, la tarjeta DICE que va a medias", () => {
    const r = combinarDesglose({ sistema, historicoParticipa: true, estado: { tipo: "cargando" } });
    expect(r.cargando).toBe(true);
    // Y sigue marcada como «solo del sistema»: lo que se ve todavía no lleva
    // el histórico, y callarlo lo haría pasar por el total.
    expect(r.soloSistema).toBe(true);
    expect(r.filas).toEqual(sistema);
  });

  it("🔴 si el histórico falla se avisa, no se enseñan las cifras del sistema como si fueran todo", () => {
    const r = combinarDesglose({
      sistema,
      historicoParticipa: true,
      estado: { tipo: "error", mensaje: "No se pudo cargar el histórico migrado de Alegra." },
    });
    expect(r.error).toMatch(/histórico/i);
    expect(r.soloSistema).toBe(true);
    expect(r.filas).toEqual(sistema);
  });

  it("cuando el histórico no participa en ninguna parte, no hay nada que aclarar", () => {
    // Casilla desmarcada o filtro que el histórico no sabe aplicar: arriba y
    // abajo cuentan lo mismo, así que el aviso sería ruido.
    const r = combinarDesglose({ sistema, historicoParticipa: false, estado: { tipo: "cargando" } });
    expect(r.soloSistema).toBe(false);
    expect(r.cargando).toBe(false);
    expect(r.filas).toEqual(sistema);
  });

  it("🔴 la etiqueta migrada se puede traducir: `cash` no puede convivir con «Efectivo»", () => {
    // Alegra guarda `cash`/`credit-card` y la pantalla dice «Efectivo». Sin
    // traducir, la misma tabla enseñaría las dos formas del mismo concepto y
    // parecerían dos medios de pago distintos.
    const crudas: FilaDesglose[] = [
      { clave: "cash", etiqueta: "cash", origen: "alegra", cantidad: 869, total: 2_689_272.65 },
      { clave: "", etiqueta: "Sin forma de pago", origen: "alegra", cantidad: 12_672, total: 40_912_469.65 },
    ];
    const r = combinarDesglose({
      sistema: [],
      historicoParticipa: true,
      estado: listo(crudas),
      etiquetaMigrada: (f) => (f.clave === "cash" ? "Efectivo" : f.etiqueta),
    });
    expect(r.filas.map((f) => f.etiqueta)).toEqual(["Sin forma de pago", "Efectivo"]);
    // La clave NO cambia: es lo que ata la fila a su grupo en la base.
    expect(r.filas.map((f) => f.clave)).toEqual(["", "cash"]);
  });

  it("🔴 no se cuela la mitad «sistema» del desglose: esa la pone el reporte, ya filtrada", () => {
    // El desglose de la base solo sabe filtrar por fecha, sucursal y cliente.
    // Si sus filas de sistema entraran, la misma tabla mezclaría una fila
    // filtrada por «Efectivo» con otra sin filtrar.
    const conSistema: FilaDesglose[] = [
      ...alegra,
      { clave: "u9", etiqueta: "SIN FILTRAR", origen: "sistema", cantidad: 99, total: 99_999 },
    ];
    const r = combinarDesglose({ sistema, historicoParticipa: true, estado: listo(conSistema) });
    expect(r.filas.map((f) => f.etiqueta)).not.toContain("SIN FILTRAR");
    expect(r.filas.filter((f) => f.origen === "sistema")).toEqual(sistema);
  });
});

describe("TarjetaDesglose", () => {
  const pintar = (estado: ReturnType<typeof combinarDesglose>, extra = {}) =>
    render(
      <TarjetaDesglose
        titulo="Ventas por vendedor"
        estado={estado}
        encabezadoClave="Vendedor"
        encabezadoCantidad="Ventas"
        vacio="Sin ventas con vendedor."
        {...extra}
      />,
    );

  it("🔴 cada fila migrada lleva su etiqueta de origen; las del sistema, no", () => {
    pintar(combinarDesglose({ sistema, historicoParticipa: true, estado: listo(alegra) }));
    // Dos filas migradas → dos etiquetas. `EtiquetaOrigen` no marca las del
    // sistema a propósito (marcarlas sería ruido), así que son exactamente 2.
    expect(screen.getAllByText(/Migrada de Alegra/i)).toHaveLength(2);
    const filaSistema = screen.getByText("Rosa Peralta").closest("tr")!;
    expect(within(filaSistema).queryByText(/Migrada de Alegra/i)).not.toBeInTheDocument();
  });

  it("🔴 el aviso «Solo ventas del sistema» desaparece cuando el histórico ya está dentro", () => {
    pintar(combinarDesglose({ sistema, historicoParticipa: true, estado: listo(alegra) }));
    expect(screen.queryByText(/Solo ventas del sistema/i)).not.toBeInTheDocument();
    expect(screen.getByText("DESTENY REYNOSO")).toBeInTheDocument();
  });

  it("🔴 mientras carga lo dice, y no finge que la tabla está completa", () => {
    pintar(combinarDesglose({ sistema, historicoParticipa: true, estado: { tipo: "cargando" } }));
    expect(screen.getByText(/Cargando el histórico migrado/i)).toBeInTheDocument();
  });

  it("🔴 si falla, el aviso es visible; no se enseñan ceros", () => {
    pintar(
      combinarDesglose({
        sistema,
        historicoParticipa: true,
        estado: { tipo: "error", mensaje: "No se pudo cargar el histórico migrado de Alegra." },
      }),
    );
    expect(screen.getByText(/No se pudo cargar el histórico migrado/i)).toBeInTheDocument();
    expect(screen.getByText(/Se enseñan solo las ventas del sistema/i)).toBeInTheDocument();
  });

  it("sin ninguna fila enseña el texto de vacío, no una tabla en blanco", () => {
    pintar(combinarDesglose({ sistema: [], historicoParticipa: false, estado: { tipo: "cargando" } }));
    expect(screen.getByText("Sin ventas con vendedor.")).toBeInTheDocument();
  });

  it("el tope recorta lo que se pinta, no lo que se cuenta", () => {
    const muchas: FilaTarjeta[] = Array.from({ length: 30 }, (_, i) => ({
      clave: `p${i}`,
      etiqueta: `Producto ${i}`,
      origen: "sistema" as const,
      cantidad: 1,
      total: 100 - i,
    }));
    pintar(combinarDesglose({ sistema: muchas, historicoParticipa: false, estado: { tipo: "cargando" } }), {
      tope: 10,
    });
    expect(screen.getByText("Producto 9")).toBeInTheDocument();
    expect(screen.queryByText("Producto 10")).not.toBeInTheDocument();
  });

  it("la nota se enseña tal cual: es donde se explica el dato migrado sin maquillar", () => {
    pintar(combinarDesglose({ sistema, historicoParticipa: true, estado: listo(alegra) }), {
      nota: "Alegra no registró la forma de pago en 12 672 de las facturas migradas.",
    });
    expect(screen.getByText(/12 672/)).toBeInTheDocument();
  });
});
