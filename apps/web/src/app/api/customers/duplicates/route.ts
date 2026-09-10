import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { authorizeRole } from "@/server/auth/require-role";
import { ROLES_CON_RIESGO } from "@/features/auth/riesgo-operativo";
import { createServer } from "@/lib/supabase/server";
import { fetchAllPages } from "@/server/repositories/supabase/pagination";
import {
  scanAllDuplicates,
  type DuplicateScanCandidate,
} from "@/features/customers/utils/duplicate-detection";
import { getClientPurchaseCounts } from "@/server/services/customers/purchase-counts";

/**
 * GET /api/customers/duplicates — escaneo COMPLETO de posibles duplicados
 * del negocio, para la pantalla `/clientes/unificar`. Admin-only: barre
 * TODA la base (6 544 clientes hoy — sin caché v1, YAGNI, ver diseño
 * aprobado) así que no es algo para pedir en cada render de un listado.
 *
 * 🔴 `select("*")` sobre `clients` ya causó una vez un problema real de
 * rendimiento (`customer.list`: 4,9 MB → 1,9 MB al recortar a 13 columnas).
 * Esta ruta lo reprodujo el mismo día que se escribió: trae SOLO las
 * columnas que el matcher necesita, y la respuesta al navegador trae SOLO
 * lo que la pantalla pinta (id, nombre, compras) — ni el documento, ni el
 * teléfono, ni el email viajan, aunque se usaron para decidir el par.
 */
export const dynamic = "force-dynamic";

interface ClientMatchRow {
  id: string;
  business_id: string;
  customer_number: string;
  first_name: string;
  last_name: string;
  document_number: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  birth_date: string | null;
  total_orders: number;
}

function rowToScanCandidate(row: ClientMatchRow): DuplicateScanCandidate {
  return {
    id: row.id,
    businessId: row.business_id,
    firstName: row.first_name,
    lastName: row.last_name,
    documentNumber: row.document_number ?? undefined,
    phone: row.phone ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    email: row.email ?? undefined,
    birthDate: row.birth_date ?? undefined,
    totalOrders: Number(row.total_orders),
  };
}

/**
 * Lo que viaja al navegador: lo que la fila pinta (nombre, compras) + lo que
 * el buscador necesita (mismo criterio que `/clientes`). NO manda
 * `businessId`/`birthDate` — el matcher ya los usó en el servidor.
 *
 * 🔴 `totalOrders` NO es `row.total_orders` (esa columna solo cuenta ventas
 * del POS propio y queda en 0 para casi todos los clientes migrados de
 * Alegra) — es el conteo combinado de `purchasesById`, mismo criterio que
 * `resumen_ventas_unificadas`/`desglose_ventas_unificadas`.
 */
function toWireCustomer(row: ClientMatchRow, purchasesById: Map<string, number>) {
  return {
    id: row.id,
    customerNumber: row.customer_number,
    firstName: row.first_name,
    lastName: row.last_name,
    documentNumber: row.document_number ?? undefined,
    phone: row.phone ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    email: row.email ?? undefined,
    totalOrders: purchasesById.get(row.id) ?? 0,
  };
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Unificar clientes solo está disponible en modo Supabase." },
      { status: 409 },
    );
  }
  const auth = await authorizeRole(ROLES_CON_RIESGO);
  if (!auth.ok) return auth.res;

  const businessId = auth.session.businessId;
  const sb = await createServer();
  if (!sb) {
    return NextResponse.json({ error: "No se pudo conectar con la base." }, { status: 502 });
  }

  // Clientes y compras se piden EN PARALELO — son independientes, y cada uno
  // ya paginaba 6-7 llamadas secuenciales por su cuenta; encadenarlos
  // duplicaría el tiempo de espera sin necesidad.
  let rows: ClientMatchRow[];
  let purchasesById: Map<string, number>;
  try {
    [rows, purchasesById] = await Promise.all([
      fetchAllPages<ClientMatchRow>(async (from, to) => {
        const { data, error } = await sb
          .from("clients")
          .select(
            "id,business_id,customer_number,first_name,last_name,document_number,phone,whatsapp,email,birth_date,total_orders",
          )
          .eq("business_id", businessId)
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      }),
      getClientPurchaseCounts(sb),
    ]);
  } catch {
    return NextResponse.json({ error: "No se pudo cargar la información de clientes." }, { status: 502 });
  }

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const candidates = rows.map(rowToScanCandidate);
  const pairs = scanAllDuplicates(candidates).map((p) => ({
    a: toWireCustomer(rowById.get(p.a.id)!, purchasesById),
    b: toWireCustomer(rowById.get(p.b.id)!, purchasesById),
    confidence: p.confidence,
    reasons: p.reasons,
  }));

  return NextResponse.json({ pairs }, { headers: { "Cache-Control": "no-store" } });
}
