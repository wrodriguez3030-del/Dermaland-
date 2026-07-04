import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";

/**
 * POST /api/dgii/sequences/reserve
 *
 * Reserva ATÓMICA del siguiente número de comprobante desde
 * `invoice_numberings` (mig 0011) vía la RPC `reserve_invoice_number`
 * (UPDATE ... RETURNING con guard `auth_business_id()`): dos cajas en
 * dispositivos distintos JAMÁS reciben el mismo número — a diferencia de la
 * reserva localStorage del store cliente, que es por navegador.
 *
 * Seguridad:
 *  - `business_id` sale de la SESIÓN (RLS), nunca del cliente.
 *  - La RPC es security invoker: rango, vencimiento, estado y tenant se
 *    validan en la base de datos.
 *  - NUNCA reserva numeraciones en ambiente `produccion` (DGII real
 *    apagado; Fase G bloqueada).
 *  - Proforma NO se reserva aquí: no consume secuencia fiscal (sigue en el
 *    store local).
 *
 * Body: {
 *   docType: "consumo"|"credito_fiscal"|"ecf_31"|"ecf_32"|"ecf_33"|"ecf_34",
 *   environment?: "mock"|"demo"|"testecf"|"certecf"  (preferido),
 *   branchId?: string, cashierId?: string             (auditoría)
 * }
 * 200 → { sequenceId, docType, number, formatted, environment, remaining }
 * 409 → sin numeración activa con rango disponible.
 *
 * NO emite, NO firma, NO llama a DGII — solo administra numeración.
 */

const DOC_TYPES = new Set([
  "consumo",
  "credito_fiscal",
  "ecf_31",
  "ecf_32",
  "ecf_33",
  "ecf_34",
]);
const ENVIRONMENTS = new Set(["mock", "demo", "testecf", "certecf"]);

interface NumberingRow {
  id: string;
  document_type: string;
  prefix: string;
  next_number: number;
  range_end: number;
  environment: string;
  is_preferred: boolean;
}

/** Mismo formato visible que el store local: prefijo + 8 dígitos. */
function formatComprobante(prefix: string, value: number): string {
  return `${prefix}${String(value).padStart(8, "0")}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Disponible solo con DATA_SOURCE=supabase" },
      { status: 501 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    docType?: string;
    environment?: string;
    branchId?: string;
    cashierId?: string;
  };
  if (!body.docType || !DOC_TYPES.has(body.docType)) {
    return NextResponse.json(
      { error: "docType inválido (consumo|credito_fiscal|ecf_31|ecf_32|ecf_33|ecf_34)" },
      { status: 400 },
    );
  }
  const preferredEnv =
    body.environment && ENVIRONMENTS.has(body.environment)
      ? body.environment
      : "mock";

  const sb = await createServer();
  if (!sb) {
    return NextResponse.json(
      { error: "Supabase no configurado" },
      { status: 503 },
    );
  }

  // Candidatas emitibles (RLS filtra por business). NUNCA `produccion`.
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows, error: selErr } = await sb
    .from("invoice_numberings")
    .select("id, document_type, prefix, next_number, range_end, environment, is_preferred")
    .eq("document_type", body.docType)
    .eq("status", "active")
    .is("deleted_at", null)
    .neq("environment", "produccion")
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (selErr) {
    return NextResponse.json(
      { error: `No pude leer numeraciones: ${selErr.message}` },
      { status: 500 },
    );
  }

  // Mismo orden de preferencia que el store local: ambiente preferido
  // primero, luego la marcada como preferida.
  const candidates = ((rows ?? []) as NumberingRow[])
    .filter((n) => n.next_number <= n.range_end)
    .sort((a, b) => {
      const envA = a.environment === preferredEnv ? 0 : 1;
      const envB = b.environment === preferredEnv ? 0 : 1;
      if (envA !== envB) return envA - envB;
      return Number(b.is_preferred) - Number(a.is_preferred);
    });

  if (candidates.length === 0) {
    return NextResponse.json(
      {
        error:
          "No hay numeración activa con rango disponible para este tipo de " +
          "comprobante. Configura o amplía el rango en DGII > Secuencias.",
      },
      { status: 409 },
    );
  }

  // Reservar: la RPC es la única que avanza el contador (atómica). Si una
  // candidata se agotó/venció entre el SELECT y el UPDATE, probamos la
  // siguiente.
  for (const cand of candidates) {
    const { data: reserved, error: rpcErr } = await sb.rpc(
      "reserve_invoice_number",
      { p_numbering_id: cand.id },
    );
    if (rpcErr || reserved === null || reserved === undefined) continue;

    const num = Number(reserved);
    const formatted = formatComprobante(cand.prefix, num);

    // Auditoría best-effort (nunca rompe la venta).
    try {
      const repos = getRepositories();
      await repos.audit.log(
        { businessId: session.businessId, userId: session.user.id },
        {
          businessId: session.businessId,
          userId: body.cashierId || session.user.id,
          userName: session.user.fullName ?? "",
          action: "dgii.sequence_reserved",
          entity: "invoice_numbering",
          entityId: cand.id,
          branchId: body.branchId,
          metadata: {
            docType: body.docType,
            number: num,
            formatted,
            environment: cand.environment,
          },
        },
      );
    } catch {
      /* best-effort */
    }

    return NextResponse.json({
      sequenceId: cand.id,
      docType: body.docType,
      number: num,
      formatted,
      environment: cand.environment,
      remaining: cand.range_end - num,
    });
  }

  return NextResponse.json(
    { error: "La numeración se agotó o venció. Amplía el rango en DGII > Secuencias." },
    { status: 409 },
  );
}
