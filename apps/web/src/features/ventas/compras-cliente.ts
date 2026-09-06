import type { Proforma } from "@/types";
import {
  collectConvertedSourceIds,
  isExcludedStatus,
  isFinalCustomerTransaction,
} from "@/features/customers/customer-purchases";
import { desdeProforma, type VentaUnificada } from "./venta-unificada";

/**
 * Compras de UN cliente, las del sistema y las migradas de Alegra en la misma
 * lista y ordenadas por fecha. PURO: recibe lo ya cargado, no toca red ni
 * reloj.
 *
 * Hasta ahora la ficha del cliente enseñaba sus compras de Alegra en otra
 * pestaña, así que quien miraba «Compras» veía una lista vacía de alguien que
 * lleva años comprando. La pestaña separada se queda —sirve para mirar solo lo
 * de Alegra—, pero el listado principal ya no las ignora.
 *
 * Las del sistema NO se toman de la API aunque también vengan ahí: se toman de
 * las proformas que la ficha ya tiene cargadas. Dos razones, las dos de peso:
 * la proforma completa es la que permite abrir, imprimir y enviar el documento
 * (la venta unificada no lleva ítems ni pagos), y sin Supabase la API no
 * devuelve nada — apoyarse en ella dejaría la ficha en blanco en desarrollo.
 */
export interface CompraCliente {
  venta: VentaUnificada;
  /** La proforma original cuando es del sistema; `null` si viene de Alegra. */
  proforma: Proforma | null;
}

/**
 * Une las proformas del cliente con sus facturas migradas, de la más reciente
 * a la más antigua.
 *
 * `ventasApi` es la página de `/api/ventas?clienteId=…`: de ahí solo se toman
 * las de Alegra. Si una venta del sistema apareciera en las dos fuentes, manda
 * la proforma local (es la que trae los ítems y las acciones).
 */
export function combinarComprasCliente(
  proformas: Proforma[],
  ventasApi: VentaUnificada[],
): CompraCliente[] {
  const filas: CompraCliente[] = proformas.map((p) => ({
    venta: desdeProforma(p),
    proforma: p,
  }));
  const yaEstan = new Set(filas.map((f) => f.venta.id));
  for (const v of ventasApi) {
    if (v.origen !== "alegra" || yaEstan.has(v.id)) continue;
    yaEstan.add(v.id);
    filas.push({ venta: v, proforma: null });
  }
  return filas.sort((a, b) => (a.venta.fecha < b.venta.fecha ? 1 : a.venta.fecha > b.venta.fecha ? -1 : 0));
}

/**
 * 🔴 UNA sola definición de «lo que este cliente ha comprado», para el KPI y
 * para la leyenda de la tabla.
 *
 * Antes había dos, a diez centímetros la una de la otra: el KPI «Total
 * gastado» salía de `computeCustomerPurchaseStats` (solo sistema, solo
 * transacciones finales) y la leyenda de un `porOrigen` propio (sistema +
 * Alegra, cualquier estado no anulado). El dueño leía «Total gastado RD$0.00 ·
 * Compras 0» justo encima de «Compras (172) · RD$X comprados». Es el mismo
 * desconcierto que motivó este plan —«el panel dice RD$0.00 teniendo 48
 * millones»— reproducido un nivel más abajo, en la pantalla que el plan venía
 * a arreglar.
 *
 * La regla es la de la casa, sin inventar nada:
 *  - Ventas del sistema: `isFinalCustomerTransaction` (la misma que usan el
 *    perfil, el reporte de clientes y la gráfica «Compras por mes»), y en las
 *    parciales cuenta lo PAGADO, no lo facturado.
 *  - Facturas de Alegra: cuentan si no están anuladas, por su total. Es lo
 *    mismo que suman el panel y el reporte de ventas para el histórico, y es
 *    todo lo que se puede: `VentaUnificada` no lleva `totalPaid` ni `balance`
 *    (lo dejó anotado la tarea 1). Una migrada con saldo abierto suma su total
 *    facturado; su parte pendiente se mira en cuentas por cobrar.
 */
export interface MetricasComprasCliente {
  /** Gasto final del cliente, las dos fuentes con la misma regla. */
  totalGastado: number;
  /** Compras que cuentan como gasto final. */
  compras: number;
  cantidadSistema: number;
  cantidadAlegra: number;
  /** Filas que la tabla lista (incluye anuladas y documentos sin cobrar). */
  listadas: number;
  /** Última compra no anulada, para «Última visita». */
  ultimaCompra: string | null;
}

/** Céntimos enteros: sumar en float miles de importes arrastra redondeo. */
const aCentavos = (n: number): number => Math.round(n * 100);

export function metricasComprasCliente(compras: CompraCliente[]): MetricasComprasCliente {
  const proformas = compras
    .map((c) => c.proforma)
    .filter((p): p is Proforma => p !== null);
  const convertidas = collectConvertedSourceIds(proformas);

  let centavos = 0;
  let cantidadSistema = 0;
  let cantidadAlegra = 0;
  let ultimaCompra: string | null = null;

  for (const { venta, proforma } of compras) {
    const excluida = proforma ? isExcludedStatus(proforma.status) : venta.anulada;
    if (!excluida && (!ultimaCompra || venta.fecha > ultimaCompra)) ultimaCompra = venta.fecha;

    if (proforma) {
      if (!isFinalCustomerTransaction(proforma, convertidas)) continue;
      centavos += aCentavos(
        proforma.status === "partially_paid" ? proforma.paid : proforma.total,
      );
      cantidadSistema += 1;
    } else {
      if (venta.anulada) continue;
      centavos += aCentavos(venta.total);
      cantidadAlegra += 1;
    }
  }

  return {
    totalGastado: centavos / 100,
    compras: cantidadSistema + cantidadAlegra,
    cantidadSistema,
    cantidadAlegra,
    listadas: compras.length,
    ultimaCompra,
  };
}

/**
 * Línea que explica la tabla de compras. Habla de COMPRAS, no de «ventas» ni
 * de «período»: esta pantalla no tiene filtro de fechas y la tabla se titula
 * «Compras». Y si la tabla lista más filas de las que cuentan, lo dice — si no,
 * el contador de la pestaña y el KPI parecerían contradecirse otra vez.
 */
export function textoComprasCliente(m: MetricasComprasCliente): string {
  const plural = (n: number) => (n === 1 ? "compra" : "compras");
  if (m.listadas === 0) return "Este cliente aún no tiene compras registradas.";

  const origen =
    m.cantidadAlegra === 0
      ? `${m.compras} ${plural(m.compras)} del sistema`
      : m.cantidadSistema === 0
        ? `${m.compras} ${plural(m.compras)} · todas migradas de Alegra`
        : `${m.compras} ${plural(m.compras)} · ${m.cantidadSistema} del sistema, ` +
          `${m.cantidadAlegra} migradas de Alegra`;

  const noCuentan = m.listadas - m.compras;
  const cola =
    noCuentan > 0
      ? ` · la tabla lista ${m.listadas} filas: ${noCuentan} no cuentan como gasto (anuladas o sin cobrar)`
      : "";
  return `${origen}${cola}`;
}
