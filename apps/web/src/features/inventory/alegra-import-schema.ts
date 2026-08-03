import { z } from "zod";
import type { UserRole } from "@/types";

/** Solo estos roles pueden previsualizar o aplicar una importación de inventario. */
export const INVENTORY_IMPORT_ROLES: ReadonlyArray<UserRole> = [
  "super_admin",
  "admin",
  "manager",
];

/** Tope de filas por importación (anti-DoS). El export real ronda 1400. */
export const MAX_IMPORT_ROWS = 5000;

const rowSchema = z.object({
  rowNumber: z.number().int().min(1).max(1_000_000),
  name: z.string().min(1).max(300),
  qtyPrincipal: z.number().int().min(-1_000_000).max(1_000_000),
  qtyTotal: z.number().int().min(-1_000_000).max(1_000_000),
});

export const alegraImportBodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(MAX_IMPORT_ROWS),
  zeroMissing: z.boolean().optional().default(false),
});
