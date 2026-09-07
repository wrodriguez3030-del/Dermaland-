import { describe, it, expect } from "vitest";
import {
  comoDesgloseVentas,
  comoListadoVentas,
  comoMensajeError,
  comoResumenVentas,
  consultaVentas,
  textoDesgloseOrigen,
} from "./ventas-api";

describe("lectura del resumen de /api/ventas", () => {
  it("suma el total a partir del desglose, no de un campo suelto", () => {
    // El número grande y su explicación tienen que salir del MISMO dato: si el
    // total viniera por un lado y el desglose por otro, podrían discrepar y el
    // usuario vería «RD$100» explicado como «60 + 30».
    const r = comoResumenVentas({
      resumen: {
        total: 999,
        cantidad: 999,
        porOrigen: { sistema: { total: 60, cantidad: 2 }, alegra: { total: 30, cantidad: 1 } },
      },
    });
    expect(r.total).toBe(90);
    expect(r.cantidad).toBe(3);
  });

  it("una respuesta rota da ceros, nunca NaN en pantalla", () => {
    const r = comoResumenVentas({ resumen: { porOrigen: { alegra: { total: "no-es-un-número" } } } });
    expect(r.total).toBe(0);
    expect(r.porOrigen.alegra.total).toBe(0);
    expect(r.porOrigen.sistema.cantidad).toBe(0);
  });

  it("acepta importes en texto (PostgREST devuelve numeric como cadena)", () => {
    const r = comoResumenVentas({
      resumen: { porOrigen: { alegra: { total: "48454899.08", cantidad: "14743" } } },
    });
    expect(r.porOrigen.alegra.total).toBeCloseTo(48454899.08, 2);
    expect(r.porOrigen.alegra.cantidad).toBe(14743);
  });
});

describe("lectura del listado de /api/ventas", () => {
  it("una factura de Alegra NUNCA llega editable, aunque el JSON lo diga", () => {
    // `editable` decide si la pantalla enseña «Editar» o «Anular». No se cree a
    // la red: lo decide el origen, igual que en `venta-unificada.ts`.
    const { ventas } = comoListadoVentas({
      ventas: [{ id: "a", fecha: "2026-01-01", origen: "alegra", editable: true }],
      hayMas: false,
    });
    expect(ventas).toHaveLength(1);
    expect(ventas[0]!.editable).toBe(false);
  });

  it("descarta filas sin id o sin fecha en vez de pintar basura", () => {
    const { ventas } = comoListadoVentas({
      ventas: [{ id: "a", fecha: "2026-01-01" }, { fecha: "2026-01-02" }, { id: "c" }, null],
    });
    expect(ventas.map((v) => v.id)).toEqual(["a"]);
  });

  it("sin origen conocido, una venta es del sistema (y editable)", () => {
    const { ventas } = comoListadoVentas({ ventas: [{ id: "a", fecha: "2026-01-01" }] });
    expect(ventas[0]!.origen).toBe("sistema");
    expect(ventas[0]!.editable).toBe(true);
  });

  it("🔴 el estado del documento VIAJA: un borrador no llega como anulado", () => {
    // Si `estado` no cruzara la API, el cliente volvería a deducirlo de
    // `anulada` y la ficha pintaría badge rojo «Anulada» sobre un borrador
    // de Alegra. La ficha del cliente lee sus compras migradas por AQUÍ.
    const { ventas } = comoListadoVentas({
      ventas: [{ id: "a", fecha: "2026-01-01", origen: "alegra", anulada: true, estado: "borrador" }],
    });
    expect(ventas[0]!.estado).toBe("borrador");
    expect(ventas[0]!.anulada).toBe(true);
  });

  it("un estado que no reconocemos no se cuela: se cae a lo que dice `anulada`", () => {
    const { ventas } = comoListadoVentas({
      ventas: [
        { id: "a", fecha: "2026-01-01", anulada: true, estado: "inventado" },
        { id: "b", fecha: "2026-01-01", anulada: false },
      ],
    });
    expect(ventas[0]!.estado).toBe("anulada");
    expect(ventas[1]!.estado).toBe("vigente");
  });

  it("hayMas solo es cierto si el servidor lo dice", () => {
    expect(comoListadoVentas({ ventas: [], hayMas: "sí" }).hayMas).toBe(false);
    expect(comoListadoVentas({ ventas: [], hayMas: true }).hayMas).toBe(true);
  });
});

describe("consulta que se le manda a /api/ventas", () => {
  it("solo manda incluirAlegra cuando hay que APAGARLO", () => {
    // La ruta apaga Alegra únicamente con el literal "false"; mandar el
    // booleano serializado de cualquier otra forma lo dejaría encendido sin
    // que se note.
    expect(consultaVentas("listado", { incluirAlegra: false })).toContain("incluirAlegra=false");
    expect(consultaVentas("listado", { incluirAlegra: true })).not.toContain("incluirAlegra");
    expect(consultaVentas("listado", {})).not.toContain("incluirAlegra");
  });

  it("no manda filtros vacíos (un rango a medias no es un rango)", () => {
    const q = consultaVentas("resumen", { desde: undefined, hasta: "2026-09-05", sucursalId: "" });
    expect(q).toBe("vista=resumen&hasta=2026-09-05");
  });

  it("desplazamiento 0 sí viaja (es la primera página, no 'sin valor')", () => {
    expect(consultaVentas("listado", { desplazamiento: 0 })).toContain("desplazamiento=0");
  });

  it("🔴 el cliente viaja en la consulta: sin él, la ficha pediría las de TODOS", () => {
    // La ficha de un cliente pide `?clienteId=…`. Si ese filtro no viajara,
    // `/api/ventas` devolvería hasta 200 facturas migradas de cualquier
    // cliente del negocio —con sus nombres— y la ficha las sumaría como
    // compras suyas. Fuga entre clientes y un total inventado.
    const q = consultaVentas("listado", { clienteId: "d76d0d15-815e-4f56-a9ae-7fc21bc58af9" });
    expect(q).toContain("clienteId=d76d0d15-815e-4f56-a9ae-7fc21bc58af9");
  });

  it("un cliente vacío no viaja: pedir «de nadie» no es pedir «de todos»", () => {
    expect(consultaVentas("listado", { clienteId: "" })).not.toContain("clienteId");
  });
});

describe("texto del desglose por origen", () => {
  it("dice cuánto pone cada fuente cuando hay las dos", () => {
    const t = textoDesgloseOrigen(2, 3);
    expect(t).toContain("del sistema");
    expect(t).toContain("migradas de Alegra");
  });

  it("no habla de Alegra si no hay nada migrado en el período", () => {
    expect(textoDesgloseOrigen(4, 0)).not.toMatch(/Alegra/);
  });

  it("avisa cuando TODO lo del período es histórico migrado", () => {
    // Es el caso real de hoy: `proformas` está vacía y todo viene de Alegra.
    expect(textoDesgloseOrigen(0, 14743)).toMatch(/todas migradas de Alegra/);
  });

  it("sin ventas lo dice, no enseña un cero suelto", () => {
    expect(textoDesgloseOrigen(0, 0)).toBe("Sin ventas en el período.");
  });
});

describe("mensaje de error de la respuesta", () => {
  it("usa el del servidor cuando lo trae", () => {
    expect(comoMensajeError({ error: "La función no existe todavía." })).toBe(
      "La función no existe todavía.",
    );
  });
  it("da null cuando no hay mensaje utilizable", () => {
    expect(comoMensajeError({ error: 42 })).toBeNull();
    expect(comoMensajeError(null)).toBeNull();
  });
});

describe("lectura del desglose de /api/ventas", () => {
  it("lee las filas con su origen y sus importes en texto", () => {
    const { filas } = comoDesgloseVentas({
      desglose: [
        { clave: "DESTENY REYNOSO", etiqueta: "DESTENY REYNOSO", origen: "alegra", cantidad: "5513", total: "20000.00" },
      ],
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]!.origen).toBe("alegra");
    expect(filas[0]!.cantidad).toBe(5513);
    expect(filas[0]!.total).toBeCloseTo(20000, 2);
  });

  it("🔴 lee QUÉ FUENTES trae el desglose, que no siempre son las dos", () => {
    // `forma_pago` y `producto` solo traen Alegra. Hoy `proformas` está vacía y
    // por eso cualquiera de las tres parece completa; sin este campo, el día
    // que el POS facture la media verdad no se distinguiría de la entera.
    expect(comoDesgloseVentas({ desglose: [], fuentes: ["alegra"] }).fuentes).toEqual(["alegra"]);
    expect(comoDesgloseVentas({ desglose: [], fuentes: ["sistema", "alegra"] }).fuentes)
      .toEqual(["sistema", "alegra"]);
  });

  it("una fuente que no reconocemos no se cuela", () => {
    expect(comoDesgloseVentas({ desglose: [], fuentes: ["alegra", "vete-a-saber", 7] }).fuentes)
      .toEqual(["alegra"]);
    expect(comoDesgloseVentas({ desglose: [], fuentes: "nope" }).fuentes).toEqual([]);
  });

  it("🔴 una fila con origen desconocido se DESCARTA, no se cuela como «sistema»", () => {
    // «sistema» es el origen que `EtiquetaOrigen` pinta SIN etiqueta. Si un
    // origen raro cayera ahí por defecto, dinero migrado aparecería como venta
    // propia y nadie lo vería.
    const { filas } = comoDesgloseVentas({
      desglose: [
        { etiqueta: "Raro", origen: "vete-a-saber", cantidad: 1, total: 1 },
        { etiqueta: "Sin origen", cantidad: 1, total: 1 },
        { etiqueta: "Buena", origen: "sistema", cantidad: 1, total: 1 },
      ],
    });
    expect(filas.map((f) => f.etiqueta)).toEqual(["Buena"]);
  });

  it("descarta filas sin etiqueta en vez de pintar un importe sin nombre", () => {
    const { filas } = comoDesgloseVentas({
      desglose: [{ origen: "alegra", cantidad: 1, total: 999 }, null, "no soy un objeto"],
    });
    expect(filas).toEqual([]);
  });

  it("una respuesta sin `desglose` da lista vacía, no revienta", () => {
    expect(comoDesgloseVentas(null)).toEqual({ filas: [], fuentes: [] });
    expect(comoDesgloseVentas({})).toEqual({ filas: [], fuentes: [] });
    expect(comoDesgloseVentas({ desglose: "nope" })).toEqual({ filas: [], fuentes: [] });
  });
});

describe("consulta del desglose", () => {
  it("🔴 manda la dimensión: sin ella la ruta responde 400, no un desglose vacío", () => {
    const q = consultaVentas("desglose", { dimension: "forma_pago", desde: "2026-01-01" });
    expect(q).toContain("vista=desglose");
    expect(q).toContain("dimension=forma_pago");
    expect(q).toContain("desde=2026-01-01");
  });

  it("las otras dos vistas no arrastran una dimensión que no les toca", () => {
    expect(consultaVentas("resumen", {})).not.toContain("dimension");
    expect(consultaVentas("listado", {})).not.toContain("dimension");
  });
});
