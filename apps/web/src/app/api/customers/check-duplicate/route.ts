import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { Customer } from "@/types";
import { getSession, sessionToRepoContext } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { clientRowToTs } from "@/server/repositories/supabase/mappers";
import {
  findPotentialDuplicateClients,
  type CustomerFormCandidate,
} from "@/features/customers/utils/duplicate-detection";

/**
 * POST /api/customers/check-duplicate
 *
 * Detección de duplicados AUTORITATIVA y COMPLETA: recorre TODA la base de
 * clientes del negocio (paginado server-side, `business_id` del JWT — nunca del
 * cliente) y corre el matcher por documento, teléfono, WhatsApp, correo, nombre
 * y fecha de nacimiento. Antes la comprobación se hacía en el cliente contra
 * `GET /api/customers`, que topa en 1000 filas (límite de PostgREST) → se
 * escapaban duplicados. Aquí no.
 *
 * Body: campos del candidato + `excludeClientId?` (al editar). Devuelve
 * `{ isDuplicate, matches, topConfidence }` con como máximo 5 matches.
 */
export const dynamic = "force-dynamic";

const PAGE = 1000;
const MAX_PAGES = 25; // tope de seguridad: 25k clientes por negocio

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    // En modo local la detección la hace el store contra localStorage.
    return NextResponse.json({ isDuplicate: false, matches: [], topConfidence: null });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const ctx = sessionToRepoContext(session);

  const body = (await req.json().catch(() => ({}))) as Partial<CustomerFormCandidate> & {
    excludeClientId?: string;
  };

  const sb = await createServer();
  if (!sb) {
    return NextResponse.json({ isDuplicate: false, matches: [], topConfidence: null });
  }

  // Barrido paginado de TODA la base del negocio (RLS + filtro explícito).
  const all: Customer[] = [];
  let page = 0;
  let truncated = false;
  for (; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await sb
      .from("clients")
      .select("*")
      .eq("business_id", ctx.businessId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json(
        { error: "No se pudo verificar duplicados." },
        { status: 502 },
      );
    }
    const rows = data ?? [];
    all.push(...rows.map(clientRowToTs));
    if (rows.length < PAGE) break; // última página
  }
  if (page >= MAX_PAGES) {
    truncated = true;
    console.warn(
      `[check-duplicate] negocio ${ctx.businessId}: barrido cortado en ${MAX_PAGES * PAGE} clientes.`,
    );
  }

  const candidate: CustomerFormCandidate = {
    firstName: body.firstName,
    lastName: body.lastName,
    phone: body.phone,
    whatsapp: body.whatsapp,
    email: body.email,
    documentNumber: body.documentNumber,
    birthDate: body.birthDate,
    businessId: ctx.businessId, // SIEMPRE el del JWT, no el del cliente
  };

  const result = findPotentialDuplicateClients(candidate, all, {
    excludeClientId: body.excludeClientId,
  });

  return NextResponse.json(
    {
      isDuplicate: result.isDuplicate,
      topConfidence: result.topConfidence,
      matches: result.matches.slice(0, 5),
      truncated,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
