/**
 * Ventas unificadas: une `proformas` (el sistema propio) y `alegra_invoices`
 * (el histórico migrado) SIN copiar ni tocar ninguna de las dos — se leen y
 * se combinan al vuelo. Ver `features/ventas/venta-unificada.ts` (el modelo
 * y los mapeadores) y `features/ventas/agregados.ts` (las sumas en memoria
 * para lo que ya viene cargado).
 *
 * Tres funciones, y la distinción es el corazón del plan (ver "El rendimiento
 * no es un extra de este plan" en la spec):
 *
 *  - `resumenVentas`: totales calculados EN LA BASE. Ni una fila viaja. Es
 *    lo que usa el panel.
 *  - `desgloseVentas`: los mismos totales AGRUPADOS en la base (por vendedor,
 *    forma de pago o producto), con el origen de cada grupo. Es lo que usan
 *    las tarjetas de resumen del reporte de ventas. Tampoco viaja una fila de
 *    venta: viaja el desglose ya hecho, con tope de 200 grupos.
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
import type { DesgloseOrigen } from "@/features/ventas/agregados";
import {
  desdeFacturaAlegra,
  desdeProforma,
  DIMENSIONES_DESGLOSE,
  type DimensionDesglose,
  type FilaDesglose,
  type FilaFacturaAlegra,
  type OrigenVenta,
  type VentaUnificada,
} from "@/features/ventas/venta-unificada";

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
 * agregado. Cada venta llega con su `anulada` correcto para que quien la
 * muestre decida, y para que `agregados.ts` las excluya de los totales si el
 * consumidor sólo cargó esta página para sumar.
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

  const fila = (data as FilaResumenRpc[] | null)?.[0];
  const sistema: DesgloseOrigen = {
    total: numero(fila?.sistema_total),
    cantidad: Math.trunc(numero(fila?.sistema_cantidad)),
  };
  const alegra: DesgloseOrigen = incluirAlegra
    ? { total: numero(fila?.alegra_total), cantidad: Math.trunc(numero(fila?.alegra_cantidad)) }
    : { total: 0, cantidad: 0 };

  return {
    total: redondearDinero(sistema.total + alegra.total),
    cantidad: sistema.cantidad + alegra.cantidad,
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
 * Desglose de ventas —sistema + Alegra— agrupado EN LA BASE por vendedor,
 * forma de pago o producto. Hermano de `resumenVentas`, y por el mismo
 * motivo: agrupar 14 965 facturas y 31 213 renglones en Node significaría
 * descargarlos, que es justo lo que este plan corrige.
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

  const filas: FilaDesglose[] = [];
  for (const cruda of (data as FilaDesgloseRpc[] | null) ?? []) {
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
