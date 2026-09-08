import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { requireAal2 } from "@/server/auth/require-aal2";
import { createServer } from "@/lib/supabase/server";
import { revelarClave } from "@/server/services/users/access-service";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";

/**
 * POST /api/users/[id]/clave/ver → enseña la clave guardada de un usuario.
 *
 * 🔴 POST y no GET, a propósito. Un GET se guarda en el historial del
 * navegador, se puede pedir desde una etiqueta `<img>` de otra página, y lo
 * cachean los intermediarios. Esto no es una lectura cualquiera: cada llamada
 * deja un registro y entrega una credencial.
 *
 * La respuesta lleva `Cache-Control: no-store` y la pantalla la borra a los 30
 * segundos. El registro en `audit_logs` se escribe ANTES de abrir el sobre: si
 * no hay rastro, no hay clave.
 */
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Params): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ error: "Disponible solo con Supabase." }, { status: 501 });
  }
  const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
  if (!auth.ok) return auth.res;
  const paso2 = await requireAal2();
  if (!paso2.ok) return paso2.res;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await ctx.params;
  const sb = await createServer();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fila, error } = await (sb as any)
    .from("users")
    .select("id,business_id,email,full_name,role,branch_ids")
    .eq("business_id", session.businessId)
    .eq("id", id)
    .maybeSingle();
  if (error || !fila) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  try {
    const r = await revelarClave(
      {
        id: session.user.id,
        role: session.user.role,
        isPlatformAdmin: session.isPlatformAdmin,
        businessId: session.businessId,
        nombre: session.user.fullName ?? "",
      },
      {
        id: String(fila.id),
        businessId: String(fila.business_id),
        email: String(fila.email),
        fullName: String(fila.full_name),
        role: String(fila.role),
        branchIds: Array.isArray(fila.branch_ids) ? (fila.branch_ids as string[]) : [],
      },
    );
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(
      {
        clave: r.datos.clave,
        asignadaEl: r.datos.asignadaEl,
        asignadaPor: r.datos.asignadaPor,
        caducaEnSegundos: 30,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Incluye el caso «no se pudo dejar rastro»: sin registro, no hay clave.
    return NextResponse.json(
      { error: "No se pudo mostrar la clave (no se pudo dejar constancia de la consulta)." },
      { status: 500 },
    );
  }
}
