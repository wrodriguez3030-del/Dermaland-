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

export type OrigenVenta = "sistema" | "alegra";

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
  anulada: boolean;
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
 * Proforma del sistema → venta unificada. Es la venta viva: se puede abrir,
 * editar o anular, así que `editable` es siempre `true`.
 */
export function desdeProforma(p: Proforma): VentaUnificada {
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
    // Si hubo pago mixto se toma el primero: el modelo unificado guarda una
    // sola forma de pago por venta.
    formaPago: p.payments?.[0]?.method ?? null,
    vendedor: p.cashierName,
    sucursalId: p.branchId,
    anulada: p.status === "cancelled",
    editable: true,
  };
}

/**
 * Factura de Alegra → venta unificada. Es historial: `editable` es siempre
 * `false`. Usa el mismo criterio de anuladas que
 * `features/alegra/sales-report.ts` (`status === "void"`).
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
    anulada: f.status === "void",
    editable: false,
  };
}
