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
  /**
   * Cuántas de las LISTADAS vienen de Alegra. No es lo mismo que
   * `cantidadAlegra`, que solo cuenta las que suman gasto: sin este número, la
   * leyenda no puede decir la verdad sobre una tabla en la que nada cuenta.
   */
  listadasAlegra: number;
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

    const cuenta = centavosQueCuentan({ venta, proforma }, convertidas);
    if (proforma) {
      if (cuenta === null) continue;
      centavos += cuenta;
      cantidadSistema += 1;
    } else {
      if (cuenta === null) continue;
      centavos += cuenta;
      cantidadAlegra += 1;
    }
  }

  return {
    totalGastado: centavos / 100,
    compras: cantidadSistema + cantidadAlegra,
    cantidadSistema,
    cantidadAlegra,
    listadas: compras.length,
    listadasAlegra: compras.filter((c) => c.proforma === null).length,
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

  // 🔴 Cuando NADA cuenta como gasto hay que hablar de lo LISTADO y de su
  // origen, no del sistema. Un cliente cuya única factura migrada esté anulada
  // leía «0 compras del sistema» con la etiqueta «Migrada de Alegra» visible
  // dos centímetros más abajo: la frase atribuía al sistema una lista que es
  // 100 % migrada, justo en la pantalla que se arregló para dejar de mentir
  // sobre el origen.
  if (m.compras === 0) {
    const deDonde =
      m.listadasAlegra === m.listadas
        ? "todas migradas de Alegra"
        : m.listadasAlegra === 0
          ? "todas del sistema"
          : `${m.listadas - m.listadasAlegra} del sistema, ${m.listadasAlegra} migradas de Alegra`;
    return (
      `Ninguna de las ${m.listadas} ${plural(m.listadas)} listadas cuenta como gasto ` +
      `(anuladas o sin cobrar) · ${deDonde}`
    );
  }

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

/**
 * 🔴 Cuánto cuenta ESTA compra, en centavos enteros. `null` = no cuenta.
 *
 * UNA sola definición para el KPI «Total gastado» de la ficha y para el gráfico
 * «Compras por mes». Cuando eran dos, las barras podían no sumar el número
 * grande de arriba y nadie sabría cuál creer.
 *
 * Las reglas que encierra, y por qué:
 *  - Del sistema: solo las transacciones finales del cliente
 *    (`isFinalCustomerTransaction` descarta las proformas convertidas, para no
 *    contar dos veces la misma venta), y una pagada a medias cuenta lo PAGADO,
 *    no lo facturado.
 *  - De Alegra: cuenta el total salvo que esté anulada. No hay pagos parciales
 *    que distinguir porque la migración trajo la factura, no su cobro.
 */
export function centavosQueCuentan(
  { venta, proforma }: CompraCliente,
  convertidas: Set<string>,
): number | null {
  if (proforma) {
    if (!isFinalCustomerTransaction(proforma, convertidas)) return null;
    return aCentavos(proforma.status === "partially_paid" ? proforma.paid : proforma.total);
  }
  // Sin ternario a propósito: hay un guardián que prohíbe `anulada ? … : …`
  // porque ese patrón fue siempre una decisión de PINTURA disfrazada. Aquí
  // `anulada` decide si la venta CUENTA, que es para lo que existe el campo, y
  // escribirlo como un `if` deja clara la diferencia sin debilitar la guarda.
  if (venta.anulada) return null;
  return aCentavos(venta.total);
}

/** Abreviaturas de mes, como las escribe la casa. */
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Gasto por mes del cliente, contando LAS DOS fuentes.
 *
 * 🔴 Antes esto salía de `purchasesByMonth(proformas)`, o sea solo de las
 * ventas del sistema. Con `proformas` a 0 filas, la ficha de un cliente con 17
 * compras migradas y RD$99 150 gastados enseñaba «Sin compras en los últimos
 * meses» justo debajo de un KPI que decía RD$99 150. Dos afirmaciones opuestas
 * en la misma pantalla.
 *
 * Se agrupa por año Y mes: sin el año, una compra de mayo de 2025 caería en la
 * barra de mayo de 2026 y el gráfico inventaría un mes bueno.
 *
 * Las que no cuentan para los totales (anuladas, borradores) tampoco cuentan
 * aquí: el mismo criterio que el KPI de arriba, para que las barras sumen lo
 * que dice el número grande.
 */
export function comprasPorMes(
  compras: CompraCliente[],
  meses = 6,
  ahora: Date = new Date(),
): { label: string; value: number }[] {
  const cubos: { clave: string; label: string; value: number }[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - i, 1));
    cubos.push({
      clave: `${d.getUTCFullYear()}-${d.getUTCMonth()}`,
      label: MESES[d.getUTCMonth()]!,
      value: 0,
    });
  }
  const indice = new Map(cubos.map((c, i) => [c.clave, i]));
  // Mismo conjunto de convertidas que el KPI: si se calculara aquí sobre otra
  // lista, una proforma convertida podría contarse en el gráfico y no arriba.
  const convertidas = collectConvertedSourceIds(
    compras.map((f) => f.proforma).filter((p): p is Proforma => p !== null),
  );
  for (const f of compras) {
    const cuenta = centavosQueCuentan(f, convertidas);
    if (cuenta === null) continue;
    // La fecha llega como ISO (`2026-05-29` o con hora): se parte a mano en vez
    // de `new Date(...)` para que la zona horaria no mueva una compra del día 1
    // al mes anterior.
    const [anio, mes] = f.venta.fecha.slice(0, 7).split("-");
    if (!anio || !mes) continue;
    const i = indice.get(`${Number(anio)}-${Number(mes) - 1}`);
    if (i === undefined) continue;
    cubos[i]!.value += cuenta;
  }
  // De centavos a pesos AL FINAL, una sola vez: sumar pesos con coma flotante
  // arrastra céntimos que no cuadran con el KPI.
  return cubos.map(({ label, value }) => ({ label, value: value / 100 }));
}
