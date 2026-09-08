import "server-only";
import { z } from "zod";
import { getRepoContext } from "@/server/auth/context";
import { getRepositories } from "@/server/repositories";
import {
  facturaAlegraCompleta,
  type FacturaAlegraCompleta,
} from "@/server/services/alegra/factura-completa";
import { proformaDesdeAlegra } from "@/features/ventas/proforma-desde-alegra";
import type { Proforma } from "@/types";

/**
 * Helper compartido por las páginas «ver» e «imprimir» de una factura
 * migrada de Alegra: junta la cabecera+líneas (A1), la adapta a `Proforma`
 * para el ticket 80mm (A2) y resuelve la sucursal real (nunca la mock, ver
 * el comentario de `sucursal` en `Receipt80mm`).
 *
 * Solo lectura — Alegra manda; nada de esto se escribe en `proformas`.
 */

export interface FacturaMigradaCargada {
  factura: FacturaAlegraCompleta;
  proforma: Proforma;
  sucursal?: { name: string; address?: string | null; phone?: string | null };
}

/**
 * `null` si el id no es un uuid válido, si la factura no existe o si no es
 * del `business_id` de la sesión actual (el filtro de tenant vive dentro de
 * `facturaAlegraCompleta`, no aquí). El id se valida ANTES de tocar la base:
 * un id que no es uuid ni vale la pena consultarlo.
 */
export async function cargarFacturaMigrada(
  id: string,
): Promise<FacturaMigradaCargada | null> {
  if (!z.string().uuid().safeParse(id).success) return null;

  const ctx = await getRepoContext();
  const repos = getRepositories();

  const f = await facturaAlegraCompleta(ctx, id);
  if (!f) return null;

  const sucursal = f.branchId
    ? await repos.branch.byId(ctx, f.branchId).catch(() => null)
    : null;

  return {
    factura: f,
    proforma: proformaDesdeAlegra(f, ctx.businessId),
    sucursal: sucursal
      ? { name: sucursal.name, address: sucursal.address, phone: sucursal.phone }
      : undefined,
  };
}
