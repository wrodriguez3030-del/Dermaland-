/**
 * Ventas unificadas: une `proformas` (el sistema propio) y `alegra_invoices`
 * (el histórico migrado) SIN copiar ni tocar ninguna de las dos — se leen y
 * se combinan al vuelo. Ver `features/ventas/venta-unificada.ts` (el modelo,
 * los mapeadores y `DesgloseOrigen`).
 *
 * Tres funciones, y la distinción es el corazón del plan (ver "El rendimiento
 * no es un extra de este plan" en la spec):
 *
 *  - `resumenVentas`: totales calculados EN LA BASE. Ni una fila viaja. Es
 *    lo que usa el panel.
 *  - `desgloseVentas`: los mismos totales AGRUPADOS en la base (por vendedor,
 *    forma de pago o producto), con el origen de cada grupo. Es lo que usan
 *    las tarjetas de resumen del reporte de ventas. Tampoco viaja una fila de
 *    venta: viaja el desglose ya hecho, con tope de 200 grupos. 🔴 Solo la
 *    dimensión `vendedor` trae LAS DOS fuentes; `forma_pago` y `producto`
 *    traen solo Alegra — ver `FUENTES_DESGLOSE` en
 *    `features/ventas/venta-unificada.ts`, que es de donde sale el campo
 *    `fuentes` de la respuesta HTTP.
 *  - `listarVentasUnificadas`: filas, pero paginadas con tope duro de 200.
 *    Es lo que usan los listados (reportes, ficha del cliente, CxC).
 *
 * `resumenVentas` no puede resolverse con un `select=col.sum()` de
 * PostgREST: los agregados están DESACTIVADOS en este proyecto (comprobado
 * en vivo — ver el comentario de cabecera de la migración
 * `supabase/migrations/20260906130000_resumen_ventas_unificadas.sql`, que
 * trae la función `resumen_ventas_unificadas` que este archivo llama por
 * RPC). Esa migración NO se aplicó desde esta tarea — hasta que el dueño la
 * aplique, `resumenVentas` lanza un error claro (función inexistente) en vez
 * de camuflar el problema trayendo las 14 965 facturas para sumarlas aquí.
 */
import "server-only";
import type { RepoContext } from "@/server/repositories";
import { failRepo, getClient, type AnySupabase } from "@/server/repositories/supabase/client";
import { proformaRowToTs } from "@/server/repositories/supabase/mappers";
import { fetchAllPages } from "@/server/repositories/supabase/pagination";
import {
  desdeFacturaAlegra,
  desdeProforma,
  DIMENSIONES_DESGLOSE,
  type DesgloseOrigen,
  type DimensionDesglose,
  type FilaDesglose,
  type FilaFacturaAlegra,
  type OrigenVenta,
  type VentaUnificada,
} from "@/features/ventas/venta-unificada";
import type { MetricasClienteAlegra } from "@/features/customers/customer-metrics";

export interface FiltrosVentas {
  /** Fecha ISO `YYYY-MM-DD`, inclusive. */
  desde?: string;
  /** Fecha ISO `YYYY-MM-DD`, inclusive. */
  hasta?: string;
  clienteId?: string;
  sucursalId?: string;
  /** `false` para no consultar `alegra_invoices` en absoluto. Por defecto `true`. */
  incluirAlegra?: boolean;
  /** Filas por página. El servidor nunca da más de 200, aunque se pida más. */
  limite?: number;
  /** Filas a saltar, para paginar. */
  desplazamiento?: number;
}

export interface ResumenVentas {
  total: number;
  cantidad: number;
  /** ITBIS de las dos mitades. Lo enseña el índice de Reportes. */
  itbis: number;
  /** Unidades vendidas (cantidades de las líneas), no ventas. */
  unidades: number;
  /** Descuentos concedidos, de la cabecera de la venta. */
  descuento: number;
  /** Clientes distintos sobre la UNIÓN de las dos fuentes, no la suma. */
  clientesDistintos: number;
  porOrigen: Record<OrigenVenta, DesgloseOrigen>;
}

/**
 * El contrato del desglose se define en `features/ventas/venta-unificada.ts`
 * —el modelo compartido— porque el cliente de la API lo necesita y no puede
 * importar este archivo (lleva `server-only`). Se reexporta para que quien
 * llame al repositorio no tenga que saberlo.
 */
export { DIMENSIONES_DESGLOSE, type DimensionDesglose, type FilaDesglose };

export interface ListaVentasUnificadas {
  ventas: VentaUnificada[];
  /** `true` si hay más filas después de esta página. */
  hayMas: boolean;
}

/**
 * Contexto de este repositorio: el `RepoContext` de siempre (business_id del
 * JWT verificado, nunca de quien llama) más un cliente Supabase inyectable
 * SOLO para pruebas — así se prueba sin tocar red ni `createServer()`. En
 * producción SIEMPRE se omite `cliente`: lo arma `getClient()` con la sesión
 * real, igual que el resto de repositorios de la casa.
 */
export interface CtxVentasUnificadas extends RepoContext {
  cliente?: AnySupabase;
}

/** Tope duro de filas por página. Lo pone el servidor: quien llama NO puede superarlo. */
const TOPE_LISTADO = 200;
const LIMITE_POR_DEFECTO = 50;
/**
 * Cota defensiva a `desplazamiento`: ninguna regla de negocio la exige, es
 * solo un cortafuegos ante un número disparatado aguas arriba (evita un
 * `.range()` absurdo). 20 000 cubre de sobra el histórico de hoy (14 965
 * facturas de Alegra).
 */
const TOPE_DESPLAZAMIENTO = 20_000;
/**
 * Tope de filas del desglose. El MISMO 200 que ya aplica la función SQL
 * (`limit 200`), repetido aquí porque una migración se puede reemplazar sin
 * tocar este archivo: si un día la función devolviera más, la pantalla
 * seguiría sin recibir una tabla entera. `producto` puede tener una fila por
 * cada uno de los 1 487 productos migrados.
 */
const TOPE_DESGLOSE = 200;
/** Tope de fila por request a PostgREST: pedir más se corta en SILENCIO (ver `pagination.ts`). */
const TANDA_POSTGREST = 1000;

const CAMPOS_ALEGRA =
  "id,ncf,date,status,client_id,client_name,branch_id,seller_name,payment_method,subtotal,itbis,total";

/** PostgREST devuelve `numeric` como cadena; nunca se usa un importe de la base sin pasar por aquí. */
const numero = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

/** Redondeo a centavos: evita arrastres de coma flotante al sumar dos totales ya redondeados. */
const redondearDinero = (n: number): number => Math.round(n * 100) / 100;

/** Cliente Supabase real, o el inyectado por la prueba si `ctx.cliente` lo trae. */
async function clienteDe(ctx: CtxVentasUnificadas, metodo: string): Promise<AnySupabase> {
  return ctx.cliente ?? (await getClient(metodo));
}

/** Entero saneado: no-finito o negativo cae al `porDefecto`. */
function entero(valor: number | undefined, porDefecto: number, minimo: number): number {
  const n = Math.trunc(valor ?? porDefecto);
  return Number.isFinite(n) ? Math.max(minimo, n) : porDefecto;
}

/** Aplica el tope duro de la página: el servidor decide, no quien llama. */
function limitePagina(filtros: FiltrosVentas): { limite: number; desplazamiento: number } {
  const limite = Math.min(entero(filtros.limite, LIMITE_POR_DEFECTO, 1), TOPE_LISTADO);
  const desplazamiento = Math.min(entero(filtros.desplazamiento, 0, 0), TOPE_DESPLAZAMIENTO);
  return { limite, desplazamiento };
}

/** Límite superior EXCLUSIVE para una columna timestamptz, dado un `YYYY-MM-DD` inclusive. */
function finDelDia(hasta: string): string {
  return new Date(Date.parse(hasta) + 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Trae hasta `tope + 1` filas (la fila de más es la "espía" que dice si sobra
 * algo), pidiendo a PostgREST en tandas de ≤ `TANDA_POSTGREST`: PostgREST
 * corta cada respuesta en 1000 filas EN SILENCIO (ver `pagination.ts`), así
 * que un solo `.range(0, tope)` con `tope` grande perdería filas sin avisar.
 *
 * A diferencia de `fetchAllPages` (que trae TODO lo que haya, pensado para
 * agregar sobre el histórico completo), esto se DETIENE en `tope + 1`: es lo
 * que necesita un listado paginado, no un volcado completo.
 */
async function fetchHasta<T>(
  tope: number,
  fetchPage: (from: number, to: number) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (from <= tope) {
    const to = Math.min(from + TANDA_POSTGREST - 1, tope);
    const pagina = await fetchPage(from, to);
    out.push(...pagina);
    if (pagina.length < to - from + 1) break; // página incompleta: no hay más
    from = to + 1;
  }
  return out;
}

/** Ventas del sistema (`proformas`) que entran en una página del listado. */
async function proformasDeListado(
  ctx: CtxVentasUnificadas,
  filtros: FiltrosVentas,
  ventana: number,
): Promise<VentaUnificada[]> {
  const sb = await clienteDe(ctx, "ventasUnificadas.listar.proformas");
  // select("*"): reutiliza `proformaRowToTs` tal cual (mismo motivo que
  // `proforma.listHeaders` en `./sales.ts` — tolera columnas añadidas por
  // migraciones futuras) en vez de reconstruir un `Proforma` a mano con
  // media docena de campos ausentes.
  let q = sb.from("proformas").select("*").eq("business_id", ctx.businessId);
  if (filtros.desde) q = q.gte("created_at", filtros.desde);
  if (filtros.hasta) q = q.lt("created_at", finDelDia(filtros.hasta));
  if (filtros.clienteId) q = q.eq("customer_id", filtros.clienteId);
  if (filtros.sucursalId) q = q.eq("branch_id", filtros.sucursalId);
  const filas = await fetchHasta(ventana, async (from, to) => {
    const { data, error } = await q.order("created_at", { ascending: false }).order("id").range(from, to);
    if (error) failRepo("ventasUnificadas.listar.proformas", error);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []) as any[];
  });
  return filas.map((fila) => desdeProforma(proformaRowToTs(fila)));
}

/** Ventas de Alegra (`alegra_invoices`) que entran en una página del listado. Solo lectura. */
async function alegraDeListado(
  ctx: CtxVentasUnificadas,
  filtros: FiltrosVentas,
  ventana: number,
): Promise<VentaUnificada[]> {
  const sb = await clienteDe(ctx, "ventasUnificadas.listar.alegra");
  let q = sb.from("alegra_invoices").select(CAMPOS_ALEGRA).eq("business_id", ctx.businessId);
  if (filtros.desde) q = q.gte("date", filtros.desde);
  if (filtros.hasta) q = q.lte("date", filtros.hasta);
  if (filtros.clienteId) q = q.eq("client_id", filtros.clienteId);
  if (filtros.sucursalId) q = q.eq("branch_id", filtros.sucursalId);
  const filas = await fetchHasta<FilaFacturaAlegra>(ventana, async (from, to) => {
    const { data, error } = await q.order("date", { ascending: false }).order("id").range(from, to);
    if (error) failRepo("ventasUnificadas.listar.alegra", error);
    return (data ?? []) as FilaFacturaAlegra[];
  });
  return filas.map(desdeFacturaAlegra);
}

/**
 * Ventas unificadas, paginadas: junta `proformas` y `alegra_invoices` — ni
 * copia ni escribe ninguna de las dos — y devuelve una sola página ordenada
 * por fecha descendente.
 *
 * Cada fuente llega YA ordenada por fecha desde su propio índice
 * (`alegra_invoices_business_date` / el índice de `proformas`); lo único que
 * pasa en memoria es intercalar dos listas cortas ya ordenadas (como mucho
 * `2 × (tope + 1)` filas) — nunca se ordena el histórico completo en Node.
 *
 * Por qué se piden `desplazamiento + limite + 1` filas de CADA fuente (no
 * solo la ventana de esta página): las dos tablas no comparten una sola
 * secuencia ordenada, así que la única forma correcta de construir la
 * página combinada N (sin perder ventas de la fuente que aporta menos filas
 * en ese rango) es traer el top-`(desplazamiento+limite+1)` de cada una,
 * intercalar, y recién ahí cortar. El `+1` es la fila "espía" que dice si
 * sobra algo (`hayMas`), sin necesidad de una segunda consulta de conteo.
 *
 * No filtra anuladas — igual que `alegra/queries.ts#facturasEnRango`, que
 * tampoco lo hace: esto es el recorte por fecha/cliente/sucursal, no un
 * agregado. Cada venta llega con su `anulada` correcto —para quien sume— y con
 * su `estado`, para quien tenga que decir qué es el documento.
 */
export async function listarVentasUnificadas(
  ctx: CtxVentasUnificadas,
  filtros: FiltrosVentas,
): Promise<ListaVentasUnificadas> {
  const { limite, desplazamiento } = limitePagina(filtros);
  const ventana = desplazamiento + limite;
  const incluirAlegra = filtros.incluirAlegra !== false;

  const [sistema, alegra] = await Promise.all([
    proformasDeListado(ctx, filtros, ventana),
    incluirAlegra ? alegraDeListado(ctx, filtros, ventana) : Promise.resolve([]),
  ]);

  const combinadas = [...sistema, ...alegra].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  const ventas = combinadas.slice(desplazamiento, desplazamiento + limite);
  return { ventas, hayMas: combinadas.length > desplazamiento + limite };
}

/** Fila que devuelve la función `resumen_ventas_unificadas` (ver la migración). */
interface FilaResumenRpc {
  sistema_total: number | string | null;
  sistema_cantidad: number | string | null;
  alegra_total: number | string | null;
  alegra_cantidad: number | string | null;
  // Añadidas por `20260907140000_resumen_ventas_itbis_items.sql` para el índice
  // de Reportes, que enseña ITBIS y unidades además del total.
  sistema_itbis: number | string | null;
  sistema_unidades: number | string | null;
  alegra_itbis: number | string | null;
  alegra_unidades: number | string | null;
  // Añadidas por `20260907180000_resumen_ventas_descuento_clientes.sql`.
  sistema_descuento: number | string | null;
  alegra_descuento: number | string | null;
  /** Distintos sobre la UNIÓN: NO se suma por origen (contaría dos veces). */
  clientes_distintos: number | string | null;
}

/**
 * Totales de ventas —sistema + Alegra— calculados EN LA BASE: `{ total,
 * cantidad, porOrigen }` en un solo viaje de ida y vuelta, decenas de bytes,
 * no megas. Es lo que usa el panel.
 *
 * Único acceso a la base: una llamada RPC a `resumen_ventas_unificadas`
 * (`POST .../rest/v1/rpc/resumen_ventas_unificadas`), que cuenta y suma con
 * `count(*)`/`sum(total)` en SQL — no un `select=total.sum()` de PostgREST,
 * que en este proyecto está desactivado (ver el encabezado de este archivo).
 * Si la migración aún no está aplicada, esto lanza un error claro (función
 * inexistente) en vez de camuflarlo trayendo 14 965 facturas para sumarlas.
 */
export async function resumenVentas(
  ctx: CtxVentasUnificadas,
  filtros: FiltrosVentas,
): Promise<ResumenVentas> {
  const sb = await clienteDe(ctx, "ventasUnificadas.resumen");
  const incluirAlegra = filtros.incluirAlegra !== false;

  const { data, error } = await sb.rpc("resumen_ventas_unificadas", {
    p_business_id: ctx.businessId,
    p_desde: filtros.desde ?? null,
    p_hasta: filtros.hasta ?? null,
    p_cliente_id: filtros.clienteId ?? null,
    p_sucursal_id: filtros.sucursalId ?? null,
  });
  if (error) failRepo("ventasUnificadas.resumen", error);

  return interpretarResumen((data as FilaResumenRpc[] | null)?.[0], incluirAlegra);
}

/**
 * La fila cruda del resumen → el resumen que usan las pantallas.
 *
 * Vive aparte porque hay DOS caminos que traen esa fila: la llamada suelta de
 * arriba y la agrupada de `panelVentas`. Escribirlo dos veces acabaría con uno
 * de los dos sumando distinto que el otro, y esa diferencia solo se vería como
 * un total que cambia según qué pantalla lo pida.
 */
function interpretarResumen(
  fila: FilaResumenRpc | undefined,
  incluirAlegra: boolean,
): ResumenVentas {
  const sistema: DesgloseOrigen = {
    total: numero(fila?.sistema_total),
    cantidad: Math.trunc(numero(fila?.sistema_cantidad)),
    itbis: numero(fila?.sistema_itbis),
    unidades: numero(fila?.sistema_unidades),
    descuento: numero(fila?.sistema_descuento),
  };
  const alegra: DesgloseOrigen = incluirAlegra
    ? {
        total: numero(fila?.alegra_total),
        cantidad: Math.trunc(numero(fila?.alegra_cantidad)),
        itbis: numero(fila?.alegra_itbis),
        unidades: numero(fila?.alegra_unidades),
        descuento: numero(fila?.alegra_descuento),
      }
    : { total: 0, cantidad: 0, itbis: 0, unidades: 0, descuento: 0 };

  return {
    total: redondearDinero(sistema.total + alegra.total),
    cantidad: sistema.cantidad + alegra.cantidad,
    itbis: redondearDinero(sistema.itbis + alegra.itbis),
    unidades: sistema.unidades + alegra.unidades,
    descuento: redondearDinero(sistema.descuento + alegra.descuento),
    // 🔴 De la fila, NO de la suma de los dos orígenes: quien compró en los dos
    // sitios contaría dos veces. La base lo resuelve sobre la unión.
    clientesDistintos: incluirAlegra
      ? Math.trunc(numero(fila?.clientes_distintos))
      : sistema.cantidad > 0
        ? Math.trunc(numero(fila?.clientes_distintos))
        : 0,
    porOrigen: { sistema, alegra },
  };
}

/** Fila que devuelve la función `desglose_ventas_unificadas` (ver la migración). */
interface FilaDesgloseRpc {
  clave: string | null;
  etiqueta: string | null;
  origen: string | null;
  cantidad: number | string | null;
  total: number | string | null;
}

/**
 * Desglose de ventas agrupado EN LA BASE por vendedor, forma de pago o
 * producto. Hermano de `resumenVentas`, y por el mismo motivo: agrupar 14 965
 * facturas y 31 213 renglones en Node significaría descargarlos, que es justo
 * lo que este plan corrige.
 *
 * 🔴 NO todas las dimensiones traen las dos fuentes. `vendedor` sí; en
 * `forma_pago` y `producto` cada fila es de Alegra, porque del sistema ya
 * existen `byPaymentMethod` y `topProducts` sobre datos que la base no puede
 * reproducir sin inventar otro criterio. El detalle y el porqué, en
 * `FUENTES_DESGLOSE` (`features/ventas/venta-unificada.ts`); quien llame por
 * HTTP lo recibe en el campo `fuentes` y no tiene que adivinarlo.
 *
 * Único acceso a la base: una llamada RPC a `desglose_ventas_unificadas`. Ni
 * un `.from()`. `business_id` sale del JWT verificado (`ctx.businessId`),
 * nunca de quien llama.
 *
 * Si la migración `20260906140000_desglose_ventas_unificadas.sql` aún no está
 * aplicada, esto lanza un error claro (42883, función inexistente) que la
 * pantalla ENSEÑA — una tabla vacía sería indistinguible de «no hubo ventas».
 */
export async function desgloseVentas(
  ctx: CtxVentasUnificadas,
  filtros: FiltrosVentas,
  dimension: DimensionDesglose,
): Promise<FilaDesglose[]> {
  const sb = await clienteDe(ctx, "ventasUnificadas.desglose");
  const incluirAlegra = filtros.incluirAlegra !== false;

  const { data, error } = await sb.rpc("desglose_ventas_unificadas", {
    p_business_id: ctx.businessId,
    p_desde: filtros.desde ?? null,
    p_hasta: filtros.hasta ?? null,
    p_cliente_id: filtros.clienteId ?? null,
    p_sucursal_id: filtros.sucursalId ?? null,
    p_dimension: dimension,
  });
  if (error) failRepo("ventasUnificadas.desglose", error);

  return interpretarDesglose(data as FilaDesgloseRpc[] | null, incluirAlegra);
}

/**
 * Las filas crudas de un desglose → las filas que pintan las pantallas.
 *
 * Igual que `interpretarResumen`: lo llaman el camino suelto y el agrupado, y
 * tenerlo escrito una sola vez es lo que impide que el desglose de una pantalla
 * descarte filas que el de otra deja pasar.
 */
function interpretarDesglose(
  crudas: FilaDesgloseRpc[] | null,
  incluirAlegra: boolean,
): FilaDesglose[] {
  const filas: FilaDesglose[] = [];
  for (const cruda of crudas ?? []) {
    // 🔴 El origen se comprueba, no se copia: una fila con un `origen` que no
    // conocemos NO se cuela como «sistema» (que es la que la pantalla pinta
    // sin etiqueta, y por tanto la que pasa desapercibida). Se descarta.
    const origen: OrigenVenta | null =
      cruda.origen === "alegra" ? "alegra" : cruda.origen === "sistema" ? "sistema" : null;
    if (!origen) continue;
    if (origen === "alegra" && !incluirAlegra) continue;
    filas.push({
      clave: cruda.clave ?? "",
      // La base ya resuelve el «sin dato»; este respaldo es para una fila rota,
      // no para la lógica de negocio.
      etiqueta: cruda.etiqueta ?? "—",
      origen,
      cantidad: Math.trunc(numero(cruda.cantidad)),
      total: numero(cruda.total),
    });
  }
  return filas.slice(0, TOPE_DESGLOSE);
}

/** Lo que devuelve `panel_ventas_unificadas`: el resumen y los desgloses juntos. */
export interface PanelVentas {
  /** `null` cuando no se pidió (`conResumen: false`): la base ni lo calculó. */
  resumen: ResumenVentas | null;
  desgloses: Partial<Record<DimensionDesglose, FilaDesglose[]>>;
}

/**
 * PostgREST no encuentra la función: la migración
 * `20260909150000_panel_ventas_unificadas.sql` todavía no está aplicada.
 *
 * 🔴 Se distingue ESE error de cualquier otro a propósito. Tratar cualquier
 * fallo como «usa el camino viejo» convertiría un problema real de la base —un
 * permiso mal puesto, una consulta que revienta— en cuatro consultas que quizá
 * también fallan, y el aviso llegaría tarde o no llegaría.
 */
function esFuncionSinAplicar(error: { code?: string | null; message?: string | null }): boolean {
  // PGRST202: PostgREST no la tiene en su caché de esquema. 42883: Postgres
  // dice que la función no existe (llega cuando la caché está al día y la
  // función de verdad no está).
  return error.code === "PGRST202" || error.code === "42883";
}

/**
 * El resumen y VARIOS desgloses en UNA llamada a la base.
 *
 * 🔴 POR QUÉ. El panel pedía el resumen y tres desgloses por separado: cuatro
 * viajes a la base con EXACTAMENTE los mismos filtros. Medido el 08/09/2026
 * contra esta base (14 973 facturas · 31 222 líneas): una llamada sola cuesta
 * 70-145 ms, pero las cinco en paralelo tardan 412 ms de reloj. Cinco consultas
 * que leen ~46 000 filas no pueden costar eso en trabajo real —tablas de este
 * tamaño se escanean en decenas de milisegundos—; lo que cuesta es cada viaje,
 * y encima se estorban entre ellos. Con `Server-Timing` en producción ese tramo
 * salía en 653 ms en caliente y 3 883 ms en frío.
 *
 * 🔴 NO recalcula nada: la función SQL llama a `resumen_ventas_unificadas` y a
 * `desglose_ventas_unificadas` con los mismos parámetros, y aquí se interpreta
 * el resultado con las MISMAS funciones que interpretan el camino suelto. Es
 * imposible que dé un número distinto.
 *
 * Mientras la migración no esté aplicada, cae al camino de siempre —cuatro
 * llamadas— en vez de romper la pantalla. Solo ante ese error concreto: ver
 * `esFuncionSinAplicar`.
 */
export async function panelVentas(
  ctx: CtxVentasUnificadas,
  filtros: FiltrosVentas,
  dimensiones: readonly DimensionDesglose[],
  conResumen = true,
): Promise<PanelVentas> {
  const sb = await clienteDe(ctx, "ventasUnificadas.panel");
  const incluirAlegra = filtros.incluirAlegra !== false;

  const { data, error } = await sb.rpc("panel_ventas_unificadas", {
    p_business_id: ctx.businessId,
    p_desde: filtros.desde ?? null,
    p_hasta: filtros.hasta ?? null,
    p_cliente_id: filtros.clienteId ?? null,
    p_sucursal_id: filtros.sucursalId ?? null,
    p_dimensiones: [...dimensiones],
    p_con_resumen: conResumen,
  });

  if (error) {
    if (!esFuncionSinAplicar(error)) failRepo("ventasUnificadas.panel", error);
    return panelPorSeparado(ctx, filtros, dimensiones, conResumen);
  }

  const cuerpo = (data ?? {}) as {
    resumen?: FilaResumenRpc | null;
    desgloses?: Record<string, FilaDesgloseRpc[] | null> | null;
  };
  const desgloses: Partial<Record<DimensionDesglose, FilaDesglose[]>> = {};
  for (const dim of dimensiones) {
    const crudas = cuerpo.desgloses?.[dim];
    // 🔴 `undefined` NO es una lista vacía. Una dimensión que la base no
    // devolvió se deja FUERA para que la ruta lo note; pintarla como cero filas
    // sería indistinguible de «no hubo ventas», que es el fallo mudo que todo
    // este trabajo existe para cerrar.
    if (crudas === undefined || crudas === null) continue;
    desgloses[dim] = interpretarDesglose(crudas, incluirAlegra);
  }

  return {
    resumen: conResumen ? interpretarResumen(cuerpo.resumen ?? undefined, incluirAlegra) : null,
    desgloses,
  };
}

/** El camino de siempre: una llamada por cosa, en paralelo. */
async function panelPorSeparado(
  ctx: CtxVentasUnificadas,
  filtros: FiltrosVentas,
  dimensiones: readonly DimensionDesglose[],
  conResumen: boolean,
): Promise<PanelVentas> {
  const [resumen, listas] = await Promise.all([
    conResumen ? resumenVentas(ctx, filtros) : Promise.resolve(null),
    Promise.all(dimensiones.map((d) => desgloseVentas(ctx, filtros, d))),
  ]);
  const desgloses: Partial<Record<DimensionDesglose, FilaDesglose[]>> = {};
  dimensiones.forEach((d, i) => {
    desgloses[d] = listas[i] ?? [];
  });
  return { resumen, desgloses };
}

/**
 * Gasto, compras y última visita POR CLIENTE del histórico migrado de Alegra.
 *
 * Una llamada RPC a `metricas_clientes_alegra`, que agrupa en la base y
 * devuelve una fila por cliente CON COMPRAS —hoy unas 5 995, no las 14 749
 * facturas—. Sin esto habría que traerse todas las cabeceras en cada petición
 * para agruparlas aquí.
 *
 * Devuelve SOLO la mitad de Alegra: la del sistema la calcula
 * `computeCustomerPurchaseStats`, que es la misma que usa el perfil del cliente
 * y sabe de conversiones y proformas pendientes. Las dos se suman en
 * `fusionarMetricasAlegra`, cada una calculada por quien sabe hacerlo.
 */
export async function metricasClientesAlegra(
  ctx: CtxVentasUnificadas,
  filtros: Pick<FiltrosVentas, "desde" | "hasta" | "sucursalId"> = {},
): Promise<{ filas: MetricasClienteAlegra[]; aviso?: string }> {
  const sb = await clienteDe(ctx, "ventasUnificadas.metricasClientes");

  // 🔴 PAGINADO, y no es un detalle. Esta función devuelve una fila por cliente
  // CON compras —hoy 5 995— y PostgREST corta en 1 000 EN SILENCIO si no se le
  // pide un rango. Sin esto, 4 995 clientes salían con RD$0,00 gastado: el
  // listado ordenado por «Total gastado» encabezaba con alguien de RD$190 mil
  // cuando el que más había gastado llevaba RD$1,2 millones, y nada avisaba.
  // Es el mismo tope que ya mordió a este proyecto en otras consultas.
  const filas = await fetchAllPages<FilaMetricaClienteRpc>(async (from, to) => {
    const { data, error } = await sb
      .rpc("metricas_clientes_alegra", {
        p_business_id: ctx.businessId,
        p_desde: filtros.desde ?? null,
        p_hasta: filtros.hasta ?? null,
        p_sucursal_id: filtros.sucursalId ?? null,
      })
      // El orden por `cliente_id` es total y estable: sin él, dos páginas
      // podrían repetir una fila y perder otra.
      .order("cliente_id", { ascending: true })
      .range(from, to);
    if (error) failRepo("ventasUnificadas.metricasClientes", error);
    return (data as FilaMetricaClienteRpc[] | null) ?? [];
  });
  return {
    filas: filas
      // Sin id de cliente no hay a quién sumárselo: la base ya las excluye,
      // esto es la segunda barrera por si la función cambia.
      .filter((f): f is FilaMetricaClienteRpc & { cliente_id: string } =>
        typeof f.cliente_id === "string" && f.cliente_id !== "",
      )
      .map((f) => ({
        clienteId: f.cliente_id,
        total: numero(f.total),
        compras: Math.trunc(numero(f.compras)),
        ultimaFecha: typeof f.ultima_fecha === "string" ? f.ultima_fecha : "",
      })),
  };
}

/** Fila que devuelve `metricas_clientes_alegra` (ver la migración). */
interface FilaMetricaClienteRpc {
  cliente_id: string | null;
  total: number | string | null;
  compras: number | string | null;
  ultima_fecha: string | null;
}
