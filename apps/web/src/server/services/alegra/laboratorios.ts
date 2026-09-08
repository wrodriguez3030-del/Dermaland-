import "server-only";
import type { RepoContext } from "@/server/repositories/types";
import { getClient, failRepo } from "@/server/repositories/supabase/client";

/**
 * Ventas del histórico migrado de Alegra, agrupadas por laboratorio o por
 * producto.
 *
 * Existe porque «Productos → Laboratorios» salía entera en cero: se alimenta
 * de `proformas`, que tiene 0 filas, mientras los RD$48,4 millones del negocio
 * están en `alegra_invoices`. Aquí se suma esa mitad; la del sistema la sigue
 * calculando `computeLabSales` con su propio criterio de qué estado cuenta
 * como venta.
 *
 * Toda la suma la hace la función SQL `ventas_por_laboratorio` (migración
 * 20260909110000): los agregados de PostgREST están apagados en este proyecto.
 * SOLO LECTURA — Alegra manda.
 */

export type NivelLaboratorio = "laboratorio" | "producto";

export interface VentaPorLaboratorio {
  /** Id del laboratorio (nivel «laboratorio») o del producto (nivel «producto»). Vacío = sin asignar. */
  clave: string;
  etiqueta: string;
  /** Id del laboratorio. Vacío cuando el producto no tiene ninguno. */
  laboratorioId: string;
  total: number;
  unidades: number;
  /** Facturas DISTINTAS en las que aparece. */
  facturas: number;
}

export interface FiltrosLaboratorio {
  desde?: string;
  hasta?: string;
  sucursalId?: string;
}

/** PostgREST devuelve `numeric` como cadena; ningún importe se usa sin pasar por aquí. */
const numero = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

interface FilaCruda {
  clave: string | null;
  etiqueta: string | null;
  laboratorio_id: string | null;
  total: number | string | null;
  unidades: number | string | null;
  facturas: number | string | null;
}

export async function ventasPorLaboratorio(
  ctx: RepoContext,
  filtros: FiltrosLaboratorio = {},
  nivel: NivelLaboratorio = "laboratorio",
): Promise<VentaPorLaboratorio[]> {
  const sb = await getClient("alegra.ventasPorLaboratorio");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any).rpc("ventas_por_laboratorio", {
    p_business_id: ctx.businessId,
    p_desde: filtros.desde ?? null,
    p_hasta: filtros.hasta ?? null,
    p_sucursal_id: filtros.sucursalId ?? null,
    p_nivel: nivel,
  });
  if (error) failRepo("alegra.ventasPorLaboratorio", error);

  return ((data as FilaCruda[] | null) ?? []).map((f) => ({
    clave: f.clave ?? "",
    etiqueta: f.etiqueta ?? "Sin laboratorio",
    laboratorioId: f.laboratorio_id ?? "",
    total: numero(f.total),
    unidades: numero(f.unidades),
    facturas: Math.trunc(numero(f.facturas)),
  }));
}
