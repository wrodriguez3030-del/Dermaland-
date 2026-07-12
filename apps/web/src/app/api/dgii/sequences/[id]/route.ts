import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  getNumberingRow,
  listNumberingRows,
  numberingRowToClient,
  rowToLike,
  auditNumbering,
  friendlyDbError,
} from "@/server/services/dgii/numbering-admin";
import { validateNumberingWrite } from "@/features/dgii/numbering-rules";
import { canManageNumberings } from "@/features/billing/permissions";

/**
 * PATCH  /api/dgii/sequences/[id]  → edita la numeración (validada: no bajar
 *        siguiente número, no mover el inicio si ya emitió, nunca produccion).
 * DELETE /api/dgii/sequences/[id]  → soft-delete SOLO si no tiene uso
 *        (next_number == range_start).
 */

type Params = { params: Promise<{ id: string }> };

function guard() {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Disponible solo con DATA_SOURCE=supabase" },
      { status: 501 },
    );
  }
  return null;
}

export async function PATCH(req: NextRequest, ctx: Params): Promise<NextResponse> {
  const blocked = guard();
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canManageNumberings(session.user.role)) {
    return NextResponse.json({ error: "No tienes permiso para administrar numeraciones." }, { status: 403 });
  }
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const current = await getNumberingRow(id).catch(() => null);
  if (!current) {
    return NextResponse.json({ error: "Numeración no encontrada" }, { status: 404 });
  }
  const rows = await listNumberingRows().catch(() => []);
  const error = validateNumberingWrite(
    body as Parameters<typeof validateNumberingWrite>[0],
    rows.map(rowToLike),
    rowToLike(current),
  );
  if (error) return NextResponse.json({ error }, { status: 422 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.prefix !== undefined) patch.prefix = String(body.prefix).trim();
  if (body.documentType !== undefined) patch.document_type = body.documentType;
  if (body.rangeStart !== undefined) patch.range_start = body.rangeStart;
  if (body.rangeEnd !== undefined) patch.range_end = body.rangeEnd;
  if (body.nextNumber !== undefined) patch.next_number = body.nextNumber;
  if (body.startDate !== undefined) patch.start_date = body.startDate || null;
  if (body.endDate !== undefined) patch.end_date = body.endDate || null;
  if (body.environment !== undefined) patch.environment = body.environment;
  if (body.isElectronic !== undefined) patch.is_electronic = Boolean(body.isElectronic);
  if (body.isPreferred !== undefined) patch.is_preferred = Boolean(body.isPreferred);
  if (body.status !== undefined) patch.status = body.status;
  if (body.note !== undefined) patch.note = body.note || null;
  if (body.branchId !== undefined) patch.branch_id = body.branchId || null;

  const sb = await createServer();
  if (!sb) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }
  const { data, error: updErr } = await sb
    .from("invoice_numberings")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", id)
    .select("*")
    .single();
  if (updErr) {
    return NextResponse.json(
      { error: friendlyDbError(updErr.message) },
      { status: 422 },
    );
  }

  await auditNumbering(session, "dgii.numbering_updated", id, {
    changes: Object.keys(patch).filter((k) => k !== "updated_at"),
    name: data.name,
    environment: data.environment,
    nextNumber: data.next_number,
  });

  return NextResponse.json({ numbering: numberingRowToClient(data) });
}

export async function DELETE(_req: NextRequest, ctx: Params): Promise<NextResponse> {
  const blocked = guard();
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canManageNumberings(session.user.role)) {
    return NextResponse.json({ error: "No tienes permiso para administrar numeraciones." }, { status: 403 });
  }
  const { id } = await ctx.params;

  const current = await getNumberingRow(id).catch(() => null);
  if (!current) {
    return NextResponse.json({ error: "Numeración no encontrada" }, { status: 404 });
  }
  if (current.next_number > current.range_start) {
    return NextResponse.json(
      {
        error:
          "Esta numeración ya emitió comprobantes y no puede eliminarse. Puedes inactivarla.",
      },
      { status: 409 },
    );
  }

  const sb = await createServer();
  if (!sb) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }
  // Soft-delete (no borra datos).
  const { error: delErr } = await sb
    .from("invoice_numberings")
    .update({ deleted_at: new Date().toISOString(), status: "inactive" })
    .eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { error: friendlyDbError(delErr.message) },
      { status: 422 },
    );
  }

  await auditNumbering(session, "dgii.numbering_deleted", id, {
    name: current.name,
    prefix: current.prefix,
    environment: current.environment,
  });

  return NextResponse.json({ ok: true });
}
