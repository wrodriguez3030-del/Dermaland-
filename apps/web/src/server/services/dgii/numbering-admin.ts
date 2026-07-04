import "server-only";
import { createServer } from "@/lib/supabase/server";
import { getRepositories } from "@/server/repositories";
import type { NumberingLike } from "@/features/dgii/numbering-rules";

/**
 * Helpers server-side de administración de numeraciones
 * (`invoice_numberings`). Todas las operaciones van con el cliente de
 * SESIÓN (RLS filtra por business — el business_id NUNCA viene del
 * cliente) y auditan en `audit_logs`. NO tocan DGII.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Fila DB → shape del cliente (camelCase, sin business_id). */
export function numberingRowToClient(row: Row) {
  return {
    id: row.id as string,
    branchId: (row.branch_id as string | null) ?? undefined,
    name: row.name as string,
    documentType: row.document_type as string,
    prefix: row.prefix as string,
    rangeStart: row.range_start as number,
    rangeEnd: row.range_end as number,
    nextNumber: row.next_number as number,
    startDate: (row.start_date as string | null) ?? undefined,
    endDate: (row.end_date as string | null) ?? undefined,
    environment: row.environment as string,
    isElectronic: row.is_electronic as boolean,
    isPreferred: row.is_preferred as boolean,
    status: row.status as "active" | "inactive",
    note: (row.note as string | null) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function rowToLike(row: Row): NumberingLike {
  return {
    id: row.id,
    documentType: row.document_type,
    prefix: row.prefix,
    environment: row.environment,
    isPreferred: row.is_preferred,
    status: row.status,
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    nextNumber: row.next_number,
  };
}

/** Lista las numeraciones del negocio de la sesión (RLS). */
export async function listNumberingRows() {
  const sb = await createServer();
  if (!sb) throw new Error("Supabase no configurado");
  const { data, error } = await sb
    .from("invoice_numberings")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

export async function getNumberingRow(id: string) {
  const sb = await createServer();
  if (!sb) throw new Error("Supabase no configurado");
  const { data, error } = await sb
    .from("invoice_numberings")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Row | null;
}

/** Auditoría best-effort — nunca rompe la operación. */
export async function auditNumbering(
  session: { businessId: string; user: { id: string; fullName?: string } },
  action: string,
  numberingId: string,
  metadata: Record<string, unknown>,
) {
  try {
    const repos = getRepositories();
    await repos.audit.log(
      { businessId: session.businessId, userId: session.user.id },
      {
        businessId: session.businessId,
        userId: session.user.id,
        userName: session.user.fullName ?? "",
        action,
        entity: "invoice_numbering",
        entityId: numberingId,
        metadata,
      },
    );
  } catch {
    /* best-effort */
  }
}

/** Traduce errores Postgres conocidos a mensajes amigables. */
export function friendlyDbError(message: string): string {
  if (message.includes("invoice_numberings_one_preferred")) {
    return "Ya hay una numeración preferida activa para este tipo y ambiente.";
  }
  if (message.includes("duplicate key")) {
    return "Ya existe una numeración con el mismo prefijo, tipo y ambiente.";
  }
  if (message.includes("invoice_numberings_next_ok")) {
    return "El siguiente número debe estar dentro del rango.";
  }
  if (message.includes("invoice_numberings_range_ok")) {
    return "El rango final debe ser mayor o igual al rango inicial.";
  }
  return "No se pudo guardar la numeración. Verifica los datos e intenta de nuevo.";
}
