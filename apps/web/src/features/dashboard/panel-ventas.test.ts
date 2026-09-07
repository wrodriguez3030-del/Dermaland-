import { describe, it, expect } from "vitest";
import {
  etiquetaPagoMigrado,
  fundirPorClave,
  mesesDelSistema,
  origenesDe,
  pagosDelSistema,
  productosDelSistema,
  reclavarPagoMigrado,
  serieDeTendencia,
  sucursalesDelSistema,
  tarjetaDePanel,
  ventanaDeTendencia,
} from "./panel-ventas";
import { mesesDeLaTendencia } from "./dashboard-metrics";
import type { EstadoTarjeta, FilaTarjeta } from "@/features/ventas/desglose-tarjeta";

/**
 * 🔴 Lo que estas pruebas protegen: que las cuatro tarjetas del panel dejen de
 * salir en blanco, y que al arreglarlas no empiecen a MENTIR.
 *
 * Los datos son los REALES de septiembre de 2026, medidos contra producción
 * (89 facturas · RD$317 723,13). Si alguna de estas cifras deja de salir, el
 * dueño vuelve a ver «Sin datos este mes.» con RD$317 mil delante.
 */

/** Septiembre 2026 por sucursal, tal como lo devuelve la base. */
const SUCURSALES_MIGRADAS: FilaTarjeta[] = [
  { clave: "b-villa", etiqueta: "Dermaland  Villa Olga", origen: "alegra", cantidad: 41, total: 165_985 },
  { clave: "b-princ", etiqueta: "DermaLand Principal", origen: "alegra", cantidad: 48, total: 151_738.13 },
];

/** Septiembre 2026 por forma de pago, con las claves crudas de Alegra. */
const PAGOS_MIGRADOS: FilaTarjeta[] = [
  { clave: "credit-card", etiqueta: "credit-card", origen: "alegra", cantidad: 52, total: 182_435 },
  { clave: "cash", etiqueta: "cash", origen: "alegra", cantidad: 36, total: 133_838.13 },
  { clave: "debit-card", etiqueta: "debit-card", origen: "alegra", cantidad: 1, total: 1_450 },
];

const estado = (filas: FilaTarjeta[]): EstadoTarjeta => ({
  filas,
  cargando: false,
  error: null,
  soloSistema: false,
});

describe("origenesDe", () => {
  it("🔴 dice que hay histórico migrado cuando lo hay", () => {
    // Es lo que decide si la tarjeta lleva la etiqueta «Migrada de Alegra».
    // Sin ella, RD$317 mil de otro sistema pasarían por ventas propias.
    expect(origenesDe(SUCURSALES_MIGRADAS)).toEqual(["alegra"]);
  });

  it("con las dos fuentes las nombra en orden estable: sistema primero", () => {
    expect(
      origenesDe([
        ...SUCURSALES_MIGRADAS,
        { clave: "b-villa", etiqueta: "Villa Olga", origen: "sistema", cantidad: 2, total: 900 },
      ]),
    ).toEqual(["sistema", "alegra"]);
  });

  it("🔴 una fila vacía NO cuenta como fuente", () => {
    // Anunciar «histórico migrado» por una fila a cero es tan falso como
    // callarlo cuando trae dinero.
    const vacia: FilaTarjeta[] = [{ clave: "x", etiqueta: "x", origen: "alegra", cantidad: 0, total: 0 }];
    expect(origenesDe(vacia)).toEqual([]);
  });

  it("sin filas no hay ninguna fuente que anunciar", () => {
    expect(origenesDe([])).toEqual([]);
  });
});

describe("fundirPorClave", () => {
  it("🔴 una sucursal vendida por los DOS caminos sale en UNA sola barra", () => {
    // Sin fundir, «Ventas por sucursal» enseñaría dos barras «Villa Olga» con
    // la mitad del dinero cada una, y el dueño no sabría cuál mirar.
    const filas = fundirPorClave([
      ...SUCURSALES_MIGRADAS,
      { clave: "b-villa", etiqueta: "Dermaland  Villa Olga", origen: "sistema", cantidad: 3, total: 1_000 },
    ]);
    expect(filas).toHaveLength(2);
    const villa = filas.find((f) => f.clave === "b-villa")!;
    expect(villa.total).toBe(166_985);
    expect(villa.cantidad).toBe(44);
    expect(villa.origenes).toEqual(["sistema", "alegra"]);
  });

  it("ordena por importe, de mayor a menor", () => {
    expect(fundirPorClave(SUCURSALES_MIGRADAS).map((f) => f.etiqueta)).toEqual([
      "Dermaland  Villa Olga",
      "DermaLand Principal",
    ]);
    expect(fundirPorClave(SUCURSALES_MIGRADAS)[0]!.total).toBe(165_985);
  });

  it("🔴 dos grupos del mismo importe salen SIEMPRE en el mismo orden", () => {
    // Sin desempate, la gráfica cambiaría de orden entre renders.
    const empate: FilaTarjeta[] = [
      { clave: "b", etiqueta: "Bravo", origen: "alegra", cantidad: 1, total: 100 },
      { clave: "a", etiqueta: "Alfa", origen: "alegra", cantidad: 1, total: 100 },
    ];
    expect(fundirPorClave(empate).map((f) => f.etiqueta)).toEqual(["Alfa", "Bravo"]);
    expect(fundirPorClave([...empate].reverse()).map((f) => f.etiqueta)).toEqual(["Alfa", "Bravo"]);
  });

  it("cuando las dos mitades escriben el nombre distinto, manda la del mayor importe", () => {
    const filas = fundirPorClave([
      { clave: "p1", etiqueta: "LIDOCAINA SPRAY", origen: "alegra", cantidad: 50, total: 37_513.13 },
      { clave: "p1", etiqueta: "Lidocaína spray", origen: "sistema", cantidad: 1, total: 700 },
    ]);
    expect(filas[0]!.etiqueta).toBe("LIDOCAINA SPRAY");
  });

  it("sin filas devuelve una lista vacía, no una fila fantasma", () => {
    expect(fundirPorClave([])).toEqual([]);
  });
});

describe("tarjetaDePanel", () => {
  it("🔴 la tarjeta de sucursales trae las cifras REALES de septiembre", () => {
    const t = tarjetaDePanel(estado(SUCURSALES_MIGRADAS));
    expect(t.filas.map((f) => f.total)).toEqual([165_985, 151_738.13]);
    expect(t.origenes).toEqual(["alegra"]);
    expect(t.cargando).toBe(false);
    expect(t.error).toBeNull();
  });

  it("arrastra el estado de carga y el de error sin inventarse filas", () => {
    const cargando = tarjetaDePanel({ filas: [], cargando: true, error: null, soloSistema: true });
    expect(cargando.cargando).toBe(true);
    expect(cargando.filas).toEqual([]);
    const roto = tarjetaDePanel({ filas: [], cargando: false, error: "falló", soloSistema: true });
    expect(roto.error).toBe("falló");
  });
});

describe("las mitades del sistema, traducidas", () => {
  it("sucursalesDelSistema conserva el nombre como clave, para poder fundir", () => {
    // `salesByBranch` pierde el id: la única clave común con la mitad migrada
    // es el nombre, que las dos sacan de `branches.name`.
    expect(sucursalesDelSistema([{ label: "Villa Olga", value: 900 }])).toEqual([
      { clave: "Villa Olga", etiqueta: "Villa Olga", origen: "sistema", cantidad: 0, total: 900 },
    ]);
  });

  it("pagosDelSistema deja fuera los grupos a cero", () => {
    // `byPaymentMethod` devuelve siempre los cuatro grupos: en una dona eso son
    // porciones invisibles con leyenda.
    expect(
      pagosDelSistema([
        { label: "Efectivo", value: 500 },
        { label: "Transferencia", value: 0 },
      ]).map((f) => f.etiqueta),
    ).toEqual(["Efectivo"]);
  });

  it("productosDelSistema usa el id del producto, no el SKU", () => {
    // El histórico de Alegra no trae SKU: la única clave que comparten las dos
    // mitades es `products.id`.
    expect(
      productosDelSistema([{ productId: "p1", name: "Crema", sku: "SKU-1", units: 2, total: 700 }]),
    ).toEqual([{ clave: "p1", etiqueta: "Crema", origen: "sistema", cantidad: 2, total: 700 }]);
  });
});

describe("forma de pago migrada", () => {
  it("🔴 traduce las claves de Alegra al idioma de la pantalla", () => {
    // Sin esto la dona enseñaría «cash» y «credit-card» al lado de «Efectivo».
    expect(etiquetaPagoMigrado({ clave: "cash", etiqueta: "cash" })).toBe("Efectivo");
    expect(etiquetaPagoMigrado({ clave: "credit-card", etiqueta: "credit-card" })).toBe(
      "Tarjeta de crédito",
    );
    expect(etiquetaPagoMigrado({ clave: "debit-card", etiqueta: "debit-card" })).toBe(
      "Tarjeta de débito",
    );
  });

  it("una clave que no conocemos se enseña tal como vino, no se descarta", () => {
    expect(etiquetaPagoMigrado({ clave: "bizum", etiqueta: "bizum" })).toBe("bizum");
  });

  it("🔴 la clave vacía conserva el texto que puso la BASE", () => {
    // `METODO_ETIQUETA[""]` dice «Sin método» y la base dice «Sin forma de
    // pago»: serían dos nombres para lo mismo en la misma tarjeta.
    expect(etiquetaPagoMigrado({ clave: "", etiqueta: "Sin forma de pago" })).toBe(
      "Sin forma de pago",
    );
  });

  it("🔴 `Efectivo` del sistema y `cash` de Alegra caen en el MISMO grupo", () => {
    // Es lo único que impide dos porciones «Efectivo» en la misma dona.
    const filas = fundirPorClave([
      ...PAGOS_MIGRADOS.map(reclavarPagoMigrado),
      { clave: "Efectivo", etiqueta: "Efectivo", origen: "sistema", cantidad: 0, total: 2_000 },
    ]);
    const efectivo = filas.filter((f) => f.etiqueta === "Efectivo");
    expect(efectivo).toHaveLength(1);
    expect(efectivo[0]!.total).toBe(135_838.13);
    expect(efectivo[0]!.origenes).toEqual(["sistema", "alegra"]);
  });

  it("🔴 la tarjeta de cobros trae las cifras REALES de septiembre", () => {
    const t = tarjetaDePanel(estado(PAGOS_MIGRADOS.map(reclavarPagoMigrado)));
    expect(t.filas.map((f) => [f.etiqueta, f.total])).toEqual([
      ["Tarjeta de crédito", 182_435],
      ["Efectivo", 133_838.13],
      ["Tarjeta de débito", 1_450],
    ]);
  });
});

describe("la serie de tendencia", () => {
  const REF = new Date(2026, 8, 15); // 15 sep 2026
  const CUBOS = mesesDeLaTendencia(6, REF);
  /** Los seis meses reales medidos contra producción. */
  const MIGRADOS: FilaTarjeta[] = [
    { clave: "2026-04", etiqueta: "Abr 2026", origen: "alegra", cantidad: 432, total: 1_580_965.66 },
    { clave: "2026-05", etiqueta: "May 2026", origen: "alegra", cantidad: 455, total: 1_641_881.92 },
    { clave: "2026-06", etiqueta: "Jun 2026", origen: "alegra", cantidad: 446, total: 1_543_623.44 },
    { clave: "2026-07", etiqueta: "Jul 2026", origen: "alegra", cantidad: 590, total: 2_086_983.23 },
    { clave: "2026-08", etiqueta: "Ago 2026", origen: "alegra", cantidad: 471, total: 1_908_052.71 },
    { clave: "2026-09", etiqueta: "Sep 2026", origen: "alegra", cantidad: 89, total: 317_723.13 },
  ];

  it("🔴 la línea deja de estar plana: seis puntos con los importes reales", () => {
    const serie = serieDeTendencia(fundirPorClave(MIGRADOS), CUBOS);
    expect(serie).toEqual([
      { label: "Abr 2026", value: 1_580_965.66 },
      { label: "May 2026", value: 1_641_881.92 },
      { label: "Jun 2026", value: 1_543_623.44 },
      { label: "Jul 2026", value: 2_086_983.23 },
      { label: "Ago 2026", value: 1_908_052.71 },
      { label: "Sep 2026", value: 317_723.13 },
    ]);
  });

  it("🔴 NO se ordena por importe: un mes flojo se queda en su sitio", () => {
    // Septiembre va incompleto y es el más bajo de los seis. Si la serie se
    // ordenara por dinero —como las otras tres tarjetas— saltaría al principio
    // y la «tendencia» dejaría de ser una tendencia.
    const serie = serieDeTendencia(fundirPorClave(MIGRADOS), CUBOS);
    expect(serie.map((p) => p.label)).toEqual(CUBOS.map((c) => c.etiqueta));
    expect(serie.at(-1)!.value).toBe(317_723.13);
  });

  it("un mes sin ventas vale 0 y sigue dibujándose", () => {
    const serie = serieDeTendencia(fundirPorClave(MIGRADOS.slice(0, 3)), CUBOS);
    expect(serie.map((p) => p.value)).toEqual([1_580_965.66, 1_641_881.92, 1_543_623.44, 0, 0, 0]);
  });

  it("suma las dos fuentes en el MISMO punto", () => {
    const serie = serieDeTendencia(
      fundirPorClave([
        ...MIGRADOS,
        { clave: "2026-09", etiqueta: "Sep 2026", origen: "sistema", cantidad: 2, total: 1_000 },
      ]),
      CUBOS,
    );
    expect(serie.at(-1)!.value).toBe(318_723.13);
    expect(serie).toHaveLength(6);
  });

  it("🔴 la ventana que se le pide a la base cubre los seis cubos, ni uno más", () => {
    // Sin `desde`/`hasta` la base devolvería un grupo por cada mes del
    // histórico; con una ventana mal calculada faltaría el primer o el último
    // punto de la línea.
    expect(ventanaDeTendencia(CUBOS)).toEqual({ desde: "2026-04-01", hasta: "2026-09-30" });
  });

  it("🔴 el último día del mes se calcula, no se supone", () => {
    // Febrero de un bisiesto tiene 29. Poner 30 o 31 pediría un rango
    // inválido; poner 28 dejaría fuera las ventas del último día.
    expect(ventanaDeTendencia(mesesDeLaTendencia(2, new Date(2028, 1, 10)))).toEqual({
      desde: "2028-01-01",
      hasta: "2028-02-29",
    });
    expect(ventanaDeTendencia(mesesDeLaTendencia(1, new Date(2026, 10, 3)))).toEqual({
      desde: "2026-11-01",
      hasta: "2026-11-30",
    });
  });

  it("mesesDelSistema casa cada total con su cubo por posición", () => {
    const filas = mesesDelSistema(
      CUBOS.map((c, i) => ({ label: c.etiqueta, value: i * 100 })),
      CUBOS,
    );
    expect(filas.map((f) => [f.clave, f.total])).toEqual([
      ["2026-04", 0],
      ["2026-05", 100],
      ["2026-06", 200],
      ["2026-07", 300],
      ["2026-08", 400],
      ["2026-09", 500],
    ]);
  });

  it("una serie del sistema más corta no rompe la línea: los cubos que faltan valen 0", () => {
    expect(mesesDelSistema([{ label: "Abr 2026", value: 700 }], CUBOS).map((f) => f.total)).toEqual([
      700, 0, 0, 0, 0, 0,
    ]);
  });
});
