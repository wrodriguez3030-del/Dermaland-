import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  listNumberingRows,
  numberingRowToClient,
  rowToLike,
  auditNumbering,
  friendlyDbError,
} from "@/server/services/dgii/numbering-admin";
import { validateNumberingWrite } from "@/features/dgii/numbering-rules";
import { canManageNumberings } from "@/features/billing/permissions";

/**
 * GET  /api/dgii/sequences  → lista las numeraciones del negocio (RLS).
 * POST /api/dgii/sequences  → crea una numeración (validada; nunca
 *                             `produccion` mientras DGII real esté apagado).
 *
 * El business_id SIEMPRE sale de la sesión — nunca del cliente. La misma
 * tabla (`invoice_numberings`) es la que consume el POS al reservar:
 * una sola fuente de verdad.
 */

function guard() {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Disponible solo con DATA_SOURCE=supabase" },
      { status: 501 },
    );
  }
  return null;
}

export async function GET(): Promise<NextResponse> {
  const blocked = guard();
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const rows = await listNumberingRows();
    return NextResponse.json({ numberings: rows.map(numberingRowToClient) });
  } catch (e) {
    return NextResponse.json(
      { error: `No pude leer las numeraciones: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guard();
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // SEC-007: crear numeraciones fiscales → solo admin.
  if (!canManageNumberings(session.user.role)) {
    return NextResponse.json({ error: "No tienes permiso para administrar numeraciones." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const rows = await listNumberingRows().catch(() => []);
  const error = validateNumberingWrite(
    body as Parameters<typeof validateNumberingWrite>[0],
    rows.map(rowToLike),
  );
  if (error) return NextResponse.json({ error }, { status: 422 });

  const sb = await createServer();
  if (!sb) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }
  const { data, error: insErr } = await sb
    .from("invoice_numberings")
    .insert({
      business_id: session.businessId,
      branch_id: (body.branchId as string) || null,
      name: String(body.name ?? "").trim(),
      document_type: body.documentType as string,
      prefix: String(body.prefix ?? "").trim(),
      range_start: body.rangeStart as number,
      range_end: body.rangeEnd as number,
      next_number: body.nextNumber as number,
      start_date: (body.startDate as string) || null,
      end_date: (body.endDate as string) || null,
      environment: (body.environment as string) ?? "mock",
      is_electronic: Boolean(body.isElectronic),
      is_preferred: Boolean(body.isPreferred),
      status: (body.status as string) ?? "active",
      note: (body.note as string) || null,
      created_by: session.user.id,
    })
    .select("*")
    .single();
  if (insErr) {
    return NextResponse.json(
      { error: friendlyDbError(insErr.message) },
      { status: 422 },
    );
  }

  await auditNumbering(session, "dgii.numbering_created", data.id, {
    name: data.name,
    documentType: data.document_type,
    prefix: data.prefix,
    environment: data.environment,
    range: [data.range_start, data.range_end],
    nextNumber: data.next_number,
  });

  return NextResponse.json({ numbering: numberingRowToClient(data) });
}
