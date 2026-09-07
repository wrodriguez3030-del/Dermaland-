/**
 * Modelo unificado de ventas: une las proformas del sistema y las facturas
 * migradas de Alegra bajo una sola forma, para que el panel, los reportes,
 * la ficha del cliente y cuentas por cobrar puedan mirarlas juntas.
 *
 * Los dos mapeadores son PUROS: solo traducen forma, no deciden nada de
 * negocio. Las facturas de Alegra son historial —Alegra manda, DermaLand
 * solo lee— por eso `editable` es siempre `false` para ellas, sin importar
 * su estado: si fuera editable, alguien podría "anular" desde aquí una
 * factura que en Alegra sigue viva, y los dos sistemas dejarían de cuadrar.
 */
import type { Proforma } from "@/types";
import { isExcludedStatus } from "@/features/customers/customer-purchases";
import { saleMethodSummary } from "@/features/sales/sales-report";
import { cuentaParaTotales } from "@/features/alegra/sales-report";

export type OrigenVenta = "sistema" | "alegra";

/**
 * 🔴 QUÉ ES el documento — para PINTARLO. No decide nada de dinero.
 *
 * `anulada` significa «no cuenta para los totales», que NO es lo mismo que
 * «anulada fiscalmente»: una factura de Alegra en borrador tampoco cuenta, y
 * durante un tiempo la ficha del cliente la enseñaba con badge rojo «Anulada»
 * y el reporte la tachaba. Eso es falso sobre un documento fiscal de otro
 * sistema, y basta con que alguien lo repita por teléfono.
 *
 * Quien construya una columna de ESTADO usa este campo. Quien sume, `anulada`.
 * La invariante que los ata —y que fija la prueba— es
 * `anulada === (estado !== "vigente")`: separar la etiqueta no cambió ni una
 * fila de lo que entra en los totales.
 */
export type EstadoVenta = "vigente" | "anulada" | "borrador" | "vencida";

/** Cómo se llama cada estado en pantalla. Un solo sitio para todas las tablas. */
export const ETIQUETA_ESTADO_VENTA: Record<EstadoVenta, string> = {
  vigente: "Vigente",
  anulada: "Anulada",
  borrador: "Borrador",
  vencida: "Vencida",
};

/** Cómo se pinta una venta en una columna de estado o junto a su importe. */
export interface PinturaVenta {
  /** Texto del estado; `null` cuando no hay nada que advertir. */
  etiqueta: string | null;
  /** Tachar el importe. SOLO la anulada: tachar un número ES decir «anulada». */
  tachada: boolean;
  /** Atenuar el importe: no cuenta para los totales, pero no está anulada. */
  atenuada: boolean;
  /** Tono del badge del design system. */
  tono: "neutral" | "warning" | "danger";
}

/**
 * 🔴 UNA sola decisión de cómo se pinta un estado, para las dos tablas que lo
 * pintan (la ficha del cliente y el histórico del reporte de ventas).
 *
 * Estaba escrita dos veces y las dos leían `anulada`, que significa «no cuenta
 * para los totales»: un borrador de Alegra salía con badge rojo «Anulada» y
 * con el importe tachado. Aquí es imposible: `tachada` solo es cierto para la
 * anulada de verdad.
 */
export function pinturaEstadoVenta(estado: EstadoVenta): PinturaVenta {
  if (estado === "vigente") return { etiqueta: null, tachada: false, atenuada: false, tono: "neutral" };
  if (estado === "anulada") {
    return { etiqueta: ETIQUETA_ESTADO_VENTA.anulada, tachada: true, atenuada: false, tono: "danger" };
  }
  return { etiqueta: ETIQUETA_ESTADO_VENTA[estado], tachada: false, atenuada: true, tono: "warning" };
}

export interface VentaUnificada {
  id: string;
  origen: OrigenVenta;
  /** Número visible: el de la proforma, o el NCF de Alegra. */
  numero: string;
  fecha: string; // ISO
  clienteId: string | null;
  clienteNombre: string | null;
  total: number;
  itbis: number;
  subtotal: number;
  formaPago: string | null;
  vendedor: string | null;
  sucursalId: string | null;
  /** No cuenta para los totales. NO quiere decir «anulada fiscalmente». */
  anulada: boolean;
  /** Qué es el documento, para pintarlo. Ver `EstadoVenta`. */
  estado: EstadoVenta;
  /** Solo las del sistema se pueden abrir, editar o anular. */
  editable: boolean;
}

/**
 * Fila de `alegra_invoices` tal como la entrega PostgREST: columnas en
 * snake_case y los importes `numeric` como texto (ver la migración
 * `supabase/migrations/20260905200000_alegra_sync.sql`). Solo lleva los
 * campos que necesita este mapeador, no la fila completa.
 */
export interface FilaFacturaAlegra {
  id: string;
  ncf: string | null;
  date: string;
  status: "open" | "closed" | "void" | "draft";
  client_id: string | null;
  client_name: string | null;
  branch_id: string | null;
  seller_name: string | null;
  payment_method: string | null;
  subtotal: number | string;
  itbis: number | string;
  total: number | string;
}

/**
 * PostgREST devuelve las columnas `numeric` como cadena: ningún importe de
 * Alegra se usa sin pasar antes por aquí.
 */
const numero = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

/**
 * Estado visible de una proforma. Los cuatro que `isExcludedStatus` deja
 * fuera de los totales no son lo mismo entre sí: `cancelled`/`voided` sí están
 * anuladas, `draft` es un borrador y `expired` una proforma vencida.
 *
 * Exportada (además de usarla `desdeProforma`) para que el asistente de IA
 * (`server/services/ai/tool-executor.ts`) desglose sus propios conteos con el
 * MISMO criterio: sin esto, ese canal tenía uno propio que llamaba «anuladas»
 * a los borradores y a las vencidas (N9), justo donde no hay un badge en
 * pantalla que lo corrija.
 */
export function estadoDeProforma(status: string): EstadoVenta {
  if (status === "cancelled" || status === "voided") return "anulada";
  if (status === "draft") return "borrador";
  if (status === "expired") return "vencida";
  return "vigente";
}

/**
 * Proforma del sistema → venta unificada. Es la venta viva: se puede abrir,
 * editar o anular, así que `editable` es siempre `true`.
 */
export function desdeProforma(p: Proforma): VentaUnificada {
  // Pago mixto (dos o más métodos reales, p. ej. mitad efectivo y mitad
  // tarjeta): atribuírselo a uno solo le cuelga el 100% del total a un
  // método que solo cobró la mitad. Mismo criterio de
  // `saleMethodSummary` (features/sales/sales-report.ts): "mixed" cuando
  // hay dos o más grupos de pago, reutilizado en vez de reinventado. No
  // resuelve el reparto por método —eso cambia el modelo y es otra tarea—,
  // pero deja de mentir sobre cuál método cobró todo.
  const metodo = saleMethodSummary(p);
  return {
    id: p.id,
    origen: "sistema",
    numero: p.number,
    fecha: p.createdAt,
    clienteId: p.customerId ?? null,
    clienteNombre: p.customerName,
    total: p.total,
    itbis: p.itbis,
    subtotal: p.subtotal,
    formaPago: metodo === "mixed" ? "mixed" : (p.payments?.[0]?.method ?? null),
    // `sellerName` es el vendedor responsable (base de incentivos);
    // `cashierName` es quien cobra en caja. Son roles distintos a propósito
    // (types/index.ts) y en el POS `cashierName` está fijo en el código
    // ("Rosa Peralta"): usarlo aquí habría mostrado el mismo nombre en el
    // 100% de las ventas del sistema.
    vendedor: p.sellerName ?? null,
    sucursalId: p.branchId,
    // Reutiliza el mismo criterio que las métricas del cliente
    // (`isExcludedStatus`): cubre 'cancelled' y también el estado extendido
    // de la DB 'voided', que no está en el union TS `ProformaStatus`.
    anulada: isExcludedStatus(p.status),
    estado: estadoDeProforma(p.status),
    editable: true,
  };
}

/**
 * Factura de Alegra → venta unificada. Es historial: `editable` es siempre
 * `false`. `anulada` reutiliza tal cual el criterio de
 * `features/alegra/sales-report.ts` (`cuentaParaTotales`): una factura en
 * borrador no cuenta igual que una anulada, y aquí es el único flag de
 * exclusión que tiene el modelo unificado, así que cubre los dos casos.
 */
export function desdeFacturaAlegra(f: FilaFacturaAlegra): VentaUnificada {
  return {
    id: f.id,
    origen: "alegra",
    numero: f.ncf ?? "—",
    fecha: f.date,
    // 40 contactos de Alegra llegaron sin nombre: lo que no viene, no se
    // inventa (nada de "Cliente" como relleno).
    clienteId: f.client_id ?? null,
    clienteNombre: f.client_name ?? null,
    total: numero(f.total),
    itbis: numero(f.itbis),
    subtotal: numero(f.subtotal),
    formaPago: f.payment_method ?? null,
    vendedor: f.seller_name ?? null,
    sucursalId: f.branch_id ?? null,
    anulada: !cuentaParaTotales(f),
    // El estado REAL de Alegra, no «lo que no cuenta»: `draft` es borrador y
    // `void` es anulada, y son cosas distintas que decirle al usuario.
    estado: f.status === "void" ? "anulada" : f.status === "draft" ? "borrador" : "vigente",
    editable: false,
  };
}

/**
 * Cuánto puso cada fuente. No es un extra: un total que mezcla dos sistemas
 * sin decir cuánto pone cada uno no se puede auditar.
 *
 * Vive aquí, en el modelo compartido, porque lo usan el repositorio
 * (`resumenVentas`) y el cliente de la API (`ventas-api.ts`). Antes vivía en
 * `agregados.ts`, un módulo de agregados que NADIE llamaba: era la quinta
 * definición de «lo vendido» y la única que no cuadraba con ninguna pantalla,
 * puesta en el sitio más obvio para reutilizarla y con pruebas verdes. Se
 * borró; este tipo, que sí se usaba, se quedó.
 */
export interface DesgloseOrigen {
  total: number;
  cantidad: number;
  /**
   * ITBIS de la cabecera de la factura. Mide lo mismo en las dos mitades, así
   * que se puede sumar entre orígenes sin trampa.
   */
  itbis: number;
  /**
   * Unidades vendidas: suma de las CANTIDADES de las líneas. Una venta de 3
   * cajas cuenta 3, no 1 — no confundir con `cantidad`, que son ventas.
   */
  unidades: number;
}

/**
 * 🔴 Etiqueta de «sin forma de pago». La resuelve la BASE
 * (`20260906140000_desglose_ventas_unificadas.sql`) y la pinta la tarjeta de
 * medios de pago tal cual. Está fijada aquí, y comparada con el SQL por
 * `migracion-desglose.test.ts`, para que la fila del desglose migrado y la del
 * sistema no acaben llamándose distinto si alguien cambia una sola de las dos.
 */
export const ETIQUETA_SIN_FORMA_PAGO = "Sin forma de pago";

/**
 * Las formas de agrupar que sabe la función SQL `desglose_ventas_unificadas`.
 * Las tres primeras nacieron en
 * `supabase/migrations/20260906140000_desglose_ventas_unificadas.sql`; las dos
 * últimas —`sucursal` y `mes`— las añade
 * `supabase/migrations/20260907120000_desglose_ventas_sucursal_mes.sql`, que
 * reemplaza esa función sobre la misma firma para que el panel deje de enseñar
 * cuatro tarjetas en blanco.
 *
 * Vive aquí, en el modelo compartido, y no en el repositorio de Supabase,
 * porque el cliente de la API (`ventas-api.ts`, "use client") también la
 * necesita y ese repositorio lleva `import "server-only"`: importarlo desde el
 * navegador reventaría el build. Una sola definición, no dos listas que se
 * separen.
 *
 * 🔴 Esta lista es la que valida la ruta HTTP con zod: añadir un nombre aquí
 * sin su rama en el SQL convertiría un 400 honesto («esa dimensión no
 * existe») en un desglose VACÍO, que en una tarjeta es indistinguible de «no
 * hubo ventas». `migracion-desglose.test.ts` comprueba que la migración
 * vigente cubre exactamente estos cinco nombres.
 */
export const DIMENSIONES_DESGLOSE = [
  "vendedor",
  "forma_pago",
  "producto",
  "sucursal",
  "mes",
] as const;
export type DimensionDesglose = (typeof DIMENSIONES_DESGLOSE)[number];

/**
 * 🔴 Qué fuentes trae DE VERDAD cada dimensión. No las tres traen las dos.
 *
 *  - `vendedor`: proformas + alegra_invoices.
 *  - `forma_pago`: SOLO Alegra. En el sistema la forma de pago no vive en
 *    `proformas` sino en `proforma_payments`, con reparto por método y el
 *    concepto «mixto» (`saleMethodSummary`); reimplementarlo en SQL sería
 *    inventar otro criterio distinto del que ya calcula `byPaymentMethod`.
 *  - `producto`: SOLO Alegra. El sistema ya tiene `topProducts` sobre
 *    `proforma_items`.
 *  - `sucursal`: SOLO Alegra. El panel ya calcula su mitad con `salesByBranch`
 *    sobre las ventas que la pantalla tiene filtradas.
 *  - `mes`: SOLO Alegra. La mitad del sistema es `monthlyTrend`, que arma los
 *    mismos cubos de mes en el navegador.
 *
 * Esto NO es documentación: viaja en la respuesta de
 * `GET /api/ventas?vista=desglose` (campo `fuentes`). Hoy `proformas` está
 * vacía, así que un desglose de forma de pago o de producto ES el total y
 * quien lo consuma aprenderá que cuadra; el día que el punto de venta empiece
 * a facturar, la misma llamada devolverá solo la mitad migrada. Sin este
 * campo, esa media verdad no se distingue de la entera.
 */
export const FUENTES_DESGLOSE: Record<DimensionDesglose, readonly OrigenVenta[]> = {
  vendedor: ["sistema", "alegra"],
  forma_pago: ["alegra"],
  producto: ["alegra"],
  sucursal: ["alegra"],
  mes: ["alegra"],
};

/**
 * Una línea del desglose: un grupo (un vendedor, una forma de pago, un
 * producto) de UNA de las dos fuentes. El mismo vendedor puede aparecer dos
 * veces —una por origen— y es lo que se quiere: así se ve cuánto puso cada
 * sistema sin tener que adivinarlo.
 */
export interface FilaDesglose {
  /** Clave de agrupación. Cadena vacía cuando el dato no venía (sin vendedor, sin forma de pago…). */
  clave: string;
  /** Texto para la pantalla. Nunca vacío: la base ya resolvió el «sin dato». */
  etiqueta: string;
  origen: OrigenVenta;
  /** Ventas del grupo. En la dimensión `producto` son RENGLONES de factura, no unidades. */
  cantidad: number;
  total: number;
}
