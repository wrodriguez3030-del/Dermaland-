/**
 * Las cuatro tarjetas de ventas del panel, calculadas SIN React ni DOM.
 *
 * 🔴 Qué estaba roto y por qué esto existe.
 *
 * «Ventas por sucursal», «Cobros por método de pago», «Tendencia mensual» y
 * «Top productos del mes» salían EN BLANCO en producción —«Sin datos este
 * mes.» y una línea plana en cero— con RD$317 723,13 de septiembre delante.
 * Las cuatro se alimentaban de `proformas`, que tiene 0 filas: el punto de
 * venta propio todavía no ha cobrado nada y todo el histórico está en
 * `alegra_invoices`. Son las tarjetas que el dueño mira primero.
 *
 * 🔴 Por qué aquí SÍ se funden los dos orígenes en un solo grupo, y en el
 * reporte de ventas NO.
 *
 * En el reporte (`reportes/ventas/desglose-tarjetas.tsx`) las filas del
 * sistema salen de un `SalesReport` que aplica filtros que el histórico no
 * sabe aplicar (método, comprobante, estado, cajero…): fundirlas sumaría una
 * mitad filtrada por «Efectivo» con otra sin filtrar, así que allí cada fila
 * va suelta y lleva su etiqueta de origen.
 *
 * En el panel los dos lados llevan EXACTAMENTE los mismos filtros —sucursal,
 * mes y año— así que «Ventas por sucursal» tiene que decir cuánto vendió Villa
 * Olga, no cuánto vendió Villa Olga por el sistema y cuánto por Alegra en dos
 * barras distintas. Se funden por clave, y la tarjeta dice a nivel de tarjeta
 * de qué fuentes está hecha (`origenesDe` + la etiqueta de histórico migrado
 * en la cabecera): una barra no puede llevar una insignia, y en tabletas no
 * hay hover, así que un `title` no cuenta como decirlo.
 *
 * La otra mitad de la regla —cuándo se avisa de que falta el histórico— NO se
 * reimplementa: es `combinarDesglose` (`features/ventas/desglose-tarjeta.ts`),
 * la misma que usa el reporte.
 */
import type { EstadoTarjeta, FilaTarjeta } from "@/features/ventas/desglose-tarjeta";
import type { OrigenVenta } from "@/features/ventas/venta-unificada";
import { METODO_ETIQUETA } from "@/features/alegra/sales-report";
import {
  ETIQUETA_SIN_SUCURSAL,
  mesesDeLaTendencia,
  type BranchValue,
  type CuboMes,
  type LabeledValue,
  type TopProductRow,
} from "./dashboard-metrics";

/** Un grupo del panel, ya fundido: puede venir de una fuente o de las dos. */
export interface FilaPanel {
  clave: string;
  etiqueta: string;
  /** Las fuentes que aportan a ESTE grupo, en orden estable. Nunca vacío. */
  origenes: OrigenVenta[];
  /** Ventas / unidades del grupo, según la tarjeta. */
  cantidad: number;
  total: number;
}

/** Lo que necesita una tarjeta del panel para pintarse. */
export interface TarjetaPanel {
  filas: FilaPanel[];
  /** `true` mientras el histórico está en camino: falta media tarjeta y hay que decirlo. */
  cargando: boolean;
  /** Mensaje de fallo visible, o `null`. Nunca se enseñan ceros en su lugar. */
  error: string | null;
  /** Las fuentes que aportan algo a la tarjeta ENTERA. */
  origenes: OrigenVenta[];
}

/** Orden estable de los orígenes: primero el sistema, después lo migrado. */
const ORDEN_ORIGEN: OrigenVenta[] = ["sistema", "alegra"];

/**
 * Qué fuentes aportan DE VERDAD a un conjunto de filas. Un grupo con todo a
 * cero no cuenta: anunciar «histórico migrado» por una fila vacía sería tan
 * falso como callarlo cuando sí trae dinero.
 */
export function origenesDe(
  filas: readonly { origen: OrigenVenta; cantidad: number; total: number }[],
): OrigenVenta[] {
  const vistos = new Set<OrigenVenta>();
  for (const f of filas) {
    if (f.cantidad === 0 && f.total === 0) continue;
    vistos.add(f.origen);
  }
  return ORDEN_ORIGEN.filter((o) => vistos.has(o));
}

/**
 * Funde por clave las filas que `combinarDesglose` dejó sueltas (una por
 * origen) y ordena por importe. La etiqueta que gana es la de la fila de MAYOR
 * importe del grupo: si el sistema y Alegra escriben el nombre de un producto
 * distinto, manda el que representa más dinero.
 */
export function fundirPorClave(filas: FilaTarjeta[]): FilaPanel[] {
  const acc = new Map<string, FilaPanel & { mayor: number }>();
  for (const f of filas) {
    const previo = acc.get(f.clave);
    if (!previo) {
      acc.set(f.clave, {
        clave: f.clave,
        etiqueta: f.etiqueta,
        origenes: [f.origen],
        cantidad: f.cantidad,
        total: f.total,
        mayor: f.total,
      });
      continue;
    }
    previo.cantidad += f.cantidad;
    previo.total += f.total;
    if (!previo.origenes.includes(f.origen)) {
      previo.origenes = ORDEN_ORIGEN.filter((o) => o === f.origen || previo.origenes.includes(o));
    }
    if (f.total > previo.mayor) {
      previo.mayor = f.total;
      previo.etiqueta = f.etiqueta;
    }
  }
  return [...acc.values()]
    .map(({ mayor: _mayor, ...fila }) => fila)
    // Desempate por etiqueta: sin él, dos grupos del mismo importe podrían
    // cambiar de orden entre renders y la gráfica parpadearía.
    .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

/**
 * Convierte un `EstadoTarjeta` (filas sueltas por origen) en una tarjeta del
 * panel, fundiendo por clave.
 *
 * `reclavarMigrada` se aplica SOLO a las filas del histórico, antes de fundir,
 * y puede cambiar su CLAVE además de su etiqueta. Existe por la forma de pago:
 * Alegra agrupa por `cash` y el sistema por «Efectivo», así que sin reclavar
 * la dona enseñaría dos porciones «Efectivo» con la mitad del dinero cada una.
 * `combinarDesglose` no sirve para esto —su `etiquetaMigrada` sólo cambia el
 * texto, no la clave— y ampliarlo rompería al reporte, que necesita las claves
 * separadas por origen.
 */
export function tarjetaDePanel(
  estado: EstadoTarjeta,
  reclavarMigrada?: (fila: FilaTarjeta) => FilaTarjeta,
): TarjetaPanel {
  const filas = reclavarMigrada
    ? estado.filas.map((f) => (f.origen === "alegra" ? reclavarMigrada(f) : f))
    : estado.filas;
  return {
    filas: fundirPorClave(filas),
    cargando: estado.cargando,
    error: estado.error,
    origenes: origenesDe(filas),
  };
}

// ── Las mitades del sistema, traducidas al formato común ────────────────────
// `combinarDesglose` espera `FilaTarjeta[]`; lo que el panel ya tiene
// calculado son `LabeledValue[]` y `TopProductRow[]`. Estas funciones sólo
// cambian la forma: ni suman, ni filtran, ni deciden nada.

/**
 * 🔴 La clave de una fila de sucursal, para las DOS mitades.
 *
 * Es el `branches.id` — el mismo espacio de ids que agrupa la base
 * (`alegra_invoices.branch_id` referencia `public.branches(id)`) — salvo
 * cuando no hay sede que nombrar, y entonces las dos mitades caen en la clave
 * vacía para que «Sin sucursal» sea UNA fila y no dos.
 *
 * Existe porque durante un tiempo el sistema clavó por NOMBRE y la base por
 * UUID: las dos mitades no se fundían nunca. Villa Olga salía en dos barras
 * bajo una cabecera que decía «Suma las ventas del sistema y el histórico
 * migrado», y el insight llegó a decir «Principal lidera las ventas del mes»
 * con RD$150 000 cuando Villa Olga llevaba RD$200 000: el panel afirmando algo
 * FALSO sobre el negocio.
 */
export function claveSucursal(id: string, etiqueta: string): string {
  return etiqueta === ETIQUETA_SIN_SUCURSAL ? "" : id;
}

/**
 * Ventas por sucursal del sistema, clavadas por id para poder fundirse con la
 * mitad migrada.
 */
export function sucursalesDelSistema(filas: BranchValue[]): FilaTarjeta[] {
  return filas.map((f) => ({
    clave: claveSucursal(f.id, f.label),
    etiqueta: f.label,
    origen: "sistema" as const,
    // `salesByBranch` no cuenta transacciones, solo suma importes: inventar un
    // conteo aquí sería peor que no tenerlo.
    cantidad: 0,
    total: f.value,
  }));
}

/**
 * La fila migrada de sucursal ya viene clavada por `branch_id`; lo único que
 * hace falta es que una factura SIN sede caiga en la misma clave que una venta
 * del sistema sin sede que nombrar. Se pasa como `reclavarMigrada`, igual que
 * en la dona de formas de pago.
 */
export function reclavarSucursalMigrada(fila: FilaTarjeta): FilaTarjeta {
  return { ...fila, clave: claveSucursal(fila.clave, fila.etiqueta) };
}

/**
 * Cobros por método del sistema. `paymentsByMethod` ya etiqueta con
 * `PAYMENT_METHOD_LABEL` («Efectivo», «Tarjeta»…) y la mitad migrada se
 * traduce con `METODO_ETIQUETA` («Efectivo», «Tarjeta de crédito»…): «Efectivo»
 * cae en el mismo grupo, y «Tarjeta» del sistema no se funde con «Tarjeta de
 * crédito» de Alegra porque NO son lo mismo — el sistema no distingue crédito
 * de débito y Alegra sí. Fundirlas inventaría un detalle que el sistema no
 * tiene.
 */
export function pagosDelSistema(filas: LabeledValue[]): FilaTarjeta[] {
  return filas
    // Un grupo a cero no es información: `paymentsByMethod` ya no los devuelve,
    // pero una barra de longitud cero en la dona sería una porción invisible
    // con leyenda.
    .filter((f) => f.value !== 0)
    .map((f) => ({
      clave: f.label,
      etiqueta: f.label,
      origen: "sistema" as const,
      cantidad: 0,
      total: f.value,
    }));
}

/**
 * Etiqueta de una fila migrada de forma de pago. Alegra guarda `cash` /
 * `credit-card`; se traduce con el MISMO diccionario que ya usa la tabla del
 * histórico (`METODO_ETIQUETA`), no con uno nuevo. La clave vacía se deja como
 * vino: la base ya la resolvió a «Sin forma de pago».
 */
export function etiquetaPagoMigrado(fila: { clave: string; etiqueta: string }): string {
  return fila.clave ? (METODO_ETIQUETA[fila.clave] ?? fila.etiqueta) : fila.etiqueta;
}

/**
 * 🔴 La clave de las filas migradas de forma de pago pasa a ser su ETIQUETA
 * traducida, para que «Efectivo» del sistema y `cash` de Alegra caigan en el
 * mismo grupo. Sin esto la dona enseñaría dos porciones «Efectivo», una con
 * cada mitad del dinero.
 */
export function reclavarPagoMigrado(fila: FilaTarjeta): FilaTarjeta {
  const etiqueta = etiquetaPagoMigrado(fila);
  return { ...fila, clave: etiqueta, etiqueta };
}

/**
 * Top productos del sistema. La clave es el id del producto, que es EXACTAMENTE
 * la misma que usa la base para los renglones migrados: así un producto que se
 * vendió por los dos caminos sale en una fila y no en dos.
 */
export function productosDelSistema(filas: TopProductRow[]): FilaTarjeta[] {
  return filas.map((p) => ({
    clave: p.productId,
    etiqueta: p.name,
    origen: "sistema" as const,
    // 🔴 Unidades en el sistema, RENGLONES de factura en lo migrado: el
    // histórico de Alegra no trae la unidad con precisión suficiente para
    // sumarla (`alegra_invoice_items.quantity` es numeric(14,3) y redondear
    // unidades vendidas es mentir). La tarjeta lo dice bajo la tabla.
    cantidad: p.units,
    total: p.total,
  }));
}

/**
 * La serie mensual del sistema, cubo a cubo. La clave es `YYYY-MM`: la MISMA
 * que emite la base en la dimensión `mes`, que es lo único que hace que los
 * dos orígenes caigan en el mismo punto de la línea.
 */
export function mesesDelSistema(serie: LabeledValue[], cubos: CuboMes[]): FilaTarjeta[] {
  return cubos.map((c, i) => ({
    clave: c.clave,
    etiqueta: c.etiqueta,
    origen: "sistema" as const,
    cantidad: 0,
    // `monthlyTrend` devuelve los cubos en el MISMO orden que
    // `mesesDeLaTendencia` (los construye con ella), así que el índice casa.
    // Si algún día dejaran de casar, un cubo sin valor vale 0, no `NaN`.
    total: serie[i]?.value ?? 0,
  }));
}

/**
 * La serie de la gráfica de tendencia: un punto por cubo, SIEMPRE los mismos
 * seis, en orden cronológico y con el total de las dos fuentes.
 *
 * 🔴 No se usa `tarjetaDePanel` aquí porque una serie de tiempo no se ordena
 * por importe: un mes flojo no puede saltar al final de la línea. Se recorre
 * la lista de cubos, que ya viene ordenada.
 */
export function serieDeTendencia(filas: FilaPanel[], cubos: CuboMes[]): LabeledValue[] {
  const porClave = new Map(filas.map((f) => [f.clave, f]));
  return cubos.map((c) => ({ label: c.etiqueta, value: porClave.get(c.clave)?.total ?? 0 }));
}

/**
 * La ventana de fechas que hay que pedirle a la base para la tendencia.
 *
 * 🔴 Es la ÚNICA tarjeta que NO respeta el filtro de mes/año del panel: es una
 * serie de tiempo y recortarla al mes elegido la colapsaría a un solo punto.
 * Así lo hacía ya `monthlyTrend`, que filtra por sucursal y no por periodo, y
 * ese criterio no cambia. Lo que sí se hace es acotar la petición a los seis
 * cubos que se dibujan: sin `desde`/`hasta` la base devolvería un grupo por
 * cada mes del histórico.
 */
export function ventanaDeTendencia(cubos: CuboMes[]): { desde: string; hasta: string } {
  const primero = cubos[0];
  const ultimo = cubos[cubos.length - 1];
  // Sin cubos no hay ventana que pedir; quien llame no lanza la petición.
  if (!primero || !ultimo) return { desde: "", hasta: "" };
  const [anio, mes] = ultimo.clave.split("-").map(Number) as [number, number];
  // Día 0 del mes siguiente = último día de éste (sin sorpresas de febrero ni
  // de años bisiestos).
  const ultimoDia = new Date(anio, mes, 0).getDate();
  return { desde: `${primero.clave}-01`, hasta: `${ultimo.clave}-${String(ultimoDia).padStart(2, "0")}` };
}

/** Los seis cubos de la tendencia, para quien no quiera importar dos módulos. */
export { mesesDeLaTendencia };
